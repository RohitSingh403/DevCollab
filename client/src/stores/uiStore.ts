import { create } from 'zustand';

interface Toast {
  id: string;
  message: string;
}

interface UiState {
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
  toasts: Toast[];
  pushToast: (message: string) => void;
  dismissToast: (id: string) => void;
  workspaceId: string | null;
  rememberWorkspace: (id: string) => void;
}

const remembered = typeof localStorage === 'undefined' ? null : localStorage.getItem('devcollab.workspace');

export const useUiStore = create<UiState>((set, get) => ({
  navOpen: false,
  setNavOpen: (navOpen) => set({ navOpen }),
  toasts: [],
  pushToast: (message) => {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts, { id, message }].slice(-4) }));
    window.setTimeout(() => get().dismissToast(id), 4200);
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  workspaceId: remembered,
  rememberWorkspace: (workspaceId) => {
    localStorage.setItem('devcollab.workspace', workspaceId);
    set({ workspaceId });
  },
}));
