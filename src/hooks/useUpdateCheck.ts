import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';
import { checkForUpdate, cleanupDownloadedApks, UpdateInfo } from '../utils/appUpdater';

const POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 min
const INITIAL_DELAY_MS = 4000;
const MANUAL_THROTTLE_MS = 5 * 1000;
const WEB_POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 min

interface UpdateState {
  updateInfo: UpdateInfo | null;
  checking: boolean;
  error: string | null;
  lastCheckAt: number;
  webUpdateAvailable: boolean;
  setUpdateInfo: (info: UpdateInfo | null) => void;
  setChecking: (checking: boolean) => void;
  setError: (error: string | null) => void;
  setLastCheckAt: (at: number) => void;
  setWebUpdateAvailable: (v: boolean) => void;
}

const useUpdateStore = create<UpdateState>((set) => ({
  updateInfo: null,
  checking: false,
  error: null,
  lastCheckAt: 0,
  webUpdateAvailable: false,
  setUpdateInfo: (updateInfo) => set({ updateInfo }),
  setChecking: (checking) => set({ checking }),
  setError: (error) => set({ error }),
  setLastCheckAt: (lastCheckAt) => set({ lastCheckAt }),
  setWebUpdateAvailable: (webUpdateAvailable) => set({ webUpdateAvailable }),
}));

/** Run update check honoring throttle. */
export async function runUpdateCheck(force = false): Promise<UpdateInfo | null> {
  if (Platform.OS !== 'android') return null;
  const state = useUpdateStore.getState();
  const now = Date.now();
  if (!force && now - state.lastCheckAt < MANUAL_THROTTLE_MS) {
    return state.updateInfo;
  }
  state.setLastCheckAt(now);
  state.setChecking(true);
  state.setError(null);
  try {
    const info = await checkForUpdate();
    state.setUpdateInfo(info);
    return info;
  } catch (e: any) {
    state.setError(e?.message ?? 'Update check failed');
    throw e;
  } finally {
    state.setChecking(false);
  }
}

export function dismissUpdate() {
  useUpdateStore.getState().setUpdateInfo(null);
}

export function dismissWebUpdate() {
  useUpdateStore.getState().setWebUpdateAvailable(false);
}

/** Subscribe to update state. Used by UpdateBanner and Reports button. */
export function useUpdateCheck() {
  const updateInfo = useUpdateStore((s) => s.updateInfo);
  const checking = useUpdateStore((s) => s.checking);
  const error = useUpdateStore((s) => s.error);
  const webUpdateAvailable = useUpdateStore((s) => s.webUpdateAvailable);

  const recheck = useCallback((force = true) => runUpdateCheck(force).catch(() => {}), []);
  const dismiss = useCallback(() => dismissUpdate(), []);
  const dismissWeb = useCallback(() => dismissWebUpdate(), []);

  return { updateInfo, checking, error, recheck, dismiss, webUpdateAvailable, dismissWeb };
}

/** Mount once (in App root) to enable auto polling on both platforms. */
export function useAutoUpdateCheck() {
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;

    if (Platform.OS === 'android') {
      cleanupDownloadedApks().catch(() => {});
      const t = setTimeout(() => runUpdateCheck(true).catch(() => {}), INITIAL_DELAY_MS);
      const interval = setInterval(() => runUpdateCheck(true).catch(() => {}), POLL_INTERVAL_MS);
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') runUpdateCheck(false).catch(() => {});
      });
      return () => {
        clearTimeout(t);
        clearInterval(interval);
        sub.remove();
      };
    }

    if (Platform.OS === 'web') {
      let buildTs: number | null = null;
      const check = async () => {
        try {
          const res = await fetch('/_v.json?_=' + Date.now(), { cache: 'no-store' });
          if (!res.ok) return;
          const { b } = await res.json();
          if (buildTs === null) {
            buildTs = b;
          } else if (b !== buildTs) {
            useUpdateStore.getState().setWebUpdateAvailable(true);
          }
        } catch {}
      };
      const t = setTimeout(check, INITIAL_DELAY_MS);
      const interval = setInterval(check, WEB_POLL_INTERVAL_MS);
      const onVisible = () => { if (document.visibilityState === 'visible') check(); };
      document.addEventListener('visibilitychange', onVisible);
      return () => { clearTimeout(t); clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
    }
  }, []);
}
