// app/eventos/crear.tsx
import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Buffer } from 'buffer';
import { readAsStringAsync, EncodingType } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '../../lib/supabase';
import { useAuthInfo } from '../../lib/useAuthInfo';
import { theme } from '../../lib/theme';

export default function CrearEventoScreen() {
  // --- HOOKS (siempre al principio, sin returns antes) ---
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { biz } = useLocalSearchParams<{ biz?: string }>();
  const { session, loading: authLoading, isOwner, ownerBusinessIds } = useAuthInfo();
  const [ownerBusinesses, setOwnerBusinesses] = useState<{ id: string; name: string }[]>([]);


  // Form
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string>('image/jpeg');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Negocio seleccionado
  const [selectedBiz, setSelectedBiz] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !session || !isOwner) return;

    (async () => {
      const { data, error } = await supabase
        .from('businesses')
        .select('id, name')
        .in('id', ownerBusinessIds ?? []);

      if (!error && data) setOwnerBusinesses(data);
    })();
  }, [authLoading, session, isOwner, ownerBusinessIds])

  // Inicializa el negocio seleccionado cuando haya auth
  useEffect(() => {
    if (authLoading) return;
    const initial = (typeof biz === 'string' && biz) ? biz : (ownerBusinessIds?.[0] ?? null);
    setSelectedBiz(initial);
  }, [authLoading, biz, ownerBusinessIds]);

  // Redirige a /auth solo cuando *ya* sabemos que no hay sesión
  useEffect(() => {
    if (!authLoading && !session) {
      router.replace('/auth');
    }
  }, [authLoading, session, router]);

  // ==== Pick de imagen (API nueva) ====
  const pickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Concede acceso a tus fotos para subir una imagen.');
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any, // API nueva
      quality: 0.9,
      allowsEditing: true,
      aspect: [4, 3],
      selectionLimit: 1,
    });

    if (res.canceled || !res.assets?.length) return;

    const asset = res.assets[0];
    setImageUri(asset.uri);
    setImageMime(asset.mimeType ?? 'image/jpeg');
  }, []);

  const removeImage = useCallback(() => {
    setImageUri(null);
    setImageMime('image/jpeg');
  }, []);

  // ==== Subida a storage: events ====
  const uploadToEventsBucket = useCallback(async (businessId: string, uri: string, mime: string) => {
    setUploading(true);
    try {
      let bytes: Uint8Array | Buffer;

      try {
        const r = await fetch(uri);
        const b: any = await r.blob();
        if (typeof b.arrayBuffer === 'function') {
          const ab = await b.arrayBuffer();
          bytes = new Uint8Array(ab);
        } else {
          const b64fallback = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
          bytes = Buffer.from(b64fallback, 'base64');
        }
      } catch {
        const b64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
        bytes = Buffer.from(b64, 'base64');
      }

      const path = `${businessId}/event-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from('events').upload(path, bytes, { contentType: mime || 'image/jpeg', upsert: true });
      if (upErr) {
        console.log('[STORAGE UPLOAD ERROR]', upErr);
        throw upErr;
      }

      const { data: pub } = supabase.storage.from('business_events').getPublicUrl(path);
      return `${pub.publicUrl}?v=${Date.now()}`;
    } finally {
      setUploading(false);
    }
  }, []);

  // ==== Crear evento ====
  const createEvent = useCallback(async () => {
    if (!isOwner) {
      Alert.alert('Permisos', 'Solo los dueños pueden crear eventos.');
      return;
    }
    if (!selectedBiz) {
      Alert.alert('Negocio', 'Selecciona un negocio.');
      return;
    }

    setSaving(true);
    try {
      // 1) Subir imagen si hay
      let image_url: string | null = null;
      if (imageUri) {
        image_url = await uploadToEventsBucket(selectedBiz, imageUri, imageMime);
      }

      // 2) Insertar fila
      const payload: any = {
        business_id: selectedBiz,
        title: title.trim() || null,
        notes: notes.trim() || null,
        image_url,
      };

      const { error: insErr } = await supabase.from('business_events').insert(payload);
      if (insErr) {
        console.log('[INSERT business_events ERROR]', insErr);
        throw insErr;
      }

      Alert.alert('Publicado', 'Tu evento ha sido creado.');
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo crear el evento');
    } finally {
      setSaving(false);
    }
  }, [isOwner, selectedBiz, imageUri, imageMime, title, notes, router, uploadToEventsBucket]);

  // --- UI helpers ---
  const isBusy = authLoading || uploading || saving;
  const canSubmit = !!session && isOwner && !!selectedBiz && !isBusy;

  // --- RENDER (sin returns tempranos que cambien hooks) ---
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.card }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 8 : 0}
        style={{ flex: 1 }}
      >
        {/* Estados de carga / no owner */}
        {authLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : !session ? (
          // Mientras el effect navega a /auth mostramos algo neutro
          <View style={{ flex: 1 }} />
        ) : !isOwner ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <Text style={{ color: theme.colors.gray, textAlign: 'center' }}>
              Tu usuario no es dueño de ningún negocio.
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            keyboardShouldPersistTaps="always"
          >
            <View
              style={{
                backgroundColor: '#fff',
                borderRadius: 16,
                padding: 16,
                borderWidth: 1,
                borderColor: theme.colors.border,
                shadowColor: '#000',
                shadowOpacity: 0.06,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
                elevation: 2,
              }}
            >
              {/* Selector de negocio (si hay varios) */}
              <Text style={{ color: theme.colors.gray }}>Negocio</Text>
              {ownerBusinesses.map((biz) => (
              <TouchableOpacity
                key={biz.id}
                onPress={() => setSelectedBiz(biz.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: 10,
                  backgroundColor: selectedBiz === biz.id ? theme.colors.grayBg : '#fff',
                  marginBottom: 8,
                }}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={selectedBiz === biz.id ? 'radio-button-on' : 'radio-button-off'}
                  size={18}
                  color={theme.colors.primary}
                  style={{ marginRight: 10 }}
                />
                {/* Ahora mostramos el nombre del negocio */}
                <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{biz.name}</Text>
              </TouchableOpacity>
            ))}

              <Text style={{ color: theme.colors.gray }}>Título (opcional)</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Ej. 2x1 en bebidas"
                placeholderTextColor={theme.colors.gray}
                style={input}
                blurOnSubmit={false}
                returnKeyType="next"
              />

              <Text style={{ color: theme.colors.gray, marginTop: 10 }}>Imagen (opcional)</Text>
              {imageUri ? (
                <View style={{ marginTop: 8 }}>
                  <Image
                    source={{ uri: imageUri }}
                    style={{ width: '100%', height: 200, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border }}
                    resizeMode="cover"
                  />
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8, gap: 8 }}>
                    <TouchableOpacity
                      onPress={pickImage}
                      style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border }}
                      activeOpacity={0.85}
                    >
                      <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 12 }}>Cambiar imagen</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={removeImage}
                      style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#EF4444' }}
                      activeOpacity={0.85}
                    >
                      <Text style={{ color: '#EF4444', fontWeight: '800', fontSize: 12 }}>Quitar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={pickImage}
                  style={{
                    marginTop: 8,
                    paddingVertical: 12,
                    alignItems: 'center',
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.grayBg,
                  }}
                  activeOpacity={0.85}
                >
                  {uploading ? (
                    <ActivityIndicator color={theme.colors.primary} />
                  ) : (
                    <Text style={{ color: theme.colors.text, fontWeight: '800' }}>Elegir imagen</Text>
                  )}
                </TouchableOpacity>
              )}

              <Text style={{ color: theme.colors.gray, marginTop: 10 }}>Notas (opcional)</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Información adicional del evento, horarios, condiciones…"
                placeholderTextColor={theme.colors.gray}
                multiline
                numberOfLines={4}
                style={[input, { minHeight: 100, textAlignVertical: 'top' }]}
                blurOnSubmit
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />

              <TouchableOpacity
                onPress={createEvent}
                disabled={!canSubmit}
                style={{
                  marginTop: 16,
                  backgroundColor: theme.colors.text,
                  borderRadius: 10,
                  padding: 12,
                  alignItems: 'center',
                  opacity: !canSubmit ? 0.6 : 1,
                }}
                activeOpacity={0.85}
              >
                <Text style={{ color: '#fff', fontWeight: '900' }}>
                  {saving ? 'Publicando…' : 'Publicar evento'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const input = {
  backgroundColor: '#fff',
  borderRadius: 10,
  padding: 12,
  borderWidth: 1,
  borderColor: theme.colors.border,
  color: theme.colors.text,
} as const;
