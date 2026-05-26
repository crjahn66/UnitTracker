import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../utils/supabase';

// Accounts that should be view-only — no edit mode, no write UI. Anyone NOT
// in this set who logs in successfully is treated as an editor.
// Case-insensitive comparison against the session email.
const VIEW_ONLY_EMAILS = new Set<string>([
  'viewonly@red.group',
  'coolred@red.group',
]);
const INACTIVITY_TIMEOUT_MS = 12 * 60 * 60 * 1000; // 12 hours
const LAST_ACTIVITY_KEY = 'ut_last_activity';

function isViewOnlyEmail(email: string | null): boolean {
  if (!email) return false;
  return VIEW_ONLY_EMAILS.has(email.trim().toLowerCase());
}

interface UserCtx {
  email: string | null;
  isViewOnly: boolean;
}

const UserContext = createContext<UserCtx>({ email: null, isViewOnly: false });

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setEmail(session?.user?.email ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const updateActivity = () => localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const last = Number(localStorage.getItem(LAST_ACTIVITY_KEY) ?? 0);
        if (last && Date.now() - last > INACTIVITY_TIMEOUT_MS) {
          supabase.auth.signOut();
        }
      }
    };

    updateActivity();
    document.addEventListener('visibilitychange', handleVisibility);
    document.addEventListener('click', updateActivity);
    document.addEventListener('keydown', updateActivity);
    document.addEventListener('touchstart', updateActivity);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('click', updateActivity);
      document.removeEventListener('keydown', updateActivity);
      document.removeEventListener('touchstart', updateActivity);
    };
  }, []);

  return (
    <UserContext.Provider value={{ email, isViewOnly: isViewOnlyEmail(email) }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
