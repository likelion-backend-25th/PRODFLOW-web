import { apiClient } from "@/lib/apiClient.ts";
import type { AccountStatus, Role } from "@/types/domain.ts";

export type ApiRole = "SUPER_ADMIN" | "ORDER_MANAGER" | "PRODUCTION_MANAGER" | "INQUIRY_MANAGER";
export type EditableAccountStatus = Exclude<AccountStatus, "DELETED">;

export interface UserResponse {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: ApiRole;
  status: AccountStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  mustChangePassword: boolean;
}

export interface MeResponse {
  userId: number;
  name: string;
  phone: string;
  email: string;
  role: ApiRole;
  status: AccountStatus;
  mustChangePassword: boolean;
}

export interface OrderManagerResponse {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: ApiRole;
  status: AccountStatus;
}

export interface UserStatsResponse {
  totalAccounts: number;
  activeAccounts: number;
  inactiveAccounts: number;
}

export interface UserPageResponse {
  content: UserResponse[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface CreateUserRequest {
  name: string;
  email: string;
  phone: string;
  role: ApiRole;
  temporaryPassword: string;
}

export interface UpdateUserRequest {
  name: string;
  email: string;
  phone: string;
  role: ApiRole;
  status: EditableAccountStatus;
  temporaryPassword: string | null;
}

export function toRole(role: ApiRole): Role {
  return role === "INQUIRY_MANAGER" ? "VIEWER" : role;
}

export function toApiRole(role: Role): ApiRole {
  return role === "VIEWER" ? "INQUIRY_MANAGER" : role;
}

export function getMe(): Promise<MeResponse> {
  return apiClient.get<MeResponse>("/users/me").then((response) => response.data);
}

export function getOrderManagers(): Promise<OrderManagerResponse[]> {
  return apiClient.get<OrderManagerResponse[]>("/users/order").then((response) => response.data);
}

export function getUsers(params: {
  keyword?: string;
  status?: EditableAccountStatus;
  page: number;
  size: number;
}): Promise<UserPageResponse> {
  return apiClient.get<UserPageResponse>("/users", {
    params: {
      keyword: params.keyword || undefined,
      status: params.status,
      page: params.page,
      size: params.size,
      sort: "id,desc",
    },
  }).then((response) => response.data);
}

export function getUserStats(): Promise<UserStatsResponse> {
  return apiClient.get<UserStatsResponse>("/users/stats").then((response) => response.data);
}

export function getUser(userId: number): Promise<UserResponse> {
  return apiClient.get<UserResponse>(`/users/${userId}`).then((response) => response.data);
}

export function createUser(input: CreateUserRequest): Promise<UserResponse> {
  return apiClient.post<UserResponse>("/users", input).then((response) => response.data);
}

export function updateUser(userId: number, input: UpdateUserRequest): Promise<UserResponse> {
  return apiClient.put<UserResponse>(`/users/${userId}`, input).then((response) => response.data);
}

export function deleteUser(userId: number): Promise<UserResponse> {
  return apiClient.delete<UserResponse>(`/users/${userId}`).then((response) => response.data);
}

export function generateTemporaryPassword(): string {
  const groups = ["ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz", "0123456789", "!@#$%&*?"] as const;
  const all = groups.join("");
  const randomIndex = (length: number): number => {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] % length;
  };
  const characters = groups.map((group) => group[randomIndex(group.length)]);
  while (characters.length < 12) characters.push(all[randomIndex(all.length)]);
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }
  return characters.join("");
}
