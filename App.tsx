import './src/errorInit';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Navigation from './src/navigation';
import ErrorBoundary from './src/components/ErrorBoundary';
import AuthGate from './src/components/AuthGate';
import EditModeBanner from './src/components/EditModeBanner';
import IssueTicker from './src/components/IssueTicker';
import UpdateBanner from './src/components/UpdateBanner';
import ToastHost from './src/components/ToastHost';
import { EditModeProvider, useEditMode } from './src/context/EditModeContext';
import { UserProvider } from './src/context/UserContext';
import { useSessionTimeout } from './src/hooks/useSessionTimeout';
import { useAutoUpdateCheck } from './src/hooks/useUpdateCheck';
import { useStore } from './src/store/useStore';
import { pushToCloud, isSuppressingAutoPush, subscribeRealtimeSync } from './src/utils/sync';
import { startAutoBackup } from './src/utils/backup';

// Auto-push store state to sync_state 2s after any change on both platforms.
// Note: Auto-push only happens in edit mode to prevent conflicts with view-only state.
function useAutoPush() {
  const { isEditMode } = useEditMode();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const unsubscribe = useStore.subscribe((state, prev) => {
      if (state.units === prev.units && state.generalIssues === prev.generalIssues) return;
      if (isSuppressingAutoPush() || !isEditMode) return;
      clearTimeout(timer);
      timer = setTimeout(() => { pushToCloud().catch(() => {}); }, 2000);
    });
    return () => { unsubscribe(); clearTimeout(timer); };
  }, [isEditMode]);
}

function useRealtimeSync() {
  useEffect(() => subscribeRealtimeSync(), []);
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
  useAutoUpdateCheck();
  useRealtimeSync();
  const { resetTimer } = useEditMode();
  const { resetSessionTimer } = useSessionTimeout();
  // Backfill any units persisted before new entries were added to COMPONENTS,
  // so consumers can safely do `unit.components[anyKey].status` without
  // missing-key crashes. Idempotent — no state change when nothing's missing.
  useEffect(() => {
    useStore.getState().ensureAllComponentsPresent();
  }, []);
  const handleTouch = () => { resetTimer(); resetSessionTimer(); };
  return (
    <View style={{ flex: 1 }} onTouchStart={handleTouch}>
      <EditModeBanner />
      <UpdateBanner />
      <IssueTicker />
      <Navigation />
      <ToastHost />
    </View>
  );
}

export default function App() {
  useLocalAutoBackup();
  return (
    <ErrorBoundary>
      <UserProvider>
        <EditModeProvider>
          <StatusBar style="light" />
          <AuthGate>
            <AppShell />
          </AuthGate>
        </EditModeProvider>
      </UserProvider>
    </ErrorBoundary>
  );
}
