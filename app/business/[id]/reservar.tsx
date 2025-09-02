import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, TextInput, Alert,
  KeyboardAvoidingView, Platform, Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { theme } from '../../../lib/theme';
import { getClientAnonToken } from '../../../lib/reservationClient';

type Reservation = {
  id: string;
  business_id: string;
  user_id: string | null;
  anon_token: string | null;
  full_name: string;
  phone: string | null;

  // La RPC puede devolver distintos alias
  people?: number | null;
  party?: number | null;
  party_size?: number | null;

  date: string;   // 'YYYY-MM-DD'
  time: string;   // 'HH:MM:SS'
  status: 'pending' | 'owner_proposed' | 'confirmed' | 'accepted' | 'modified' | 'declined' | 'canceled';
  notes: string | null;

  // Si el dueño propone cambio (opcional, por si tu RPC lo añade)
  proposed_date?: string | null;
  proposed_time?: string | null;
};

const getPeople = (r: Reservation) => (r.people ?? r.party ?? r.party_size ?? null);

function fmtYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function normalizeHHMM(input: string) {
  const d = (input || '').replace(/\D/g, '').slice(0, 4);
  const h = d.slice(0, 2);
  const m = d.slice(2, 4);
  return d.length >= 3 ? `${h}:${m}` : h;
}
function sanitizeHHMM(str: string) {
  if (!/^\d{1,2}(:\d{1,2})?$/.test(str)) return str;
  const [hhRaw, mmRaw = ''] = str.split(':');
  let hh = Math.min(parseInt(hhRaw || '0', 10) || 0, 23);
  let mm = Math.min(parseInt(mmRaw || '0', 10) || 0, 59);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export default function ReservarScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();

  // Calendario + modal
  const [month, setMonth] = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [modalOpen, setModalOpen] = useState(false);
  const [selDate, setSelDate] = useState<Date | null>(null);

  // Form
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [party, setParty] = useState('2');
  const [time, setTime] = useState('20:30');
  const [notes, setNotes] = useState('');

  // Mis reservas
  const [myReservations, setMyReservations] = useState<Reservation[]>([]);
  const reservedDateSet = useMemo(() => {
    const s = new Set<string>();
    myReservations.forEach(r => s.add(r.date));
    return s;
  }, [myReservations]);

  useEffect(() => {
    navigation.setOptions({ title: 'Reservar mesa', headerBackTitle: 'Atrás' });
  }, [navigation]);

  // Malla del mes (semana empieza L)
  const today = useMemo(() => { const t = new Date(); t.setHours(0,0,0,0); return t; }, []);
  const days = useMemo(() => {
    const y = month.getFullYear();
    const m = month.getMonth();
    const first = new Date(y, m, 1); first.setHours(0,0,0,0);
    const startWeekday = (first.getDay() + 6) % 7;
    const total = new Date(y, m + 1, 0).getDate();
    const arr: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i++) arr.push(null);
    for (let d = 1; d <= total; d++) { const dd = new Date(y, m, d); dd.setHours(0,0,0,0); arr.push(dd); }
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [month]);

  // Tamaños
  const { width } = Dimensions.get('window');
  const horizontalPadding = 16, gap = 8, cols = 7;
  const cellSize = useMemo(() => {
    const totalGap = gap * (cols - 1);
    const usable = width - (horizontalPadding * 2) - totalGap;
    return Math.floor(usable / cols);
  }, [width]);

  const changeMonth = (delta: number) => { const d = new Date(month); d.setMonth(d.getMonth() + delta); setMonth(d); };
  const isPast = (d: Date) => d.getTime() < today.getTime();
  const openForDate = (d: Date) => { if (isPast(d)) return; setSelDate(d); setModalOpen(true); };

  // Crear
  const submit = async () => {
    if (!selDate) return;
    const hhmm = sanitizeHHMM(time);
    if (!/^\d{2}:\d{2}$/.test(hhmm)) { Alert.alert('Hora', 'Formato HH:MM'); return; }
    if (!fullName.trim() || !phone.trim()) { Alert.alert('Campos obligatorios', 'Nombre y teléfono.'); return; }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const anon = user ? null : await getClientAnonToken();

      const payload: any = {
        p_business_id: id,
        p_full_name: fullName.trim(),
        p_phone: phone.trim(),
        p_party_size: Math.max(1, Math.min(50, parseInt(party || '1', 10) || 1)),
        p_date: fmtYMD(selDate),
        p_time: hhmm + ':00',
        p_notes: notes.trim() || null,
        p_anon_token: anon,
      };

      const { error } = await supabase.rpc('create_reservation', payload);
      if (error) throw error;

      Alert.alert('Reserva enviada', 'Tu petición está pendiente de confirmación.');
      setModalOpen(false);
      await loadMyReservations();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo crear la reserva');
    }
  };

  // Acciones
  const cancelReservation = async (reservationId: string) => {
    try {
      let ok = false;

      // 1) Intento como usuario registrado (si lo hay)
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data, error } = await supabase.rpc('cancel_reservation_self', {
            p_reservation_id: reservationId,
            p_reason: null,
            p_cancel_status: 'canceled', // unificamos a 'canceled'
          });
          if (error) throw error;
          ok = Boolean(data ?? true);
        }
      } catch (e) {
        // seguimos al intento anónimo
      }

      // 2) Si no estamos logados o falló la 1), probamos como anónimo con el anon_token
      if (!ok) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          const anon = await getClientAnonToken(); // debe ser el MISMO token con el que creaste la reserva
          const { data, error } = await supabase.rpc('cancel_reservation_self_anon', {
            p_reservation_id: reservationId,
            p_anon_token: anon,
            p_reason: null,
            p_cancel_status: 'canceled', // ⬅️ mismo estado
          });
          if (error) throw error;
          ok = Boolean(data ?? true);
        }
      }

      if (!ok) {
        Alert.alert('No se pudo cancelar', 'La reserva no es tuya, o ya no es cancelable.');
        return;
      }

      Alert.alert('Reserva cancelada', 'Se ha cancelado tu reserva.');
      await loadMyReservations(); // refresca la lista
    } catch (e: any) {
      console.log('[reservas] cancelar — error:', e);
      Alert.alert('Error', e?.message ?? 'No se pudo cancelar');
    }
  };


  const acceptProposal = async (reservationId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const anon = user ? null : await getClientAnonToken();

      const { data, error } = await supabase.rpc('customer_accept_proposal', {
        p_reservation_id: reservationId,
        p_anon_token: anon,
      });
      if (error) throw error;
      if (!data) { Alert.alert('No se pudo aceptar', 'La propuesta ya no es válida.'); return; }

      await loadMyReservations();
      Alert.alert('Propuesta aceptada', 'Hemos actualizado tu reserva.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo aceptar la propuesta');
    }
  };

  // Cargar mis reservas del mes con RPC
  const loadMyReservations = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const anon = user ? null : await getClientAnonToken();

      const from = fmtYMD(new Date(month.getFullYear(), month.getMonth(), 1));
      const to   = fmtYMD(new Date(month.getFullYear(), month.getMonth() + 1, 0));

      const { data, error } = await supabase.rpc('get_my_reservations', {
        p_business_id: id,
        p_from: from,
        p_to: to,
        p_anon_token: anon,
      });

      if (error) throw error;
      setMyReservations((data || []) as Reservation[]);
    } catch {
      setMyReservations([]);
    }
  };

  useEffect(() => { loadMyReservations(); /* eslint-disable-line */ }, [id, month.getFullYear(), month.getMonth()]);

  // UI
  const monthTitle = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const weekLetters = ['L','M','X','J','V','S','D'];

  return (
    <ScrollView style={{ flex:1, backgroundColor: theme.colors.card }} contentContainerStyle={{ padding: horizontalPadding, paddingBottom: 24 }}>
      {/* Header calendario */}
      <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom: 12 }}>
        <TouchableOpacity onPress={() => changeMonth(-1)} style={{ width:36, height:36, borderRadius:18, alignItems:'center', justifyContent:'center', backgroundColor:'#fff',
          borderWidth:1, borderColor: theme.colors.border, shadowColor:'#000', shadowOpacity:0.06, shadowRadius:6, shadowOffset:{width:0,height:2}, elevation:2 }}>
          <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={{ fontWeight:'900', color: theme.colors.text, fontSize: 18, textTransform:'capitalize' }}>{monthTitle}</Text>
        <TouchableOpacity onPress={() => changeMonth(1)} style={{ width:36, height:36, borderRadius:18, alignItems:'center', justifyContent:'center', backgroundColor:'#fff',
          borderWidth:1, borderColor: theme.colors.border, shadowColor:'#000', shadowOpacity:0.06, shadowRadius:6, shadowOffset:{width:0,height:2}, elevation:2 }}>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      {/* Días semana */}
      <View style={{ flexDirection:'row', justifyContent:'space-between', marginBottom: 8 }}>
        {weekLetters.map((k) => (
          <View key={k} style={{ width: cellSize, height: 28, borderRadius: 14, alignItems:'center', justifyContent:'center',
            backgroundColor: theme.colors.grayBg, borderWidth: 1, borderColor: theme.colors.border }}>
            <Text style={{ color: theme.colors.gray, fontWeight:'700' }}>{k}</Text>
          </View>
        ))}
      </View>

      {/* Grid días */}
      <View style={{ flexDirection:'row', flexWrap:'wrap', gap }}>
        {days.map((d, i) => {
          const disabledBase = !d || isPast(d);
          const key = d ? fmtYMD(d) : '';
          const hasReservation = d ? reservedDateSet.has(key) : false;
          const finalDisabled = disabledBase || hasReservation;
          const isTodayCell = d && key === fmtYMD(today);

          return (
            <TouchableOpacity key={i} disabled={finalDisabled} onPress={() => d && openForDate(d)} activeOpacity={0.9}
              style={{ width: cellSize, height: cellSize, borderRadius: 12, alignItems:'center', justifyContent:'center',
                backgroundColor: d ? '#fff' : theme.colors.grayBg, borderWidth: 1, borderColor: theme.colors.border,
                opacity: finalDisabled ? 0.5 : 1, shadowColor:'#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
                elevation: 2, position: 'relative' }}>
              {/* HOY */}
              {isTodayCell && (<View style={{ position:'absolute', top:6, right:6, width:8, height:8, borderRadius:4, backgroundColor: theme.colors.primary }}/>)}
              <Text style={{ color: d ? theme.colors.text : theme.colors.gray, fontWeight:'800', fontSize: 16 }}>{d ? d.getDate() : ''}</Text>
              {d && (<View style={{ width: '40%', height: 3, borderRadius: 2, backgroundColor: theme.colors.grayBg, marginTop: 6 }} />)}
              {/* DOT rojo */}
              {hasReservation && (<View style={{ position:'absolute', bottom:6, width:8, height:8, borderRadius:4, backgroundColor: '#E53935' }} />)}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Mis reservas */}
      <View style={{ marginTop: 20 }}>
        <Text style={{ fontSize:16, fontWeight:'900', color: theme.colors.text, marginBottom: 8 }}>Mis reservas este mes</Text>
        {myReservations.length === 0 ? (
          <Text style={{ color: theme.colors.gray }}>No tienes reservas en este mes.</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {myReservations.map((r) => {
              const dateLabel = new Date(r.date + 'T' + r.time).toLocaleDateString();
              const timeLabel = r.time.slice(0,5);
              const ppl = getPeople(r);

              const statusBg =
                r.status === 'confirmed' || r.status === 'accepted' ? '#E8F5E9' :
                r.status === 'owner_proposed' || r.status === 'modified' ? '#FFF8E1' :
                r.status === 'pending' ? '#E3F2FD' : '#FBE9E7';
              const statusColor =
                r.status === 'confirmed' || r.status === 'accepted' ? '#2E7D32' :
                r.status === 'owner_proposed' || r.status === 'modified' ? '#8D6E63' :
                r.status === 'pending' ? '#1565C0' : '#C62828';

              const canAccept = r.status === 'owner_proposed';
              const canCancel = ['pending','owner_proposed','confirmed','accepted','modified'].includes(r.status);

              return (
                <View
                  key={r.id}
                  style={{
                    backgroundColor:'#fff',
                    borderRadius:12,
                    borderWidth:1,
                    borderColor: theme.colors.border,
                    padding:12,
                    shadowColor:'#000', shadowOpacity:0.06, shadowRadius:6, shadowOffset:{width:0,height:2}, elevation:2
                  }}
                >
                  {/* Cabecera: título + badge de estado */}
                  <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
                    <Text style={{ fontWeight:'800', color: theme.colors.text }}>
                      {dateLabel} · {timeLabel}{ppl ? ` — ${ppl} pers.` : ''}
                    </Text>
                    <View style={{ backgroundColor: statusBg, paddingHorizontal:8, paddingVertical:4, borderRadius:8 }}>
                      <Text style={{ color: statusColor, fontWeight:'700', fontSize:12 }}>{r.status}</Text>
                    </View>
                  </View>

                  {/* Línea secundaria */}
                  {r.full_name ? (
                    <Text style={{ marginTop:6, color: theme.colors.gray }} numberOfLines={1}>
                      {r.full_name}{r.phone ? ` · ${r.phone}` : ''}
                    </Text>
                  ) : null}
                  {r.notes ? (<Text style={{ marginTop:4, color: theme.colors.gray }} numberOfLines={2}>{r.notes}</Text>) : null}

                  {/* ACCIONES compactas: justo DEBAJO del status */}
                  {(canAccept || canCancel) && (
                    <View style={{ flexDirection:'row', justifyContent:'flex-end', gap:8, marginTop:10 }}>
                      {canAccept && (
                        <TouchableOpacity
                          onPress={() => acceptProposal(r.id)}
                          style={{
                            paddingVertical:6, paddingHorizontal:10, borderRadius:8,
                            borderWidth:1, borderColor:'#0EA5E9'
                          }}
                        >
                          <Text style={{ color:'#0EA5E9', fontWeight:'800', fontSize:12 }}>Aceptar propuesta</Text>
                        </TouchableOpacity>
                      )}
                      {canCancel && (
                        <TouchableOpacity
                          onPress={() => cancelReservation(r.id)}
                          style={{
                            paddingVertical:6, paddingHorizontal:10, borderRadius:8,
                            borderWidth:1, borderColor:'#EF4444'
                          }}
                        >
                          <Text style={{ color:'#EF4444', fontWeight:'800', fontSize:12 }}>Cancelar</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>

              );
            })}
          </View>
        )}
      </View>

      {/* Modal nueva reserva */}
      <Modal visible={modalOpen} animationType="fade" transparent onRequestClose={()=>setModalOpen(false)}>
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.35)', justifyContent:'center', alignItems:'center', padding:16 }}>
          <KeyboardAvoidingView behavior={Platform.OS==='ios' ? 'padding' : undefined} style={{ width:'100%' }}>
            <View style={{ width:'100%', maxWidth: 460, backgroundColor:'#fff', borderRadius: 16, padding: 16,
              shadowColor:'#000', shadowOpacity:0.12, shadowRadius:12, shadowOffset:{width:0,height:4}, elevation:4 }}>
              <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
                <Text style={{ fontSize:18, fontWeight:'900', color: theme.colors.text }}>Nueva reserva</Text>
                <TouchableOpacity onPress={()=>setModalOpen(false)} style={{ padding:6 }}>
                  <Ionicons name="close" size={22} color={theme.colors.text} />
                </TouchableOpacity>
              </View>

              <Text style={{ marginTop:6, color: theme.colors.gray }}>{selDate ? selDate.toLocaleDateString() : ''}</Text>

              <Text style={{ marginTop:12, color: theme.colors.gray }}>Nombre completo</Text>
              <TextInput value={fullName} onChangeText={setFullName} placeholder="Tu nombre" placeholderTextColor={theme.colors.gray} style={inputStyle} />
              <Text style={{ marginTop:12, color: theme.colors.gray }}>Teléfono</Text>
              <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="600123123" placeholderTextColor={theme.colors.gray} style={inputStyle} />

              <View style={{ flexDirection:'row', marginTop:12 }}>
                <View style={{ flex:1, marginRight:6 }}>
                  <Text style={{ color: theme.colors.gray }}>Nº personas</Text>
                  <TextInput value={party} onChangeText={setParty} keyboardType="number-pad" placeholder="2" placeholderTextColor={theme.colors.gray} style={inputStyle} />
                </View>
                <View style={{ flex:1, marginLeft:6 }}>
                  <Text style={{ color: theme.colors.gray }}>Hora</Text>
                  <TextInput value={time} onChangeText={(t)=>setTime(normalizeHHMM(t))} onBlur={()=>setTime(sanitizeHHMM(time))}
                    maxLength={5} keyboardType="number-pad" placeholder="20:30" placeholderTextColor={theme.colors.gray} style={inputStyle} />
                </View>
              </View>

              <Text style={{ marginTop:12, color: theme.colors.gray }}>Notas (opcional)</Text>
              <TextInput value={notes} onChangeText={setNotes} placeholder="Preferencias o dudas…" placeholderTextColor={theme.colors.gray}
                multiline numberOfLines={3} style={[inputStyle, { minHeight: 86 }]} />

              <TouchableOpacity onPress={submit} style={{ marginTop: 16, backgroundColor: theme.colors.text, borderRadius: 10, padding: 12, alignItems:'center' }}>
                <Text style={{ color:'#fff', fontWeight:'900' }}>Enviar reserva</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </ScrollView>
  );
}

const inputStyle = {
  backgroundColor: '#fff',
  borderRadius: 10,
  padding: 12,
  borderWidth: 1,
  borderColor: theme.colors.border,
  color: theme.colors.text,
} as const;
