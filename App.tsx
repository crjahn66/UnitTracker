import './src/errorInit';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import Navigation from './src/navigation';
import ErrorBoundary from './src/components/ErrorBoundary';
import { useStore } from './src/store/useStore';
import { pushToCloud } from './src/utils/sync';

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

export default function App() {
  useAutoPush();
  return (
    <ErrorBoundary>
      <StatusBar style="light" />
      <Navigation />
    </ErrorBoundary>
  );
}
