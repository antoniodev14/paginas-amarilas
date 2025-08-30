// app/_layout.tsx
import { Stack } from 'expo-router';

export default function RootStack() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="auth" options={{ title: 'Acceso' }} />
      <Stack.Screen name="profile-empresa/gestion" options={{ title: 'Gestión de empresa' }} />
      <Stack.Screen name="profile-empresa/horarios" options={{ title: 'Horarios' }} />
      <Stack.Screen name="business/[id]" options={{ title: 'Negocio' }} />
    </Stack>
  );
}
