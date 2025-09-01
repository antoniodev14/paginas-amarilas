import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator, Image, TouchableOpacity, Modal, Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { theme } from '../../lib/theme';

type DishDetail = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  image_url: string | null;
  category_name?: string | null;
  allergens?: Array<{ slug: string; name: string; icon_emoji?: string | null }>;
};

type DishImage = { id: string; image_url: string };

export default function DishDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();

  const [loading, setLoading] = useState(true);
  const [dish, setDish] = useState<DishDetail | null>(null);
  const [gallery, setGallery] = useState<DishImage[]>([]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Plato + categoría + alérgenos
        const { data, error } = await supabase
          .from('menu_dishes')
          .select(`
            id, name, description, price, image_url,
            menu_categories ( name ),
            menu_dish_allergens (
              allergens ( slug, name, icon_emoji )
            )
          `)
          .eq('id', id)
          .maybeSingle();

        if (error) throw error;

        const allergens = ((data?.menu_dish_allergens ?? []) as any[])
          .map((r) => r.allergens)
          .filter(Boolean)
          .map((a: any) => ({ slug: a.slug, name: a.name, icon_emoji: a.icon_emoji }));

        type CatLite = { name: string };
        const mc = data?.menu_categories as CatLite[] | CatLite | undefined;

        const category_name =
          Array.isArray(mc) ? mc[0]?.name ?? null : mc?.name ?? null;



        const detail: DishDetail = {
          id: data?.id,
          name: data?.name,
          description: data?.description ?? null,
          price: typeof data?.price === 'number' ? data.price : Number(data?.price ?? 0),
          image_url: data?.image_url ?? null,
          category_name,
          allergens,
        };
        setDish(detail);

        // Galería (opcional)
        const { data: imgs, error: imgErr } = await supabase
          .from('menu_dish_images')
          .select('id, image_url')
          .eq('dish_id', id)
          .order('position', { ascending: true });
        if (!imgErr && imgs) setGallery(imgs as DishImage[]);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  useEffect(() => {
    navigation.setOptions({ title: dish?.name ?? 'Plato' });
  }, [navigation, dish?.name]);

  const galleryData = useMemo<DishImage[]>(() => {
    if (gallery.length > 0) return gallery;
    if (dish?.image_url) return [{ id: 'main', image_url: dish.image_url }];
    return [];
  }, [gallery, dish?.image_url]);

  // Construye columnas de alérgenos (4 filas por columna)
  const allergenColumns = useMemo(() => {
    const items = dish?.allergens ?? [];
    const perCol = 4;
    const cols = Math.ceil(items.length / perCol);
    return Array.from({ length: cols }, (_, c) => items.slice(c * perCol, (c + 1) * perCol));
  }, [dish?.allergens]);

  const openViewer = (index: number) => {
    setViewerIndex(index);
    setViewerOpen(true);
  };

  if (loading) {
    return <View style={{ padding: 16 }}><ActivityIndicator color={theme.colors.primary} /></View>;
  }
  if (!dish) {
    return <View style={{ padding: 16 }}><Text>No encontrado</Text></View>;
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ paddingBottom: 24 }}>
      {/* Cabecera simple con nombre y precio (sin banner) */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: theme.colors.text }} numberOfLines={2}>
          {dish.name}
        </Text>
        {typeof dish.price === 'number' && !isNaN(dish.price) && (
          <Text style={{ marginTop: 6, fontWeight: '800', color: theme.colors.text }}>
            {dish.price.toFixed(2)} €
          </Text>
        )}
        {!!dish.category_name && (
          <Text style={{ marginTop: 4, color: theme.colors.gray }}>{dish.category_name}</Text>
        )}
      </View>

      {/* Descripción */}
      {!!dish.description && (
        <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
          <Text style={{ color: theme.colors.text }}>{dish.description}</Text>
        </View>
      )}

      {/* Alérgenos (en columnas, 4 filas por columna) */}
      <View
        style={{
          marginTop: 16,
          marginHorizontal: 12,
          backgroundColor: '#fff',
          borderRadius: 12,
          paddingVertical: 10,
          borderWidth: 1, borderColor: theme.colors.border,
        }}
      >
        <Text style={{ fontWeight: '800', color: theme.colors.text, paddingHorizontal: 14, marginBottom: 6 }}>
          Alérgenos
        </Text>

        {(!dish.allergens || dish.allergens.length === 0) ? (
          <Text style={{ color: theme.colors.gray, paddingHorizontal: 14 }}>Sin alérgenos declarados</Text>
        ) : (
          <View style={{ flexDirection: 'row', paddingHorizontal: 14 }}>
            {allergenColumns.map((col, idx) => (
              <View key={idx} style={{ flex: 1, marginRight: idx < allergenColumns.length - 1 ? 12 : 0 }}>
                {col.map((a) => (
                  <View key={a.slug} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
                    <Text style={{ fontSize: 18, width: 26, textAlign: 'center' }}>{a.icon_emoji ?? 'ℹ️'}</Text>
                    <Text style={{ marginLeft: 8, color: theme.colors.text }}>{a.name}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Galería (imágenes medianas en carrusel horizontal) */}
      {galleryData.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontWeight: '800', color: theme.colors.text, paddingHorizontal: 16, marginBottom: 8 }}>
            Galería
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 12 }}
          >
            {galleryData.map((img, i) => (
              <TouchableOpacity
                key={img.id ?? String(i)}
                onPress={() => openViewer(i)}
                style={{
                  marginRight: 10,
                  borderRadius: 10,
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Image
                  source={{ uri: img.image_url }}
                  style={{
                    width: 220, // mediano, no ocupa toda la pantalla
                    height: 150,
                  }}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Modal visor imagen grande */}
      <ImageViewer
        visible={viewerOpen}
        onClose={() => setViewerOpen(false)}
        images={galleryData.map(g => g.image_url)}
        index={viewerIndex}
      />
    </ScrollView>
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

        {/* Controles izquierda/derecha (si hay varias) */}
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

        {/* Imagen centrada, contener sin ocupar todo */}
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
