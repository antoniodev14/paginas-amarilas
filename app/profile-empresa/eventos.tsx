import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, Alert, Image, ScrollView, Switch,
  KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthInfo } from '../../lib/useAuthInfo';
import { theme } from '../../lib/theme';
import { uploadImage } from '../../lib/upload';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type EventRow = {
  id: string;
  business_id: string;
  title: string;
  image_url: string | null;
  notes: string | null;
  published: boolean;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
};

export default function EventosScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { biz } = useLocalSearchParams<{ biz?: string | string[] }>();
  const businessId = useMemo(() => Array.isArray(biz) ? biz[0] : biz, [biz]);

  const { session, loading } = useAuthInfo();
  const [checking, setChecking] = useState(true);

  // Data
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // Buscador
  const [q, setQ] = useState('');
  const [showSug, setShowSug] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const qNorm = q.trim().toLowerCase();
  const filteredRows = qNorm
    ? rows.filter(r =>
        (r.title ?? '').toLowerCase().includes(qNorm) ||
        (r.notes ?? '').toLowerCase().includes(qNorm)
      )
    : rows;
  const suggestions = qNorm
    ? Array.from(new Set(rows.map(r => r.title).filter(Boolean) as string[]))
        .filter(t => t.toLowerCase().includes(qNorm))
        .slice(0, 6)
    : [];

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [kbVisibleModal, setKbVisibleModal] = useState(false);
  const [editingId, setEditingId] = useState<string|null>(null);
  const [form, setForm] = useState<{
    title: string;
    notes: string;
    published: boolean;
    image_url: string | null;
    localImageUri: string | null;
    localImageMime?: string | null;
  }>({
    title: '',
    notes: '',
    published: true,
    image_url: null,
    localImageUri: null,
    localImageMime: null
  });

  // Header
  useEffect(() => {
    navigation.setOptions({ headerRight: undefined, title: 'Eventos', headerBackTitle: 'Atrás'  });
  }, [navigation]);

  // Guardia owner del negocio
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

  const fetchEvents = async () => {
    if (!businessId) return;
    setLoadingList(true);
    try {
      const { data, error } = await supabase
        .from('business_events')
        .select('id,business_id,title,image_url,notes,published,created_at,updated_at,created_by')
        .eq('business_id', businessId)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      setRows((data ?? []) as EventRow[]);
    } catch (e) {
      console.error('[business_events] select error:', e);
      setRows([]);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    if (!checking && businessId) fetchEvents();
  }, [checking, businessId]);

  // Teclado SOLO cuando la modal está abierta
  useEffect(() => {
    if (!modalOpen) return;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const sh = Keyboard.addListener(showEvt, () => setKbVisibleModal(true));
    const hd = Keyboard.addListener(hideEvt, () => setKbVisibleModal(false));
    return () => { sh.remove(); hd.remove(); };
  }, [modalOpen]);

  // ---- Helpers modal ----
  const openCreate = () => {
    setEditingId(null);
    setForm({
      title: '',
      notes: '',
      published: true,
      image_url: null,
      localImageUri: null,
      localImageMime: null
    });
    setModalOpen(true);
  };

  const openEdit = (ev: EventRow) => {
    setEditingId(ev.id);
    setForm({
      title: ev.title ?? '',
      notes: ev.notes ?? '',
      published: !!ev.published,
      image_url: ev.image_url ?? null,
      localImageUri: null,
      localImageMime: null
    });
    setModalOpen(true);
  };

  // ---- Imagen: elegir origen (cámara o galería)
  const selectImageSource = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { Alert.alert('Sesión', 'Inicia sesión'); return; }

    const pickFromLibrary = async () => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permiso requerido', 'Concede acceso a tus fotos.'); return; }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'] as any,
        quality: 0.9,
        allowsEditing: true,
        aspect: [4, 3],
      });
      if (!res.canceled && res.assets?.length) {
        const asset = res.assets[0];
        setForm(f => ({ ...f, localImageUri: asset.uri, localImageMime: asset.mimeType ?? 'image/jpeg' }));
      }
    };

    const pickFromCamera = async () => {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permiso requerido', 'Concede acceso a la cámara.'); return; }
      const res = await ImagePicker.launchCameraAsync({
        quality: 0.9,
        allowsEditing: true,
        aspect: [4,3],
      });
      if (!res.canceled && res.assets?.length) {
        const asset = res.assets[0];
        setForm(f => ({ ...f, localImageUri: asset.uri, localImageMime: asset.mimeType ?? 'image/jpeg' }));
      }
    };

    Alert.alert('Imagen del evento', 'Selecciona origen', [
      { text: 'Hacer foto', onPress: pickFromCamera },
      { text: 'Galería', onPress: pickFromLibrary },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  async function uploadImageIfNeeded(eventId: string): Promise<string|null> {
    if (!form.localImageUri) return form.image_url ?? null;
    const path = `events/${businessId}/${eventId}/main-${Date.now()}.jpg`;
    return await uploadImage('event-images', path, form.localImageUri, form.localImageMime ?? 'image/jpeg');
  }

  // ---- Guardar ----
  const onSave = async () => {
    if (!businessId) return;
    const title = form.title.trim();
    if (!title) { Alert.alert('Título obligatorio'); return; }

    try {
      const nowIso = new Date().toISOString();
      let id = editingId;

      if (editingId) {
        const image_url = await uploadImageIfNeeded(editingId);
        const { error } = await supabase
          .from('business_events')
          .update({
            title,
            notes: form.notes.trim() || null,
            published: form.published,
            image_url,
            updated_at: nowIso,
          })
          .eq('id', editingId)
          .eq('business_id', businessId);
        if (error) throw error;
      } else {
        const { data: ins, error: insErr } = await supabase
          .from('business_events')
          .insert({
            business_id: businessId,
            title,
            notes: form.notes.trim() || null,
            published: form.published,
            created_by: session?.user?.id ?? null,
            created_at: nowIso,
            updated_at: nowIso,
          })
          .select('id')
          .single();
        if (insErr) throw insErr;

        id = ins.id as string;

        const image_url = await uploadImageIfNeeded(id);
        if (image_url) {
          const { error: upErr } = await supabase
            .from('business_events')
            .update({ image_url, updated_at: nowIso })
            .eq('id', id)
            .eq('business_id', businessId);
          if (upErr) throw upErr;
        }
      }

      setModalOpen(false);
      await fetchEvents();
    } catch (e:any) {
      if (String(e?.message || e).includes('Bucket not found')) {
        Alert.alert('Storage', 'No se encuentra el bucket "event-images". Créalo o cambia el nombre en el código.');
      } else {
        Alert.alert('Error', e?.message ?? 'No se pudo guardar el evento');
      }
    }
  };

  const onDelete = (ev: EventRow) => {
    Alert.alert('Eliminar', `¿Eliminar "${ev.title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('business_events')
            .delete()
            .eq('id', ev.id)
            .eq('business_id', businessId);
          if (error) { Alert.alert('Error', error.message); return; }
          fetchEvents();
        }
      }
    ]);
  };

  // ⬇️ Si aún estamos validando sesión/owner, sólo spinner. La UI (buscador) ya no depende de loadingList.
  if (checking) {
    return <View style={{ padding: 16 }}><ActivityIndicator color={theme.colors.primary} /></View>;
  }

  return (
    <KeyboardAvoidingView behavior={Platform.select({ ios:'padding', android:'height' })} style={{ flex:1 }}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ flex:1, backgroundColor: theme.colors.grayBg }}>
          {/* === Buscador con autocompletado + botón X === */}
          <View style={{ paddingHorizontal:12, paddingTop:12 }}>
            <View style={{
              flexDirection:'row', alignItems:'center',
              backgroundColor:'#fff', borderRadius:12, borderWidth:1, borderColor: theme.colors.border, paddingHorizontal:10, height:44
            }}>
              <Ionicons name="search" size={18} color={theme.colors.gray} />
              <TextInput
                ref={inputRef}
                value={q}
                onChangeText={(t)=>{ setQ(t); setShowSug(true); }}
                placeholder="Buscar eventos (título o notas)"
                placeholderTextColor={theme.colors.gray}
                style={{ flex:1, marginLeft:8, color: theme.colors.text }}
                returnKeyType="search"
                onSubmitEditing={()=>setShowSug(false)}
                onFocus={()=>setShowSug(true)}
              />
              {q.length > 0 && (
                <TouchableOpacity onPress={()=>{ setQ(''); setShowSug(false); inputRef.current?.focus(); }}>
                  <Ionicons name="close-circle" size={18} color={theme.colors.gray} />
                </TouchableOpacity>
              )}
            </View>

            {showSug && suggestions.length > 0 && (
              <View style={{
                marginTop:6, backgroundColor:'#fff', borderRadius:12, borderWidth:1,
                borderColor: theme.colors.border, overflow:'hidden'
              }}>
                {suggestions.map((s, idx) => (
                  <TouchableOpacity
                    key={s+idx}
                    onPress={()=>{ setQ(s); setShowSug(false); }}
                    style={{
                      paddingHorizontal:12, paddingVertical:10,
                      borderTopWidth: idx===0 ? 0 : 1, borderTopColor: theme.colors.border
                    }}
                  >
                    <Text style={{ color: theme.colors.text }}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Lista */}
          {loadingList ? (
            <View style={{ padding: 16 }}><ActivityIndicator color={theme.colors.primary} /></View>
          ) : (
            <FlatList
              data={filteredRows}
              keyExtractor={(it) => it.id}
              contentContainerStyle={{ padding: 12, paddingBottom: 120 }}
              ListEmptyComponent={
                <Text style={{ textAlign:'center', color: theme.colors.gray, marginTop: 24 }}>
                  {q ? 'Sin resultados para tu búsqueda.' : 'Aún no tienes eventos.'}
                </Text>
              }
              renderItem={({ item }) => {
                const when = new Date(item.updated_at ?? item.created_at ?? Date.now());
                const date = when.toLocaleDateString();
                const time = `${String(when.getHours()).padStart(2,'0')}:${String(when.getMinutes()).padStart(2,'0')}`;

                return (
                  <View
                    style={{
                      marginBottom: 10, backgroundColor:'#fff', borderRadius: 12,
                      borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden', padding: 12
                    }}
                  >
                    <View style={{ flexDirection:'row', alignItems:'center' }}>
                      {/* Miniatura */}
                      {item.image_url ? (
                        <Image
                          source={{ uri: item.image_url }}
                          style={{ width: 56, height: 56, borderRadius: 10, marginRight: 10, borderWidth:1, borderColor: theme.colors.border }}
                        />
                      ) : (
                        <View
                          style={{
                            width: 56, height: 56, borderRadius: 10, marginRight: 10,
                            backgroundColor: theme.colors.grayBg, alignItems:'center', justifyContent:'center',
                            borderWidth:1, borderColor: theme.colors.border
                          }}
                        >
                          <Text style={{ color: theme.colors.gray, fontSize: 10 }}>IMG</Text>
                        </View>
                      )}

                      <View style={{ flex:1 }}>
                        <Text style={{ fontSize: 16, fontWeight:'800', color: theme.colors.text }} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={{ marginTop: 4, fontWeight:'600', color: theme.colors.text }}>
                          {date} · {time}
                        </Text>
                        {!!item.notes && (
                          <Text style={{ marginTop: 2, color: theme.colors.gray }} numberOfLines={2}>
                            {item.notes}
                          </Text>
                        )}
                      </View>

                      <View
                        style={{
                          width: 34, height: 34, borderRadius: 17,
                          backgroundColor: item.published ? '#22C55E33' : '#EF444433',
                          alignItems:'center', justifyContent:'center', marginLeft: 8
                        }}
                      >
                        <Ionicons
                          name={item.published ? 'checkmark' : 'close'}
                          size={18}
                          color={item.published ? '#22C55E' : '#EF4444'}
                        />
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
                );
              }}
            />
          )}

          {/* FAB */}
          <View style={{ position:'absolute', right:16, bottom:24 }}>
            <TouchableOpacity
              onPress={openCreate}
              style={{
                width:56, height:56, borderRadius:28, backgroundColor: theme.colors.primary,
                alignItems:'center', justifyContent:'center',
                shadowColor:'#000', shadowOpacity:0.2, shadowRadius:8, shadowOffset:{width:0,height:3}, elevation:4
              }}
              accessibilityLabel="Crear evento"
            >
              <Ionicons name="add" size={26} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Modal centrada */}
          <Modal
            visible={modalOpen}
            animationType="fade"
            transparent
            presentationStyle="overFullScreen"
            onRequestClose={() => setModalOpen(false)}
          >
            <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.35)', justifyContent:'center', alignItems:'center', padding:16 }}>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={insets.top}
                style={{ width: '100%' }}
              >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                  <View style={{ width:'100%', maxWidth:480, backgroundColor:'#fff', borderRadius:16, padding:16, borderWidth:1, borderColor: theme.colors.border }}>
                    <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
                      <Text style={{ fontSize:18, fontWeight:'800', color: theme.colors.text }}>
                        {editingId ? 'Editar evento' : 'Crear evento'}
                      </Text>
                      <TouchableOpacity onPress={() => setModalOpen(false)}>
                        <Ionicons name="close" size={22} color={theme.colors.text} />
                      </TouchableOpacity>
                    </View>

                    <ScrollView
                      style={{ marginTop: 10 }}
                      contentContainerStyle={{ paddingBottom: (kbVisibleModal ? 8 : 16) + insets.bottom }}
                      keyboardDismissMode="on-drag"
                      keyboardShouldPersistTaps="handled"
                      automaticallyAdjustKeyboardInsets
                    >
                      <Text style={{ color: theme.colors.gray, marginBottom: 4 }}>Título</Text>
                      <TextInput
                        value={form.title}
                        onChangeText={(t)=>setForm(f=>({...f, title:t}))}
                        placeholder="Nombre del evento"
                        style={{ borderWidth:1, borderColor: theme.colors.border, borderRadius:10, padding:10 }}
                        returnKeyType="next"
                      />

                      <Text style={{ color: theme.colors.gray, marginTop: 12, marginBottom: 4 }}>Notas / descripción</Text>
                      <TextInput
                        value={form.notes}
                        onChangeText={(t)=>setForm(f=>({...f, notes:t}))}
                        placeholder="Descripción del evento"
                        multiline
                        style={{ borderWidth:1, borderColor: theme.colors.border, borderRadius:10, padding:10, minHeight:80 }}
                      />

                      <View style={{ flexDirection:'row', alignItems:'center', marginTop: 12 }}>
                        <Text style={{ color: theme.colors.text, fontWeight:'600', marginRight: 8 }}>Publicado</Text>
                        <Switch
                          value={form.published}
                          onValueChange={(v)=>setForm(f=>({...f, published:v}))}
                        />
                      </View>

                      <Text style={{ color: theme.colors.gray, marginTop: 12, marginBottom: 8 }}>Imagen (opcional)</Text>
                      <View style={{ flexDirection:'row', alignItems:'center' }}>
                        <TouchableOpacity
                          onPress={selectImageSource}
                          style={{ paddingHorizontal:12, paddingVertical:8, backgroundColor: theme.colors.primary, borderRadius:8 }}
                        >
                          <Text style={{ color:'#fff', fontWeight:'700' }}>Añadir imagen</Text>
                        </TouchableOpacity>
                        {(form.localImageUri || form.image_url) && (
                          <Image
                            source={{ uri: form.localImageUri ?? form.image_url! }}
                            style={{ width: 64, height: 64, borderRadius: 8, marginLeft: 12 }}
                          />
                        )}
                      </View>

                      <View style={{ height: 12 }} />

                      <TouchableOpacity
                        onPress={onSave}
                        style={{ paddingVertical:12, backgroundColor: theme.colors.text, borderRadius:10, alignItems:'center' }}
                      >
                        <Text style={{ color:'#fff', fontWeight:'800' }}>{editingId ? 'Guardar cambios' : 'Crear evento'}</Text>
                      </TouchableOpacity>
                      <View style={{ height: 8 }} />
                    </ScrollView>
                  </View>
                </TouchableWithoutFeedback>
              </KeyboardAvoidingView>
            </View>
          </Modal>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}
