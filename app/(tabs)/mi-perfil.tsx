import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert, Image,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, Keyboard
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { readAsStringAsync, EncodingType } from 'expo-file-system';
import { Buffer } from 'buffer';
import { supabase } from '../../lib/supabase';
import { theme } from '../../lib/theme';
import { useAuthInfo } from '../../lib/useAuthInfo';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

type Profile = {
  id: string;
  username: string | null;
  full_name: string | null;
  phone: number | null;
  avatar_url: string | null;
};
type OwnedBiz = { id: string; name: string; city: string | null; image_url: string | null };

export default function MiPerfil() {
  const router = useRouter();
  const { session, loading: loadingAuth } = useAuthInfo();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [email, setEmail] = useState<string>('');
  const [profile, setProfile] = useState<Profile | null>(null);

  // form
  const [username, setUsername] = useState('');
  const [usernameOk, setUsernameOk] = useState<null | boolean>(null);
  const [fullName, setFullName] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [phone, setPhone] = useState('');

  const [owned, setOwned] = useState<OwnedBiz[]>([]);

  useEffect(() => {
    if (!loadingAuth && !session) router.replace('/auth');
  }, [loadingAuth, session]);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const user = session.user;
      setEmail(user?.email ?? '');

      const { data: p } = await supabase
        .from('profiles')
        .select('id, username, full_name,phone, avatar_url')
        .eq('id', user.id)
        .maybeSingle();
      if (p) {
        setProfile(p);
        setUsername(p.username ?? '');
        setFullName(p.full_name ?? '');
        setAvatar(p.avatar_url ?? null);
        setPhone(p.phone ?? '');

      }

      // negocios donde soy owner (incluye image_url y city)
      const { data: rows } = await supabase
        .from('business_members')
        .select('businesses(id,name,city,image_url)')
        .eq('user_id', user.id)
        .eq('role', 'owner');

      const list: OwnedBiz[] = (rows ?? []).map((r: any) => ({
        id: r.businesses.id,
        name: r.businesses.name,
        city: r.businesses.city,
        image_url: r.businesses.image_url,
      }));
      setOwned(list);

      setLoading(false);
    })();
  }, [session]);

  // disponibilidad username
  useEffect(() => {
    let active = true;
    const t = setTimeout(async () => {
      const u = username.trim();
      if (!u || u.length < 3) { if (active) setUsernameOk(null); return; }
      const { data, error } = await supabase.rpc('is_username_available', { p_username: u });
      if (!active) return;
      if (error) { console.log(error); setUsernameOk(null); return; }
      if (profile?.username && profile.username.toLowerCase() === u.toLowerCase()) {
        setUsernameOk(true);
      } else {
        setUsernameOk(!!data);
      }
    }, 250);
    return () => { active = false; clearTimeout(t); };
  }, [username, profile?.username]);

  const onSave = async () => {
    if (!profile) return;
    const u = username.trim();
    if (u && u.length < 3) { Alert.alert('Usuario', 'Mínimo 3 caracteres'); return; }
    if (usernameOk === false) { Alert.alert('Usuario', 'Ya existe otro igual'); return; }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          username: u || null,
          full_name: fullName.trim() || null,
          avatar_url: avatar || null,
          phone: phone || null
        })
        .eq('id', profile.id)
        .select('id')
        .single();
      if (error) throw error;
      Alert.alert('Guardado', 'Perfil actualizado');
    } catch (e:any) {
      Alert.alert('Error', e.message ?? 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const onPickAvatar = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { Alert.alert('Sesión', 'Inicia sesión'); return; }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permiso requerido', 'Concede acceso a tus fotos.'); return; }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      quality: 0.9,
      allowsEditing: true,
      aspect: [1, 1],
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

      const path = `users/${user.id}/avatar-${Date.now()}.jpg`;

      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, bytes, { contentType: asset.mimeType ?? 'image/jpeg', upsert: true });
      if (upErr) { throw upErr; }

      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${pub.publicUrl}?v=${Date.now()}`;

      const { error: updErr } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id)
        .select('id')
        .single();
      if (updErr) throw updErr;

      setAvatar(publicUrl);
      Alert.alert('Listo', 'Avatar actualizado');
    } catch (e:any) {
      console.log('avatar err', e);
      Alert.alert('Error', e.message ?? 'No se pudo subir');
    } finally {
      setUploading(false);
    }
  };

  if (loadingAuth || !session || loading) {
    return <View style={{ padding:16 }}><ActivityIndicator color={theme.colors.primary} /></View>;
  }

  return (
    <KeyboardAvoidingView behavior={Platform.select({ ios:'padding', android:'height' })} style={{ flex:1 }}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView style={{ flex:1, backgroundColor: theme.colors.card }} contentContainerStyle={{ padding:16, paddingBottom:24 }}>

          {/* Avatar + Email */}
          <View style={{ flexDirection:'row', alignItems:'center', marginBottom:16 }}>
            <TouchableOpacity onPress={onPickAvatar} disabled={uploading} style={{ marginRight:12 }}>
              {avatar ? (
                <Image source={{ uri: avatar }} style={{ width:72, height:72, borderRadius:36, borderWidth:1, borderColor: theme.colors.border }} />
              ) : (
                <View style={{ width:72, height:72, borderRadius:36, backgroundColor: theme.colors.grayBg, alignItems:'center', justifyContent:'center', borderWidth:1, borderColor: theme.colors.border }}>
                  <Text style={{ color: theme.colors.gray }}>IMG</Text>
                </View>
              )}
            </TouchableOpacity>
            <View style={{ flex:1 }}>
              <Text style={{ color: theme.colors.gray, marginBottom:4 }}>Email</Text>
              <Text style={{ fontWeight:'700', color: theme.colors.text }}>{email || '—'}</Text>
              <TouchableOpacity onPress={onPickAvatar} disabled={uploading} style={{ marginTop:8, paddingHorizontal:12, paddingVertical:8, backgroundColor: theme.colors.primary, borderRadius:8, alignSelf:'flex-start' }}>
                {uploading ? <ActivityIndicator color="#fff" /> : <Text style={{ color:'#fff', fontWeight:'700' }}>Cambiar foto</Text>}
              </TouchableOpacity>
            </View>
          </View>

          {/* Username */}
          <Text style={{ marginBottom:6, color: theme.colors.text }}>Usuario</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            placeholder="tu_usuario"
            placeholderTextColor={theme.colors.gray}
            style={{ backgroundColor:'#fff', borderRadius:10, padding:12, borderWidth:1, borderColor: theme.colors.border, marginBottom:6, color: theme.colors.text }}
          />
          {username.length > 0 && (
            <Text style={{ marginBottom:12, color: usernameOk === false ? '#c1121f' : usernameOk ? theme.colors.success : theme.colors.gray }}>
              {usernameOk === false ? 'No disponible' : usernameOk ? 'Disponible' : 'Mínimo 3 caracteres'}
            </Text>
          )}

          {/* Nombre completo */}
          <Text style={{ marginBottom:6, color: theme.colors.text }}>Nombre completo</Text>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder="Tu nombre"
            placeholderTextColor={theme.colors.gray}
            style={{ backgroundColor:'#fff', borderRadius:10, padding:12, borderWidth:1, borderColor: theme.colors.border, marginBottom:16, color: theme.colors.text }}
          />
          {/* phone */}
          <Text style={{ marginBottom:6, color: theme.colors.text }}>Telefono</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="Tu telefono"
            placeholderTextColor={theme.colors.gray}
            style={{ backgroundColor:'#fff', borderRadius:10, padding:12, borderWidth:1, borderColor: theme.colors.border, marginBottom:16, color: theme.colors.text }}
          />

          <TouchableOpacity onPress={onSave} disabled={saving} style={{ backgroundColor: theme.colors.text, borderRadius:10, padding:14, alignItems:'center', marginBottom:16 }}>
            <Text style={{ color:'#fff', fontWeight:'800' }}>{saving ? 'Guardando...' : 'Guardar cambios'}</Text>
          </TouchableOpacity>

          {/* Mis negocios */}
          <Text style={{ fontWeight:'800', fontSize:16, color: theme.colors.text, marginBottom:8 }}>Mis negocios</Text>
          {owned.length === 0 ? (
            <Text style={{ color: theme.colors.gray }}>No tienes negocios aún.</Text>
          ) : (
            owned.map(b => (
              <TouchableOpacity
                key={b.id}
                onPress={() => router.push({ pathname: '/profile-empresa', params: { biz: b.id } })}
                style={{
                  flexDirection:'row',
                  alignItems:'center',
                  backgroundColor:'#fff',
                  borderRadius:12,
                  padding:12,
                  marginBottom:10,
                  borderWidth:1,
                  borderColor: theme.colors.border
                }}
              >
                {/* Imagen redonda del negocio */}
                {b.image_url ? (
                  <Image source={{ uri: b.image_url }} style={{ width:56, height:56, borderRadius:28, marginRight:12, borderWidth:1, borderColor: theme.colors.border }} />
                ) : (
                  <View style={{ width:56, height:56, borderRadius:28, marginRight:12, backgroundColor: theme.colors.grayBg, alignItems:'center', justifyContent:'center', borderWidth:1, borderColor: theme.colors.border }}>
                    <Text style={{ color: theme.colors.gray, fontSize:12 }}>IMG</Text>
                  </View>
                )}
                <View style={{ flex:1 }}>
                  <Text style={{ fontWeight:'700', color: theme.colors.text }} numberOfLines={1}>{b.name}</Text>
                  <Text style={{ color: theme.colors.gray }} numberOfLines={1}>{b.city || '—'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.colors.gray} />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}
