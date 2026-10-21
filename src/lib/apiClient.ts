import axios from "axios";

export const apiClient = axios.create({
  baseURL: "/api/v1",
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

export function readApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (typeof message === "string" && message.length > 0) return message;
    if (error.response?.status) return `요청이 실패했습니다. (${error.response.status})`;
  }
  return "요청이 실패했습니다.";
}
