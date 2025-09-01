import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import {
  View, Text, TextInput, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard, ActivityIndicator, ScrollView
} from 'react-native';
import { supabase } from '../lib/supabase';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { theme } from '../lib/theme';
import { useRouter } from 'expo-router';
import { getRedirectUri } from '../lib/oauth';

WebBrowser.maybeCompleteAuthSession();

type Mode = 'login' | 'register';



export default function AuthScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [loading, setLoading] = useState(false);

  // login
  const [emailL, setEmailL] = useState('');
  const [passL, setPassL] = useState('');

  // register
  const [username, setUsername] = useState('');
  const [emailR, setEmailR] = useState('');
  const [passR, setPassR] = useState('');
  const [passR2, setPassR2] = useState('');
  const [usernameOk, setUsernameOk] = useState<null | boolean>(null);

  const redirectTo = getRedirectUri();
  // console.log('OAuth redirectTo =>', redirectTo);
  if (redirectTo.includes('localhost')) {
    console.warn('⚠️ redirectTo apunta a localhost. Revisa lib/oauth.ts');
  }
  // useEffect(() => { console.log('OAuth redirectTo:', redirectTo); }, [redirectTo]);

  // Comprobar disponibilidad de username (debounce ligero)
  useEffect(() => {
    let active = true;
    const t = setTimeout(async () => {
      if (!username || username.trim().length < 3) { if (active) setUsernameOk(null); return; }
      const { data, error } = await supabase.rpc('is_username_available', { p_username: username.trim() });
      if (!active) return;
      if (error) { console.log(error); setUsernameOk(null); return; }
      setUsernameOk(!!data);
    }, 250);
    return () => { active = false; clearTimeout(t); };
  }, [username]);

  // Cambiar entre login/registro
  const switchMode = () => {
    setMode(prev => prev === 'login' ? 'register' : 'login');
  };

  async function handleOAuthRedirect(returnedUrl: string) {
    try {
      let code: string | null = null;

      try {
        const u = new URL(returnedUrl);
        code = u.searchParams.get('code');
      } catch {
        const parsed = Linking.parse(returnedUrl) as any;
        code = parsed?.queryParams?.code ?? null;
      }

      if (!code) {
        if (returnedUrl.includes('error=')) {
          const msg = decodeURIComponent(
            (returnedUrl.split('error_description=')[1] || '').split(/[&#]/)[0] || 'Error en OAuth'
          );
          throw new Error(msg);
        }
        throw new Error('No se recibió "code" en el deep link.');
      }

      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      const { data: me } = await supabase.auth.getUser();
      console.log('Me:', me?.user?.id);

      console.log('OAuth exchange ok → user:', data.user?.id);
    } catch (e: any) {
      throw e;
    }
  }



  // === EMAIL + PASSWORD ===
  const onLogin = async () => {
    if (!emailL || !passL) { Alert.alert('Campos requeridos', 'Email y contraseña.'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: emailL.trim(), password: passL });
      if (error) throw error;
      router.back();
    } catch (e:any) {
      Alert.alert('Error al iniciar sesión', e.message ?? '');
    } finally {
      setLoading(false);
    }
  };

  const onRegister = async () => {
    const u = username.trim();
    const e = emailR.trim();
    if (!u || !e || !passR || !passR2) { Alert.alert('Campos requeridos', 'Usuario, email y ambas contraseñas.'); return; }
    if (passR !== passR2) { Alert.alert('Contraseñas', 'Las contraseñas no coinciden.'); return; }
    if (u.length < 3) { Alert.alert('Usuario', 'Mínimo 3 caracteres.'); return; }

    setLoading(true);
    try {
      // 1) comprobar disponibilidad (lado servidor)
      const { data: available, error: errAvail } = await supabase.rpc('is_username_available', { p_username: u });
      if (errAvail) throw errAvail;
      if (!available) { Alert.alert('Usuario', 'Este usuario ya existe.'); setUsernameOk(false); return; }

      // 2) registrar email+password
      const { data, error } = await supabase.auth.signUp({ email: e, password: passR });
      if (error) throw error;

      // 3) si la sesión ya está disponible (dependiendo de confirmación de email), actualiza profile
      const user = data.user ?? (await supabase.auth.getUser()).data.user;
      if (user) {
        const { error: upErr } = await supabase
          .from('profiles')
          .update({ username: u })
          .eq('id', user.id)
          .select('id')
          .single();
        // Si hay conflicto único (23505), avisa
        if (upErr) {
          // @ts-ignore
          if (upErr.code === '23505') {
            Alert.alert('Usuario', 'Este usuario ya existe. Prueba otro.');
          } else {
            throw upErr;
          }
        }
      }

      Alert.alert('Cuenta creada', 'Revisa tu email si la verificación está activada.');
      router.back();
    } catch (e:any) {
      Alert.alert('Error al registrar', e.message ?? '');
    } finally {
      setLoading(false);
    }
  };
  

  // === OAUTH GOOGLE ===
  const signInWithGoogle = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,                 // paginasamarillas://auth  (o exp://… en Expo Go)
          skipBrowserRedirect: true,  // abrimos nosotros el navegador
          scopes: 'email profile',
        },
      });
      if (error) throw error;
      if (!data?.url) throw new Error('Supabase no devolvió URL de autorización.');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      // ⬇️ Muy importante: al volver, canjea el "code"
      if (result.type === 'success' && result.url) {
        await handleOAuthRedirect(result.url);
      } else if (result.type === 'cancel') {
        throw new Error('Autenticación cancelada.');
      }
    } catch (e:any) {
      Alert.alert('Google', e.message ?? 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  // === OAUTH APPLE ===
  const signInWithApple = async () => {
    setLoading(true);
    try {
      if (Platform.OS === 'ios') {
        // iOS nativo con ID token (esto no necesita exchangeCode)
        const cred = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL
          ]
        });
        if (!cred.identityToken) throw new Error('No se recibió identityToken de Apple.');
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: cred.identityToken,
        });
        if (error) throw error;
      } else {
        // Android/Web: flujo OAuth con code → hay que canjearlo
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'apple',
          options: { redirectTo, skipBrowserRedirect: true },
        });
        if (error) throw error;
        if (!data?.url) throw new Error('Supabase no devolvió URL de autorización.');

        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type === 'success' && result.url) {
          await handleOAuthRedirect(result.url); // ⬅️ canjeo
        } else if (result.type === 'cancel') {
          throw new Error('Autenticación cancelada.');
        }
      }
    } catch (e:any) {
      if (e?.code !== 'ERR_CANCELED') {
        Alert.alert('Apple ID', e.message ?? 'Error desconocido');
      }
    } finally {
      setLoading(false);
    }
  };


  return (
    <KeyboardAvoidingView behavior={Platform.select({ ios:'padding', android:'height' })} style={{ flex:1 }}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView style={{ flex:1, backgroundColor:'#fff' }} contentContainerStyle={{ padding:16, paddingBottom:24 }}>
          {/* Toggle Login / Registro */}
          <View style={{ flexDirection:'row', backgroundColor: theme.colors.grayBg, borderRadius:12, padding:4, marginBottom:16 }}>
            <TouchableOpacity onPress={() => setMode('login')} style={{ flex:1, backgroundColor: mode==='login' ? '#fff' : 'transparent', padding:10, borderRadius:10, alignItems:'center', borderWidth:1, borderColor: mode==='login' ? theme.colors.border : 'transparent' }}>
              <Text style={{ fontWeight:'700', color: theme.colors.text }}>Iniciar sesión</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMode('register')} style={{ flex:1, backgroundColor: mode==='register' ? '#fff' : 'transparent', padding:10, borderRadius:10, alignItems:'center', borderWidth:1, borderColor: mode==='register' ? theme.colors.border : 'transparent' }}>
              <Text style={{ fontWeight:'700', color: theme.colors.text }}>Crear cuenta</Text>
            </TouchableOpacity>
          </View>

          {mode === 'login' ? (
            <>
              <Text style={{ marginBottom:6 }}>Email</Text>
              <TextInput value={emailL} onChangeText={setEmailL} autoCapitalize="none" keyboardType="email-address"
                style={{ backgroundColor:'#fff', borderRadius:10, padding:12, borderWidth:1, borderColor: theme.colors.border, marginBottom:12 }} />
              <Text style={{ marginBottom:6 }}>Contraseña</Text>
              <TextInput value={passL} onChangeText={setPassL} secureTextEntry
                style={{ backgroundColor:'#fff', borderRadius:10, padding:12, borderWidth:1, borderColor: theme.colors.border, marginBottom:16 }} />

              <TouchableOpacity onPress={onLogin} disabled={loading} style={{ backgroundColor: theme.colors.text, borderRadius:10, padding:14, alignItems:'center', marginBottom:16 }}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color:'#fff', fontWeight:'700' }}>Entrar</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={{ marginBottom:6 }}>Usuario (único)</Text>
              <TextInput
                value={username} onChangeText={setUsername} autoCapitalize="none"
                style={{ backgroundColor:'#fff', borderRadius:10, padding:12, borderWidth:1, borderColor: theme.colors.border, marginBottom:6 }}
                placeholder="pizzeria_ramon"
              />
              {username.length > 0 && (
                <Text style={{ marginBottom:12, color: usernameOk === false ? '#c1121f' : usernameOk ? theme.colors.success : theme.colors.gray }}>
                  {usernameOk === false ? 'No disponible' : usernameOk ? 'Disponible' : 'Mínimo 3 caracteres'}
                </Text>
              )}

              <Text style={{ marginBottom:6 }}>Email *</Text>
              <TextInput value={emailR} onChangeText={setEmailR} autoCapitalize="none" keyboardType="email-address"
                style={{ backgroundColor:'#fff', borderRadius:10, padding:12, borderWidth:1, borderColor: theme.colors.border, marginBottom:12 }} />

              <Text style={{ marginBottom:6 }}>Contraseña *</Text>
              <TextInput value={passR} onChangeText={setPassR} secureTextEntry
                style={{ backgroundColor:'#fff', borderRadius:10, padding:12, borderWidth:1, borderColor: theme.colors.border, marginBottom:12 }} />

              <Text style={{ marginBottom:6 }}>Repetir contraseña *</Text>
              <TextInput value={passR2} onChangeText={setPassR2} secureTextEntry
                style={{ backgroundColor:'#fff', borderRadius:10, padding:12, borderWidth:1, borderColor: theme.colors.border, marginBottom:16 }} />

              <TouchableOpacity onPress={onRegister} disabled={loading} style={{ backgroundColor: theme.colors.primary, borderRadius:10, padding:14, alignItems:'center', marginBottom:16 }}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color:'#fff', fontWeight:'700' }}>Crear cuenta</Text>}
              </TouchableOpacity>
            </>
          )}

          {/* OAuth */}
          <View style={{ height:8 }} />
          <TouchableOpacity onPress={signInWithGoogle} disabled={loading}
            style={{ borderRadius:10, padding:14, alignItems:'center', borderWidth:1, borderColor: theme.colors.border, backgroundColor:'#fff', marginBottom:10 }}>
            {loading ? <ActivityIndicator /> : <Text style={{ fontWeight:'700' }}>Registrarme con Google</Text>}
          </TouchableOpacity>

          {Platform.OS === 'ios' && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={10}
              style={{ width: '100%', height: 44 }}
              onPress={signInWithApple}
            />
          )}
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}
