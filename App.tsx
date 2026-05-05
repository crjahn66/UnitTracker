import './src/errorInit';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Navigation from './src/navigation';
import ErrorBoundary from './src/components/ErrorBoundary';
import AuthGate from './src/components/AuthGate';
import EditModeBanner from './src/components/EditModeBanner';
import { EditModeProvider, useEditMode } from './src/context/EditModeContext';
import { useSessionTimeout } from './src/hooks/useSessionTimeout';
import { useStore } from './src/store/useStore';
import { pushToCloud, isSuppressingAutoPush } from './src/utils/sync';
import { startAutoBackup } from './src/utils/backup';

// Auto-push store state to sync_state 2s after any change on both platforms.
// Note: Auto-push only happens in edit mode to prevent conflicts with view-only state.
function useAutoPush() {
  const { isEditMode } = useEditMode();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const unsubscribe = useStore.subscribe(() => {
      if (isSuppressingAutoPush() || !isEditMode) return;
      clearTimeout(timer);
      timer = setTimeout(() => { pushToCloud().catch(() => {}); }, 2000);
    });
    return () => { unsubscribe(); clearTimeout(timer); };
  }, [isEditMode]);
}

// Local backup to /storage/emulated/0/Download/Dicvon/bak every 15 min (native only).
function useLocalAutoBackup() {
  useEffect(() => {
    const stop = startAutoBackup(() => useStore.getState());
    return stop;
  }, []);
}

function AppShell() {
  useAutoPush();
  const { resetTimer } = useEditMode();
  const { resetSessionTimer } = useSessionTimeout();
  const handleTouch = () => { resetTimer(); resetSessionTimer(); };
  return (
    <View style={{ flex: 1 }} onTouchStart={handleTouch}>
      <EditModeBanner />
      <Navigation />
    </View>
  );
}

export default function App() {
  useLocalAutoBackup();
  return (
    <ErrorBoundary>
      <EditModeProvider>
        <StatusBar style="light" />
        <AuthGate>
          <AppShell />
        </AuthGate>
      </EditModeProvider>
    </ErrorBoundary>
  );
}
