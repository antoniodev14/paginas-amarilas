import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, Alert, Image, ScrollView, Switch, KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard, 
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { readAsStringAsync, EncodingType } from 'expo-file-system';
import { Buffer } from 'buffer';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthInfo } from '../../lib/useAuthInfo';
import { theme } from '../../lib/theme';

type Category = { id:string; name:string; position?: number };
type Dish = {
  id:string; name:string; description:string|null; price:number; image_url:string|null;
  category_id:string; category_name?:string; is_available:boolean;
};
type Allergen = { id:string; slug:string; name:string; icon_emoji?:string|null };

function slugify(input: string) {
  const base = (input || 'categoria')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')                     // todo lo no alfanumérico -> -
    .replace(/^-+|-+$/g, '')                         // trim guiones
    .replace(/--+/g, '-');                           // colapsa guiones
  return base || 'categoria';
}

async function uniqueSlugForCategory(businessId: string, baseSlug: string) {
  // Trae todos los slugs que empiecen por baseSlug para ese negocio
  const { data } = await supabase
    .from('menu_categories')
    .select('slug')
    .eq('business_id', businessId)
    .ilike('slug', `${baseSlug}%`);

  const existing = new Set((data ?? []).map(r => r.slug as string));
  if (!existing.has(baseSlug)) return baseSlug;

  let i = 2;
  let candidate = `${baseSlug}-${i}`;
  while (existing.has(candidate)) {
    i += 1;
    candidate = `${baseSlug}-${i}`;
  }
  return candidate;
}

