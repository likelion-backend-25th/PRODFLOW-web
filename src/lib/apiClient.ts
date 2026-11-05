import axios from "axios";

export const apiClient = axios.create({
  baseURL: "/api/v1",
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const raw = localStorage.getItem("prodflow-session");
  if (!raw) return config;
  const session = JSON.parse(raw) as { token?: string };
  if (session.token) {
    config.headers.Authorization = `Bearer ${session.token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const url = error.config?.url ?? "";
      const loggingIn = url.includes("/auth/login");
      if (!loggingIn) {
        localStorage.removeItem("prodflow-session");
        if (!window.location.pathname.startsWith("/login")) {
          window.location.assign("/login");
        }
      }
    }
    return Promise.reject(error);
  },
);

export function readApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (typeof message === "string" && message.length > 0) return message;
    if (error.response?.status) return `요청이 실패했습니다. (${error.response.status})`;
  }
  return "요청이 실패했습니다.";
}
