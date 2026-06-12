import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const SUPABASE_URL = 'https://kizqpjitayvlezcjvdeo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_HfhY_YliSPzpT7HQgSu9xw_1lQZu04n';
const isWeb = Platform.OS === 'web';
const APP_VERSION = (require('../../app.json') as { expo: { version: string } }).expo.version;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  global: {
    headers: {
      'x-unittracker-version': APP_VERSION,
    },
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    ...(isWeb ? {} : { storage: AsyncStorage }),
  },
});

export async function ensureFreshSession(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.expires_at) return;
    if ((session.expires_at * 1000) - Date.now() > 60_000) return;
    const { error } = await supabase.auth.refreshSession();
    if (error && /jwt expired/i.test(error.message)) await supabase.auth.signOut();
  } catch (err: any) {
    if (/jwt expired/i.test(err?.message ?? '')) await supabase.auth.signOut();
  }
}
