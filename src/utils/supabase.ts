import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kizqpjitayvlezcjvdeo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_HfhY_YliSPzpT7HQgSu9xw_1lQZu04n';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
