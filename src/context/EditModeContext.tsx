import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useUser } from './UserContext';

export const EDIT_TIMEOUT_MS = 180_000;

interface EditModeCtx {
  isEditMode: boolean;
  lastActivity: number;
  isPaused: boolean;
  enterEditMode: () => void;
  resetTimer: () => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
}

const EditModeContext = createContext<EditModeCtx>({
  isEditMode: false,
  lastActivity: 0,
  isPaused: false,
  enterEditMode: () => {},
  resetTimer: () => {},
  pauseTimer: () => {},
  resumeTimer: () => {},
});

export function EditModeProvider({ children }: { children: React.ReactNode }) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPausedRef = useRef(false);
  // Ref mirrors lastActivity so the visibilitychange handler always sees the current value.
  const lastActivityRef = useRef(Date.now());
  const isEditModeRef = useRef(false);
  const { isViewOnly } = useUser();

  const exitEditMode = useCallback(() => {
    setIsEditMode(false);
    isEditModeRef.current = false;
  }, []);

  const startTimer = useCallback(() => {
    if (isPausedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(exitEditMode, EDIT_TIMEOUT_MS);
  }, [exitEditMode]);

  const enterEditMode = useCallback(() => {
    if (isViewOnly) return;
    const now = Date.now();
    setIsEditMode(true);
    isEditModeRef.current = true;
    setLastActivity(now);
    lastActivityRef.current = now;
    startTimer();
  }, [startTimer, isViewOnly]);

  const resetTimer = useCallback(() => {
    if (!isEditMode || isPausedRef.current) return;
    const now = Date.now();
    setLastActivity(now);
    lastActivityRef.current = now;
    startTimer();
  }, [isEditMode, startTimer]);

  const pauseTimer = useCallback(() => {
    isPausedRef.current = true;
    setIsPaused(true);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const resumeTimer = useCallback(() => {
    isPausedRef.current = false;
    setIsPaused(false);
    if (isEditMode) {
      const now = Date.now();
      setLastActivity(now);
      lastActivityRef.current = now;
      startTimer();
    }
  }, [isEditMode, startTimer]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // On web, Chrome freezes background tabs so setTimeout never fires.
  // Check elapsed time against lastActivityRef when the tab becomes visible again.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && isEditModeRef.current && !isPausedRef.current) {
        if (Date.now() - lastActivityRef.current >= EDIT_TIMEOUT_MS) {
          exitEditMode();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [exitEditMode]);

  return (
    <EditModeContext.Provider value={{ isEditMode, lastActivity, isPaused, enterEditMode, resetTimer, pauseTimer, resumeTimer }}>
      {children}
    </EditModeContext.Provider>
  );
}

export function useEditMode() {
  return useContext(EditModeContext);
}
