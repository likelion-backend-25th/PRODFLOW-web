import { create } from "zustand";
import { apiClient, readApiErrorMessage } from "@/lib/apiClient.ts";
import { readDb } from "@/lib/db.ts";
import type { Role } from "@/types/domain.ts";

interface LoginResponse {
  accessToken: string;
  tokenType: string;
  userId: number;
  name: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
}

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
  loginId: string;
}

interface AuthState {
  user: SessionUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  refresh: () => void;
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
      const { data } = await apiClient.post<LoginResponse>("/auth/login", {
        email: email.trim(),
        password,
      });
      const next = {
        user: {
          id: String(data.userId),
          name: data.name,
          role: sessionRole(data.role),
          loginId: data.email,
        },
        token: data.accessToken,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      set(next);
      return null;
    } catch (error: unknown) {
      return readApiErrorMessage(error);
    }
  },
  logout: async () => {
    try {
      await apiClient.post("/auth/logout");
    } catch {
      // 서버 세션이 이미 없어도 화면 세션은 닫는다.
    }
    localStorage.removeItem(SESSION_KEY);
    set({ user: null, token: null });
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

function sessionRole(role: string): Role {
  if (role === "INQUIRY_MANAGER") return "VIEWER";
  if (role === "SUPER_ADMIN" || role === "ORDER_MANAGER" || role === "PRODUCTION_MANAGER" || role === "VIEWER") return role;
  return "VIEWER";
}
