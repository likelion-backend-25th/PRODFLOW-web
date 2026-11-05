import { create } from "zustand";
import { apiClient, readApiErrorMessage } from "@/lib/apiClient.ts";
import { readDb } from "@/lib/db.ts";
import type { Role } from "@/types/domain.ts";

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
  loginId: string;
  email: string;
  mustChangePassword: boolean;
}

interface AuthState {
  user: SessionUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => void;
  refresh: () => void;
  clearPasswordChange: () => void;
}

interface LoginResponse {
  accessToken: string;
  userId: number;
  name: string;
  email: string;
  role: Role | "INQUIRY_MANAGER";
  mustChangePassword: boolean;
}

function toRole(role: LoginResponse["role"]): Role {
  return role === "INQUIRY_MANAGER" ? "VIEWER" : role;
}

const SESSION_KEY = "prodflow-session";

function loadSession(): Pick<AuthState, "user" | "token"> {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return { user: null, token: null };
  return JSON.parse(raw) as Pick<AuthState, "user" | "token">;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  ...loadSession(),
  login: async (email, password) => {
    try {
      const response = await apiClient.post<LoginResponse>("/auth/login", { email, password });
      const body = response.data;
      const next = {
        user: {
          id: String(body.userId),
          name: body.name,
          role: toRole(body.role),
          loginId: body.email,
          email: body.email,
          mustChangePassword: body.mustChangePassword,
        },
        token: body.accessToken,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      set(next);
      return null;
    } catch (error: unknown) {
      return readApiErrorMessage(error);
    }
  },
  logout: () => {
    const token = get().token;
    void apiClient.post("/auth/logout", null, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).catch(() => undefined);
    localStorage.removeItem(SESSION_KEY);
    set({ user: null, token: null });
  },
  clearPasswordChange: () => {
    const { user, token } = get();
    if (!user) return;
    const next = { user: { ...user, mustChangePassword: false }, token };
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    set(next);
  },
  refresh: () => {
    const { user, token } = get();
    const account = readDb().users.find((item) => item.id === user?.id);
    if (!user || !account) return;
    if (account.name === user.name && account.role === user.role) return;
    const next = { user: { ...user, name: account.name, role: account.role }, token };
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    set(next);
  },
}));

export function canManageOrders(role: Role | undefined): boolean {
  return role === "SUPER_ADMIN" || role === "ORDER_MANAGER";
}

export function canProduce(role: Role | undefined): boolean {
  return role === "SUPER_ADMIN" || role === "PRODUCTION_MANAGER";
}
