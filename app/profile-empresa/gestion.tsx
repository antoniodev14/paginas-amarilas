import { useEffect, useState, useMemo } from 'react';
import { View, Text, TextInput, TextStyle, TouchableOpacity, Alert, Image, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { theme } from '../../lib/theme';
import { uploadImage } from '../../lib/upload';
import { useAuthInfo } from '../../lib/useAuthInfo';

type Service = { id: string; name: string; slug: string };
type Biz = {
  id: string; name: string; description: string|null; city: string|null; address: string|null;
  phone: string|null; image_url: string|null; service_type_id: string;
};

export default function GestionEmpresa() {
  const navigation = useNavigation();
  const router = useRouter();
  const { biz } = useLocalSearchParams<{ biz?: string | string[] }>();
  const paramBizId = useMemo(() => Array.isArray(biz) ? biz[0] : biz, [biz]);

  const { session, loading, businessId: ownerDefaultBizId } = useAuthInfo();

  // fuente única de verdad para el negocio actual:
  const currentBizId = useMemo(() => paramBizId || ownerDefaultBizId || null, [paramBizId, ownerDefaultBizId]);

  const [checking, setChecking] = useState(true);
  const [loadingScreen, setLoadingScreen] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [services, setServices] = useState<Service[]>([]);
  const [bizRow, setBizRow] = useState<Biz | null>(null);

  // form
  const [name, setName] = useState('');
  const [serviceId, setServiceId] = useState<string>('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [desc, setDesc] = useState('');
  const [img, setImg] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ headerBackTitle: 'Atrás', title: 'Gestión empresa' });
  }, [navigation]);

  // Guardia: sesión + ownership del negocio actual
  useEffect(() => {
    (async () => {
      if (loading) return;
      if (!session || !currentBizId) { router.replace('/auth'); return; }

      const { data, error } = await supabase
        .from('business_members')
        .select('business_id, role')
        .eq('user_id', session.user.id)
        .eq('business_id', currentBizId)
        .eq('role', 'owner')
        .maybeSingle();

      if (error || !data) { router.replace('/auth'); return; }

      setChecking(false);
    })();
  }, [loading, session, currentBizId]);

  // Carga de datos (servicios + negocio) una vez verificado
  useEffect(() => {
    if (checking || !currentBizId) return;

    (async () => {
      try {
        const [{ data: sv }, { data: row, error }] = await Promise.all([
          supabase.from('services').select('id,name,slug').order('name'),
          supabase
            .from('businesses')
            .select('id,name,description,city,address,phone,image_url,service_type_id')
            .eq('id', currentBizId)
            .maybeSingle()
        ]);

        setServices((sv ?? []) as Service[]);
        if (error) throw error;

        const b = (row ?? null) as Biz | null;
        setBizRow(b);
        if (b) {
          setName(b.name);
          setServiceId(b.service_type_id);
          setCity(b.city ?? '');
          setAddress(b.address ?? '');
          setPhone(b.phone ?? '');
          setDesc(b.description ?? '');
          setImg(b.image_url);
        }
      } catch (e) {
        console.log(e);
        setBizRow(null);
      } finally {
        setLoadingScreen(false);
      }
    })();
  }, [checking, currentBizId]);

  const onPickImage = async () => {
    if (!session || !currentBizId) { Alert.alert('Espera', 'Inicia sesión y carga el negocio.'); return; }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permiso requerido', 'Concede acceso a tus fotos.'); return; }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      allowsEditing: true,
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.length) return;

    try {
      setUploading(true);
      const asset = result.assets[0];

      const path = `businesses/${currentBizId}/main-${Date.now()}.jpg`;
      const publicUrl = await uploadImage('business-images', path, asset.uri, asset.mimeType ?? 'image/jpeg');

      const { error: updErr } = await supabase
        .from('businesses')
        .update({ image_url: publicUrl })
        .eq('id', currentBizId)
        .select('id')
        .single();

      if (updErr) { Alert.alert('Error guardando URL', updErr.message ?? ''); return; }

      setImg(publicUrl);
      Alert.alert('Imagen subida', 'Imagen y URL guardadas.');
    } catch (e:any) {
      Alert.alert('Error', e?.message ?? 'Error desconocido');
    } finally {
      setUploading(false);
    }
  };

  const onSave = async () => {
    if (!currentBizId) return;
    try {
      const { error } = await supabase
        .from('businesses')
        .update({
          name: name.trim(),
          service_type_id: serviceId,
          city: city.trim() || null,
          address: address.trim() || null,
          phone: phone.trim() || null,
          description: desc.trim() || null,
          image_url: img
        })
        .eq('id', currentBizId)
        .select('id')
        .single();
      if (error) throw error;
      Alert.alert('Guardado', 'Datos actualizados');
    } catch (e:any) {
      Alert.alert('Error', e.message);
    }
  };

  if (loading || checking || loadingScreen) return <View style={{ padding:16 }}><ActivityIndicator color={theme.colors.primary} /></View>;
  if (!bizRow) return <View style={{ padding:16 }}><Text style={{ color: theme.colors.text }}>No se encontró el negocio.</Text></View>;

  return (
    <KeyboardAvoidingView behavior={Platform.select({ ios:'padding', android:'height' })} style={{ flex:1 }}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView style={{ flex:1, backgroundColor: theme.colors.card }} contentContainerStyle={{ padding:16, gap:12, paddingBottom: 24 }}>
          <Text style={{ color: theme.colors.text }}>Nombre</Text>
          <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="Mi negocio" placeholderTextColor={theme.colors.gray} />
          <Text style={{ color: theme.colors.text }}>Ciudad</Text>
          <TextInput value={city} onChangeText={setCity} style={styles.input} placeholder="Madrid" placeholderTextColor={theme.colors.gray} />
          <Text style={{ color: theme.colors.text }}>Dirección</Text>
          <TextInput value={address} onChangeText={setAddress} style={styles.input} placeholder="Calle..." placeholderTextColor={theme.colors.gray} />
          <Text style={{ color: theme.colors.text }}>Teléfono</Text>
          <TextInput value={phone} onChangeText={setPhone} style={styles.input} keyboardType="phone-pad" placeholder="+34 ..." placeholderTextColor={theme.colors.gray} />
          <Text style={{ color: theme.colors.text }}>Descripción</Text>
          <TextInput value={desc} onChangeText={setDesc} style={[styles.input,{height:100}]} multiline placeholder="Cuéntanos sobre tu negocio" placeholderTextColor={theme.colors.gray} />
          <Text style={{ color: theme.colors.text }}>Imagen principal</Text>
          {img ? <Image source={{ uri: img }} style={{ width:'100%', height:160, borderRadius:10, borderWidth:1, borderColor: theme.colors.border }} /> : null}
          <TouchableOpacity onPress={onPickImage} style={[styles.button, { backgroundColor: theme.colors.primary }]} disabled={uploading}>
            {uploading ? <ActivityIndicator color="#fff" /> : <Text style={[styles.buttonText,{ color:'#fff' }]}>Subir / Cambiar imagen</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={onSave} style={[styles.button,{ backgroundColor: theme.colors.text }]}>
            <Text style={[styles.buttonText,{ color:'#fff' }]}>Guardar cambios</Text>
          </TouchableOpacity>
          <View style={{ height:24 }} />
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = {
  input: { backgroundColor:'#fff', borderRadius:12, padding:12, borderWidth:1, borderColor: theme.colors.border, color: theme.colors.text },
  selectBtn: { backgroundColor:'#fff', borderRadius:12, padding:12, justifyContent:'center' as const, borderWidth:1, borderColor: theme.colors.border },
  button: { borderRadius:12, padding:14, alignItems:'center' as const },
  buttonText: { fontWeight: '700' as TextStyle['fontWeight'] },
};
