import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { getClientAnonToken } from '../../lib/reservationClient';
import {
  View,
  Text,
  ImageBackground,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  Linking,
  FlatList,
  Image,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { formatWeek } from '../../lib/formatHours';
import { theme } from '../../lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

type Detail = {
  id: string;
  name: string;
  description: string | null;
  city: string | null;
  address: string | null;
  image_url: string | null;
  timezone: string;
  opening_hours: any;
  service: string;
  is_open: boolean;
  phone?: string | null;
  lat?: number | null;
  lng?: number | null;
};

type Reservation = {
  id: string;
  date: string;     // 'YYYY-MM-DD'
  time: string;     // 'HH:MM:SS'
  status: 'pending' | 'owner_proposed' | 'confirmed' | 'accepted' | 'modified' | 'declined' | 'canceled';
  people?: number | null;
  party?: number | null;
  party_size?: number | null;
  full_name?: string | null;
  notes?: string | null;
  proposed_date?: string | null;
  proposed_time?: string | null;
};

const STATUS_LABEL: Record<Reservation['status'] | string, string> = {
  pending: 'Pendiente',
  owner_proposed: 'Propuesta dueño',
  confirmed: 'Confirmada',
  modified: 'Modificada',
  declined: 'Rechazada cliente',
  canceled: 'Cancelada',
  cancelled: 'Cancelada',
  accepted: 'Aceptada cliente', // por si te llega de algún histórico, pero ya no lo usamos
};

const getPeople = (r: Reservation) => (r.people ?? r.party ?? r.party_size ?? null);
const fmtYMD = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
};

