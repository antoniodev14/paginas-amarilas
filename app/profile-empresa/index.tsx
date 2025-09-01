import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { ListItem } from '../../components/ListItem';
import { useAuthInfo } from '../../lib/useAuthInfo';
import { supabase } from '../../lib/supabase';

export default function PerfilEmpresa() {
  const router = useRouter();
  const navigation = useNavigation();
  const { biz } = useLocalSearchParams<{ biz?: string }>();
  const businessId = typeof biz === 'string' ? biz : undefined;

  const { session, loading } = useAuthInfo();
  const [businessName, setBusinessName] = useState<string | null>(null);

  // Cargar el nombre del negocio para el título
  useEffect(() => {
    if (!businessId) return;
    (async () => {
      const { data, error } = await supabase
        .from('businesses')
        .select('name')
        .eq('id', businessId)
        .maybeSingle();

      if (!error && data?.name) {
        setBusinessName(data.name);
        navigation.setOptions({ title: data.name });
      }
    })();
  }, [businessId, navigation]);

  // Guardia: sesión y ownership del negocio
  useEffect(() => {
    (async () => {
      if (loading) return;
      if (!session || !businessId) {
        router.replace('/auth');
        return;
      }
      const { data, error } = await supabase
        .from('business_members')
        .select('business_id, role')
        .eq('user_id', session.user.id)
        .eq('business_id', businessId)
        .eq('role', 'owner')
        .maybeSingle();

      if (error || !data) {
        router.replace('/auth');
      }
    })();
  }, [loading, session, businessId, router]);

  if (loading || !session || !businessId) return null;

  return (
    <View style={{ flex:1, backgroundColor:'#f5f5f5' }}>
      <View style={{ height:8 }} />
      <ListItem
        title="Gestión empresa"
        subtitle="Aquí se modifican todos los datos de la empresa (nombre, servicio, imagen, dirección, teléfono, descripción y ciudad)."
        onPress={() => router.push({ pathname: '/profile-empresa/gestion', params: { biz: businessId } })}
      />
      <View style={{ height:3 }} />
      <ListItem
        title="Modificar tramos horarios apertura"
        subtitle="Verás los días y franjas horarias actuales; podrás añadir, editar o eliminar."
        onPress={() => router.push({ pathname: '/profile-empresa/horarios', params: { biz: businessId } })}
      />
      <View style={{ height:3 }} />
       <ListItem
        title="Configuración productos"
        subtitle="Lista de productos (platos) con edición y alta de nuevos."
        onPress={() => router.push({ pathname: '/profile-empresa/productos', params: { biz: businessId } })}
      />
      <View style={{ height:3 }} />
      <ListItem
        title="Galería imágenes"
        subtitle="Gestiona las imágenes de los platos (hasta 10 por plato)."
        onPress={() => router.push({ pathname: '/profile-empresa/galeria', params: { biz: businessId } })}
      />
      <View style={{ height:3 }} />
    </View>
  );
}