export default function ProductosScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { biz } = useLocalSearchParams<{ biz?: string }>();
  const businessId = typeof biz === 'string' ? biz : undefined;

  const { session, loading } = useAuthInfo();
  const [checking, setChecking] = useState(true);

  // Data
  const [categories, setCategories] = useState<Category[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  // Allergens
  const [allAllergens, setAllAllergens] = useState<Allergen[]>([]);
  const [selectedAllergenIds, setSelectedAllergenIds] = useState<string[]>([]);

  // Product Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string|null>(null);
  const [form, setForm] = useState<{
    name:string;
    description:string;
    price:string;
    category_id:string|null;
    is_available:boolean;
    image_url:string|null;
    localImageUri:string|null; // como en mi-perfil
    localImageMime?: string | null;
  }>({
    name:'', description:'', price:'', category_id:null, is_available:true, image_url:null, localImageUri:null, localImageMime:null
  });

  // FAB (speed dial)
  const [fabOpen, setFabOpen] = useState(false);

  // Category Modal
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [savingCat, setSavingCat] = useState(false);

  // Guardia: owner del negocio
  useEffect(() => {
    (async () => {
      if (loading) return;
      if (!session || !businessId) { router.replace('/auth'); return; }

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
  }, [loading, session, businessId]);

  // Quitamos el antiguo headerRight
  useEffect(() => {
    navigation.setOptions({ headerRight: undefined, title: 'Productos', headerBackTitle: 'Atrás'  });
  }, [navigation]);

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('menu_categories')
      .select('id,name,position')
      .eq('business_id', businessId)
      .order('position', { ascending: true })
      .order('name', { ascending: true });
    if (!error && data) setCategories(data as Category[]);
  };

  const fetchDishes = async () => {
    setLoadingList(true);
    try {
      const { data, error } = await supabase
        .from('menu_dishes')
        .select('id,name,description,price,image_url,category_id,is_available, menu_categories!inner(name)')
        .eq('business_id', businessId)
        .order('position', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      const items = (data ?? []).map((d:any) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        price: Number(d.price),
        image_url: d.image_url,
        category_id: d.category_id,
        category_name: d.menu_categories?.name,
        is_available: !!d.is_available,
      })) as Dish[];
      setDishes(items);
    } catch (e) {
      console.error(e);
      setDishes([]);
    } finally {
      setLoadingList(false);
    }
  };

  const fetchAllergens = async () => {
    const { data, error } = await supabase
      .from('allergens')
      .select('id, slug, name, icon_emoji')
      .order('name', { ascending: true });
    if (!error && data) setAllAllergens(data as Allergen[]);
  };

  useEffect(() => {
    if (!checking && businessId) {
      fetchCategories();
      fetchDishes();
      fetchAllergens();
    }
  }, [checking, businessId]);

  if (checking) return null;

  // --- Helpers UI ---
  const openCreate = () => {
    setEditingId(null);
    setForm({
      name:'', description:'', price:'',
      category_id: categories[0]?.id ?? null,
      is_available:true,
      image_url:null,
      localImageUri:null,
      localImageMime:null
    });
    setSelectedAllergenIds([]);
    setModalOpen(true);
    setFabOpen(false);
  };

  const openEdit = async (dish: Dish) => {
    setEditingId(dish.id);
    setForm({
      name: dish.name,
      description: dish.description ?? '',
      price: String(dish.price ?? ''),
      category_id: dish.category_id,
      is_available: dish.is_available,
      image_url: dish.image_url ?? null,
      localImageUri: null,
      localImageMime: null,
    });
    // Cargar alérgenos actuales del plato
    const { data: cur, error: curErr } = await supabase
      .from('menu_dish_allergens')
      .select('allergen_id')
      .eq('dish_id', dish.id);
    if (!curErr && cur) setSelectedAllergenIds(cur.map(r => r.allergen_id));
    setModalOpen(true);
  };

  // === Subida tipo mi-perfil ===
  const pickImage = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { Alert.alert('Sesión', 'Inicia sesión'); return; }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Concede acceso a tus fotos.');
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      quality: 0.9,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (res.canceled || !res.assets?.length) return;

    const asset = res.assets[0];
    setForm(f => ({
      ...f,
      localImageUri: asset.uri,
      localImageMime: asset.mimeType ?? 'image/jpeg',
    }));
  };

  async function uploadImageIfNeeded(dishId: string): Promise<string|null> {
    if (!form.localImageUri) return form.image_url ?? null;

    let bytes: Uint8Array | Buffer;

    try {
      const r = await fetch(form.localImageUri);
      const b: any = await r.blob();
      if (typeof b.arrayBuffer === 'function') {
        const ab = await b.arrayBuffer();
        bytes = new Uint8Array(ab);
      } else {
        const b64 = await readAsStringAsync(form.localImageUri, { encoding: EncodingType.Base64 });
        bytes = Buffer.from(b64, 'base64');
      }
    } catch {
      const b64 = await readAsStringAsync(form.localImageUri, { encoding: EncodingType.Base64 });
      bytes = Buffer.from(b64, 'base64');
    }

    const path = `menu/${businessId}/${dishId}/main-${Date.now()}.jpg`;

    const { error: upErr } = await supabase.storage
      .from('menu-images')
      .upload(path, bytes, {
        contentType: form.localImageMime ?? 'image/jpeg',
        upsert: true,
      });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from('menu-images').getPublicUrl(path);
    const publicUrl = pub?.publicUrl ? `${pub.publicUrl}?v=${Date.now()}` : null;
    return publicUrl;
  }

  const onSave = async () => {
    if (!form.name.trim()) { Alert.alert('Nombre obligatorio'); return; }
    const priceNum = Number(form.price);
    if (isNaN(priceNum) || priceNum < 0) { Alert.alert('Precio inválido'); return; }
    if (!form.category_id) { Alert.alert('Selecciona una categoría'); return; }

    try {
      let dishId = editingId;

      if (editingId) {
        const image_url = await uploadImageIfNeeded(editingId);
        const { error } = await supabase
          .from('menu_dishes')
          .update({
            name: form.name.trim(),
            description: form.description.trim() || null,
            price: priceNum,
            category_id: form.category_id,
            is_available: form.is_available,
            image_url,
          })
          .eq('id', editingId)
          .eq('business_id', businessId);
        if (error) throw error;

      } else {
        const { data: ins, error: insErr } = await supabase
          .from('menu_dishes')
          .insert({
            business_id: businessId,
            category_id: form.category_id,
            name: form.name.trim(),
            description: form.description.trim() || null,
            price: priceNum,
            is_available: form.is_available,
          })
          .select('id')
          .single();
        if (insErr) throw insErr;

        dishId = ins.id as string;

        const image_url = await uploadImageIfNeeded(dishId);
        if (image_url) {
          const { error: upErr } = await supabase
            .from('menu_dishes')
            .update({ image_url })
            .eq('id', dishId)
            .eq('business_id', businessId);
          if (upErr) throw upErr;
        }
      }

      // Alérgenos (replace)
      if (dishId) {
        const { error: delErr } = await supabase
          .from('menu_dish_allergens')
          .delete()
          .eq('dish_id', dishId);
        if (delErr) throw delErr;

        if (selectedAllergenIds.length) {
          const payload = selectedAllergenIds.map(allergen_id => ({ dish_id: dishId!, allergen_id }));
          const { error: insAErr } = await supabase
            .from('menu_dish_allergens')
            .insert(payload);
          if (insAErr) throw insAErr;
        }
      }

      setModalOpen(false);
      await fetchDishes();
    } catch (e:any) {
      console.error(e);
      if (String(e?.message || e).includes('Bucket not found')) {
        Alert.alert('Storage', 'No se encuentra el bucket "menu-images". Créalo o cambia el nombre en el código.');
      } else {
        Alert.alert('Error', e?.message ?? 'No se pudo guardar el producto');
      }
    }
  };

  // --- Categorías: crear / eliminar ---
  const openCategories = () => {
    setCatModalOpen(true);
    setFabOpen(false);
  };

  const createCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    setSavingCat(true);
    try {
      // próximo position (simple: al final)
      const nextPos =
        categories.length && categories.some(c => typeof c.position === 'number')
          ? Math.max(...categories.map(c => c.position ?? 0)) + 1
          : categories.length + 1;

      // genera slug y garantiza unicidad por negocio
      const base = slugify(name);
      const slug = await uniqueSlugForCategory(businessId!, base);

      const { error } = await supabase
        .from('menu_categories')
        .insert({ business_id: businessId, name, position: nextPos, slug });
      if (error) throw error;

      setNewCatName('');
      await fetchCategories();
    } catch (e:any) {
      Alert.alert('Error', e?.message ?? 'No se pudo crear la categoría');
    } finally {
      setSavingCat(false);
    }
  };


  const deleteCategory = async (id: string, name: string) => {
    Alert.alert('Eliminar categoría', `¿Seguro que quieres eliminar "${name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive', onPress: async () => {
          try {
            const { error } = await supabase
              .from('menu_categories')
              .delete()
              .eq('id', id)
              .eq('business_id', businessId);
            if (error) throw error;
            await fetchCategories();
          } catch (e:any) {
            // FK en uso
            Alert.alert('No se puede eliminar', 'Esta categoría tiene productos asociados.');
          }
        }
      }
    ]);
  };

  const onDelete = (dish: Dish) => {
    Alert.alert('Eliminar', `¿Eliminar "${dish.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('menu_dishes')
            .delete()
            .eq('id', dish.id)
            .eq('business_id', businessId);
          if (error) { Alert.alert('Error', error.message); return; }
          fetchDishes();
        }
      }
    ]);
  };

  return (
    <View style={{ flex:1, backgroundColor: theme.colors.grayBg }}>
      {loadingList ? (
        <View style={{ padding: 16 }}><ActivityIndicator color={theme.colors.primary} /></View>
      ) : (
        <FlatList
          data={dishes}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 120 }}
          renderItem={({ item }) => (
            <View
              style={{
                marginBottom: 10, backgroundColor:'#fff', borderRadius: 12,
                borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden', padding: 12
              }}
            >
              {/* Fila compacta: miniatura izquierda + nombre + estado a la derecha */}
              <View style={{ flexDirection:'row', alignItems:'center' }}>
                {/* Miniatura izquierda */}
                {item.image_url ? (
                  <Image
                    source={{ uri: item.image_url }}
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

                {/* Nombre + estado compacto */}
                <View style={{ flex:1, flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
                  <View style={{ flex:1 }}>
                    <Text style={{ fontSize: 16, fontWeight:'800', color: theme.colors.text }} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {/* Precio debajo del nombre */}
                    <Text style={{ marginTop: 4, fontWeight:'600', color: theme.colors.text }}>
                      {item.price.toFixed(2)} €
                    </Text>
                    {/* Categoría en gris, más compacto */}
                    <Text style={{ marginTop: 2, color: theme.colors.gray }}>
                      {item.category_name ?? '—'}
                    </Text>
                  </View>

                  <View
                    style={{
                      width: 32, height: 32, borderRadius: 16,
                      backgroundColor: item.is_available ? '#22C55E33' : '#EF444433',
                      alignItems:'center', justifyContent:'center', marginLeft: 8
                    }}
                  >
                    <Ionicons
                      name={item.is_available ? 'checkmark' : 'close'}
                      size={16}
                      color={item.is_available ? '#22C55E' : '#EF4444'}
                    />
                  </View>
                </View>
              </View>

              <View style={{ flexDirection:'row', marginTop: 10 }}>
                <TouchableOpacity
                  onPress={() => openEdit(item)}
                  style={{ paddingHorizontal:12, paddingVertical:6, backgroundColor: theme.colors.primary, borderRadius:8, marginRight:8 }}
                >
                  <Text style={{ color:'#fff', fontWeight:'700' }}>Editar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onDelete(item)}
                  style={{ paddingHorizontal:12, paddingVertical:6, backgroundColor: '#ef4444', borderRadius:8 }}
                >
                  <Text style={{ color:'#fff', fontWeight:'700' }}>Eliminar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <Text style={{ textAlign:'center', color: theme.colors.gray, marginTop: 24 }}>
              Aún no tienes productos.
            </Text>
          }
        />
      )}

      {/* FAB overlay para cerrar si está abierto */}
      {fabOpen && (
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setFabOpen(false)}
          style={{
            position:'absolute', left:0, right:0, top:0, bottom:0,
            backgroundColor:'transparent'
          }}
        />
      )}

      {/* Speed dial */}
      <View style={{ position:'absolute', right:16, bottom:24 }}>
        {fabOpen && (
          <View style={{ alignItems:'flex-end', marginBottom: 12 }}>
            {/* Opción: Agregar producto */}
            <TouchableOpacity
              onPress={openCreate}
              style={{
                flexDirection:'row', alignItems:'center',
                backgroundColor: '#fff', paddingVertical:10, paddingHorizontal:12,
                borderRadius: 999, marginBottom: 8,
                shadowColor:'#000', shadowOpacity:0.15, shadowRadius:8, shadowOffset:{width:0,height:2}, elevation:3,
                borderWidth:1, borderColor: theme.colors.border
              }}
            >
              <Text style={{ marginRight:8, color: theme.colors.text, fontWeight:'700' }}>Agregar producto</Text>
              <Ionicons name="fast-food-outline" size={18} color={theme.colors.text} />
            </TouchableOpacity>

            {/* Opción: Agregar categoría */}
            <TouchableOpacity
              onPress={openCategories}
              style={{
                flexDirection:'row', alignItems:'center',
                backgroundColor: '#fff', paddingVertical:10, paddingHorizontal:12,
                borderRadius: 999,
                shadowColor:'#000', shadowOpacity:0.15, shadowRadius:8, shadowOffset:{width:0,height:2}, elevation:3,
                borderWidth:1, borderColor: theme.colors.border
              }}
            >
              <Text style={{ marginRight:8, color: theme.colors.text, fontWeight:'700' }}>Agregar categoría</Text>
              <Ionicons name="pricetags-outline" size={18} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
        )}

        {/* Botón principal FAB */}
        <TouchableOpacity
          onPress={() => setFabOpen(v => !v)}
          style={{
            width:56, height:56, borderRadius:28, backgroundColor: theme.colors.primary,
            alignItems:'center', justifyContent:'center',
            shadowColor:'#000', shadowOpacity:0.2, shadowRadius:8, shadowOffset:{width:0,height:3}, elevation:4
          }}
          accessibilityLabel="Acciones"
        >
          <Ionicons name={fabOpen ? 'close' : 'add'} size={26} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Modal Crear/Editar Producto */}
      <Modal
        visible={modalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setModalOpen(false)}
      >
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.35)', justifyContent:'flex-end' }}>
          <View style={{ backgroundColor:'#fff', borderTopLeftRadius:16, borderTopRightRadius:16, padding:16, maxHeight:'90%' }}>
            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
              <Text style={{ fontSize:18, fontWeight:'800', color: theme.colors.text }}>
                {editingId ? 'Editar producto' : 'Agregar producto'}
              </Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <Ionicons name="close" size={22} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ marginTop: 10 }}>
              <Text style={{ color: theme.colors.gray, marginBottom: 4 }}>Nombre</Text>
              <TextInput
                value={form.name}
                onChangeText={(t)=>setForm(f=>({...f, name:t}))}
                placeholder="Nombre del producto"
                style={{ borderWidth:1, borderColor: theme.colors.border, borderRadius:10, padding:10 }}
              />

              <Text style={{ color: theme.colors.gray, marginTop: 12, marginBottom: 4 }}>Descripción (opcional)</Text>
              <TextInput
                value={form.description}
                onChangeText={(t)=>setForm(f=>({...f, description:t}))}
                placeholder="Descripción"
                multiline
                style={{ borderWidth:1, borderColor: theme.colors.border, borderRadius:10, padding:10, minHeight:80 }}
              />

              <Text style={{ color: theme.colors.gray, marginTop: 12, marginBottom: 4 }}>Precio (€)</Text>
              <TextInput
                value={form.price}
                onChangeText={(t)=>setForm(f=>({...f, price:t}))}
                keyboardType="decimal-pad"
                placeholder="0.00"
                style={{ borderWidth:1, borderColor: theme.colors.border, borderRadius:10, padding:10 }}
              />

              <Text style={{ color: theme.colors.gray, marginTop: 12, marginBottom: 4 }}>Categoría</Text>
              <View style={{ borderWidth:1, borderColor: theme.colors.border, borderRadius:10 }}>
                <ScrollView style={{ maxHeight: 160 }}>
                  {categories.map(c => (
                    <TouchableOpacity
                      key={c.id}
                      onPress={()=>setForm(f=>({...f, category_id: c.id}))}
                      style={{
                        padding:10, backgroundColor: form.category_id===c.id ? theme.colors.grayBg : '#fff',
                        borderBottomWidth:1, borderBottomColor: theme.colors.border
                      }}
                    >
                      <Text style={{ color: theme.colors.text }}>{c.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={{ flexDirection:'row', alignItems:'center', marginTop: 12 }}>
                <Text style={{ color: theme.colors.text, fontWeight:'600', marginRight: 8 }}>Disponible</Text>
                <Switch
                  value={form.is_available}
                  onValueChange={(v)=>setForm(f=>({...f, is_available:v}))}
                />
              </View>

              <Text style={{ color: theme.colors.gray, marginTop: 12, marginBottom: 8 }}>Imagen</Text>
              <View style={{ flexDirection:'row', alignItems:'center' }}>
                <TouchableOpacity
                  onPress={pickImage}
                  style={{ paddingHorizontal:12, paddingVertical:8, backgroundColor: theme.colors.primary, borderRadius:8 }}
                >
                  <Text style={{ color:'#fff', fontWeight:'700' }}>Seleccionar imagen</Text>
                </TouchableOpacity>
                {(form.localImageUri || form.image_url) && (
                  <Image
                    source={{ uri: form.localImageUri ?? form.image_url! }}
                    style={{ width: 64, height: 64, borderRadius: 8, marginLeft: 12 }}
                  />
                )}
              </View>

              {/* Alérgenos */}
              <Text style={{ color: theme.colors.gray, marginTop: 12, marginBottom: 8 }}>Alérgenos</Text>
              <ScrollView style={{ maxHeight: 160 }} horizontal={false}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {allAllergens.map(a => {
                    const active = selectedAllergenIds.includes(a.id);
                    return (
                      <TouchableOpacity
                        key={a.id}
                        onPress={() => {
                          setSelectedAllergenIds(prev =>
                            active ? prev.filter(id => id !== a.id) : [...prev, a.id]
                          );
                        }}
                        style={{
                          flexDirection:'row',
                          alignItems:'center',
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          marginRight: 8,
                          marginBottom: 8,
                          backgroundColor: active ? theme.colors.primary : '#fff',
                        }}
                      >
                        <Text style={{ fontSize: 16, width: 22, textAlign:'center' }}>
                          {a.icon_emoji ?? 'ℹ️'}
                        </Text>
                        <Text style={{ marginLeft: 6, color: active ? '#fff' : theme.colors.text, fontWeight:'600' }}>
                          {a.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <View style={{ height: 12 }} />

              <TouchableOpacity
                onPress={onSave}
                style={{ paddingVertical:12, backgroundColor: theme.colors.text, borderRadius:10, alignItems:'center' }}
              >
                <Text style={{ color:'#fff', fontWeight:'800' }}>{editingId ? 'Guardar cambios' : 'Crear producto'}</Text>
              </TouchableOpacity>
              <View style={{ height: 8 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal de Categorías */}
      <Modal
        visible={catModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setCatModalOpen(false)}
      >
        <View
          style={{
            flex:1,
            backgroundColor:'rgba(0,0,0,0.35)',
            justifyContent:'center',
            alignItems:'center',
            padding:16,
          }}
        >
          <View
            style={{
              backgroundColor:'#fff',
              borderRadius:16,
              padding:16,
              width:'90%',
              maxWidth:420,
              maxHeight:'85%',
            }}
          >
            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
              <Text style={{ fontSize:18, fontWeight:'800', color: theme.colors.text }}>Categorías</Text>
              <TouchableOpacity onPress={() => setCatModalOpen(false)}>
                <Ionicons name="close" size={22} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            {/* Crear nueva */}
            <View style={{ flexDirection:'row', marginTop:12 }}>
              <TextInput
                value={newCatName}
                onChangeText={setNewCatName}
                placeholder="Nombre de la categoría"
                style={{
                  flex:1,
                  borderWidth:1,
                  borderColor: theme.colors.border,
                  borderRadius:10,
                  padding:10,
                  marginRight:8,
                }}
                returnKeyType="done"
                onSubmitEditing={createCategory}
              />
              <TouchableOpacity
                onPress={createCategory}
                disabled={savingCat}
                style={{
                  paddingHorizontal:12,
                  alignItems:'center',
                  justifyContent:'center',
                  backgroundColor: theme.colors.primary,
                  borderRadius:10,
                }}
              >
                <Text style={{ color:'#fff', fontWeight:'700' }}>
                  {savingCat ? 'Añadiendo...' : 'Añadir'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Lista de categorías */}
            <ScrollView
              style={{ marginTop: 12 }}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 12 }}
            >
              {categories.length === 0 ? (
                <Text style={{ color: theme.colors.gray }}>No hay categorías aún.</Text>
              ) : categories.map((c) => (
                <View
                  key={c.id}
                  style={{
                    flexDirection:'row',
                    alignItems:'center',
                    paddingVertical:10,
                    borderBottomWidth:1,
                    borderBottomColor: theme.colors.border,
                  }}
                >
                  <Text style={{ flex:1, color: theme.colors.text }}>{c.name}</Text>
                  <TouchableOpacity onPress={() => deleteCategory(c.id, c.name)} style={{ padding:8 }}>
                    <Ionicons name="trash-outline" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
