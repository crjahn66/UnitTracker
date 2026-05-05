import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabase';

const SESSION_TIMEOUT_MS = 60_000;

export function useSessionTimeout() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetSessionTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      supabase.auth.signOut().catch(() => {});
    }, SESSION_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    resetSessionTimer();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [resetSessionTimer]);

  return { resetSessionTimer };
}
