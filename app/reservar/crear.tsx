// app/reservas/crear.tsx
import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { theme } from '../../lib/theme';
import { useAuthInfo } from '../../lib/useAuthInfo';
import { Keyboard } from 'react-native'; // 👈 añade esto arriba

function fmtDDMMYYYY(d: Date) {
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
function ddmmyyyyToYmd(s: string) {
  const [dd, mm, yyyy] = s.split('-');
  if (!dd || !mm || !yyyy) return s;
  return `${yyyy}-${mm}-${dd}`;
}

export default function CrearReservaOwnerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isOwner, businessId } = useAuthInfo() as any;

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [party_size, setPartySize] = useState('2');
  const [date, setDate] = useState(fmtDDMMYYYY(new Date())); // UI: DD-MM-YYYY
  const [time, setTime] = useState('20:30');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const createReservation = useCallback(async () => {
    if (!isOwner || !businessId) {
      Alert.alert('Sin negocio', 'Tu usuario no tiene negocio asociado.');
      return;
    }
    const hhmm = sanitizeHHMM(time);
    if (!/^\d{2}:\d{2}$/.test(hhmm)) { Alert.alert('Hora', 'Formato HH:MM'); return; }
    if (!fullName.trim() || !phone.trim()) { Alert.alert('Campos obligatorios', 'Nombre y teléfono.'); return; }
    const p = Math.max(1, Math.min(50, parseInt(party_size||'1',10)||1));

    setBusy(true);
    try {
      const { error } = await supabase.rpc('owner_create_reservation', {
        p_business_id: businessId,
        p_full_name: fullName.trim(),
        p_phone: phone.trim(),
        p_party_size: p,
        p_date: ddmmyyyyToYmd(date),
        p_time: `${hhmm}:00`,
        p_notes: notes.trim() || null,
      });
      if (error) throw error;
      Alert.alert('Creada', 'Reserva creada y confirmada.');
      router.back();
    } catch (e:any) {
      Alert.alert('Error', e?.message ?? 'No se pudo crear la reserva');
    } finally {
      setBusy(false);
    }
  }, [isOwner, businessId, fullName, phone, party_size, date, time, notes]);

  // Altura del header nativo aprox. para calcular el offset del teclado
  const HEADER_OFFSET = 56;

  return (
    <View style={{ flex:1, backgroundColor: theme.colors.card }}>

      {/* El KAV envuelve TODO para levantar el footer con el teclado */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top + HEADER_OFFSET}
        style={{ flex:1 }}
      >
        {/* Formulario scrollable con padding inferior grande para no chocar con el footer */}
        <ScrollView
          contentContainerStyle={{ padding:16, paddingBottom: insets.bottom + 140 }}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="interactive"
        >
          <View style={{
            backgroundColor:'#fff', borderRadius:16, padding:16,
            borderWidth:1, borderColor: theme.colors.border,
            shadowColor:'#000', shadowOpacity:0.06, shadowRadius:6, shadowOffset:{width:0,height:2}, elevation:2
          }}>
            <Text style={{ color: theme.colors.gray, marginTop: 4 }}>Nombre completo</Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Nombre del cliente"
              placeholderTextColor={theme.colors.gray}
              style={input}
              blurOnSubmit={false}
              returnKeyType="next"
            />

            <Text style={{ color: theme.colors.gray, marginTop: 10 }}>Teléfono</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="600123123"
              placeholderTextColor={theme.colors.gray}
              style={input}
              blurOnSubmit={false}
              returnKeyType="next"
            />

            <Text style={{ color: theme.colors.gray, marginTop: 10 }}>Personas</Text>
            <TextInput
              value={party_size}
              onChangeText={setPartySize}
              keyboardType="number-pad"
              placeholder="2"
              placeholderTextColor={theme.colors.gray}
              style={input}
              blurOnSubmit={false}
              returnKeyType="next"
            />

            <Text style={{ color: theme.colors.gray, marginTop: 10 }}>Fecha (DD-MM-YYYY)</Text>
            <TextInput
              value={date}
              onChangeText={setDate}
              placeholder={fmtDDMMYYYY(new Date())}
              placeholderTextColor={theme.colors.gray}
              style={input}
              blurOnSubmit={false}
              returnKeyType="next"
            />

            <Text style={{ color: theme.colors.gray, marginTop: 10 }}>Hora</Text>
            <TextInput
              value={time}
              onChangeText={(t)=>setTime(normalizeHHMM(t))}
              onBlur={()=>setTime(sanitizeHHMM(time))}
              maxLength={5}
              keyboardType="number-pad"
              placeholder="20:30"
              placeholderTextColor={theme.colors.gray}
              style={input}
              blurOnSubmit={false}
              returnKeyType="next"
            />

            <Text style={{ color: theme.colors.gray, marginTop: 10 }}>Notas (opcional)</Text>
            <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Preferencias u observaciones"
                placeholderTextColor={theme.colors.gray}
                multiline
                numberOfLines={4}
                style={[input, { minHeight: 110, textAlignVertical: 'top' }]}
                returnKeyType="done"          // 👈 mostrar "Aceptar"
                blurOnSubmit={true}           // 👈 permite cerrar
                onSubmitEditing={() => Keyboard.dismiss()} // 👈 cierra teclado
            />
          </View>
        </ScrollView>

        {/* Footer fijo: se eleva con el teclado gracias al KAV */}
        <View
          pointerEvents="box-none"
          style={{
            position:'absolute',
            left:16, right:16,
            bottom: insets.bottom + 12
          }}
        >
          <TouchableOpacity
            onPress={createReservation}
            disabled={busy}
            style={{
              backgroundColor: theme.colors.text,
              borderRadius: 12, paddingVertical: 14, alignItems:'center',
              opacity: busy ? 0.6 : 1,
              shadowColor:'#000', shadowOpacity:0.12, shadowRadius:8, shadowOffset:{width:0,height:3}, elevation:3
            }}
            activeOpacity={0.85}
          >
            <Text style={{ color:'#fff', fontWeight:'900' }}>
              {busy ? 'Creando…' : 'Reservar'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const input = {
  backgroundColor:'#fff',
  borderRadius:10,
  padding:12,
  borderWidth:1,
  borderColor: theme.colors.border,
  color: theme.colors.text
} as const;
