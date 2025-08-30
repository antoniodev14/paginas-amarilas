import { View, TextInput, FlatList, TouchableOpacity, Text } from 'react-native';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useDebounce } from '../lib/useDebounce';
import { theme } from '../lib/theme';

export function SearchBar({
  value, onChange, onPickSuggestion, closeSignal
}: {
  value: string;
  onChange: (t: string) => void;
  onPickSuggestion?: (t: string) => void;
  closeSignal?: number; // ⟵ si cambia, cerramos sugerencias
}) {
  const [sugs, setSugs] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const dv = useDebounce(value, 150);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!dv || dv.trim().length < 2) { setSugs([]); setOpen(false); return; }
      const { data } = await supabase.rpc('search_businesses', {
        q: dv, service_slugs: null, city_filter: null, page_size: 8, page: 0
      });
      if (cancelled) return;
      const names = (data ?? []).map((r: any) => r.name);
      setSugs(Array.from(new Set(names)));
      setOpen(names.length > 0);
    })();
    return () => { cancelled = true; };
  }, [dv]);

  // cerrar cuando llega señal externa (scroll/filtro)
  useEffect(() => { if (closeSignal !== undefined) setOpen(false); }, [closeSignal]);

  return (
    <View style={{ paddingHorizontal:16, paddingVertical:8, position:'relative' }}>
      <TextInput
        placeholder="Buscar establecimientos..."
        placeholderTextColor={theme.colors.gray}
        value={value}
        onChangeText={(t) => { onChange(t); setOpen(true); }}
        onBlur={() => setOpen(false)}           // ⟵ blur cierra
        blurOnSubmit
        returnKeyType="search"
        style={{
          backgroundColor:'#fff', borderRadius:12, paddingHorizontal:14, paddingVertical:12, fontSize:16,
          borderWidth:1, borderColor: theme.colors.border, color: theme.colors.text
        }}
      />
      {open && sugs.length > 0 && (
        <View style={{
          position:'absolute', top:56, left:16, right:16, backgroundColor: theme.colors.card,
          borderRadius:12, shadowColor:'#000', shadowOpacity:0.1, shadowRadius:8, elevation:3, maxHeight:220,
          borderWidth:1, borderColor: theme.colors.border, zIndex: 20
        }}>
          <FlatList
            keyboardShouldPersistTaps="handled"
            data={sugs}
            keyExtractor={(x)=>x}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => {
                  onChange(item);
                  setOpen(false);
                  onPickSuggestion?.(item);
                }}
                style={{ paddingHorizontal:12, paddingVertical:12, borderBottomWidth:1, borderBottomColor: theme.colors.border }}
              >
                <Text style={{ color: theme.colors.text }}>{item}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </View>
  );
}
