import { create } from 'zustand';
import type { User } from '../lib/types';

interface AuthState {
  user: User | null;
  ready: boolean;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  ready: false,
  setUser: (user) => set({ user, ready: true }),
}));
