import { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { SearchBar } from '../../components/SearchBar';
import { DropdownSelect } from '../../components/DropdownSelect';
import { BusinessCard } from '../../components/BusinessCard';
import { theme } from '../../lib/theme';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuthRole } from '../../lib/auth'; // ⟵ para obtener fullName y saber si hay sesión

type Row = { id:string; name:string; service:string; city:string; image_url:string|null; is_open:boolean; };
type Service = { slug:string; name:string; };

export default function Home() {
  const router = useRouter();
  const { session, fullName } = useAuthRole();
  const [q, setQ] = useState('');
  const [services, setServices] = useState<Service[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [serviceSel, setServiceSel] = useState<string | null>(null);
  const [citySel, setCitySel] = useState<string | null>(null);
  const [data, setData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  // para pedir a SearchBar que cierre sugerencias al empezar scroll
  const closeTick = useRef(0);
  const bumpCloseTick = () => { closeTick.current += 1; };

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase
        .from('services')
        .select('name, slug')
        .order('name', { ascending: true });
      setServices(s ?? []);

      const { data: c } = await supabase
        .from('businesses')
        .select('city')
        .eq('published', true);

      const uniq = Array.from(
        new Set((c ?? []).map(x => x.city).filter((x:any)=>!!x && String(x).trim()!==''))
      ) as string[];
      uniq.sort((a,b)=>a.localeCompare(b));
      setCities(uniq);
    })();
  }, []);

  async function fetchData(qtext: string) {
    setLoading(true);
    try {
      const service_slugs = serviceSel ? [serviceSel] : null;
      const { data: rows, error } = await supabase.rpc('search_businesses', {
        q: qtext || null,
        service_slugs,
        city_filter: citySel || null,
        page_size: 50,
        page: 0
      });
      if (error) throw error;
      setData(rows ?? []);
    } catch (e) {
      console.error(e);
      setData([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(q); }, [serviceSel, citySel]);
  useFocusEffect(useCallback(() => { fetchData(q); }, [q, serviceSel, citySel]));

  return (
    <View style={{ flex:1, backgroundColor: theme.colors.grayBg }}>
      <SearchBar
        value={q}
        onChange={setQ}
        onPickSuggestion={(t)=>{ setQ(t); fetchData(t); }}
        closeSignal={closeTick.current}
      />

      {/* Filtros */}
      <View style={{ position:'relative', flexDirection:'row', alignItems:'flex-end', paddingHorizontal:8, marginBottom:4 }}>
        <DropdownSelect
          label="Servicio"
          value={serviceSel}
          onChange={(v)=>{ setServiceSel(v); bumpCloseTick(); }}
          options={services.map(s => ({ label: s.name, value: s.slug }))}
        />
        <DropdownSelect
          label="Ciudad"
          value={citySel}
          onChange={(v)=>{ setCitySel(v); bumpCloseTick(); }}
          options={cities.map(c => ({ label: c, value: c }))}
        />
      </View>

      {loading ? (
        <View style={{ marginTop:16 }}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingVertical:6, paddingBottom:16 }}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={bumpCloseTick}
          renderItem={({ item }) => (
            <BusinessCard
              name={item.name}
              city={item.city}
              service={item.service}
              isOpen={item.is_open}
              imageUrl={item.image_url ? `${item.image_url}${item.image_url.includes('?') ? '&' : '?'}ts=${item.id}` : null}
              onPress={() => router.push(`/business/${item.id}`)}
            />
          )}
          ListEmptyComponent={
            <Text style={{ textAlign:'center', marginTop:24, color:theme.colors.gray }}>
              Sin resultados
            </Text>
          }
        />
      )}
    </View>
  );
}
