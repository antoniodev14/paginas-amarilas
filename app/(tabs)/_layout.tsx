import { Tabs, useRouter } from 'expo-router';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthRole } from '../../lib/auth';
import { theme } from '../../lib/theme';

function HeaderRight() {
  const router = useRouter();
  const { session, fullName, signOut } = useAuthRole();

  if (session) {
    return (
      <View style={{ flexDirection:'row', alignItems:'center' }}>
        {!!fullName && <Text style={{ color: theme.colors.gray, marginRight:8 }} numberOfLines={1}>Hola, {fullName}</Text>}
        <TouchableOpacity onPress={() => signOut()} style={{ paddingHorizontal:12, paddingVertical:6, backgroundColor: theme.colors.text, borderRadius:8 }}>
          <Text style={{ color:'#fff', fontWeight:'600' }}>Salir</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <TouchableOpacity onPress={() => router.push('/auth')} style={{ paddingHorizontal:12, paddingVertical:6, backgroundColor: theme.colors.primary, borderRadius:8 }}>
      <Text style={{ color:'#fff', fontWeight:'700' }}>Entrar / Registrar</Text>
    </TouchableOpacity>
  );
}

export default function TabsLayout() {
  const { isOwner } = useAuthRole();

  return (
    <Tabs
      screenOptions={{
        headerTitleAlign: 'left',
        headerTitleStyle: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
        headerRight: () => <HeaderRight />,
        headerStyle: { backgroundColor: theme.colors.card },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.gray,
        tabBarStyle: { borderTopColor: theme.colors.border, backgroundColor: theme.colors.card },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile-empresa"
        options={{
          title: 'Perfil empresa',
          href: isOwner ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="briefcase" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
