// components/FilterChips.tsx
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';

type Chip = { key: string; label: string };
export function FilterChips({
  title,
  chips,
  selected,
  onSelect,
}: {
  title: string;
  chips: Chip[];
  selected?: string | null;
  onSelect: (key: string | null) => void;
}) {
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={{ marginLeft: 16, marginBottom: 6, fontWeight: '600' }}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8 }}>
        <TouchableOpacity onPress={() => onSelect(null)} style={{
          paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
          backgroundColor: !selected ? '#111' : '#eaeaea', marginHorizontal: 8
        }}>
          <Text style={{ color: !selected ? '#fff' : '#333' }}>Todos</Text>
        </TouchableOpacity>
        {chips.map(ch => (
          <TouchableOpacity key={ch.key} onPress={() => onSelect(selected === ch.key ? null : ch.key)} style={{
            paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
            backgroundColor: selected === ch.key ? '#111' : '#eaeaea', marginHorizontal: 8
          }}>
            <Text style={{ color: selected === ch.key ? '#fff' : '#333' }}>{ch.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}
