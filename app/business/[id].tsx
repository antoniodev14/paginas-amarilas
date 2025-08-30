import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, Text, Image, ScrollView, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { formatToday, formatWeek } from '../../lib/formatHours';

type Detail = {
  id: string; name: string; description: string|null; city: string|null; address: string|null;
  image_url: string|null; timezone: string; opening_hours: any; service: string; is_open: boolean;
};

export default function BusinessDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [row, setRow] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_business_detail', { p_business_id: id });
      if (error) console.error(error);
      setRow((data?.[0] ?? null) as Detail | null);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <View style={{ padding:16 }}><ActivityIndicator/></View>;
  if (!row) return <View style={{ padding:16 }}><Text>No encontrado</Text></View>;

  const week = formatWeek(row.opening_hours);

  return (
    <ScrollView style={{ flex:1, backgroundColor:'#fff' }} contentContainerStyle={{ paddingBottom:24 }}>
      {row.image_url ? <Image source={{ uri: row.image_url }} style={{ width:'100%', height:200 }} /> : null}
      <View style={{ padding:16 }}>
        <Text style={{ fontSize:20, fontWeight:'800' }}>{row.name}</Text>
        <Text style={{ color: row.is_open ? '#128a0c' : '#c1121f', marginTop:6, fontWeight:'700' }}>
          {row.is_open ? 'Abierto ahora' : 'Cerrado'}
        </Text>
        <Text style={{ color:'#666', marginTop:6 }}>{row.service} • {row.city ?? '—'}</Text>
        {!!row.address && <Text style={{ color:'#666', marginTop:2 }}>{row.address}</Text>}
        {!!row.description && <Text style={{ marginTop:12 }}>{row.description}</Text>}

        <View style={{ marginTop:16, backgroundColor:'#fafafa', borderRadius:10, padding:12 }}>
          <Text style={{ fontWeight:'800', marginBottom:6 }}>Horarios</Text>
          <Text style={{ marginBottom:8 }}>{formatToday(row.opening_hours)}</Text>
          {week.map((l,i)=> <Text key={i} style={{ color:'#444', marginTop:2 }}>{l}</Text>)}
        </View>
      </View>
    </ScrollView>
  );
}
