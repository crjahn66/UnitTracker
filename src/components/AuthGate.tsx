import React, { useEffect, useState } from 'react';
import { Platform, View, ActivityIndicator } from 'react-native';
import { supabase } from '../utils/supabase';
import LoginScreen from '../screens/LoginScreen';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(Platform.OS === 'web');
  const [authed, setAuthed] = useState(Platform.OS !== 'web');

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthed(!!session);
      setChecking(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session);
    });

    return () => subscription.unsubscribe();
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
