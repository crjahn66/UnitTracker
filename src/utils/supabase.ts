import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const SUPABASE_URL = 'https://kizqpjitayvlezcjvdeo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_HfhY_YliSPzpT7HQgSu9xw_1lQZu04n';
const isWeb = Platform.OS === 'web';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: isWeb,
    autoRefreshToken: isWeb,
    detectSessionInUrl: false,
  },
});
