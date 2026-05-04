import './src/errorInit';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import Navigation from './src/navigation';
import ErrorBoundary from './src/components/ErrorBoundary';
import AuthGate from './src/components/AuthGate';
import { useStore } from './src/store/useStore';
import { pushToCloud } from './src/utils/sync';
import { startAutoBackup } from './src/utils/backup';

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

// Local backup to /storage/emulated/0/Download/Dicvon/bak every 15 min (native only).
function useLocalAutoBackup() {
  useEffect(() => {
    const stop = startAutoBackup(() => useStore.getState());
    return stop;
  }, []);
}

export default function App() {
  useAutoPush();
  useLocalAutoBackup();
  return (
    <ErrorBoundary>
      <StatusBar style="light" />
      <AuthGate>
        <Navigation />
      </AuthGate>
    </ErrorBoundary>
  );
}
