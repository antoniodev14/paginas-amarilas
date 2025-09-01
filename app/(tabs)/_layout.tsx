import { Tabs, useRouter, Link } from 'expo-router';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthRole } from '../../lib/auth';      // fullName + signOut + session
import { theme } from '../../lib/theme';
import { useSession } from '../../lib/useSession'; // { session, loading }

function HeaderRight() {
  const router = useRouter();
  const { session, fullName, signOut } = useAuthRole();

  if (session) {
    const handleSignOut = async () => {
      try {
        await signOut();
      } finally {
        // Aseguramos volver a Home
        router.replace('/');
      }
    };

    return (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {!!fullName && (
          <Text
            style={{ color: theme.colors.gray, marginRight: 10 }}
            numberOfLines={1}
          >
            Hola, {fullName}
          </Text>
        )}
        <TouchableOpacity
          onPress={handleSignOut}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 8,
            backgroundColor: theme.colors.text,
            borderRadius: 10,
            marginRight: 4, // pequeño margen con el borde derecho del header
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Salir</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Link href="/auth" asChild>
      <TouchableOpacity
        style={{
          paddingHorizontal: 14,
          paddingVertical: 8,
          backgroundColor: theme.colors.primary,
          borderRadius: 10,
          marginRight: 16, // ⟵ más margen como pediste
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>
          Entrar / Registrar
        </Text>
      </TouchableOpacity>
    </Link>
  );
}

export default function TabsLayout() {
  const { session, loading } = useSession();

  if (loading) return null;

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
        name="mi-perfil"
        options={{
          title: 'Mi perfil',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size} color={color} />,
          href: session ? undefined : null, // oculta si no hay sesión
        }}
      />
    </Tabs>
  );
}
