import { TouchableOpacity, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export function ListItem({
  title, subtitle, onPress
}: { title: string; subtitle?: string; onPress?: () => void; }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}
      style={{ paddingHorizontal:16, paddingVertical:14, backgroundColor:'#fff' }}>
      <View style={{ flexDirection:'row', alignItems:'center' }}>
        <View style={{ flex:1 }}>
          <Text style={{ fontSize:16, fontWeight:'700' }}>{title}</Text>
          {!!subtitle && <Text style={{ color:'#666', marginTop:4 }}>{subtitle}</Text>}
        </View>
        <Ionicons name="chevron-forward" size={20} color="#999" />
      </View>
    </TouchableOpacity>
  );
}
