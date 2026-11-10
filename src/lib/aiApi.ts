import { apiClient } from "@/lib/apiClient.ts";

// 서버 AiModelService가 받는 모델 식별자다.
export const AI_MODELS = [
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
  { id: "openai/gpt-oss-20b", label: "Groq GPT-OSS 20B" },
] as const;

export type AiModelId = (typeof AI_MODELS)[number]["id"];

export interface AiConversation {
  conversationId: number;
  title: string;
  isClosed: boolean;
  createdAt: string;
}

export interface AiMessage {
  messageId: number;
  sequenceNo: number;
  role: "USER" | "ASSISTANT";
  content: string;
  resultJson: string | null;
  createdAt: string;
}

export interface AiConversationDetail {
  conversationId: number;
  title: string;
  isClosed: boolean;
  messages: AiMessage[];
}

export interface AiAnswer {
  model: string;
  answer: string;
}

export async function fetchConversations(): Promise<AiConversation[]> {
  const { data } = await apiClient.get<AiConversation[]>("/ai/conversations");
  return data;
}

export async function createConversation(): Promise<number> {
  const { data } = await apiClient.post<number>("/ai/conversations");
  return data;
}

export async function fetchConversation(conversationId: number): Promise<AiConversationDetail> {
  const { data } = await apiClient.get<AiConversationDetail>(`/ai/conversations/${conversationId}`);
  return data;
}

export async function renameConversation(conversationId: number, title: string): Promise<void> {
  await apiClient.patch(`/ai/conversations/${conversationId}/title`, { title });
}

export async function closeConversation(conversationId: number): Promise<void> {
  await apiClient.patch(`/ai/conversations/${conversationId}/close`);
}

export async function askAi(conversationId: number, model: string, message: string): Promise<AiAnswer> {
  const { data } = await apiClient.post<AiAnswer>(`/ai/conversations/${conversationId}/messages`, { model, message });
  return data;
}
