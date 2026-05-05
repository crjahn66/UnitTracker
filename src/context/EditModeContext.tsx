import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export const EDIT_TIMEOUT_MS = 30_000;

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
  // Ref mirrors isPaused so startTimer always sees the current value without stale closures.
  const isPausedRef = useRef(false);

  const exitEditMode = useCallback(() => setIsEditMode(false), []);

  const startTimer = useCallback(() => {
    if (isPausedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(exitEditMode, EDIT_TIMEOUT_MS);
  }, [exitEditMode]);

  const enterEditMode = useCallback(() => {
    setIsEditMode(true);
    setLastActivity(Date.now());
    startTimer();
  }, [startTimer]);

  const resetTimer = useCallback(() => {
    if (!isEditMode || isPausedRef.current) return;
    setLastActivity(Date.now());
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
      setLastActivity(Date.now());
      startTimer();
    }
  }, [isEditMode, startTimer]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <EditModeContext.Provider value={{ isEditMode, lastActivity, isPaused, enterEditMode, resetTimer, pauseTimer, resumeTimer }}>
      {children}
    </EditModeContext.Provider>
  );
}

export function useEditMode() {
  return useContext(EditModeContext);
}
