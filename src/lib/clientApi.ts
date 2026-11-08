import { apiClient } from "@/lib/apiClient.ts";

export interface ClientListItem {
  id: number;
  company: string;
  employee: string;
  phone: string;
  email: string;
  totalOrder: number;
  totalAmount: number;
  recentOrderedAt: string | null;
}

export interface ClientPage {
  content: ClientListItem[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface ClientDetail {
  id: number;
  company: string;
  employee: string;
  email: string;
  phone: string;
  address: string;
  zipcode: string;
  roadAddress: string;
  detailAddress: string;
  userName: string;
  userPhone: string;
  totalOrder: number;
  totalAmount: number;
  ongoingOrders: number;
}

export interface ClientInput {
  company: string;
  employee: string;
  email: string;
  phone: string;
  userId: number;
  address: {
    zipcode: string;
    roadAddress: string;
    detailAddress: string;
  };
}

export function listClients(query: { keyword?: string; page: number; size?: number; sort?: string }): Promise<ClientPage> {
  return apiClient.get<ClientPage>("/clients", {
    params: {
      keyword: query.keyword || undefined,
      page: query.page,
      size: query.size ?? 8,
      sort: query.sort,
    },
  }).then((response) => response.data);
}

export function getClient(id: number): Promise<ClientDetail> {
  return apiClient.get<ClientDetail>(`/clients/${id}`).then((response) => response.data);
}

export function createClient(input: ClientInput): Promise<ClientDetail> {
  return apiClient.post<ClientDetail>("/clients", input).then((response) => response.data);
}

export function updateClient(id: number, input: ClientInput): Promise<ClientDetail> {
  return apiClient.post<ClientDetail>(`/clients/${id}`, input).then((response) => response.data);
}

export function importClientsFile(file: File): Promise<Array<{ id: number; company: string }>> {
  const body = new FormData();
  body.append("file", file);
  return apiClient.post<Array<{ id: number; company: string }>>("/clients/import", body).then((response) => response.data);
}
