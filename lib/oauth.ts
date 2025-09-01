import { makeRedirectUri } from 'expo-auth-session';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';

export const REDIRECT_SCHEME = 'paginasamarillas';
export const REDIRECT_PATH = 'auth';

/**
 * Devuelve la redirectUri correcta:
 * - En Expo Go: exp://.../--/auth (nunca localhost)
 * - En builds (standalone): paginasamarillas://auth
 */
export function getRedirectUri() {
  // En builds (App Store / Play Store / dev-client) usa scheme nativo
  if (Constants.executionEnvironment === 'storeClient' || Constants.executionEnvironment === 'standalone') {
    return `${REDIRECT_SCHEME}://${REDIRECT_PATH}`;
  }

  // En Expo Go → usar Linking.createURL (genera exp://…/--/auth)
  const expUrl = Linking.createURL(REDIRECT_PATH, { scheme: REDIRECT_SCHEME });

  // Fallback con makeRedirectUri por si Linking devolviera algo raro
  const uri = makeRedirectUri({
    scheme: REDIRECT_SCHEME,
    path: REDIRECT_PATH,
    preferLocalhost: false,
  });

  return expUrl.includes('localhost') ? uri : expUrl;
}
