// app/(tabs)/reservas.tsx
import React, { useEffect, useState, useCallback, memo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform, Linking
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { theme } from '../../lib/theme';
import { useAuthInfo } from '../../lib/useAuthInfo';

// ========= Tipos =========
type Reservation = {
  id: string;
  business_id: string;
  date: string;   // YYYY-MM-DD
  time: string;   // HH:MM:SS
  party_size?: number | null;
  people?: number | null;
  party?: number | null;
  full_name?: string | null;
  phone?: string | null;
  status: 'pending' | 'owner_proposed' | 'confirmed' | 'accepted' | 'modified' | 'declined' | 'canceled' | 'cancelled';
  notes?: string | null;
  proposed_time?: string | null;
  business?: { name?: string | null; city?: string | null } | null;
};
const getPeople = (r: Reservation) => (r.people ?? r.party_size ?? null);

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
function fmtYMD_DB(d: Date) {        // para RPC/queries
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function fmtDDMMYYYY(d: Date) {      // para UI
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${day}-${m}-${y}`;
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

// ======== UI pequeñas piezas ========
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

function Segmented({
  value, onChange, disabled
}: { value:'mine'|'business'; onChange:(v:'mine'|'business')=>void; disabled?:boolean }) {
  return (
    <View style={{ flexDirection:'row', alignSelf:'flex-start', borderRadius:10, overflow:'hidden', borderWidth:1, borderColor: theme.colors.border }}>
      <TouchableOpacity
        onPress={()=>onChange('mine')}
        disabled={disabled}
        style={{
          paddingVertical:8, paddingHorizontal:12,
          backgroundColor: value==='mine' ? theme.colors.primary : '#fff'
        }}
        activeOpacity={0.85}
      >
        <Text style={{ color: value==='mine' ? '#fff' : theme.colors.text, fontWeight:'800', fontSize:12 }}>
          Mis reservas
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={()=>onChange('business')}
        disabled={disabled}
        style={{
          paddingVertical:8, paddingHorizontal:12,
          borderLeftWidth:1, borderLeftColor: theme.colors.border,
          backgroundColor: value==='business' ? theme.colors.primary : '#fff'
        }}
        activeOpacity={0.85}
      >
        <Text style={{ color: value==='business' ? '#fff' : theme.colors.text, fontWeight:'800', fontSize:12 }}>
          Del negocio
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ======== Grupos de filtro (select) ========
type StatusGroupKey = 'all' | 'pending' | 'confirmed' | 'proposed' | 'cancelled';
const STATUS_GROUP_LABEL: Record<StatusGroupKey,string> = {
  all: 'Todos',
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  proposed: 'Propuesta enviada',
  cancelled: 'Rechazada / Cancelada',
};
const STATUS_GROUPS: Record<StatusGroupKey, Reservation['status'][] | null> = {
  all: ['pending','confirmed','accepted'],
  pending: ['pending'],
  confirmed: ['confirmed','accepted'],
  proposed: ['modified','owner_proposed'],
  cancelled: ['declined','canceled','cancelled'],
};

// ======== Modal ÚNICA para editar hora ========
const EditModal = memo(function EditModal({
  visible, onClose, reservation, defaultTime, onSave,
}: {
  visible: boolean;
  onClose: () => void;
  reservation: Reservation | null;
  defaultTime: string;
  onSave: (hhmm: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [time, setTime] = useState(defaultTime);

  useEffect(() => { if (visible) setTime(defaultTime); }, [visible, defaultTime]);

  const handleSave = useCallback(() => {
    const hhmm = sanitizeHHMM(time);
    if (!/^\d{2}:\d{2}$/.test(hhmm)) { Alert.alert('Hora', 'Formato HH:MM'); return; }
    onSave(hhmm);
  }, [time, onSave]);

  return (
    <Modal visible={visible} animationType="fade" transparent presentationStyle="overFullScreen" onRequestClose={onClose}>
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.35)', justifyContent:'center', alignItems:'center', padding:16 }}>
        <KeyboardAvoidingView behavior={Platform.OS==='ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS==='ios' ? insets.top + 12 : 0} style={{ width:'100%' }}>
          <ScrollView contentContainerStyle={{ width:'100%', alignItems:'center' }} keyboardShouldPersistTaps="always">
            <View style={{ width:'100%', maxWidth: 480, backgroundColor:'#fff', borderRadius:16, padding:16 }}>
              <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
                <Text style={{ fontSize:18, fontWeight:'900', color: theme.colors.text }}>Modificar hora</Text>
                <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={theme.colors.text} /></TouchableOpacity>
              </View>

              {reservation && (
                <>
                  <Text style={{ marginTop:8, color: theme.colors.gray }}>
                    {reservation.full_name ?? ''} · {new Date(reservation.date+'T'+reservation.time).toLocaleDateString()}
                  </Text>

                  <Text style={{ marginTop:12, color: theme.colors.gray }}>Hora nueva</Text>
                  <TextInput
                    value={time}
                    onChangeText={(t)=>setTime(normalizeHHMM(t))}
                    onBlur={()=>setTime(sanitizeHHMM(time))}
                    maxLength={5}
                    keyboardType="number-pad"
                    placeholder="20:30"
                    placeholderTextColor={theme.colors.gray}
                    style={{ backgroundColor:'#fff', borderRadius:10, padding:12, borderWidth:1, borderColor: theme.colors.border, color: theme.colors.text }}
                    blurOnSubmit={false}
                  />

                  <TouchableOpacity onPress={handleSave} style={{ marginTop:16, backgroundColor: theme.colors.text, borderRadius:10, padding:12, alignItems:'center' }}>
                    <Text style={{ color:'#fff', fontWeight:'900' }}>Enviar propuesta</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
});

// ========== Pantalla ==========
export default function ReservationsScreen() {
  const router = useRouter();
  const { isOwner, businessId, loading: authLoading, session } = useAuthInfo() as any;

  const [viewMode, setViewMode] = useState<'mine'|'business'>(isOwner ? 'business' : 'mine');

  // Modales (solo la de editar)
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Reservation | null>(null);

  // Mis reservas
  const [myBusy, setMyBusy] = useState(true);
  const [myRows, setMyRows] = useState<Reservation[]>([]);

  // Negocio
  const [rows, setRows] = useState<Reservation[]>([]);
  const [busy, setBusy] = useState(true);

  const [selectedGroup, setSelectedGroup] = useState<StatusGroupKey>('pending');
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const anyModalOpen = editOpen || statusPickerOpen;

  // ======== Data ========
  const fetchMyReservations = useCallback(async () => {
    if (!session?.user?.id) { setMyRows([]); setMyBusy(false); return; }
    setMyBusy(true);
    try {
      const now = new Date(); now.setHours(0,0,0,0);
      const from = fmtYMD_DB(now);
      const toDate = new Date(now); toDate.setDate(now.getDate()+90);
      const to = fmtYMD_DB(toDate);

      const ACTIVE = ['pending','owner_proposed','confirmed','accepted','modified','declined'];

      try {
        const { data, error } = await supabase.rpc('get_my_reservations_all', {
          p_from: from, p_to: to, p_statuses: ACTIVE, p_limit: 200, p_offset: 0,
        });
        if (error) throw error;
        setMyRows((data ?? []) as Reservation[]);
      } catch {
        const { data, error } = await supabase
          .from('reservations')
          .select(`
            id, business_id, date, time, status, party_size, notes, proposed_time,
            business:business_id ( name, city )
          `)
          .eq('user_id', session.user.id)
          .gte('date', from).lte('date', to)
          .in('status', ACTIVE as unknown as string[])
          .order('date', { ascending: true }).order('time', { ascending: true });
        if (error) throw error;
        setMyRows((data ?? []) as any as Reservation[]);
      }
    } catch {
      setMyRows([]);
    } finally {
      setMyBusy(false);
    }
  }, [session?.user?.id]);

  const fetchBusinessReservations = useCallback(async () => {
    if (!businessId || !isOwner) { setRows([]); setBusy(false); return; }
    setBusy(true);
    try {
      const today = new Date(); today.setHours(0,0,0,0);
      const fromDate = new Date(today); fromDate.setDate(today.getDate()-7);
      const toDate = new Date(today);   toDate.setDate(today.getDate()+60);
      const from = fmtYMD_DB(fromDate);
      const to   = fmtYMD_DB(toDate);
      const statuses = STATUS_GROUPS[selectedGroup]; // array o null

      const { data, error } = await supabase.rpc('owner_list_reservations', {
        p_business_id: businessId, p_statuses: statuses, p_from: from, p_to: to, p_q: null, p_limit: 200, p_offset: 0,
      });
      if (error) throw error;
      setRows((data || []) as Reservation[]);
    } catch {
      setRows([]);
    } finally {
      setBusy(false);
    }
  }, [businessId, isOwner, selectedGroup]);

  // ======== Ciclo de vida ========
  useEffect(() => { if (!authLoading) fetchMyReservations(); }, [authLoading, fetchMyReservations]);

  useFocusEffect(useCallback(() => {
    if (authLoading || anyModalOpen) return;
    fetchMyReservations();
    fetchBusinessReservations();
  }, [authLoading, anyModalOpen, fetchMyReservations, fetchBusinessReservations]));

  useEffect(() => {
    if (!authLoading && isOwner && !anyModalOpen && viewMode==='business') fetchBusinessReservations();
  }, [selectedGroup, viewMode, isOwner, authLoading, anyModalOpen, fetchBusinessReservations]);

  // ======== Acciones (cliente) ========
  const cancelMyReservation = useCallback(async (id: string) => {
    try {
      const { data, error } = await supabase.rpc('cancel_reservation_self', {
        p_reservation_id: id, p_reason: null, p_cancel_status: 'canceled',
      });
      if (error) throw error;
      if (!data) { Alert.alert('No se pudo cancelar', 'La reserva no es tuya o ya no es cancelable.'); return; }
      Alert.alert('Reserva cancelada', 'Se ha cancelado tu reserva.');
      fetchMyReservations();
    } catch (e:any) {
      Alert.alert('Error', e?.message ?? 'No se pudo cancelar');
    }
  }, [fetchMyReservations]);

  const acceptProposal = useCallback(async (id: string) => {
    try {
      const { data, error } = await supabase.rpc('customer_accept_proposal', {
        p_reservation_id: id,
        p_anon_token: null,  // si gestionas anónimo, rellénalo; aquí cliente logueado
      });
      if (error) throw error;
      if (!data) { Alert.alert('No se pudo aceptar', 'La propuesta ya no es válida.'); return; }
      Alert.alert('Propuesta aceptada', 'Hemos actualizado tu reserva.');
      fetchMyReservations();
    } catch (e:any) {
      Alert.alert('Error', e?.message ?? 'No se pudo aceptar la propuesta');
    }
  }, [fetchMyReservations]);

  // ======== Acciones (dueño) ========
  const confirmReservation = useCallback(async (id: string) => {
    try { const { error } = await supabase.rpc('owner_confirm_reservation', { p_reservation_id: id }); if (error) throw error;
      Alert.alert('Confirmada', 'La reserva ha sido confirmada.'); fetchBusinessReservations();
    } catch (e:any) { Alert.alert('Error', e?.message ?? 'No se pudo confirmar'); }
  }, [fetchBusinessReservations]);

  const cancelReservationOwner = useCallback(async (id: string) => {
    try { const { error } = await supabase.rpc('owner_cancel_reservation', { p_reservation_id: id, p_reason: null }); if (error) throw error;
      Alert.alert('Cancelada', 'La reserva ha sido cancelada.'); fetchBusinessReservations();
    } catch (e:any) { Alert.alert('Error', e?.message ?? 'No se pudo cancelar'); }
  }, [fetchBusinessReservations]);

  const proposeNewTime = useCallback(async (resv: Reservation, hhmm: string) => {
    const { error } = await supabase.rpc('owner_propose_time_change', { p_reservation_id: resv.id, p_new_time: `${hhmm}:00` });
    if (error) throw error;
    Alert.alert('Propuesta enviada', 'El cliente podrá aceptar o cancelar.');
    fetchBusinessReservations();
  }, [fetchBusinessReservations]);

  // ======== Helpers UI ========
  const handleCall = useCallback((phone?: string | null) => {
    if (phone) Linking.openURL(`tel:${phone}`).catch(()=>{});
  }, []);
  const isCancelledGroup = (status: Reservation['status']) =>
    ['declined','canceled','cancelled'].includes(status);

  // ======== Render ========
  const HeaderArea = () => (
    <View style={{ paddingHorizontal:16, paddingTop:10, paddingBottom:6 }}>
      {isOwner && (<Segmented value={viewMode} onChange={setViewMode} />)}

      {isOwner && viewMode==='business' && (
        <View style={{ marginTop:10 }}>
          <TouchableOpacity
            onPress={() => setStatusPickerOpen(true)}
            style={{
              height: 40, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border,
              backgroundColor: '#fff', paddingHorizontal: 12, alignItems: 'center',
              flexDirection: 'row', justifyContent: 'space-between',
            }}
            activeOpacity={0.85}
          >
            <Text style={{ color: theme.colors.text, fontWeight:'800' }}>
              {STATUS_GROUP_LABEL[selectedGroup]}
            </Text>
            <Ionicons name="chevron-down" size={18} color={theme.colors.gray} />
          </TouchableOpacity>

          <Text style={{ marginTop: 6, color: theme.colors.gray, fontSize: 12 }}>
            Filtro por estado {selectedGroup === 'all' ? '(Pendiente + Confirmadas)' : ''}
          </Text>
        </View>
      )}
    </View>
  );

  const MineView = () => (
    <View style={{ flex:1 }}>
      {myBusy ? (
        <View style={{ padding:16 }}><ActivityIndicator color={theme.colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding:16, paddingBottom:96 }} keyboardShouldPersistTaps="handled">
          {myRows.length === 0 ? (
            <Text style={{ color: theme.colors.gray }}>Aún no tienes reservas.</Text>
          ) : myRows.map((r) => {
            const dateLabel = new Date(r.date+'T'+r.time).toLocaleDateString();
            const timeLabel = r.time.slice(0,5);
            const ppl = getPeople(r);
            const canAcceptProposal = r.status === 'owner_proposed' || r.status === 'modified';
            const canCancel = !isCancelledGroup(r.status);
            const businessName = r.business?.name ?? 'Establecimiento';

            return (
              <View key={r.id} style={{
                backgroundColor:'#fff', borderRadius:14, borderWidth:1, borderColor: theme.colors.border,
                padding:12, marginBottom:12, shadowColor:'#000', shadowOpacity:0.06, shadowRadius:6, shadowOffset:{width:0,height:2}, elevation:2
              }}>
                <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
                  <Text style={{ fontWeight:'900', color: theme.colors.text }}>{businessName}</Text>

                  <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                    {!isCancelledGroup(r.status) && (
                      <TouchableOpacity
                        onPress={() => handleCall(r.phone)}
                        style={{ paddingHorizontal:10, paddingVertical:6, borderRadius:10, borderWidth:1, borderColor: theme.colors.border }}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="call-outline" size={18} color={theme.colors.text} />
                      </TouchableOpacity>
                    )}
                    <StatusBadge status={r.status} />
                  </View>
                </View>

                <Text style={{ marginTop:6, color: theme.colors.text, fontWeight:'700' }}>
                  {dateLabel} · {timeLabel}{ppl ? ` — ${ppl} pers.` : ''}
                </Text>

                {!!r.notes && (<Text style={{ marginTop:4, color: theme.colors.gray }} numberOfLines={2}>{r.notes}</Text>)}

                {r.proposed_time && (r.status === 'owner_proposed' || r.status === 'modified') && (
                  <Text style={{ marginTop:6, color:'#8D6E63', fontWeight:'600' }}>
                    Hora propuesta: {r.proposed_time.slice(0,5)}
                  </Text>
                )}

                <View style={{ flexDirection:'row', justifyContent:'flex-end', marginTop:10, alignItems:'center', gap:8 }}>
                  {canAcceptProposal && (
                    <TouchableOpacity onPress={() => acceptProposal(r.id)} style={{ paddingVertical:8, paddingHorizontal:12, borderRadius:10, borderWidth:1, borderColor:'#22C55E' }}>
                      <Text style={{ color:'#22C55E', fontWeight:'800', fontSize:12 }}>Aceptar propuesta</Text>
                    </TouchableOpacity>
                  )}
                  {canCancel && (
                    <TouchableOpacity onPress={() => cancelMyReservation(r.id)} style={{ paddingVertical:8, paddingHorizontal:12, borderRadius:10, borderWidth:1, borderColor:'#EF4444' }}>
                      <Text style={{ color:'#EF4444', fontWeight:'800', fontSize:12 }}>Cancelar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );

  const BusinessView = () => (
    <View style={{ flex:1 }}>
      {busy ? (
        <View style={{ padding:16 }}><ActivityIndicator color={theme.colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding:16, paddingBottom:96, minHeight:120 }} keyboardShouldPersistTaps="handled">
          {rows.length === 0 ? (
            <Text style={{ color: theme.colors.gray }}>Sin reservas para los filtros actuales.</Text>
          ) : rows.map((r) => {
            const dateLabel = new Date(r.date+'T'+r.time).toLocaleDateString();
            const timeLabel = r.time.slice(0,5);
            const ppl = getPeople(r);

            const isConfirmed = r.status === 'confirmed' || r.status === 'accepted';
            const canAccept = (r.status === 'pending' || r.status === 'modified') && !isConfirmed;
            const canCancel = !isCancelledGroup(r.status);
            const canPropose = !isConfirmed && !['owner_proposed', 'declined','canceled','cancelled'].includes(r.status);

            return (
              <View key={r.id} style={{
                backgroundColor:'#fff', borderRadius:14, borderWidth:1, borderColor: theme.colors.border,
                padding:12, marginBottom:12, shadowColor:'#000', shadowOpacity:0.06, shadowRadius:6, shadowOffset:{width:0,height:2}, elevation:2
              }}>
                <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
                  <Text style={{ fontWeight:'900', color: theme.colors.text }}>
                    {dateLabel} · {timeLabel}{ppl ? ` — ${ppl} pers.` : ''}
                  </Text>

                  <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                    {!isCancelledGroup(r.status) && (
                      <TouchableOpacity
                        onPress={() => handleCall(r.phone)}
                        style={{ paddingHorizontal:10, paddingVertical:6, borderRadius:10, borderWidth:1, borderColor: theme.colors.border }}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="call-outline" size={18} color={theme.colors.text} />
                      </TouchableOpacity>
                    )}
                    <StatusBadge status={r.status} />
                  </View>
                </View>

                <Text style={{ marginTop:6, color: theme.colors.gray }} numberOfLines={1}>
                  {r.full_name ?? ''}{r.phone ? ` · ${r.phone}` : ''}
                </Text>
                {!!r.notes && (<Text style={{ marginTop:4, color: theme.colors.gray }} numberOfLines={2}>{r.notes}</Text>)}
                {r.status === 'owner_proposed' && r.proposed_time && (
                  <Text style={{ marginTop:4, color:'#8D6E63', fontWeight:'600' }}>Propuesta: {r.proposed_time.slice(0,5)}</Text>
                )}

                <View style={{ flexDirection:'row', justifyContent:'flex-end', marginTop:10, alignItems:'center', gap:8 }}>
                  {canPropose && (
                    <TouchableOpacity
                      onPress={()=>{ setEditTarget(r); setEditOpen(true); }}
                      style={{ paddingVertical:8, paddingHorizontal:12, borderRadius:10, borderWidth:1, borderColor:'#8D6E63' }}
                    >
                      <Text style={{ color:'#8D6E63', fontWeight:'800', fontSize:12 }}>Modificar hora</Text>
                    </TouchableOpacity>
                  )}
                  {canAccept && (
                    <TouchableOpacity
                      onPress={()=>confirmReservation(r.id)}
                      style={{ paddingVertical:8, paddingHorizontal:12, borderRadius:10, borderWidth:1, borderColor:'#0EA5E9' }}
                    >
                      <Text style={{ color:'#0EA5E9', fontWeight:'800', fontSize:12 }}>Aceptar</Text>
                    </TouchableOpacity>
                  )}
                  {canCancel && (
                    <TouchableOpacity
                      onPress={()=>cancelReservationOwner(r.id)}
                      style={{ paddingVertical:8, paddingHorizontal:12, borderRadius:10, borderWidth:1, borderColor:'#EF4444' }}
                    >
                      <Text style={{ color:'#EF4444', fontWeight:'800', fontSize:12 }}>Cancelar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {isOwner && businessId ? (
        <TouchableOpacity
          onPress={() => router.push('../reservar/crear')}
          style={{
            position:'absolute', right:16, bottom:16,
            backgroundColor: theme.colors.text,
            width:56, height:56, borderRadius:28,
            alignItems:'center', justifyContent:'center',
            shadowColor:'#000', shadowOpacity:0.15, shadowRadius:10, shadowOffset:{width:0,height:4}, elevation:4
          }}
          accessibilityLabel="Crear reserva"
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      ) : null}

      {/* Selector de estado */}
      <Modal
        visible={statusPickerOpen}
        animationType="fade"
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={() => setStatusPickerOpen(false)}
      >
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', padding: 16
        }}>
          <View style={{
            width: '100%', maxWidth: 420, backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden',
            borderWidth: 1, borderColor: theme.colors.border
          }}>
            {(['all','pending','confirmed','proposed','cancelled'] as StatusGroupKey[]).map((key, idx) => {
              const active = key === selectedGroup;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => { setSelectedGroup(key); setStatusPickerOpen(false); }}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 12,
                    backgroundColor: active ? theme.colors.grayBg : '#fff',
                    borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: theme.colors.border,
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: active ? '800' : '600' }}>
                    {STATUS_GROUP_LABEL[key]}
                  </Text>
                  {active && <Ionicons name="checkmark" size={18} color={theme.colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>
    </View>
  );

  if (authLoading) {
    return (
      <View style={{ flex:1, alignItems:'center', justifyContent:'center', backgroundColor: theme.colors.card }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex:1, backgroundColor: theme.colors.card }}>
      <HeaderArea />
      {(isOwner && viewMode==='business') ? <BusinessView /> : <MineView />}

      {/* Modal edición única */}
      <EditModal
        visible={editOpen}
        onClose={()=>{ setEditOpen(false); setEditTarget(null); }}
        reservation={editTarget}
        defaultTime={editTarget ? editTarget.time.slice(0,5) : '20:30'}
        onSave={async (hhmm) => {
          const target = editTarget;
          setEditOpen(false);
          setEditTarget(null);
          try {
            if (target) await proposeNewTime(target, hhmm);
          } catch(e:any){
            Alert.alert('Error', e?.message ?? 'No se pudo proponer el cambio');
          }
        }}
      />
    </View>
  );
}