export default function BusinessDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [row, setRow] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoursOpen, setHoursOpen] = useState(false);

  const [upcoming, setUpcoming] = useState<Reservation[]>([]);
  const ACTIVE_STATUSES: Reservation['status'][] = ['pending','owner_proposed','confirmed','accepted','modified'];

  // Oculta header nativo en esta pantalla
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // ---- Carga detalle negocio
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_business_detail', { p_business_id: id });
      if (error) console.error(error);
      const detail = (data?.[0] ?? null) as Detail | null;
      setRow(detail);
      setLoading(false);
    })();
  }, [id]);

  // ---- Carga HASTA 2 reservas próximas
  const loadUpcoming = async () => {
    try {
      const today = new Date(); today.setHours(0,0,0,0);
      const to = new Date(); to.setDate(today.getDate() + 90);

      const { data: { user } } = await supabase.auth.getUser();
      const anon = user ? null : await getClientAnonToken();

      const { data, error } = await supabase.rpc('get_my_reservations', {
        p_business_id: id,
        p_from: fmtYMD(today),
        p_to: fmtYMD(to),
        p_anon_token: anon,
      });

      if (error) throw error;

      const rows = (data || [])
        .filter((r: Reservation) => ACTIVE_STATUSES.includes(r.status))
        .slice(0, 2);

      setUpcoming(rows);
    } catch {
      setUpcoming([]);
    }
  };

  useEffect(() => { loadUpcoming(); }, [id]);

  // ---- Acciones: cancelar / aceptar propuesta
  const cancelReservation = async (reservationId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const anon = user ? null : await getClientAnonToken();

      const { data, error } = await supabase.rpc('cancel_reservation_self', {
        p_reservation_id: reservationId,
        p_anon_token: anon
      });

      if (error) throw error;
      if (!data) { Alert.alert('No se pudo cancelar', 'Comprueba estado o autoría.'); return; }

      await loadUpcoming();
      Alert.alert('Cancelada', 'Tu reserva ha sido cancelada.');
    } catch (e:any) {
      Alert.alert('Error', e?.message ?? 'No se pudo cancelar la reserva');
    }
  };

  const acceptProposal = async (reservationId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const anon = user ? null : await getClientAnonToken();

      const { data, error } = await supabase.rpc('customer_accept_proposal', {
        p_reservation_id: reservationId,
        p_anon_token: anon
      });

      if (error) throw error;
      if (!data) { Alert.alert('No se pudo aceptar', 'La propuesta ya no es válida.'); return; }

      await loadUpcoming();
      Alert.alert('Propuesta aceptada', 'Hemos actualizado tu reserva.');
    } catch (e:any) {
      Alert.alert('Error', e?.message ?? 'No se pudo aceptar la propuesta');
    }
  };

  if (loading) return <View style={{ padding: 16 }}><ActivityIndicator color={theme.colors.primary} /></View>;
  if (!row) return <View style={{ padding: 16 }}><Text>No encontrado</Text></View>;

  const week = formatWeek(row.opening_hours);

  const handleNavigate = () => {
    if (row?.lat != null && row?.lng != null) {
      const url = `https://www.google.com/maps/search/?api=1&query=${row.lat},${row.lng}`;
      Linking.openURL(url);
      return;
    }
    const q = encodeURIComponent([row?.address, row?.city].filter(Boolean).join(', '));
    if (q) Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
  };

  const handleCall = () => { if (row?.phone) Linking.openURL(`tel:${row.phone}`); };

  const goBack = () => {
    // @ts-ignore
    if (navigation.canGoBack && (navigation as any).canGoBack()) {
      // @ts-ignore
      (navigation as any).goBack();
    } else {
      // @ts-ignore
      (navigation as any).replace('/');
    }
  };

  const openReserve = () => { if (row?.id) router.push({ pathname: '/business/[id]/reservar', params: { id: row.id } }); };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ paddingBottom: 24 }}>
      {/* Banner con back, nombre y botón Reservar */}
      <View style={{ width: '100%', height: 220, backgroundColor: '#ddd' }}>
        <ImageBackground
          source={row.image_url ? { uri: row.image_url } : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
          imageStyle={{ resizeMode: 'cover' }}
        >
          {/* Botón atrás */}
          <View style={{ position: 'absolute', top: insets.top + 8, left: 14 }}>
            <TouchableOpacity
              onPress={goBack}
              style={{ backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 999, padding: 8 }}
              accessibilityLabel="Volver atrás"
            >
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Título + Reservar */}
          <View style={{ backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 16, paddingVertical: 12, flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', flex: 1 }} numberOfLines={1}>
              {row.name}
            </Text>

            <TouchableOpacity onPress={openReserve} style={{ backgroundColor:'rgba(0,0,0,0.55)', paddingHorizontal:12, paddingVertical:8, borderRadius:999, marginLeft:12 }}>
              <Text style={{ color:'#fff', fontWeight:'700' }}>Reservar</Text>
            </TouchableOpacity>
          </View>
        </ImageBackground>
      </View>

      {/* Próximas (máx 2) con acciones */}
      {upcoming.length > 0 && (
        <View style={{
          backgroundColor:'#fff', borderRadius:12, padding:12,
          borderWidth:1, borderColor: theme.colors.border,
          shadowColor:'#000', shadowOpacity:0.06, shadowRadius:6, shadowOffset:{width:0,height:2}, elevation:2,
          marginBottom:12
        }}>
          <Text style={{ fontWeight:'900', fontSize:16, color: theme.colors.text, marginBottom:8 }}>
            Tus próximas reservas
          </Text>

          {upcoming.map((r) => {
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
              <View key={r.id} style={{ paddingVertical:8, borderTopWidth:1, borderTopColor: theme.colors.border }}>
                {/* Cabecera: título + badge */}
                <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
                  <Text style={{ fontWeight:'800', color: theme.colors.text }}>
                    {dateLabel} · {timeLabel}{ppl ? ` — ${ppl} pers.` : ''}
                  </Text>
                  
                  <View style={{ backgroundColor: statusBg, paddingHorizontal:8, paddingVertical:4, borderRadius:8 }}>
                    <Text style={{ color: statusColor, fontWeight:'700', fontSize:12 }}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Text>
                  </View>
                </View>
                {r.proposed_time && (r.status === 'owner_proposed' || r.status === 'modified') && (
                  <Text style={{ marginTop:6, color:'#8D6E63', fontWeight:'600' }}>
                    Hora propuesta: {r.proposed_time.slice(0,5)}
                  </Text>
                )}
                {r.notes ? (<Text style={{ marginTop:4, color: theme.colors.gray }} numberOfLines={2}>{r.notes}</Text>) : null}
              </View>
            );
          })}
        </View>
      )}

      {/* Estado + horarios */}
      <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{
            paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
            backgroundColor: row.is_open ? '#E8F8EE' : '#FDECEC', marginRight: 10,
            flexDirection: 'row', alignItems: 'center', gap: 6,
          }}>
            <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: row.is_open ? '#22C55E' : '#EF4444' }}/>
            <Text style={{ color: row.is_open ? '#128a0c' : '#c1121f', fontWeight: '700' }}>
              {row.is_open ? 'Abierto ahora' : 'Cerrado'}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setHoursOpen(true)}>
            <Ionicons name="help-circle-outline" size={22} color={theme.colors.gray} />
          </TouchableOpacity>
        </View>
      </View>

      {!!row.description && (
        <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
          <Text style={{ color: theme.colors.text }}>{row.description}</Text>
        </View>
      )}

      {/* Card info */}
      <View style={{
        marginTop: 16, marginHorizontal: 12, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 6,
        shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
        borderWidth: 1, borderColor: theme.colors.border,
      }}>
        {row.service && (<InfoRow icon="briefcase-outline" label="Servicio" value={row.service} />)}
        {(row.address || row.city) && (
          <InfoRow icon="location-outline" label="Dónde estamos"
            value={[row.address, row.city].filter(Boolean).join(' · ')}
            onPress={handleNavigate} actionable />
        )}
        {row.phone && (<InfoRow icon="call-outline" label="Contacto" value={row.phone} onPress={handleCall} actionable />)}
      </View>

      {/* Modal Horarios */}
      <Modal visible={hoursOpen} animationType="fade" transparent onRequestClose={() => setHoursOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, width: '92%', maxWidth: 420 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: theme.colors.text }}>Horarios</Text>
              <TouchableOpacity onPress={() => setHoursOpen(false)}>
                <Ionicons name="close" size={22} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <View style={{ marginTop: 8 }}>
              {formatWeek(row.opening_hours).map((l, i) => (
                <Text key={i} style={{ color: '#444', marginTop: 4 }}>{l}</Text>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      <View style={{ height: 12 }} />
      <BusinessMenu businessId={row.id} />
    </ScrollView>
  );
}

function InfoRow({
  icon, label, value, onPress, actionable,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress?: () => void;
  actionable?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={actionable ? 0.7 : 1}
      onPress={actionable ? onPress : undefined}
      style={{ paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' }}
    >
      <Ionicons name={icon} size={20} color={theme.colors.gray} style={{ marginRight: 10 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.colors.gray, fontSize: 12 }}>{label}</Text>
        <Text style={{ color: theme.colors.text, fontWeight: '600', marginTop: 2 }}>{value}</Text>
      </View>
      {actionable && <Ionicons name="chevron-forward" size={18} color={theme.colors.gray} />}
    </TouchableOpacity>
  );
}

function BusinessMenu({ businessId }: { businessId: string }) {
  const router = useRouter();
  const [filters, setFilters] = useState<Array<{category_id:string; name:string; slug:string; dish_count:number}>>([]);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [dishes, setDishes] = useState<Array<any>>([]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('get_menu_filters', { p_business_id: businessId });
      if (!error && data) setFilters(data);
    })();
  }, [businessId]);

  const fetchDishes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_menu_dishes', {
        p_business_id: businessId,
        p_category_ids: selectedCats.length ? selectedCats : null,
        p_q: null,
        p_page: 0,
        p_page_size: 200,
      });
      if (error) throw error;
      setDishes(data ?? []);
    } catch (e) {
      console.error(e);
      setDishes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDishes(); }, [businessId, selectedCats.join(',')]);

  if (!filters.length && !dishes.length) return null;

  return (
    <View style={{ paddingHorizontal: 12, marginTop: 8 }}>
      <Text style={{ fontSize: 18, fontWeight: '800', color: theme.colors.text, marginBottom: 8 }}>Carta</Text>

      {/* Chips categorías */}
      {!!filters.length && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          <TouchableOpacity
            onPress={() => setSelectedCats([])}
            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: theme.colors.border, marginRight: 8,
              backgroundColor: selectedCats.length ? '#fff' : theme.colors.primary }}
          >
            <Text style={{ color: selectedCats.length ? theme.colors.text : '#fff', fontWeight: '600' }}>Todo</Text>
          </TouchableOpacity>

          {filters.map((f) => {
            const active = selectedCats.includes(f.category_id);
            return (
              <TouchableOpacity
                key={f.category_id}
                onPress={() => setSelectedCats((prev) => active ? prev.filter(id => id !== f.category_id) : [...prev, f.category_id])}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: theme.colors.border, marginRight: 8,
                  backgroundColor: active ? theme.colors.primary : '#fff' }}
              >
                <Text style={{ color: active ? '#fff' : theme.colors.text, fontWeight: '600' }}>
                  {f.name}{typeof f.dish_count === 'number' ? ` (${f.dish_count})` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Lista platos */}
      {loading ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : (
        <FlatList
          data={dishes}
          keyExtractor={(it) => it.dish_id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <DishCard
              name={item.name}
              price={item.price}
              imageUrl={item.image_url}
              allergens={item.allergens as Array<{slug:string; name:string; icon?:string}>}
              onPress={() => router.push(`/dish/${item.dish_id}`)}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}
    </View>
  );
}

function DishCard({
  name, price, imageUrl, allergens, onPress
}: {
  name: string; price: number; imageUrl?: string|null;
  allergens: Array<{slug:string; name:string; icon?:string}>; onPress: ()=>void;
}) {
  const [showAllergens, setShowAllergens] = useState(false);

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Ver detalle de ${name}`}
        style={{
          borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden', padding: 12
        }}
      >
        <View style={{ flexDirection:'row', alignItems:'center' }}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={{ width: 48, height: 48, borderRadius: 10, marginRight: 10, borderWidth:1, borderColor: theme.colors.border }} />
          ) : (
            <View style={{ width: 48, height: 48, borderRadius: 10, marginRight: 10, backgroundColor: theme.colors.grayBg,
              alignItems:'center', justifyContent:'center', borderWidth:1, borderColor: theme.colors.border }}>
              <Text style={{ color: theme.colors.gray, fontSize: 10 }}>IMG</Text>
            </View>
          )}

          <View style={{ flex:1, flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
            <View style={{ flex:1, paddingRight: 8 }}>
              <View style={{ flexDirection:'row', alignItems:'center' }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text, flexShrink: 1 }} numberOfLines={1}>{name}</Text>
                <TouchableOpacity onPress={() => setShowAllergens(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 8 }}>
                  <Ionicons name="help-circle-outline" size={18} color={theme.colors.gray} />
                </TouchableOpacity>
              </View>
              <Text style={{ marginTop: 4, fontWeight: '600', color: theme.colors.text }}>{price.toFixed(2)} €</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.gray} />
          </View>
        </View>
      </TouchableOpacity>

      <Modal visible={showAllergens} animationType="fade" transparent onRequestClose={() => setShowAllergens(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, width: '86%', maxWidth: 420 }}>
            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
              <Text style={{ fontSize:16, fontWeight:'800', color: theme.colors.text }}>Alérgenos</Text>
              <TouchableOpacity onPress={() => setShowAllergens(false)}>
                <Ionicons name="close" size={20} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <View style={{ marginTop: 8 }}>
              {(allergens ?? []).length ? allergens.map((a) => (
                <View key={a.slug} style={{ flexDirection:'row', alignItems:'center', marginTop: 6 }}>
                  <Text style={{ fontSize:18, width: 26 }}>{a.icon ?? 'ℹ️'}</Text>
                  <Text style={{ marginLeft: 8, color: theme.colors.text }}>{a.name}</Text>
                </View>
              )) : (
                <Text style={{ color: theme.colors.gray, marginTop: 6 }}>Sin alérgenos declarados</Text>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
