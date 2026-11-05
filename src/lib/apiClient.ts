import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

const SESSION_KEY = "prodflow-session";

export const apiClient = axios.create({
  baseURL: "/api/v1",
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return config;
  const session = JSON.parse(raw) as { token?: string };
  if (session.token) {
    config.headers.Authorization = `Bearer ${session.token}`;
  }
  return config;
});

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetryConfig | undefined;
    const url = original?.url ?? "";
    const skipRefresh = url.includes("/auth/login") || url.includes("/auth/refresh") || url.includes("/auth/logout");
    if (error.response?.status !== 401 || !original || original._retry || skipRefresh) {
      return Promise.reject(error);
    }
    original._retry = true;
    try {
      const nextToken = await refreshAccessToken();
      original.headers.Authorization = `Bearer ${nextToken}`;
      return apiClient(original);
    } catch (refreshError: unknown) {
      void import("@/stores/useAuthStore.ts").then(({ useAuthStore }) => useAuthStore.getState().logout());
      return Promise.reject(refreshError);
    }
  },
);

let refreshing: Promise<string> | null = null;

export function refreshAccessToken(): Promise<string> {
  refreshing ??= axios.post<{ accessToken: string; mustChangePassword?: boolean }>("/api/v1/auth/refresh", null, { withCredentials: true })
    .then((response) => {
      const token = response.data.accessToken;
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const session = JSON.parse(raw) as { token?: string; user?: { mustChangePassword?: boolean } };
        session.token = token;
        if (session.user && typeof response.data.mustChangePassword === "boolean") {
          session.user.mustChangePassword = response.data.mustChangePassword;
        }
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      }
      void import("@/stores/useAuthStore.ts").then(({ useAuthStore }) => {
        const current = useAuthStore.getState();
        if (!current.user) return;
        useAuthStore.setState({
          token,
          user: typeof response.data.mustChangePassword === "boolean"
            ? { ...current.user, mustChangePassword: response.data.mustChangePassword }
            : current.user,
        });
      });
      return token;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export function apiStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

export function readApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (typeof message === "string" && message.length > 0) return message;
    if (error.response?.status === 403) return "해당 작업을 수행할 권한이 없습니다.";
    if (error.response?.status) return `요청이 실패했습니다. (${error.response.status})`;
  }
  return "요청이 실패했습니다.";
}
