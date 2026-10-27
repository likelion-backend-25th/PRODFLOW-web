import { create } from "zustand";
import { readDb, updateDb } from "@/lib/db.ts";
const SESSION_KEY = "prodflow-session";
function loadSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw)
        return { user: null, token: null };
    return JSON.parse(raw);
}
export const useAuthStore = create((set, get) => ({
    ...loadSession(),
    login: (loginId, password) => {
        const account = readDb().users.find((user) => user.loginId === loginId);
        if (!account || account.password !== password)
            return "아이디 또는 비밀번호가 올바르지 않습니다.";
        if (account.status !== "ACTIVE")
            return "사용할 수 없는 계정입니다.";
        updateDb((db) => {
            const user = db.users.find((item) => item.id === account.id);
            if (user)
                user.lastLoginAt = new Date().toISOString();
        });
        const next = {
            user: { id: account.id, name: account.name, role: account.role, loginId: account.loginId },
            token: `demo.${account.id}`,
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(next));
        set(next);
        return null;
    },
    logout: () => {
        localStorage.removeItem(SESSION_KEY);
        set({ user: null, token: null });
    },
    refresh: () => {
        const { user, token } = get();
        const account = readDb().users.find((item) => item.id === user?.id);
        if (!user || !account)
            return;
        if (account.name === user.name && account.role === user.role)
            return;
        const next = { user: { ...user, name: account.name, role: account.role }, token };
        localStorage.setItem(SESSION_KEY, JSON.stringify(next));
        set(next);
    },
}));
export function canManageOrders(role) {
    return role === "SUPER_ADMIN" || role === "ORDER_MANAGER";
}
export function canProduce(role) {
    return role === "SUPER_ADMIN" || role === "PRODUCTION_MANAGER";
}
