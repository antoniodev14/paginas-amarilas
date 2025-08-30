// components/BusinessCard.tsx
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export function BusinessCard({
  name, city, service, isOpen, imageUrl, onPress
}: {
  name: string; city: string; service: string; isOpen: boolean; imageUrl?: string | null;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={{
      marginHorizontal: 16, marginVertical: 8, borderRadius: 12, backgroundColor: '#fff',
      shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 2, overflow: 'hidden'
    }}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={{ width: '100%', height: 140 }} />
      ) : (
        <View style={{ width: '100%', height: 140, backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#888' }}>Sin imagen</Text>
        </View>
      )}
      <View style={{ padding: 12, flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '700' }}>{name}</Text>
          <Text style={{ color: '#666', marginTop: 2 }}>{service} • {city}</Text>
          <Text style={{ marginTop: 4, color: isOpen ? '#128a0c' : '#c1121f', fontWeight: '600' }}>
            {isOpen ? 'Abierto ahora' : 'Cerrado'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color="#999" />
      </View>
    </TouchableOpacity>
  );
}
