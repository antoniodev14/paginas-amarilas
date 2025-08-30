// app/auth.tsx
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Ionicons } from '@expo/vector-icons';

export default function AuthScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // Login
  const [emailL, setEmailL] = useState('');
  const [passL, setPassL] = useState('');

  // Registro
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [emailR, setEmailR] = useState('');
  const [passR, setPassR] = useState('');

  const onLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: emailL.trim(), password: passL });
      if (error) throw error;
      Alert.alert('Bienvenido', 'Inicio de sesión correcto');
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const onRegister = async () => {
    if (!username.trim() || !emailR.trim() || !passR) {
      Alert.alert('Campos obligatorios', 'Usuario, email y contraseña son obligatorios');
      return;
    }
    try {
      const { error } = await supabase.auth.signUp({
        email: emailR.trim(),
        password: passR,
        options: {
          data: {
            username: username.trim(),
            full_name: fullName.trim(),
            phone: phone.trim(),
          }
        }
      });
      if (error) throw error;
      Alert.alert('¡Hecho!', 'Revisa tu email si se requiere confirmación.');
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const onOAuth = async (provider: 'google' | 'apple') => {
    try {
      const redirectTo = 'paginasamarillas://auth/callback';
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo }
      });
      if (error) throw error;
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor:'#fff' }}>
      {/* Toggle login/registro */}
      <View style={{ flexDirection:'row', marginHorizontal:16, marginTop:8 }}>
        <TouchableOpacity onPress={() => setMode('login')} style={{
          flex:1, padding:12, backgroundColor: mode==='login' ? '#111' : '#eee', borderTopLeftRadius:10, borderBottomLeftRadius:10
        }}>
          <Text style={{ textAlign:'center', color: mode==='login' ? '#fff' : '#333', fontWeight:'700' }}>Entrar</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMode('register')} style={{
          flex:1, padding:12, backgroundColor: mode==='register' ? '#111' : '#eee', borderTopRightRadius:10, borderBottomRightRadius:10
        }}>
          <Text style={{ textAlign:'center', color: mode==='register' ? '#fff' : '#333', fontWeight:'700' }}>Registrar</Text>
        </TouchableOpacity>
      </View>

      {mode === 'login' ? (
        <View style={{ padding:16 }}>
          <Text style={{ marginTop:12, marginBottom:6 }}>Email*</Text>
          <TextInput value={emailL} onChangeText={setEmailL} autoCapitalize='none'
            style={{ backgroundColor:'#f2f2f2', borderRadius:10, padding:12 }} />
          <Text style={{ marginTop:12, marginBottom:6 }}>Contraseña*</Text>
          <TextInput value={passL} onChangeText={setPassL} secureTextEntry
            style={{ backgroundColor:'#f2f2f2', borderRadius:10, padding:12 }} />

          <TouchableOpacity onPress={onLogin} style={{ marginTop:16, backgroundColor:'#111', padding:14, borderRadius:10 }}>
            <Text style={{ color:'#fff', textAlign:'center', fontWeight:'700' }}>Entrar</Text>
          </TouchableOpacity>

          <View style={{ marginTop:24, gap:10 }}>
            <TouchableOpacity onPress={() => onOAuth('google')} style={{ padding:12, borderRadius:10, backgroundColor:'#eee' }}>
              <Text style={{ textAlign:'center', fontWeight:'600' }}>Continuar con Google</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onOAuth('apple')} style={{ padding:12, borderRadius:10, backgroundColor:'#eee' }}>
              <Text style={{ textAlign:'center', fontWeight:'600' }}>Continuar con Apple</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={{ padding:16 }}>
          <Text style={{ marginTop:12, marginBottom:6 }}>Nombre completo</Text>
          <TextInput value={fullName} onChangeText={setFullName} style={{ backgroundColor:'#f2f2f2', borderRadius:10, padding:12 }} />
          <Text style={{ marginTop:12, marginBottom:6 }}>Teléfono</Text>
          <TextInput value={phone} onChangeText={setPhone} keyboardType='phone-pad'
            style={{ backgroundColor:'#f2f2f2', borderRadius:10, padding:12 }} />
          <Text style={{ marginTop:12, marginBottom:6 }}>Usuario*</Text>
          <TextInput value={username} onChangeText={setUsername} autoCapitalize='none'
            style={{ backgroundColor:'#f2f2f2', borderRadius:10, padding:12 }} />
          <Text style={{ marginTop:12, marginBottom:6 }}>Email*</Text>
          <TextInput value={emailR} onChangeText={setEmailR} autoCapitalize='none'
            style={{ backgroundColor:'#f2f2f2', borderRadius:10, padding:12 }} />
          <Text style={{ marginTop:12, marginBottom:6 }}>Contraseña*</Text>
          <TextInput value={passR} onChangeText={setPassR} secureTextEntry
            style={{ backgroundColor:'#f2f2f2', borderRadius:10, padding:12 }} />

          <TouchableOpacity onPress={onRegister} style={{ marginTop:16, backgroundColor:'#111', padding:14, borderRadius:10 }}>
            <Text style={{ color:'#fff', textAlign:'center', fontWeight:'700' }}>Crear cuenta</Text>
          </TouchableOpacity>

          <View style={{ marginTop:24, gap:10 }}>
            <TouchableOpacity onPress={() => onOAuth('google')} style={{ padding:12, borderRadius:10, backgroundColor:'#eee' }}>
              <Text style={{ textAlign:'center', fontWeight:'600' }}>Registrarme con Google</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onOAuth('apple')} style={{ padding:12, borderRadius:10, backgroundColor:'#eee' }}>
              <Text style={{ textAlign:'center', fontWeight:'600' }}>Registrarme con Apple</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
