import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useAuthInfo } from '../../../lib/useAuthInfo';
import { theme } from '../../../lib/theme';
import { useNavigation } from 'expo-router';


type Dish = { id: string; name: string; image_url: string | null };

export default function GaleriaPlatosListado() {
  const router = useRouter();
  const { biz } = useLocalSearchParams<{ biz?: string }>();
  const businessId = typeof biz === 'string' ? biz : undefined;

  const { session, loading } = useAuthInfo();
  const [checking, setChecking] = useState(true);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({ title: 'Galería de imágenes', headerBackTitle: 'Atrás' });
  }, [navigation]);
  // Guardia owner
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

  useEffect(() => {
    (async () => {
      if (checking || !businessId) return;
      setLoadingList(true);
      const { data, error } = await supabase
        .from('menu_dishes')
        .select('id,name,image_url')
        .eq('business_id', businessId)
        .order('name', { ascending: true });
      if (!error && data) setDishes(data as Dish[]);
      setLoadingList(false);
    })();
  }, [checking, businessId]);

  if (checking) return null;

  return (
    <View style={{ flex:1, backgroundColor: theme.colors.grayBg, padding: 12 }}>
      {loadingList ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : dishes.length === 0 ? (
        <Text style={{ color: theme.colors.gray, textAlign:'center', marginTop: 24 }}>No hay platos.</Text>
      ) : dishes.map(d => (
        <TouchableOpacity
          key={d.id}
          onPress={() => router.push({ pathname: '/profile-empresa/galeria/dish', params: { biz: businessId, dish: d.id } })}
          style={{
            flexDirection:'row', alignItems:'center',
            backgroundColor:'#fff', borderRadius:12, padding:12, marginBottom:10,
            borderWidth:1, borderColor: theme.colors.border
          }}
        >
          {d.image_url ? (
            <Image source={{ uri: d.image_url }} style={{ width:48, height:48, borderRadius:10, marginRight:10, borderWidth:1, borderColor: theme.colors.border }} />
          ) : (
            <View style={{ width:48, height:48, borderRadius:10, marginRight:10, backgroundColor: theme.colors.grayBg, alignItems:'center', justifyContent:'center', borderWidth:1, borderColor: theme.colors.border }}>
              <Text style={{ color: theme.colors.gray, fontSize: 10 }}>IMG</Text>
            </View>
          )}
          <Text style={{ fontWeight:'700', color: theme.colors.text, flex:1 }} numberOfLines={1}>{d.name}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
