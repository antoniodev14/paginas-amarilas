// app/(tabs)/reservas.tsx
import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { theme } from '../../lib/theme';
import { useAuthInfo } from '../../lib/useAuthInfo';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { getClientAnonToken } from '../../lib/reservationClient';


// ========= Tipos =========
type Reservation = {
  id: string;
  business_id: string;
  date: string;   // YYYY-MM-DD
  time: string;   // HH:MM:SS
  people?: number | null;
  party?: number | null;
  party_size?: number | null;
  full_name?: string | null; // en "mis reservas" puede ser el del titular o null
  phone?: string | null;
  status: 'pending' | 'owner_proposed' | 'confirmed' | 'accepted' | 'modified' | 'declined' | 'canceled' | 'cancelled';
  notes?: string | null;
  proposed_time?: string | null;
  // campos extra cuando hacemos embed del negocio
  business?: { name?: string | null; city?: string | null } | null;
};
const getPeople = (r: Reservation) => (r.people ?? r.party ?? r.party_size ?? null);

const STATUS_LABEL: Record<string,string> = {
  pending: 'Pendiente',
  owner_proposed: 'Propuesta enviada',
  confirmed: 'Confirmada',
  accepted: 'Aceptada cliente',
  modified: 'Modificada',
  declined: 'Rechazada cliente',
  canceled: 'Cancelada',
  cancelled: 'Cancelada',
};

// ======== Utils ========
function todayYMD() {
  const d = new Date();
  d.setHours(0,0,0,0);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function fmtYMD(d: Date) {
  const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0'); const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function normalizeHHMM(input: string) {
  const d = (input || '').replace(/\D/g,'').slice(0,4);
  const h = d.slice(0,2); const m = d.slice(2,4);
  return d.length>=3 ? `${h}:${m}` : h;
}
function sanitizeHHMM(str: string) {
  if (!/^\d{1,2}(:\d{1,2})?$/.test(str)) return str;
  const [hhRaw, mmRaw=''] = str.split(':');
  const hh = Math.min(parseInt(hhRaw||'0',10)||0, 23);
  const mm = Math.min(parseInt(mmRaw||'0',10)||0, 59);
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}

// ======== Pequeños componentes UI ========
function StatusBadge({ status }: { status: Reservation['status'] }) {
  const bg =
    status === 'confirmed' || status === 'accepted' ? '#E8F5E9' :
    status === 'owner_proposed' || status === 'modified' ? '#FFF8E1' :
    status === 'pending' ? '#E3F2FD' : '#FBE9E7';
  const color =
    status === 'confirmed' || status === 'accepted' ? '#2E7D32' :
    status === 'owner_proposed' || status === 'modified' ? '#8D6E63' :
    status === 'pending' ? '#1565C0' : '#C62828';

  return (
    <View style={{ backgroundColor: bg, paddingHorizontal:8, paddingVertical:2, borderRadius:999 }}>
      <Text style={{ color, fontWeight:'700', fontSize:12 }}>
        {STATUS_LABEL[status] ?? status}
      </Text>
    </View>
  );
}

function Chip({
  label, active, onPress, first
}: { label:string; active:boolean; onPress:()=>void; first?:boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        height: 34,
        paddingHorizontal: 12,
        borderRadius: 17,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: active ? theme.colors.primary : '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: first ? 0 : 8,
      }}
    >
      <Text style={{ color: active ? '#fff' : theme.colors.text, fontWeight:'800', fontSize:12 }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function ActionButton({
  label, color, borderColor, onPress, ml
}: { label:string; color:string; borderColor:string; onPress:()=>void; ml?:number }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor,
        marginLeft: ml ?? 0
      }}
    >
      <Text style={{ color, fontWeight:'800', fontSize:12 }}>{label}</Text>
    </TouchableOpacity>
  );
}

