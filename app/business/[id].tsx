import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ImageBackground,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { formatWeek } from '../../lib/formatHours';
import { theme } from '../../lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

export default function BusinessDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [row, setRow] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoursOpen, setHoursOpen] = useState(false);

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

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

  const handleCall = () => {
    if (row?.phone) Linking.openURL(`tel:${row.phone}`);
  };

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

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ paddingBottom: 24 }}>
      {/* Banner con back y nombre */}
      <View style={{ width: '100%', height: 220, backgroundColor: '#ddd' }}>
        <ImageBackground
          source={row.image_url ? { uri: row.image_url } : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
          imageStyle={{ resizeMode: 'cover' }}
        >
          {/* Botón atrás (respeta safe area) */}
          <View style={{ position: 'absolute', top: insets.top + 8, left: 14 }}>
            <TouchableOpacity
              onPress={goBack}
              style={{
                backgroundColor: 'rgba(0,0,0,0.45)',
                borderRadius: 999,
                padding: 8,
              }}
              accessibilityLabel="Volver atrás"
            >
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={{ backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 16, paddingVertical: 12 }}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }} numberOfLines={1}>
              {row.name}
            </Text>
          </View>
        </ImageBackground>
      </View>

      {/* Estado + horarios */}
      <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: row.is_open ? '#E8F8EE' : '#FDECEC',
              marginRight: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                backgroundColor: row.is_open ? '#22C55E' : '#EF4444',
              }}
            />
            <Text style={{ color: row.is_open ? '#128a0c' : '#c1121f', fontWeight: '700' }}>
              {row.is_open ? 'Abierto ahora' : 'Cerrado'}
            </Text>
          </View>

          <TouchableOpacity onPress={() => setHoursOpen(true)}>
            <Ionicons name="help-circle-outline" size={22} color={theme.colors.gray} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Descripción */}
      {!!row.description && (
        <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
          <Text style={{ color: theme.colors.text }}>{row.description}</Text>
        </View>
      )}

      {/* Card información (solo muestra campos con valor) */}
      <View
        style={{
          marginTop: 16,
          marginHorizontal: 12,
          backgroundColor: '#fff',
          borderRadius: 12,
          paddingVertical: 6,
          shadowColor: '#000',
          shadowOpacity: 0.06,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        {row.service && (
          <InfoRow icon="briefcase-outline" label="Servicio" value={row.service} />
        )}
        {(row.address || row.city) && (
          <InfoRow
            icon="location-outline"
            label="Dónde estamos"
            value={[row.address, row.city].filter(Boolean).join(' · ')}
            onPress={handleNavigate}
            actionable
          />
        )}
        {row.phone && (
          <InfoRow
            icon="call-outline"
            label="Contacto"
            value={row.phone}
            onPress={handleCall}
            actionable
          />
        )}
      </View>

      {/* Modal Horarios (centrada) */}
      <Modal
        visible={hoursOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setHoursOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.35)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 16,
          }}
        >
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 16,
              padding: 16,
              width: '92%',
              maxWidth: 420,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: theme.colors.text }}>Horarios</Text>
              <TouchableOpacity onPress={() => setHoursOpen(false)}>
                <Ionicons name="close" size={22} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <View style={{ marginTop: 8 }}>
              {week.map((l, i) => (
                <Text key={i} style={{ color: '#444', marginTop: 4 }}>
                  {l}
                </Text>
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
  icon,
  label,
  value,
  onPress,
  actionable,
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
      style={{
        paddingHorizontal: 14,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
      }}
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

import { FlatList, Image } from 'react-native';
import { useRouter } from 'expo-router';

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

      {/* Chips de categorías */}
      {!!filters.length && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          <TouchableOpacity
            onPress={() => setSelectedCats([])}
            style={{
              paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
              borderWidth: 1, borderColor: theme.colors.border, marginRight: 8,
              backgroundColor: selectedCats.length ? '#fff' : theme.colors.primary
            }}
          >
            <Text style={{ color: selectedCats.length ? theme.colors.text : '#fff', fontWeight: '600' }}>Todo</Text>
          </TouchableOpacity>

          {filters.map((f) => {
            const active = selectedCats.includes(f.category_id);
            return (
              <TouchableOpacity
                key={f.category_id}
                onPress={() => {
                  setSelectedCats((prev) =>
                    active ? prev.filter(id => id !== f.category_id) : [...prev, f.category_id]
                  );
                }}
                style={{
                  paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                  borderWidth: 1, borderColor: theme.colors.border, marginRight: 8,
                  backgroundColor: active ? theme.colors.primary : '#fff'
                }}
              >
                <Text style={{ color: active ? '#fff' : theme.colors.text, fontWeight: '600' }}>
                  {f.name}{typeof f.dish_count === 'number' ? ` (${f.dish_count})` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Lista de platos */}
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
      {/* Card completa como botón */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Ver detalle de ${name}`}
        style={{
          borderRadius: 12,
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: theme.colors.border,
          overflow: 'hidden',
          padding: 12
        }}
      >
        {/* Fila compacta: miniatura izquierda + título + iconos derecha */}
        <View style={{ flexDirection:'row', alignItems:'center' }}>
          {/* Miniatura izquierda */}
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={{ width: 48, height: 48, borderRadius: 10, marginRight: 10, borderWidth:1, borderColor: theme.colors.border }}
            />
          ) : (
            <View
              style={{
                width: 48, height: 48, borderRadius: 10, marginRight: 10,
                backgroundColor: theme.colors.grayBg, alignItems:'center', justifyContent:'center',
                borderWidth:1, borderColor: theme.colors.border
              }}
            >
              <Text style={{ color: theme.colors.gray, fontSize: 10 }}>IMG</Text>
            </View>
          )}

          {/* Título + acciones */}
          <View style={{ flex:1, flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
            <View style={{ flex:1, paddingRight: 8 }}>
              <View style={{ flexDirection:'row', alignItems:'center' }}>
                <Text
                  style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text, flexShrink: 1 }}
                  numberOfLines={1}
                >
                  {name}
                </Text>
                <TouchableOpacity
                  onPress={() => setShowAllergens(true)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver alérgenos de ${name}`}
                  style={{ marginLeft: 8 }}
                >
                  <Ionicons name="help-circle-outline" size={18} color={theme.colors.gray} />
                </TouchableOpacity>
              </View>

              <Text style={{ marginTop: 4, fontWeight: '600', color: theme.colors.text }}>
                {price.toFixed(2)} €
              </Text>
            </View>

            {/* Flecha visual */}
            <Ionicons name="chevron-forward" size={20} color={theme.colors.gray} />
          </View>
        </View>
      </TouchableOpacity>

      {/* Modal de alérgenos centrada en pantalla */}
      <Modal
        visible={showAllergens}
        animationType="fade"
        transparent
        onRequestClose={() => setShowAllergens(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.35)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 16,
          }}
        >
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 16,
              padding: 16,
              width: '86%',
              maxWidth: 420,
            }}
          >
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



