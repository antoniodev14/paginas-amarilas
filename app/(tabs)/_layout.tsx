import { Tabs, useRouter, Link } from 'expo-router';
import { TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthRole } from '../../lib/auth';
import { theme } from '../../lib/theme';
import { useSession } from '../../lib/useSession';

function HeaderRight() {
  const router = useRouter();
  const { session, signOut } = useAuthRole();

  if (session) {
    const handleSignOut = async () => {
      try { 
        await signOut(); 
      } finally { 
        router.replace('/'); 
      }
    };
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12 }}>
        <TouchableOpacity onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={26} color={theme.colors.text} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Link href="/auth" asChild>
      <TouchableOpacity
        style={{ paddingHorizontal:14, paddingVertical:8, backgroundColor: theme.colors.primary, borderRadius:10, marginRight:16 }}
      >
        <Ionicons name="log-in-outline" size={20} color="#fff" />
      </TouchableOpacity>
    </Link>
  );
}

export default function TabsLayout() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <View style={{ flex:1, alignItems:'center', justifyContent:'center', backgroundColor: theme.colors.card }}>
        <ActivityIndicator />
      </View>
    );
  }

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
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} />,
        }}
      />

      <Tabs.Screen
        name="mi-perfil"
        options={{
          title: 'Mi perfil',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" size={size} color={color} />,
          href: session ? undefined : null, // oculta si no hay sesión
        }}
      />

      <Tabs.Screen
        name="reservas"
        options={{
          title: 'Reservas',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" color={color} size={size} />,
          href: session ? undefined : null,
        }}
      />

      <Tabs.Screen
        name="eventos"
        options={{
          title: 'Eventos',
          tabBarIcon: ({ color, size }) => <Ionicons name="sparkles-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
