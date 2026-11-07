// Supabase client — anon key + RLS. Session persisted in SecureStore.
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// SecureStore has a 2 KB value limit; chunk the session to stay safe.
const CHUNK = 1800;

const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return localStorage.getItem(key);
    let out = '';
    let i = 0;
    // read chunks until one is missing
    for (;;) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      if (part === null) break;
      out += part;
      i++;
      if (i > 10) break; // sanity
    }
    return out === '' ? null : out;
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    // clear old chunks first
    await secureStorage.removeItem(key);
    for (let i = 0; i * CHUNK < value.length; i++) {
      await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    }
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return;
    }
    for (let i = 0; i <= 10; i++) {
      await SecureStore.deleteItemAsync(`${key}.${i}`).catch(() => {});
    }
  },
};

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
