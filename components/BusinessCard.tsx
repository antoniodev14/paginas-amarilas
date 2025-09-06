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
     <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: 'row',
        marginHorizontal: 16,
        marginVertical: 6,
        borderRadius: 12,
        backgroundColor: '#fff',
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
        overflow: 'hidden'
      }}
    >
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={{ width: '30%', height: 120 }} />
      ) : (
        <View style={{ width: '30%', height: 120, backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#888', fontSize: 12 }}>Sin imagen</Text>
        </View>
      )}
      <View style={{ flex: 1, padding: 12, justifyContent: 'center' }}>
        <Text style={{ fontSize: 14, fontWeight: '800' }} numberOfLines={1}>{name}</Text>
        <Text style={{ color: '#666', marginTop: 2, fontSize: 12}} numberOfLines={1}>{service} • {city}</Text>
        <Text style={{ marginTop: 4, color: isOpen ? '#128a0c' : '#c1121f', fontWeight: '600', fontSize: 10 }}>
            {isOpen ? 'Abierto ahora' : 'Cerrado'}
        </Text>
      </View>
      <View style={{ justifyContent: 'center', paddingRight: 8 }}>
        <Ionicons name="chevron-forward" size={22} color="#999" />
      </View>
    </TouchableOpacity>
  );
}
