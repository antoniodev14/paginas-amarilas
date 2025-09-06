// app/_layout.tsx
import { Stack } from 'expo-router';

export default function RootStack() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Atras' }} />
      <Stack.Screen name="auth" options={{ title: 'Acceso' }} />
      <Stack.Screen name="profile-empresa/index" options={{ title: 'Mi empresa' }} />
      <Stack.Screen name="profile-empresa/gestion" options={{ title: 'Info de empresa' }} />
      <Stack.Screen name="profile-empresa/horarios" options={{ title: 'Horarios' }} />
      <Stack.Screen name="business/[id]" options={{ title: 'Atras' }} />
      <Stack.Screen name="dish/[id]" options={{ title: 'Plato' }} />
      <Stack.Screen name="profile-empresa/productos" options={{ title: 'Productos' }} />
      <Stack.Screen name="reservar/crear" options={{ title: 'Crear reserva' }} />
      <Stack.Screen name="eventos/crear" options={{ title: 'Crear eventos' }} />
      <Stack.Screen name="business/[id]/reservar" options={{ title: 'Reservar mesa', headerBackTitle: 'Atrás' }} />
      <Stack.Screen name="profile-empresa/galeria/index" options={{ title: 'Galería de imágenes' }} />
      <Stack.Screen name="profile-empresa/galeria/dish" options={{ title: 'Galería del plato' }} />
    </Stack>
  );
}
