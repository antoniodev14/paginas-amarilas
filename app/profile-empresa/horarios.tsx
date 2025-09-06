import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, Alert, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard
} from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { DAYS, isValidHHMM } from '../../lib/hours';
import { theme } from '../../lib/theme';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthInfo } from '../../lib/useAuthInfo';

type Opening = Record<string, { start:string; end:string }[]>;

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

export default function Horarios() {
  const navigation = useNavigation();
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();

  const { biz } = useLocalSearchParams<{ biz?: string | string[] }>();
  const paramBizId = useMemo(() => Array.isArray(biz) ? biz[0] : biz, [biz]);

  const { session, loading, businessId: ownerDefaultBizId } = useAuthInfo();
  const currentBizId = useMemo(() => paramBizId || ownerDefaultBizId || null, [paramBizId, ownerDefaultBizId]);

  const [checking, setChecking] = useState(true);

  const [hours, setHours] = useState<Opening>(() => Object.fromEntries(DAYS.map(d => [d.key, []])) as Opening);
  const [tz, setTz] = useState('Europe/Madrid');
  const [saving, setSaving] = useState(false);
  const [screenLoading, setScreenLoading] = useState(true);
  const [kbVisible, setKbVisible] = useState(false);

  useEffect(() => {
    navigation.setOptions({ headerBackTitle: 'Atrás', title: 'Horarios' });
  }, [navigation]);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const sh = Keyboard.addListener(showEvt, () => setKbVisible(true));
    const hd = Keyboard.addListener(hideEvt, () => setKbVisible(false));
    return () => { sh.remove(); hd.remove(); };
  }, []);

  // Guardia: sesión + ownership
  useEffect(() => {
    (async () => {
      if (loading) return;
      if (!session || !currentBizId) { router.replace('/auth'); return; }

      const { data, error } = await supabase
        .from('business_members')
        .select('business_id, role')
        .eq('user_id', session.user.id)
        .eq('business_id', currentBizId)
        .eq('role', 'owner')
        .maybeSingle();

      if (error || !data) { router.replace('/auth'); return; }

      setChecking(false);
    })();
  }, [loading, session, currentBizId]);

  // Cargar horarios del negocio actual
  useEffect(() => {
    if (checking || !currentBizId) return;

    (async () => {
      try {
        const { data: b, error } = await supabase
          .from('businesses')
          .select('id, opening_hours, timezone')
          .eq('id', currentBizId)
          .maybeSingle();

        if (error) throw error;

        if (b) {
          setTz(b.timezone ?? 'Europe/Madrid');
          const oh = (b.opening_hours ?? {}) as Opening;
          const filled: Opening = Object.fromEntries(
            DAYS.map(d => [d.key, Array.isArray(oh[d.key]) ? oh[d.key] : []])
          ) as Opening;
          setHours(filled);
        } else {
          // si no existe, deja el objeto vacío por defecto
          setTz('Europe/Madrid');
          setHours(Object.fromEntries(DAYS.map(d => [d.key, []])) as Opening);
        }
      } catch (e) {
        console.log(e);
        setTz('Europe/Madrid');
        setHours(Object.fromEntries(DAYS.map(d => [d.key, []])) as Opening);
      } finally {
        setScreenLoading(false);
      }
    })();
  }, [checking, currentBizId]);

  const addRange = (dayKey: string) =>
    setHours(prev => ({ ...prev, [dayKey]: [...prev[dayKey], { start:'09:00', end:'14:00' }] }));

  const removeRange = (dayKey: string, idx: number) =>
    setHours(prev => ({ ...prev, [dayKey]: prev[dayKey].filter((_,i)=>i!==idx) }));

  const updateRange = (dayKey: string, idx: number, field: 'start'|'end', value: string) =>
    setHours(prev => ({ ...prev, [dayKey]: prev[dayKey].map((r,i)=> i===idx ? { ...r, [field]: value } : r) }));

  const onSave = async () => {
    if (!currentBizId) return;
    for (const d of DAYS) for (const r of hours[d.key]) {
      if (!isValidHHMM(r.start) || !isValidHHMM(r.end)) { Alert.alert('Formato inválido', `Revisa ${d.label}`); return; }
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('update_business_hours', {
        p_business_id: currentBizId,
        p_opening_hours: hours,
        p_timezone: tz
      });
      if (error) throw error;
      Alert.alert('Guardado', 'Horarios actualizados');
    } catch (e:any) {
      Alert.alert('Error', e.message ?? '');
    } finally {
      setSaving(false);
    }
  };

  if (loading || checking || screenLoading) {
    return <View style={{ padding:16 }}><ActivityIndicator color={theme.colors.primary} /></View>;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', android: 'height' })}
      keyboardVerticalOffset={headerHeight - 6}
      style={{ flex:1 }}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          style={{ flex:1, backgroundColor: theme.colors.card }}
          contentContainerStyle={{
            padding:16,
            paddingBottom: kbVisible ? 8 : 24 + insets.bottom,
          }}
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
        >
          <Text style={{ fontSize:18, fontWeight:'800', marginBottom:8, color: theme.colors.text }}>
            Tramos horarios de apertura
          </Text>

          {DAYS.map(d => (
            <View key={d.key} style={{
              marginBottom:16, backgroundColor: theme.colors.grayBg, borderRadius:12,
              padding:12, borderWidth:1, borderColor: theme.colors.border
            }}>
              <View style={{ flexDirection:'row', alignItems:'center', marginBottom:8 }}>
                <Text style={{ fontWeight:'700', fontSize:16, flex:1, color: theme.colors.text }}>{d.label}</Text>
                <TouchableOpacity
                  onPress={() => addRange(d.key)}
                  style={{ paddingHorizontal:12, paddingVertical:6, backgroundColor: theme.colors.primary, borderRadius:8 }}
                >
                  <Text style={{ color:'#fff', fontWeight:'700' }}>Añadir tramo</Text>
                </TouchableOpacity>
              </View>

              {hours[d.key].length === 0 ? (
                <Text style={{ color: theme.colors.gray }}>Cerrado</Text>
              ) : (
                hours[d.key].map((r, idx) => (
                  <View key={idx} style={{ flexDirection:'row', alignItems:'center', marginBottom:8 }}>
                    <TextInput
                      value={r.start}
                      onChangeText={(t)=>updateRange(d.key, idx, 'start', normalizeHHMM(t))}
                      onBlur={()=>updateRange(d.key, idx, 'start', sanitizeHHMM(r.start))}
                      placeholder="HH:MM"
                      keyboardType="number-pad"
                      maxLength={5}
                      style={{
                        flex:1, backgroundColor:'#fff', borderRadius:10, padding:10, marginRight:8,
                        borderWidth:1, borderColor: theme.colors.border, color: theme.colors.text
                      }}
                      placeholderTextColor={theme.colors.gray}
                      returnKeyType="next"
                    />
                    <Text style={{ marginHorizontal:4, color: theme.colors.text }}>–</Text>
                    <TextInput
                      value={r.end}
                      onChangeText={(t)=>updateRange(d.key, idx, 'end', normalizeHHMM(t))}
                      onBlur={()=>updateRange(d.key, idx, 'end', sanitizeHHMM(r.end))}
                      placeholder="HH:MM"
                      keyboardType="number-pad"
                      maxLength={5}
                      style={{
                        flex:1, backgroundColor:'#fff', borderRadius:10, padding:10, marginLeft:8, marginRight:8,
                        borderWidth:1, borderColor: theme.colors.border, color: theme.colors.text
                      }}
                      placeholderTextColor={theme.colors.gray}
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                    />
                    <TouchableOpacity
                      onPress={() => removeRange(d.key, idx)}
                      style={{ paddingHorizontal:12, paddingVertical:8, backgroundColor:'#fff', borderRadius:8, borderWidth:1, borderColor: theme.colors.border }}
                    >
                      <Text style={{ fontWeight:'700', color: theme.colors.text }}>Eliminar</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          ))}

          <TouchableOpacity
            onPress={onSave}
            disabled={saving}
            style={{ backgroundColor: theme.colors.text, borderRadius:12, padding:14, alignItems:'center' }}
          >
            <Text style={{ color:'#fff', fontWeight:'800' }}>{saving ? 'Guardando...' : 'Guardar horarios'}</Text>
          </TouchableOpacity>
          <View style={{ height:8 }} />
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}
