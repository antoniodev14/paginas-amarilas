import { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, ActivityIndicator, Alert, FlatList, Modal, Dimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { readAsStringAsync, EncodingType } from 'expo-file-system';
import { Buffer } from 'buffer';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useAuthInfo } from '../../../lib/useAuthInfo';
import { theme } from '../../../lib/theme';

type Dish = { id:string; name:string };
type DishImage = { id:string; image_url:string; position:number|null };

const MAX_IMAGES = 10;

export default function GaleriaPlatoDetalle() {
  const navigation = useNavigation();
  const router = useRouter();
  const { biz, dish } = useLocalSearchParams<{ biz?: string; dish?: string }>();
  const businessId = typeof biz === 'string' ? biz : undefined;
  const dishId = typeof dish === 'string' ? dish : undefined;

  const { session, loading } = useAuthInfo();
  const [checking, setChecking] = useState(true);

  const [dishRow, setDishRow] = useState<Dish | null>(null);
  const [imgs, setImgs] = useState<DishImage[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Visor
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  // Guardia owner
  useEffect(() => {
    (async () => {
      if (loading) return;
      if (!session || !businessId || !dishId) { router.replace('/auth'); return; }
      const { data, error } = await supabase
        .from('business_members')
        .select('business_id, role')
        .eq('user_id', session.user.id)
        .eq('business_id', businessId)
        .eq('role', 'owner')
        .maybeSingle();
      if (error || !data) { router.replace('/auth'); return; }
      setChecking(false);
    })();
  }, [loading, session, businessId, dishId]);

  useEffect(() => {
    navigation.setOptions({ title: 'Galería del plato', headerBackTitle: 'Atrás'});
  }, [navigation]);

  const refresh = async () => {
    if (!dishId) return;
    setLoadingList(true);
    const { data: d } = await supabase.from('menu_dishes').select('id,name').eq('id', dishId).maybeSingle();
    if (d) setDishRow(d as Dish);

    const { data: gi } = await supabase
      .from('menu_dish_images')
      .select('id,image_url,position')
      .eq('dish_id', dishId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    setImgs((gi ?? []) as DishImage[]);
    setLoadingList(false);
  };

  useEffect(() => { if (!checking) refresh(); }, [checking, dishId]);

  const nextPosition = () => {
    const nums = imgs.map(i => i.position ?? 0);
    return (nums.length ? Math.max(...nums) : 0) + 1;
  };

  const onAddImage = async () => {
    if (imgs.length >= MAX_IMAGES) {
      Alert.alert('Límite alcanzado', `Máximo ${MAX_IMAGES} imágenes por plato.`);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { Alert.alert('Sesión', 'Inicia sesión'); return; }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permiso requerido', 'Concede acceso a tus fotos.'); return; }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      quality: 0.9,
      allowsEditing: true,
      aspect: [4,3],
    });
    if (res.canceled || !res.assets?.length) return;

    try {
      setUploading(true);
      const asset = res.assets[0];

      let bytes: Uint8Array | Buffer;
      try {
        const r = await fetch(asset.uri);
        const b: any = await r.blob();
        if (typeof b.arrayBuffer === 'function') {
          const ab = await b.arrayBuffer();
          bytes = new Uint8Array(ab);
        } else {
          const b64 = await readAsStringAsync(asset.uri, { encoding: EncodingType.Base64 });
          bytes = Buffer.from(b64, 'base64');
        }
      } catch {
        const b64 = await readAsStringAsync(asset.uri, { encoding: EncodingType.Base64 });
        bytes = Buffer.from(b64, 'base64');
      }

      const path = `menu/${businessId}/${dishId}/gallery-${Date.now()}.jpg`;

      const { error: upErr } = await supabase.storage
        .from('menu-images')
        .upload(path, bytes, { contentType: asset.mimeType ?? 'image/jpeg', upsert: true });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from('menu-images').getPublicUrl(path);
      const publicUrl = `${pub.publicUrl}?v=${Date.now()}`;

      const { error: insErr } = await supabase
        .from('menu_dish_images')
        .insert({ dish_id: dishId, image_url: publicUrl, position: nextPosition() });
      if (insErr) throw insErr;

      await refresh();
    } catch (e:any) {
      console.log(e);
      Alert.alert('Error', e?.message ?? 'No se pudo subir la imagen');
    } finally {
      setUploading(false);
    }
  };

  const onDeleteImage = (img: DishImage) => {
    Alert.alert('Eliminar imagen', '¿Seguro que quieres eliminar esta imagen?', [
      { text:'Cancelar', style:'cancel' },
      { text:'Eliminar', style:'destructive', onPress: async () => {
          const { error } = await supabase
            .from('menu_dish_images')
            .delete()
            .eq('id', img.id)
            .eq('dish_id', dishId);
          if (error) { Alert.alert('Error', error.message); return; }
          refresh();
        }
      }
    ]);
  };

  if (checking) return null;

  return (
    <View style={{ flex:1, backgroundColor: theme.colors.grayBg }}>
      <View style={{ padding:12, paddingBottom:0 }}>
        <Text style={{ fontSize:18, fontWeight:'800', color: theme.colors.text }} numberOfLines={1}>
          {dishRow?.name ?? 'Plato'}
        </Text>
        <Text style={{ color: theme.colors.gray, marginTop:4 }}>
          Imágenes ({imgs.length}/{MAX_IMAGES})
        </Text>
      </View>

      {loadingList ? (
        <View style={{ padding: 16 }}><ActivityIndicator color={theme.colors.primary} /></View>
      ) : (
        <FlatList
          data={imgs}
          keyExtractor={(it) => it.id}
          numColumns={3}
          contentContainerStyle={{ padding:12, paddingBottom: 100 }}
          columnWrapperStyle={{ gap:10 }}
          renderItem={({ item }) => (
            <View style={{ flex:1/3, aspectRatio:1 }}>
              <View
                style={{
                  flex:1, borderRadius:10, overflow:'hidden',
                  borderWidth:1, borderColor: theme.colors.border,
                }}
              >
                <TouchableOpacity
                  style={{ flex:1 }}
                  onPress={() => {
                    const idx = imgs.findIndex(i => i.id === item.id);
                    setViewerIndex(Math.max(0, idx));
                    setViewerOpen(true);
                  }}
                  activeOpacity={0.9}
                >
                  <Image source={{ uri: item.image_url }} style={{ width:'100%', height:'100%' }} />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => onDeleteImage(item)}
                  style={{
                    position:'absolute', top:6, right:6,
                    backgroundColor:'rgba(0,0,0,0.45)',
                    borderRadius:999, padding:6
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={{ textAlign:'center', color: theme.colors.gray, marginTop: 24 }}>Aún no hay imágenes.</Text>}
        />
      )}

      {/* Botón flotante para añadir (deshabilita si llega al límite) */}
      <View style={{ position:'absolute', right:16, bottom:24 }}>
        <TouchableOpacity
          onPress={onAddImage}
          disabled={uploading || imgs.length >= MAX_IMAGES}
          style={{
            width:56, height:56, borderRadius:28,
            backgroundColor: (imgs.length >= MAX_IMAGES) ? '#9CA3AF' : theme.colors.primary,
            alignItems:'center', justifyContent:'center',
            shadowColor:'#000', shadowOpacity:0.2, shadowRadius:8, shadowOffset:{width:0,height:3}, elevation:4
          }}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Ionicons name="add" size={26} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      {/* Visor a pantalla completa */}
      <ImageViewer
        visible={viewerOpen}
        onClose={() => setViewerOpen(false)}
        images={imgs.map(i => i.image_url)}
        index={viewerIndex}
      />
    </View>
  );
}

/** Visor simple en modal para mostrar la imagen ampliada (tap para cerrar) */
function ImageViewer({
  visible, onClose, images, index = 0
}: { visible: boolean; onClose: () => void; images: string[]; index?: number }) {
  const [current, setCurrent] = useState(index);
  useEffect(() => { setCurrent(index); }, [index, visible]);

  const screen = Dimensions.get('window');

  if (!visible) return null;

  const goPrev = () => setCurrent((c) => Math.max(0, c - 1));
  const goNext = () => setCurrent((c) => Math.min(images.length - 1, c + 1));

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.85)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 16,
        }}
      >
        {/* Cerrar */}
        <TouchableOpacity onPress={onClose} style={{ position: 'absolute', top: 32, right: 20, padding: 8 }}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>

        {/* Controles izquierda/derecha */}
        {images.length > 1 && current > 0 && (
          <TouchableOpacity onPress={goPrev} style={{ position: 'absolute', left: 12, padding: 12 }}>
            <Ionicons name="chevron-back" size={28} color="#fff" />
          </TouchableOpacity>
        )}
        {images.length > 1 && current < images.length - 1 && (
          <TouchableOpacity onPress={goNext} style={{ position: 'absolute', right: 12, padding: 12 }}>
            <Ionicons name="chevron-forward" size={28} color="#fff" />
          </TouchableOpacity>
        )}

        {/* Imagen centrada, contenida */}
        <Image
          source={{ uri: images[current] }}
          style={{
            width: Math.min(screen.width * 0.9, 900),
            height: Math.min(screen.height * 0.7, 700),
          }}
          resizeMode="contain"
        />
      </View>
    </Modal>
  );
}
