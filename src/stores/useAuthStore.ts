import { create } from "zustand";
import { apiClient, readApiErrorMessage, refreshAccessToken, setAccessToken } from "@/lib/apiClient.ts";
import { toRole, type ApiRole } from "@/lib/userApi.ts";
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
  temporaryPassword: string | null;
  initialized: boolean;
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  expireSession: () => void;
  completePasswordChange: () => void;
  setMustChangePassword: (mustChangePassword: boolean) => void;
  updateSessionUser: (input: Pick<SessionUser, "name" | "email" | "role">) => void;
}

interface LoginResponse {
  accessToken: string;
  userId: number;
  name: string;
  email: string;
  role: ApiRole;
  mustChangePassword: boolean;
}

const SESSION_KEY = "prodflow-session";
export const PASSWORD_CHANGED_KEY = "prodflow-password-changed";

function loadUser(): SessionUser | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as { user?: SessionUser }).user ?? null;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function persistUser(user: SessionUser | null): void {
  if (user) localStorage.setItem(SESSION_KEY, JSON.stringify({ user }));
  else localStorage.removeItem(SESSION_KEY);
}

const storedUser = loadUser();

export const useAuthStore = create<AuthState>((set, get) => ({
  user: storedUser,
  temporaryPassword: null,
  initialized: !storedUser,
  initialize: async () => {
    if (get().initialized) return;
    try {
      await refreshAccessToken();
      // 임시 비밀번호는 저장하지 않으므로 최초 변경 중 새로고침하면 다시 로그인해야 한다.
      if (get().user?.mustChangePassword && !get().temporaryPassword) {
        sessionStorage.setItem(PASSWORD_CHANGED_KEY, "보안을 위해 임시 비밀번호로 다시 로그인해 주세요.");
        get().expireSession();
        return;
      }
      set({ initialized: true });
    } catch {
      get().expireSession();
    }
  },
  login: async (email, password) => {
    try {
      const response = await apiClient.post<LoginResponse>("/auth/login", { email, password });
      const body = response.data;
      const user: SessionUser = {
        id: String(body.userId),
        name: body.name,
        role: toRole(body.role),
        loginId: body.email,
        email: body.email,
        mustChangePassword: body.mustChangePassword,
      };
      setAccessToken(body.accessToken);
      persistUser(user);
      set({
        user,
        temporaryPassword: body.mustChangePassword ? password : null,
        initialized: true,
      });
      return null;
    } catch (error: unknown) {
      return readApiErrorMessage(error);
    }
  },
  logout: async () => {
    try {
      await apiClient.post("/auth/logout");
    } catch {
      // 서버 로그아웃에 실패해도 브라우저 인증 정보는 반드시 정리한다.
    } finally {
      get().expireSession();
    }
  },
  expireSession: () => {
    setAccessToken(null);
    persistUser(null);
    set({ user: null, temporaryPassword: null, initialized: true });
  },
  completePasswordChange: () => {
    sessionStorage.setItem(PASSWORD_CHANGED_KEY, "비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인해 주세요.");
    get().expireSession();
  },
  setMustChangePassword: (mustChangePassword) => {
    const { user } = get();
    if (!user) return;
    const next = { ...user, mustChangePassword };
    persistUser(next);
    set({ user: next });
  },
  updateSessionUser: (input) => {
    const { user } = get();
    if (!user) return;
    const next = { ...user, ...input, loginId: input.email };
    persistUser(next);
    set({ user: next });
  },
}));

export function canManageOrders(role: Role | undefined): boolean {
  return role === "SUPER_ADMIN" || role === "ORDER_MANAGER";
}

export function canProduce(role: Role | undefined): boolean {
  return role === "SUPER_ADMIN" || role === "PRODUCTION_MANAGER";
}
