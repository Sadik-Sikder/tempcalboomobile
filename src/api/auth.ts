import * as Keychain from 'react-native-keychain';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../constants/env';
import { resetSessionCaches } from '../utils/cachedState';
import { resetLanguage } from '../i18n';

const SERVICE = 'com.calbookmobile.auth';

export async function login(email: string, password: string): Promise<void> {
  const formData = new FormData();
  formData.append('email', email);
  formData.append('password', password);

  const response = await fetch(`${API_URL}/login`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: formData,
  });

  const result = await response.json().catch(() => null);
  const token = result?.data?.token?.access_token;

  if (!response.ok || !token) {
    throw new Error(result?.message ?? 'Invalid email or password');
  }

  await Keychain.setGenericPassword(email, token, { service: SERVICE });
}

async function postJson(path: string, body: object): Promise<any> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(firstErrorMessage(result) ?? 'Something went wrong');
  }
  return result;
}

function firstErrorMessage(result: any): string | undefined {
  const errors = result?.errors;
  if (errors && typeof errors === 'object') {
    const first = Object.values(errors)[0];
    if (Array.isArray(first) && typeof first[0] === 'string') {
      return first[0];
    }
  }
  return result?.message;
}

export async function requestPasswordReset(email: string): Promise<void> {
  await postJson('/forgot-password', { email });
}

export async function resetPassword(params: {
  token: string;
  email: string;
  password: string;
}): Promise<void> {
  await postJson('/reset-password', {
    token: params.token,
    email: params.email,
    password: params.password,
    password_confirmation: params.password,
  });
}

export async function sendSignupCode(email: string): Promise<void> {
  await postJson('/auth/send-verification-code', { email });
}

export async function verifySignupCode(
  email: string,
  code: string,
): Promise<void> {
  await postJson('/auth/verify-email', { email, code });
}

export async function register(params: {
  name: string;
  email: string;
  password: string;
}): Promise<void> {
  const result = await postJson('/register', {
    name: params.name,
    email: params.email,
    password: params.password,
    password_confirmation: params.password,
    terms_accepted: true,
    time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const token = result?.data?.token?.access_token;
  if (!token) {
    throw new Error(result?.message ?? 'Sign up failed');
  }
  await Keychain.setGenericPassword(params.email, token, { service: SERVICE });
}

export async function googleLogin(idToken: string): Promise<void> {
  const response = await fetch(`${API_URL}/google-auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ id_token: idToken }),
  });

  const result = await response.json().catch(() => null);
  const token = result?.token?.access_token;
  const email = result?.user?.email;

  if (!response.ok || !token || !email) {
    throw new Error(result?.error ?? 'Google sign-in failed');
  }

  await Keychain.setGenericPassword(email, token, { service: SERVICE });
}

export async function logout(): Promise<void> {
  const token = await getToken();
  if (token) {
    try {
      await fetch(`${API_URL}/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
    } catch (err) {
      console.warn('Logout API failed:', err);
    }
  }
  await clearLocalSession();
}

export async function clearLocalSession(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch (err) {
    console.warn('Google sign-out failed:', err);
  }
  await Keychain.resetGenericPassword({ service: SERVICE });
  // Every screen's cached data belongs to the account that just left.
  resetSessionCaches();
  await resetLanguage().catch(err => console.warn(err));
}

export async function purgeLegacyPlaintextSession(): Promise<void> {
  await AsyncStorage.removeMany(['calbook_token', 'calbook_email']);
}

export async function getToken(): Promise<string | null> {
  const credentials = await Keychain.getGenericPassword({ service: SERVICE });
  return credentials ? credentials.password : null;
}

export async function getStoredEmail(): Promise<string | null> {
  const credentials = await Keychain.getGenericPassword({ service: SERVICE });
  return credentials ? credentials.username : null;
}

export async function refreshAccessToken(): Promise<string> {
  const response = await fetch(`${API_URL}/refresh`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });

  const result = await response.json().catch(() => null);
  const token = result?.data?.access_token;

  if (!response.ok || !token) {
    throw new Error(result?.message ?? 'Failed to refresh session');
  }

  const email = await getStoredEmail();
  await Keychain.setGenericPassword(email ?? '', token, { service: SERVICE });

  return token;
}
