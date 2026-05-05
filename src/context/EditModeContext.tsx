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

  const exitEditMode = useCallback(() => setIsEditMode(false), []);

  const startTimer = useCallback(() => {
    if (isPaused) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(exitEditMode, EDIT_TIMEOUT_MS);
  }, [exitEditMode, isPaused]);

  const enterEditMode = useCallback(() => {
    setIsEditMode(true);
    setLastActivity(Date.now());
    startTimer();
  }, [startTimer]);

  const resetTimer = useCallback(() => {
    if (!isEditMode || isPaused) return;
    setLastActivity(Date.now());
    startTimer();
  }, [isEditMode, isPaused, startTimer]);

  const pauseTimer = useCallback(() => {
    setIsPaused(true);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const resumeTimer = useCallback(() => {
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
