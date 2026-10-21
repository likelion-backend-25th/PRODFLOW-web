import { create } from "zustand";

interface ToastState {
  message: string | null;
  show: (message: string) => void;
  clear: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  show: (message) => set({ message }),
  clear: () => set({ message: null }),
}));

export function runAction(action: () => void, show: (message: string) => void, success = "반영했습니다."): void {
  try {
    action();
    show(success);
  } catch (error: unknown) {
    show(error instanceof Error ? error.message : "처리하지 못했습니다.");
  }
}
