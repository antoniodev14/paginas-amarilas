import { Tabs, useRouter, Link } from 'expo-router';
import { Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthRole } from '../../lib/auth';
import { theme } from '../../lib/theme';
import { useSession } from '../../lib/useSession';

function HeaderRight() {
  const router = useRouter();
  const { session, fullName, signOut } = useAuthRole();

  if (session) {
    const handleSignOut = async () => {
      try { await signOut(); } finally { router.replace('/'); }
    };
    return (
      <View style={{ flexDirection:'row', alignItems:'center' }}>
        {!!fullName && (
          <Text style={{ color: theme.colors.gray, marginRight: 10 }} numberOfLines={1}>
            Hola, {fullName}
          </Text>
        )}
        <TouchableOpacity
          onPress={handleSignOut}
          style={{ paddingHorizontal:14, paddingVertical:8, backgroundColor: theme.colors.text, borderRadius:10, marginRight:4 }}
        >
          <Text style={{ color:'#fff', fontWeight:'600' }}>Salir</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Link href="/auth" asChild>
      <TouchableOpacity
        style={{ paddingHorizontal:14, paddingVertical:8, backgroundColor: theme.colors.primary, borderRadius:10, marginRight:16 }}
      >
        <Text style={{ color:'#fff', fontWeight:'700' }}>Entrar / Registrar</Text>
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

      {/* visible solo con sesión; el guard de owner se hace dentro de la pantalla */}
      <Tabs.Screen
        name="reservas"
        options={{
          title: 'Reservas',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" color={color} size={size} />,
          href: session ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="eventos" // ⬅️ crea el archivo app/(tabs)/eventos.tsx
        options={{
          title: 'Eventos',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="sparkles-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
