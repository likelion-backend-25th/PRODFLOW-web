import { create } from "zustand";
export const useToastStore = create((set) => ({
    message: null,
    show: (message) => set({ message }),
    clear: () => set({ message: null }),
}));
export function runAction(action, show, success = "반영했습니다.") {
    try {
        action();
        show(success);
    }
    catch (error) {
        show(error instanceof Error ? error.message : "처리하지 못했습니다.");
    }
}
