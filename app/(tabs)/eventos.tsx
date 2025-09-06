// app/(tabs)/eventos.tsx
import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator,
  RefreshControl, Modal, Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { theme } from '../../lib/theme';
import { useAuthInfo } from '../../lib/useAuthInfo';

type EventRow = {
  id: string;
  business_id: string;
  title?: string | null;
  image_url?: string | null;   // URL pública
  notes?: string | null;
  created_at?: string | null;
  business?: { name?: string | null } | null;
};

const TABLE_EVENTS = 'business_events';

/** Normaliza la URL pública:
 * - Corrige bucket si viene como /public/business_events/ → /public/events/
 * - Asegura https y cache-buster opcional
 */
function normalizePublicUrl(url?: string | null) {
  if (!url) return null;
  let u = url.trim();

  // Corrige bucket mal grabado
  u = u.replace('/object/public/business_events/', '/object/public/events/');

  // Evita dobles ?v= largos encadenados
  const [base, q] = u.split('?');
  const hasV = (q ?? '').includes('v=');
  return hasV ? u : `${base}?v=${Date.now()}`;
}

export default function EventosScreen() {
  const { isOwner } = useAuthInfo() as any;
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [rows, setRows] = useState<EventRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [imageOpen, setImageOpen] = useState<{visible:boolean; url?:string|null}>({visible:false, url: null});

  const fetchEvents = useCallback(async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from(TABLE_EVENTS)
        .select(`
          id,
          business_id,
          title,
          image_url,
          notes,
          created_at,
          business:business_id ( name )
        `)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      setRows((data ?? []) as EventRow[]);
    } catch {
      setRows([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchEvents(); }, [fetchEvents]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchEvents();
    setRefreshing(false);
  }, [fetchEvents]);

  const openBusiness = (businessId: string) => {
    router.push({ pathname: '/business/[id]', params: { id: businessId } });
  };

  const openImage = (url?: string | null) => {
    const fixed = normalizePublicUrl(url);
    if (!fixed) return;
    setImageOpen({ visible: true, url: fixed });
  };
  const closeImage = () => setImageOpen({ visible:false, url: null });

  const width = Dimensions.get('window').width;
  const imgWidth = width - 12*2;
  const imgHeight = Math.round(imgWidth * 9/16);

  return (
    <View style={{ flex:1, backgroundColor: theme.colors.card }}>
      {busy ? (
        <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 12, paddingBottom: 96 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
          }
          keyboardShouldPersistTaps="handled"
        >
          {rows.length === 0 ? (
            <Text style={{ color: theme.colors.gray, padding: 8 }}>
              Aún no hay eventos publicados.
            </Text>
          ) : rows.map((ev) => {
            const businessName = ev.business?.name ?? 'Comercio';
            const badgeTitle = ev.title?.trim();
            const showUrl = normalizePublicUrl(ev.image_url);

            return (
              <View
                key={ev.id}
                style={{
                  marginBottom: 12,
                  borderRadius: 14,
                  backgroundColor: '#fff',
                  borderWidth: 1, borderColor: theme.colors.border,
                  shadowColor:'#000', shadowOpacity:0.06, shadowRadius:6, shadowOffset:{width:0,height:2}, elevation:2,
                  overflow:'hidden'
                }}
              >
                {/* Título = Nombre comercio */}
                <View style={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 10, flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
                  <Text style={{ fontSize: 14, fontWeight:'600', color: theme.colors.gray }} numberOfLines={1}>
                    {businessName}
                  </Text>
                  {!!badgeTitle && (
                    <View style={{ marginLeft: 10, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.colors.grayBg }}>
                      <Text style={{ color: theme.colors.text, fontWeight:'800', fontSize: 14 }} numberOfLines={1}>
                        {badgeTitle}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Imagen grande */}
                {showUrl ? (
                  <TouchableOpacity activeOpacity={0.9} onPress={() => openImage(showUrl)}>
                    <Image
                      source={{ uri: showUrl }}
                      style={{ width: '100%', height: imgHeight, backgroundColor: theme.colors.grayBg }}
                      resizeMode="cover"
                      onError={() => {
                        // Segundo intento: por si viniera con el bucket mal y SIN query
                        const fallback = (ev.image_url || '')
                          .replace('/object/public/business_events/', '/object/public/events/');
                        console.log('[IMG ERROR]', ev.image_url);
                        if (fallback && fallback !== ev.image_url) {
                          // Nota: no podemos cambiar el source aquí sin setState; lo dejamos para el próximo render
                        }
                      }}
                    />
                  </TouchableOpacity>
                ) : (
                  <View style={{ width:'100%', height: imgHeight, backgroundColor: theme.colors.grayBg, alignItems:'center', justifyContent:'center' }}>
                    <Ionicons name="image-outline" size={40} color={theme.colors.gray} />
                  </View>
                )}

                {/* Notas */}
                {!!ev.notes && (
                  <Text style={{ paddingHorizontal: 12, paddingTop: 10, color: theme.colors.text }}>
                    {ev.notes}
                  </Text>
                )}

                {/* CTA: ir al negocio */}
                <View style={{ paddingHorizontal: 12, paddingVertical: 12, flexDirection:'row', justifyContent:'flex-end' }}>
                  <TouchableOpacity
                    onPress={() => openBusiness(ev.business_id)}
                    style={{ backgroundColor: theme.colors.primary ,paddingHorizontal: 12, paddingVertical: 8, borderRadius: 15, borderWidth:1, borderColor: theme.colors.border }}
                    activeOpacity={0.85}
                  >
                    <Text style={{ color: theme.colors.card, fontWeight:'500', fontSize: 10 }}>
                      Ir a {businessName}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* FAB para dueños: Crear evento */}
      {isOwner && (
        <TouchableOpacity
          onPress={() => router.push('/eventos/crear')}
          style={{
            position:'absolute', right:16, bottom:16 + insets.bottom,
            backgroundColor: theme.colors.text,
            width:56, height:56, borderRadius:28,
            alignItems:'center', justifyContent:'center',
            shadowColor:'#000', shadowOpacity:0.15, shadowRadius:10, shadowOffset:{width:0,height:4}, elevation:4
          }}
          accessibilityLabel="Crear evento"
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Modal imagen fullscreen */}
      <Modal visible={imageOpen.visible} transparent animationType="fade" onRequestClose={closeImage}>
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.9)', alignItems:'center', justifyContent:'center' }}>
          <TouchableOpacity onPress={closeImage} activeOpacity={1} style={{ position:'absolute', top: insets.top + 12, right: 16, padding: 6 }}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {imageOpen.url ? (
            <Image source={{ uri: imageOpen.url }} style={{ width: '92%', height: '70%' }} resizeMode="contain" />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}
