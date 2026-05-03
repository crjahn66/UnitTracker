import './src/errorInit';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Navigation from './src/navigation';
import ErrorBoundary from './src/components/ErrorBoundary';
import { useStore } from './src/store/useStore';
import { pushToCloud } from './src/utils/sync';

// On web, auto-push store state to sync_state 2s after any change so other
// devices see updates without needing a manual sync.
function useWebAutoPush() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let timer: ReturnType<typeof setTimeout>;
    const unsubscribe = useStore.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(() => { pushToCloud().catch(() => {}); }, 2000);
    });
    return () => { unsubscribe(); clearTimeout(timer); };
  }, []);
}

export default function App() {
  useWebAutoPush();
  return (
    <ErrorBoundary>
      <StatusBar style="light" />
      <Navigation />
    </ErrorBoundary>
  );
}
