import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export const EDIT_TIMEOUT_MS = 30_000;

interface EditModeCtx {
  isEditMode: boolean;
  lastActivity: number;
  enterEditMode: () => void;
  resetTimer: () => void;
}

const EditModeContext = createContext<EditModeCtx>({
  isEditMode: false,
  lastActivity: 0,
  enterEditMode: () => {},
  resetTimer: () => {},
});

export function EditModeProvider({ children }: { children: React.ReactNode }) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const exitEditMode = useCallback(() => setIsEditMode(false), []);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(exitEditMode, EDIT_TIMEOUT_MS);
  }, [exitEditMode]);

  const enterEditMode = useCallback(() => {
    setIsEditMode(true);
    setLastActivity(Date.now());
    startTimer();
  }, [startTimer]);

  const resetTimer = useCallback(() => {
    if (!isEditMode) return;
    setLastActivity(Date.now());
    startTimer();
  }, [isEditMode, startTimer]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <EditModeContext.Provider value={{ isEditMode, lastActivity, enterEditMode, resetTimer }}>
      {children}
    </EditModeContext.Provider>
  );
}

export function useEditMode() {
  return useContext(EditModeContext);
}
