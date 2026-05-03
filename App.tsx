import './src/errorInit';
import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Navigation from './src/navigation';
import ErrorBoundary from './src/components/ErrorBoundary';
import { useStore } from './src/store/useStore';
import { pushToCloud } from './src/utils/sync';
import { supabase } from './src/utils/supabase';
import { downloadPhotosToDevice } from './src/utils/imageStorage';
import { UnitsStore, GeneralIssue } from './src/types';

// Auto-push store state to sync_state 2s after any change on both platforms.
function useAutoPush() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const unsubscribe = useStore.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(() => { pushToCloud().catch(() => {}); }, 2000);
    });
    return () => { unsubscribe(); clearTimeout(timer); };
  }, []);
}

// On native, poll sync_state every 30s. If updated_at changed, merge new data
// and download any photos that are missing from the device.
function useNativeAutoSync() {
  const lastUpdatedAt = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const check = async () => {
      try {
        const { data, error } = await supabase
          .from('sync_state')
          .select('updated_at, units, general_issues')
          .eq('id', 1)
          .single();
        if (error || !data) return;
        if (data.updated_at === lastUpdatedAt.current) return;
        lastUpdatedAt.current = data.updated_at;

        const remoteUnits = (data.units ?? {}) as UnitsStore;
        const remoteGeneralIssues = (data.general_issues ?? []) as GeneralIssue[];
        if (Object.keys(remoteUnits).length > 0 || remoteGeneralIssues.length > 0) {
          useStore.getState().mergeImport(remoteUnits, remoteGeneralIssues);
        }

        const { units } = useStore.getState();
        await downloadPhotosToDevice(units);
      } catch {}
    };

    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);
}

export default function App() {
  useAutoPush();
  useNativeAutoSync();
  return (
    <ErrorBoundary>
      <StatusBar style="light" />
      <Navigation />
    </ErrorBoundary>
  );
}