// ========== Pantalla ==========
export default function ReservationsScreen() {
  const { isOwner, businessId, loading: authLoading, session } = useAuthInfo() as any;

  // toggle: para dueños, alternar entre "mis reservas" y "del negocio"
  const [viewMode, setViewMode] = useState<'mine'|'business'>('mine'); // default: mis reservas

  // ----- Estado "Mis reservas" -----
  const [myBusy, setMyBusy] = useState(true);
  const [myRows, setMyRows] = useState<Reservation[]>([]);

  // ----- Estado "Del negocio" (owner) -----
  const [rows, setRows] = useState<Reservation[]>([]);
  const [busy, setBusy] = useState(true);
  const [filters, setFilters] = useState<string[]>(['pending','owner_proposed']);

  // Modales para dueños (editar y crear)
  const [editOpen, setEditOpen] = useState(false);
  const [editResv, setEditResv] = useState<Reservation | null>(null);
  const [editTime, setEditTime] = useState('20:30');

  const [createOpen, setCreateOpen] = useState(false);
  const [cFullName, setCFullName] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cPeople, setCPeople] = useState('2');
  const [cDate, setCDate] = useState(fmtYMD(new Date()));
  const [cTime, setCTime] = useState('20:30');
  const [cNotes, setCNotes] = useState('');

  // ======== Mis reservas (usuario logueado) ========
  const fetchMyReservations = async () => {
    // Sólo si hay sesión (usuario registrado)
    if (!session?.user?.id) { setMyRows([]); setMyBusy(false); return; }
    setMyBusy(true);
    try {
      // Rango: últimas 2 semanas hasta +90 días
      const today = new Date(); today.setHours(0,0,0,0);
      const from = fmtYMD(new Date(today.getFullYear(), today.getMonth(), today.getDate()-14));
      const to = fmtYMD(new Date(today.getFullYear(), today.getMonth(), today.getDate()+90));

      const ACTIVE_STATUSES = ['pending','owner_proposed','confirmed','accepted','modified','declined'] as const;

      // 1) Intento RPC "get_my_reservations_all"
      const tryRpc = async () => {
        const { data, error } = await supabase.rpc('get_my_reservations_all', {
          p_from: from,
          p_to: to,
          p_statuses: ACTIVE_STATUSES,   // ⬅️ filtramos en servidor
          p_limit: 200,
          p_offset: 0,
        });
        if (error) throw error;
        return (data ?? []) as Reservation[];
      };

      // 2) Fallback: select directo de la tabla 'reservations' (RLS debe permitir leer las tuyas)
      const tryDirect = async () => {
        const { data, error } = await supabase
          .from('reservations')
          .select(`
            id, business_id, date, time, status, people, party_size, notes, proposed_time,
            business:business_id ( name, city )
          `)
          .eq('user_id', session.user.id)
          .gte('date', from)
          .lte('date', to)
          .order('date', { ascending: true })
          .order('time', { ascending: true });

        if (error) throw error;
        return (data ?? []) as any as Reservation[];
      };

      let rows: Reservation[] = [];
      try {
        rows = await tryRpc();
      } catch {
        rows = await tryDirect();
      }
      const now = new Date();
      now.setSeconds(0,0);
      const ymdToday = todayYMD();

      rows = rows.filter(r => {
        if (r.date > ymdToday) return true;
        if (r.date < ymdToday) return false;
        // mismo día: compara HH:MM
        const [hh, mm] = (r.time || '00:00').slice(0,5).split(':').map(n=>parseInt(n,10)||0);
        const rt = new Date(now);
        rt.setHours(hh, mm, 0, 0);
        return rt.getTime() >= now.getTime();
      });
      setMyRows(rows);
    } catch (e) {
      console.log('[reservas] mis reservas error:', e);
      setMyRows([]);
    } finally {
      setMyBusy(false);
    }
  };

  // ======== Reservas del negocio (owner) ========
  const fetchBusinessReservations = async () => {
    if (!businessId || !isOwner) { setRows([]); setBusy(false); return; }
    setBusy(true);
    try {
      const today = new Date();
      const from = fmtYMD(new Date(today.getFullYear(), today.getMonth(), today.getDate()-7));
      const to = fmtYMD(new Date(today.getFullYear(), today.getMonth(), today.getDate()+60));

      const { data, error } = await supabase.rpc('owner_list_reservations', {
        p_business_id: businessId,
        p_statuses: filters.length ? filters : null,
        p_from: from,
        p_to: to,
        p_q: null,
        p_limit: 200,
        p_offset: 0,
      });
      if (error) throw error;
      setRows((data || []) as Reservation[]);
    } catch (e) {
      console.log('[reservas] negocio error:', e);
      setRows([]);
    } finally {
      setBusy(false);
    }
  };

  const fetchData = async () => {
    if (!businessId || !isOwner) { setRows([]); setBusy(false); return; }
    setBusy(true);
    try {
      const today = new Date();
      const from = fmtYMD(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7));
      const to   = fmtYMD(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 60));

      const { data, error } = await supabase.rpc('owner_list_reservations', {
        p_business_id: businessId,
        p_from: from,
        p_to: to,
        p_statuses: null,
        p_limit: 200,
        p_offset: 0,
      });
      if (error) throw error;
      setRows((data || []) as Reservation[]);
    } catch (e) {
      console.log('error fetch reservations', e);
      setRows([]);
    } finally {
      setBusy(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!authLoading) {
        fetchData();
      }
    }, [authLoading, businessId, isOwner])
  );

  // Cargas
  useFocusEffect(
    useCallback(() => {
      if (!authLoading) {
        fetchMyReservations();
        fetchBusinessReservations(); // si tienes el modo “del negocio”
      }
    }, [authLoading, businessId, isOwner])
  );

  useEffect(() => {
    if (authLoading) return;
    fetchBusinessReservations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, businessId, isOwner, filters.join(',')]);

  // ======== Acciones usuario (mis reservas) ========
  const cancelMyReservation = async (id: string) => {
    try {
      // === Registrado (canónico) ===
      let ok = false;
      try {
        const { data, error } = await supabase.rpc('cancel_reservation_self', {
          p_reservation_id: id,
          p_reason: null,
          p_cancel_status: 'canceled',
        });
        if (error) throw error;
        ok = Boolean(data ?? true);
      } catch (e) {
          // si falla por inexistente, probamos variante anónima (opcional)
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            const anon = await getClientAnonToken();
            const { data, error } = await supabase.rpc('cancel_reservation_self_anon', {
              p_reservation_id: id,
              p_anon_token: anon,
              p_reason: null,
              p_cancel_status: 'cancelled',
            });
            if (error) throw error;
            ok = Boolean(data ?? true);
          } else {
            throw e;
          }
        throw e; // si no usas anónimos, mantenemos el throw
      }

      if (!ok) {
        Alert.alert('No se pudo cancelar', 'La reserva no es tuya o ya no es cancelable.');
        return;
      }

      Alert.alert('Reserva cancelada', 'Se ha cancelado tu reserva.');
      await fetchMyReservations();   // 🔄 refresca tras la acción
    } catch (e:any) {
      console.log('[reservas] cancelar — error:', e);
      Alert.alert('Error', e?.message ?? 'No se pudo cancelar');
    }
  };

  // Aceptar propuesta del dueño — probamos varios RPC conocidos
  const acceptProposal = async (id: string) => {
    const candidates = [
      'client_accept_time_change',
      'accept_owner_proposal',
      'accept_proposed_time',
    ];
    let ok = false, lastErr: any = null;
    for (const fn of candidates) {
      try {
        const { data, error } = await supabase.rpc(fn, { p_reservation_id: id });
        if (error) throw error;
        ok = Boolean(data ?? true);
        if (ok) break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!ok) {
      console.log('[reservas] aceptar propuesta error:', lastErr);
      Alert.alert(
        'Acción no disponible',
        'No encontramos la función para aceptar propuestas en el servidor. Comunica el nombre de la RPC y lo conectamos.'
      );
      return;
    }
    Alert.alert('Propuesta aceptada', 'Has aceptado la nueva hora propuesta.');
    fetchMyReservations();
  };

  // ======== Acciones owner (negocio) ========
  const confirmReservation = async (id: string) => {
    try {
      const { error } = await supabase.rpc('owner_confirm_reservation', { p_reservation_id: id });
      if (error) throw error;
      Alert.alert('Confirmada', 'La reserva ha sido confirmada.');
      fetchBusinessReservations();
    } catch (e:any) { Alert.alert('Error', e?.message ?? 'No se pudo confirmar'); }
  };
  const cancelReservationOwner = async (id: string) => {
    try {
      const { error } = await supabase.rpc('owner_cancel_reservation', { p_reservation_id: id, p_reason: null });
      if (error) throw error;
      Alert.alert('Cancelada', 'La reserva ha sido cancelada.');
      fetchBusinessReservations();
    } catch (e:any) { Alert.alert('Error', e?.message ?? 'No se pudo cancelar'); }
  };
  const openEdit = (r: Reservation) => { setEditResv(r); setEditTime(r.time.slice(0,5)); setEditOpen(true); };
  const saveProposal = async () => {
    if (!editResv) return;
    const hhmm = sanitizeHHMM(editTime);
    if (!/^\d{2}:\d{2}$/.test(hhmm)) { Alert.alert('Hora', 'Formato HH:MM'); return; }
    try {
      const { error } = await supabase.rpc('owner_propose_time_change', {
        p_reservation_id: editResv.id,
        p_new_time: `${hhmm}:00`
      });
      if (error) throw error;
      setEditOpen(false);
      Alert.alert('Propuesta enviada', 'El cliente podrá aceptar o cancelar.');
      fetchBusinessReservations();
    } catch (e:any) { Alert.alert('Error', e?.message ?? 'No se pudo proponer el cambio'); }
  };
  const createReservation = async () => {
    if (!businessId) return;
    const hhmm = sanitizeHHMM(cTime);
    if (!/^\d{2}:\d{2}$/.test(hhmm)) { Alert.alert('Hora', 'Formato HH:MM'); return; }
    if (!cFullName.trim() || !cPhone.trim()) { Alert.alert('Campos obligatorios', 'Nombre y teléfono.'); return; }
    try {
      const people = Math.max(1, Math.min(50, parseInt(cPeople||'1',10)||1));
      const { error } = await supabase.rpc('owner_create_reservation', {
        p_business_id: businessId,
        p_full_name: cFullName.trim(),
        p_phone: cPhone.trim(),
        p_people: people,
        p_date: cDate,
        p_time: `${hhmm}:00`,
        p_notes: cNotes.trim() || null,
      });
      if (error) throw error;
      setCreateOpen(false);
      setCFullName(''); setCPhone(''); setCPeople('2'); setCNotes('');
      setCDate(fmtYMD(new Date())); setCTime('20:30');
      Alert.alert('Creada', 'Reserva creada y confirmada.');
      fetchBusinessReservations();
    } catch (e:any) { Alert.alert('Error', e?.message ?? 'No se pudo crear'); }
  };

  // ======== UI ========
  const ALL = ['pending','owner_proposed','confirmed','accepted','modified','declined','canceled','cancelled'];
  const isAll = filters.length === 0 || filters.length === ALL.length;

  // Header toggle (sólo si es owner)
  const Header = () => (
    <View style={{ paddingHorizontal:16, paddingTop:10, paddingBottom:6 }}>
      {isOwner ? (
        <View style={{ flexDirection:'row', marginTop:8 }}>
          <TouchableOpacity
            onPress={()=>setViewMode('mine')}
            style={{
              paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor: theme.colors.border,
              backgroundColor: viewMode==='mine' ? theme.colors.primary : '#fff',
              borderTopLeftRadius:10, borderBottomLeftRadius:10
            }}
          >
            <Text style={{ color: viewMode==='mine' ? '#fff' : theme.colors.text, fontWeight:'800', fontSize:12 }}>
              Mis reservas
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={()=>setViewMode('business')}
            style={{
              paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor: theme.colors.border,
              backgroundColor: viewMode==='business' ? theme.colors.primary : '#fff',
              borderTopRightRadius:10, borderBottomRightRadius:10
            }}
          >
            <Text style={{ color: viewMode==='business' ? '#fff' : theme.colors.text, fontWeight:'800', fontSize:12 }}>
              Del negocio
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );

  if (authLoading) {
    return (
      <View style={{ flex:1, alignItems:'center', justifyContent:'center', backgroundColor: theme.colors.card }}>
        <ActivityIndicator />
      </View>
    );
  }

  // ======== Vista "Mis reservas" (para cualquier usuario con sesión) ========
  const MineView = () => (
    <View style={{ flex:1 }}>
      {myBusy ? (
        <View style={{ padding:16 }}><ActivityIndicator color={theme.colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding:16, paddingBottom:96 }}>
          {myRows.length === 0 ? (
            <Text style={{ color: theme.colors.gray }}>Aún no tienes reservas.</Text>
          ) : myRows.map((r) => {
            const dateLabel = new Date(r.date+'T'+r.time).toLocaleDateString();
            const timeLabel = r.time.slice(0,5);
            const ppl = getPeople(r);
            const canAcceptProposal = r.status === 'owner_proposed' || r.status === 'modified';
            const canCancel = !['canceled','cancelled','declined'].includes(r.status);

            const businessName = r.business?.name ?? 'Establecimiento';
            return (
              <View key={r.id} style={{
                backgroundColor:'#fff',
                borderRadius:14,
                borderWidth:1,
                borderColor: theme.colors.border,
                padding:12,
                marginBottom:12,
                shadowColor:'#000',
                shadowOpacity:0.06,
                shadowRadius:6,
                shadowOffset:{width:0,height:2},
                elevation:2
              }}>
                <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
                  <Text style={{ fontWeight:'900', color: theme.colors.text }}>
                    {businessName}
                  </Text>
                  <StatusBadge status={r.status} />
                </View>

                <Text style={{ marginTop:6, color: theme.colors.text, fontWeight:'700' }}>
                  {dateLabel} · {timeLabel}{ppl ? ` — ${ppl} pers.` : ''}
                </Text>

                {!!r.notes && (
                  <Text style={{ marginTop:4, color: theme.colors.gray }} numberOfLines={2}>{r.notes}</Text>
                )}

                {r.proposed_time && (r.status === 'owner_proposed' || r.status === 'modified') && (
                  <Text style={{ marginTop:6, color:'#8D6E63', fontWeight:'600' }}>
                    Nueva hora propuesta: {r.proposed_time.slice(0,5)}
                  </Text>
                )}

                <View style={{ flexDirection:'row', justifyContent:'flex-end', marginTop:10 }}>
                  {canAcceptProposal && (
                    <ActionButton
                      label="Aceptar propuesta"
                      color="#22C55E"
                      borderColor="#22C55E"
                      onPress={() => acceptProposal(r.id)}
                    />
                  )}
                  {canCancel && (
                    <ActionButton
                      label="Cancelar"
                      color="#EF4444"
                      borderColor="#EF4444"
                      onPress={() => cancelMyReservation(r.id)}
                      ml={canAcceptProposal ? 8 : 0}
                    />
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );

  // ======== Vista "Del negocio" (sólo dueños) ========
  const BusinessView = () => (
    <View style={{ flex:1 }}>
      {/* Chips filtros */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal:16, paddingBottom:10 }}
      >
        <Chip label="Todos" active={isAll} onPress={()=>setFilters([])} first />
        {ALL.map(st => (
          <Chip
            key={st}
            label={STATUS_LABEL[st] ?? st}
            active={filters.includes(st)}
            onPress={() => setFilters(prev => prev.includes(st) ? prev.filter(x=>x!==st) : [...prev, st])}
          />
        ))}
      </ScrollView>

      {/* Lista negocio */}
      {busy ? (
        <View style={{ padding:16 }}><ActivityIndicator color={theme.colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding:16, paddingBottom:96 }}>
          {rows.length === 0 ? (
            <Text style={{ color: theme.colors.gray }}>Sin reservas para los filtros actuales.</Text>
          ) : rows.map((r) => {
            const dateLabel = new Date(r.date+'T'+r.time).toLocaleDateString();
            const timeLabel = r.time.slice(0,5);
            const ppl = getPeople(r);
            const canAccept = r.status === 'pending' || r.status === 'modified';
            const canCancel = !['canceled','cancelled','declined'].includes(r.status);
            const canPropose = !['canceled','cancelled','declined','owner_proposed'].includes(r.status);

            return (
              <View key={r.id} style={{
                backgroundColor:'#fff',
                borderRadius:14,
                borderWidth:1,
                borderColor: theme.colors.border,
                padding:12,
                marginBottom:12,
                shadowColor:'#000',
                shadowOpacity:0.06,
                shadowRadius:6,
                shadowOffset:{width:0,height:2},
                elevation:2
              }}>
                <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
                  <Text style={{ fontWeight:'900', color: theme.colors.text }}>
                    {dateLabel} · {timeLabel}{ppl ? ` — ${ppl} pers.` : ''}
                  </Text>
                  <StatusBadge status={r.status} />
                </View>

                <Text style={{ marginTop:6, color: theme.colors.gray }} numberOfLines={1}>
                  {r.full_name ?? ''}{r.phone ? ` · ${r.phone}` : ''}
                </Text>
                {!!r.notes && (
                  <Text style={{ marginTop:4, color: theme.colors.gray }} numberOfLines={2}>{r.notes}</Text>
                )}
                {r.status === 'owner_proposed' && r.proposed_time && (
                  <Text style={{ marginTop:4, color:'#8D6E63', fontWeight:'600' }}>
                    Propuesta: {r.proposed_time.slice(0,5)}
                  </Text>
                )}

                <View style={{ flexDirection:'row', justifyContent:'flex-end', marginTop:10 }}>
                  {canPropose && (
                    <ActionButton label="Modificar hora" color="#8D6E63" borderColor="#8D6E63" onPress={()=>openEdit(r)} />
                  )}
                  {canAccept && (
                    <ActionButton label="Aceptar" color="#0EA5E9" borderColor="#0EA5E9" onPress={()=>confirmReservation(r.id)} ml={8} />
                  )}
                  {canCancel && (
                    <ActionButton label="Cancelar" color="#EF4444" borderColor="#EF4444" onPress={()=>cancelReservationOwner(r.id)} ml={8} />
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* FAB crear */}
      {isOwner && businessId ? (
        <TouchableOpacity
          onPress={() => setCreateOpen(true)}
          style={{
            position:'absolute', right:16, bottom:16,
            backgroundColor: theme.colors.text,
            width:56, height:56, borderRadius:28,
            alignItems:'center', justifyContent:'center',
            shadowColor:'#000', shadowOpacity:0.15, shadowRadius:10, shadowOffset:{width:0,height:4}, elevation:4
          }}
          accessibilityLabel="Crear reserva"
        >
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      ) : null}

      {/* Modal modificar hora */}
      <Modal visible={editOpen} animationType="fade" transparent onRequestClose={()=>setEditOpen(false)}>
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.35)', justifyContent:'center', alignItems:'center', padding:16 }}>
          <KeyboardAvoidingView behavior={Platform.OS==='ios' ? 'padding' : undefined} style={{ width:'100%' }}>
            <View style={{ width:'100%', maxWidth: 480, backgroundColor:'#fff', borderRadius:16, padding:16 }}>
              <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
                <Text style={{ fontSize:18, fontWeight:'900', color: theme.colors.text }}>Modificar hora</Text>
                <TouchableOpacity onPress={()=>setEditOpen(false)}><Ionicons name="close" size={22} color={theme.colors.text} /></TouchableOpacity>
              </View>

              {editResv && (
                <>
                  <Text style={{ marginTop:8, color: theme.colors.gray }}>
                    {editResv.full_name ?? ''} · {new Date(editResv.date+'T'+editResv.time).toLocaleDateString()}
                  </Text>

                  <Text style={{ marginTop:12, color: theme.colors.gray }}>Hora nueva</Text>
                  <TextInput
                    value={editTime}
                    onChangeText={(t)=>setEditTime(normalizeHHMM(t))}
                    onBlur={()=>setEditTime(sanitizeHHMM(editTime))}
                    maxLength={5}
                    keyboardType="number-pad"
                    placeholder="20:30"
                    placeholderTextColor={theme.colors.gray}
                    style={{
                      backgroundColor:'#fff', borderRadius:10, padding:12,
                      borderWidth:1, borderColor: theme.colors.border, color: theme.colors.text
                    }}
                  />

                  <TouchableOpacity
                    onPress={saveProposal}
                    style={{ marginTop:16, backgroundColor: theme.colors.text, borderRadius:10, padding:12, alignItems:'center' }}
                  >
                    <Text style={{ color:'#fff', fontWeight:'900' }}>Enviar propuesta</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Modal crear */}
      <Modal visible={createOpen} animationType="fade" transparent onRequestClose={()=>setCreateOpen(false)}>
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.35)', justifyContent:'center', alignItems:'center', padding:16 }}>
          <KeyboardAvoidingView behavior={Platform.OS==='ios' ? 'padding' : undefined} style={{ width:'100%' }}>
            <View style={{ width:'100%', maxWidth: 520, backgroundColor:'#fff', borderRadius:16, padding:16 }}>
              <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
                <Text style={{ fontSize:18, fontWeight:'900', color: theme.colors.text }}>Crear reserva</Text>
                <TouchableOpacity onPress={()=>setCreateOpen(false)}><Ionicons name="close" size={22} color={theme.colors.text} /></TouchableOpacity>
              </View>

              <Text style={{ marginTop:10, color: theme.colors.gray }}>Nombre completo</Text>
              <TextInput value={cFullName} onChangeText={setCFullName} placeholder="Nombre del cliente" placeholderTextColor={theme.colors.gray}
                style={{ backgroundColor:'#fff', borderRadius:10, padding:12, borderWidth:1, borderColor: theme.colors.border, color: theme.colors.text }} />

              <Text style={{ marginTop:10, color: theme.colors.gray }}>Teléfono</Text>
              <TextInput value={cPhone} onChangeText={setCPhone} keyboardType="phone-pad" placeholder="600123123" placeholderTextColor={theme.colors.gray}
                style={{ backgroundColor:'#fff', borderRadius:10, padding:12, borderWidth:1, borderColor: theme.colors.border, color: theme.colors.text }} />

              <Text style={{ marginTop:10, color: theme.colors.gray }}>Personas</Text>
              <TextInput value={cPeople} onChangeText={setCPeople} keyboardType="number-pad" placeholder="2" placeholderTextColor={theme.colors.gray}
                style={{ backgroundColor:'#fff', borderRadius:10, padding:12, borderWidth:1, borderColor: theme.colors.border, color: theme.colors.text }} />

              <Text style={{ marginTop:10, color: theme.colors.gray }}>Fecha (YYYY-MM-DD)</Text>
              <TextInput value={cDate} onChangeText={setCDate} placeholder={fmtYMD(new Date())} placeholderTextColor={theme.colors.gray}
                style={{ backgroundColor:'#fff', borderRadius:10, padding:12, borderWidth:1, borderColor: theme.colors.border, color: theme.colors.text }} />

              <Text style={{ marginTop:10, color: theme.colors.gray }}>Hora</Text>
              <TextInput value={cTime} onChangeText={(t)=>setCTime(normalizeHHMM(t))} onBlur={()=>setCTime(sanitizeHHMM(cTime))}
                maxLength={5} keyboardType="number-pad" placeholder="20:30" placeholderTextColor={theme.colors.gray}
                style={{ backgroundColor:'#fff', borderRadius:10, padding:12, borderWidth:1, borderColor: theme.colors.border, color: theme.colors.text }} />

              <Text style={{ marginTop:10, color: theme.colors.gray }}>Notas (opcional)</Text>
              <TextInput value={cNotes} onChangeText={setCNotes} placeholder="Preferencias u observaciones" placeholderTextColor={theme.colors.gray}
                multiline numberOfLines={3}
                style={{ backgroundColor:'#fff', borderRadius:10, padding:12, borderWidth:1, borderColor: theme.colors.border, color: theme.colors.text, minHeight:86 }} />

              <TouchableOpacity onPress={createReservation} style={{ marginTop:16, backgroundColor: theme.colors.text, borderRadius:10, padding:12, alignItems:'center' }}>
                <Text style={{ color:'#fff', fontWeight:'900' }}>Crear confirmada</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );

  return (
    <View style={{ flex:1, backgroundColor: theme.colors.card }}>
      <Header />
      {/* Si es dueño y elige "Del negocio" → BusinessView; si no, Mis reservas */}
      {(isOwner && viewMode==='business') ? <BusinessView /> : <MineView />}
    </View>
  );
}
