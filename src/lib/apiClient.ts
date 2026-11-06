import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

// 로컬은 Vite 프록시가 /api 를 VITE_API_BASE_URL(localhost:8080)로 넘긴다. 배포 빌드만 그 주소로 직접 호출한다.
const apiOrigin = import.meta.env.DEV ? "" : (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");
const API_BASE_URL = `${apiOrigin}/api/v1`;
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
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
      setAccessToken(null);
      void import("@/stores/useAuthStore.ts").then(({ useAuthStore }) => useAuthStore.getState().expireSession());
      return Promise.reject(refreshError);
    }
  },
);

let refreshing: Promise<string> | null = null;

export function refreshAccessToken(): Promise<string> {
  refreshing ??= axios.post<{ accessToken: string; mustChangePassword?: boolean }>(`${API_BASE_URL}/auth/refresh`, null, { withCredentials: true })
    .then(async (response) => {
      const token = response.data.accessToken;
      setAccessToken(token);
      if (typeof response.data.mustChangePassword === "boolean") {
        const { useAuthStore } = await import("@/stores/useAuthStore.ts");
        useAuthStore.getState().setMustChangePassword(response.data.mustChangePassword);
      }
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
    const data: unknown = error.response?.data;
    const message = typeof data === "object" && data !== null && "message" in data
      ? (data as { message?: unknown }).message
      : undefined;
    if (typeof message === "string" && message.length > 0) return message;
    if (typeof data === "string" && data.length > 0) return data;
    if (error.response?.status === 401) return "로그인이 만료되었습니다. 다시 로그인해 주세요.";
    if (error.response?.status === 403) return "해당 작업을 수행할 권한이 없습니다.";
    if (error.response?.status === 409) return "현재 상태에서는 요청을 처리할 수 없습니다.";
    if (error.response?.status) return `요청이 실패했습니다. (${error.response.status})`;
  }
  return "요청이 실패했습니다.";
}
