// Lightweight global toast queue. Decoupled from the data store so the data
// store stays focused on Unit/Issue state. <ToastHost /> mounts once near the
// app root and renders whatever's current.

import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /**
   * Called when the toast goes away WITHOUT the action being invoked.
   * Useful for deferred cleanup that should commit only if the user did not
   * tap Undo (e.g. delete photo files on disk after a 5s undo window).
   */
  onDismissNoAction?: () => void;
  /** Auto-dismiss after this many ms (default 5000). */
  durationMs?: number;
}

interface ToastStore {
  current: Toast | null;
  show: (t: Omit<Toast, 'id'>) => void;
  dismiss: () => void;
}

let _nextId = 1;

export const useToastStore = create<ToastStore>((set) => ({
  current: null,
  show: (t) => set({ current: { id: _nextId++, ...t } }),
  dismiss: () => set({ current: null }),
}));

export function showToast(t: Omit<Toast, 'id'>) {
  useToastStore.getState().show(t);
}
