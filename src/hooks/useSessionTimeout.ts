import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../utils/supabase';

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export function useSessionTimeout() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetSessionTimer = useCallback(() => {
    if (Platform.OS !== 'web') return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      supabase.auth.signOut().catch(() => {});
    }, SESSION_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    resetSessionTimer();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [resetSessionTimer]);

  return { resetSessionTimer };
}
