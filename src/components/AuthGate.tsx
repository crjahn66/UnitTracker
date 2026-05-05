import React, { useEffect, useState } from 'react';
import { Platform, View, ActivityIndicator } from 'react-native';
import { supabase } from '../utils/supabase';
import { syncWithCloud } from '../utils/sync';
import LoginScreen from '../screens/LoginScreen';

const SESSION_KEY = 'ut_login_time';
const MAX_MS = 12 * 60 * 60 * 1000; // 12 hours

function recordLoginTime() {
  try { localStorage.setItem(SESSION_KEY, String(Date.now())); } catch {}
}

function isSessionExpired(): boolean {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return true;
    return Date.now() - Number(raw) > MAX_MS;
  } catch { return true; }
}

function clearLoginTime() {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(Platform.OS === 'web');
  const [authed, setAuthed] = useState(Platform.OS !== 'web');

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && isSessionExpired()) {
        supabase.auth.signOut();
        clearLoginTime();
        setAuthed(false);
      } else {
        setAuthed(!!session);
      }
      setChecking(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        recordLoginTime();
        syncWithCloud().catch(() => {});
      }
      if (event === 'SIGNED_OUT') clearLoginTime();
      setAuthed(!!session);
    });

    // Check expiry every minute while the tab is open
    const interval = setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && isSessionExpired()) {
        await supabase.auth.signOut();
        clearLoginTime();
      }
    }, 60 * 1000);

    return () => { subscription.unsubscribe(); clearInterval(interval); };
  }, []);

  if (checking) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0d1117', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#58a6ff" size="large" />
      </View>
    );
  }

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;

  return <>{children}</>;
}
