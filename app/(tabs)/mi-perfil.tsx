import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert, Image,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, Keyboard
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { theme } from '../../lib/theme';
import { useAuthInfo } from '../../lib/useAuthInfo';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { uploadImage } from '../../lib/upload';

type Profile = {
  id: string;
  username: string | null;
  full_name: string | null;
  phone: string | null;          // 👈 lo tratamos como string
  avatar_url: string | null;
  address: string | null;        // 👈 nuevo
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
  const [phone, setPhone] = useState('');     // 👈 string
  const [address, setAddress] = useState(''); // 👈 string

  const [owned, setOwned] = useState<OwnedBiz[]>([]);
  const [editMode, setEditMode] = useState(false);

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
        .select('id, username, full_name, phone, avatar_url, address')
        .eq('id', user.id)
        .maybeSingle();

      if (p) {
        const prof = p as Profile;
        setProfile(prof);
        setUsername(String(prof.username ?? ''));
        setFullName(String(prof.full_name ?? ''));
        setAvatar(prof.avatar_url ?? null);
        setPhone(prof.phone != null ? String(prof.phone) : '');      // 👈 coacción a string
        setAddress(prof.address != null ? String(prof.address) : ''); // 👈 coacción a string
      }

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
      if (profile?.username && String(profile.username).toLowerCase() === u.toLowerCase()) {
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
          phone: phone.trim() || null,
          address: address.trim() || null,
        })
        .eq('id', profile.id)
        .select('id')
        .single();
      if (error) throw error;
      Alert.alert('Guardado', 'Perfil actualizado');
      setEditMode(false);
    } catch (e:any) {
      Alert.alert('Error', e.message ?? 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  // Avatar: elegir entre cámara o galería
  const chooseAvatarSource = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { Alert.alert('Sesión', 'Inicia sesión'); return; }

    const pickFromLibrary = async () => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permiso requerido', 'Concede acceso a tus fotos.'); return; }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'] as any,
        quality: 0.9,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (!res.canceled && res.assets?.length) await persistAvatar(user.id, res.assets[0].uri, res.assets[0].mimeType ?? 'image/jpeg');
    };

    const pickFromCamera = async () => {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permiso requerido', 'Concede acceso a la cámara.'); return; }
      const res = await ImagePicker.launchCameraAsync({
        quality: 0.9,
        allowsEditing: true,
        aspect: [1,1],
      });
      if (!res.canceled && res.assets?.length) await persistAvatar(user.id, res.assets[0].uri, res.assets[0].mimeType ?? 'image/jpeg');
    };

    Alert.alert('Avatar', 'Selecciona origen', [
      { text: 'Hacer foto', onPress: pickFromCamera },
      { text: 'Galería', onPress: pickFromLibrary },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const persistAvatar = async (userId: string, uri: string, mime: string) => {
    try {
      setUploading(true);
      const path = `users/${userId}/avatar-${Date.now()}.jpg`;
      const publicUrl = await uploadImage('avatars', path, uri, mime);
      const { error: updErr } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId)
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

          {/* Avatar + Email + Acciones */}
          <View style={{ flexDirection:'row', alignItems:'center', marginBottom:16 }}>
            <TouchableOpacity onPress={chooseAvatarSource} disabled={uploading} style={{ marginRight:12 }}>
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

              <View style={{ flexDirection:'row', alignItems:'center', marginTop:8 }}>
                <TouchableOpacity onPress={chooseAvatarSource} disabled={uploading} style={{ paddingHorizontal:12, paddingVertical:8, backgroundColor: theme.colors.primary, borderRadius:8 }}>
                  {uploading ? <ActivityIndicator color="#fff" /> : <Text style={{ color:'#fff', fontWeight:'700' }}>Cambiar foto</Text>}
                </TouchableOpacity>

                {/* Lápiz para editar */}
                <TouchableOpacity onPress={()=>setEditMode(v=>!v)} style={{ marginLeft:8, padding:8, borderRadius:8, borderWidth:1, borderColor: theme.colors.border, backgroundColor:'#fff' }}>
                  <Ionicons name={editMode ? 'close' : 'pencil'} size={18} color={theme.colors.text} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {!editMode ? (
            // ====== Vista lectura ======
            <View>
              <Row label="Usuario" value={username || '—'} />
              <View style={{ height:8 }} />
              <Row label="Nombre completo" value={fullName || '—'} />
              <View style={{ height:8 }} />
              <Row label="Teléfono" value={phone || '—'} />
              <View style={{ height:8 }} />
              <Row label="Dirección" value={address || '—'} />
            </View>
          ) : (
            // ====== Vista edición ======
            <>
              <Text style={{ marginTop:6, marginBottom:6, color: theme.colors.text }}>Usuario</Text>
              <TextInput
                value={username}
                onChangeText={(t)=>setUsername(String(t))}
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

              <Text style={{ marginBottom:6, color: theme.colors.text }}>Nombre completo</Text>
              <TextInput
                value={fullName}
                onChangeText={(t)=>setFullName(String(t))}
                placeholder="Tu nombre"
                placeholderTextColor={theme.colors.gray}
                style={{ backgroundColor:'#fff', borderRadius:10, padding:12, borderWidth:1, borderColor: theme.colors.border, marginBottom:16, color: theme.colors.text }}
              />

              <Text style={{ marginBottom:6, color: theme.colors.text }}>Teléfono</Text>
              <TextInput
                value={phone}
                onChangeText={(t)=>setPhone(String(t))}
                placeholder="Tu teléfono"
                keyboardType="phone-pad"
                placeholderTextColor={theme.colors.gray}
                style={{ backgroundColor:'#fff', borderRadius:10, padding:12, borderWidth:1, borderColor: theme.colors.border, marginBottom:16, color: theme.colors.text }}
              />

              <Text style={{ marginBottom:6, color: theme.colors.text }}>Dirección</Text>
              <TextInput
                value={address}
                onChangeText={(t)=>setAddress(String(t))}
                placeholder="Tu dirección"
                placeholderTextColor={theme.colors.gray}
                style={{ backgroundColor:'#fff', borderRadius:10, padding:12, borderWidth:1, borderColor: theme.colors.border, marginBottom:16, color: theme.colors.text }}
              />

              <TouchableOpacity onPress={onSave} disabled={saving} style={{ backgroundColor: theme.colors.text, borderRadius:10, padding:14, alignItems:'center', marginBottom:16 }}>
                <Text style={{ color:'#fff', fontWeight:'800' }}>{saving ? 'Guardando...' : 'Guardar cambios'}</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Mis negocios */}
          <Text style={{ fontWeight:'800', fontSize:16, color: theme.colors.text, marginVertical:12 }}>Mis negocios</Text>
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

function Row({ label, value }: { label:string; value:string }) {
  return (
    <View style={{ backgroundColor:'#fff', borderRadius:12, padding:12, borderWidth:1, borderColor: theme.colors.border }}>
      <Text style={{ color: theme.colors.gray, marginBottom:2 }}>{label}</Text>
      <Text style={{ color: theme.colors.text, fontWeight:'700' }} numberOfLines={2}>
        {String(value)}
      </Text>
    </View>
  );
}
