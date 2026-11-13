import axios from "axios";
import { apiClient, readApiErrorMessage } from "@/lib/apiClient.ts";
import type { QuotationStatus } from "@/types/domain.ts";

export type QuotationSortType = "CREATED_AT" | "REQUESTED_DUE_DATE" | "ESTIMATED_DUE_DATE" | "VALID_UNTIL";

export interface QuotationListItem {
  id: number;
  quotationNo: string;
  clientId: number;
  clientCompany: string;
  requestedDueDate: string;
  estimatedDueDate: string;
  totalAmount: number;
  status: QuotationStatus;
  customerOrderId: number | null;
  orderNo: string | null;
  validUntil: string;
  userId: number;
  userName: string;
  createdAt: string;
}

export interface QuotationPage {
  content: QuotationListItem[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface QuotationItemResponse {
  id: number;
  productId: number;
  productName: string;
  deviceName: string;
  quantity: number;
  unitPrice: number;
  lineAmount: number;
}

export interface QuotationDetail {
  id: number;
  quotationNo: string;
  status: QuotationStatus;
  clientId: number;
  clientCompany: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  clientAddress: string;
  itemCount: number;
  totalQuantity: number;
  items: QuotationItemResponse[];
  vatIncluded: boolean;
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
  depositAmount: number;
  balanceAmount: number;
  requestedDueDate: string;
  estimatedDueDate: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  validUntil: string;
  userId: number;
  userName: string;
  customerOrderId: number | null;
  orderNo: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface QuotationClientInput {
  company: string;
  employee: string;
  email: string;
  phone: string;
  zipcode: string;
  roadAddress: string;
  detailAddress: string;
}

export interface QuotationItemInput {
  productId: number;
  quantity: number;
  unitPrice: number;
}

export interface QuotationCreateInput {
  sameDayStart?: boolean;
  clientId?: number;
  requestedDueDate: string;
  validUntil: string;
  vatIncluded: boolean;
  items: QuotationItemInput[];
  newClient?: QuotationClientInput;
}

export interface QuotationSchedulePreview {
  earliestDueDate: string;
  requestedDueDate: string | null;
  feasible: boolean;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
}

export interface QuotationPdfPreview {
  quotationId: number;
  quotationNo: string;
  clientCompany: string;
  clientEmail: string;
  previewUrl: string;
  expiresAt: string;
  confirmationToken: string;
}

export interface QuotationSendResult {
  quotationId: number;
  status: QuotationStatus;
  emailStatus: string;
  duplicateRequest: boolean;
  message: string;
}

export function listQuotations(query: {
  keyword?: string;
  status?: QuotationStatus | "";
  orderPending?: boolean;
  sortType: QuotationSortType;
  startDate?: string;
  endDate?: string;
  page: number;
  size?: number;
}): Promise<QuotationPage> {
  return apiClient.get<QuotationPage>("/quotations", {
    params: {
      keyword: query.keyword || undefined,
      status: query.status || undefined,
      orderPending: query.orderPending || undefined,
      sortType: query.sortType,
      startDate: query.startDate || undefined,
      endDate: query.endDate || undefined,
      page: query.page,
      size: query.size ?? 12,
    },
  }).then((response) => response.data);
}

export function getQuotation(quotationId: number): Promise<QuotationDetail> {
  return apiClient.get<QuotationDetail>(`/quotations/${quotationId}`).then((response) => response.data);
}

export function deleteQuotation(quotationId: number): Promise<void> {
  return apiClient.delete(`/quotations/${quotationId}`).then(() => undefined);
}

export function approveQuotation(quotationId: number): Promise<QuotationDetail> {
  return apiClient.patch<QuotationDetail>(`/quotations/${quotationId}/approve`).then((response) => response.data);
}

export function rejectQuotation(quotationId: number): Promise<QuotationDetail> {
  return apiClient.patch<QuotationDetail>(`/quotations/${quotationId}/reject`).then((response) => response.data);
}

export function cancelQuotation(quotationId: number): Promise<QuotationDetail> {
  return apiClient.patch<QuotationDetail>(`/quotations/${quotationId}/cancel`).then((response) => response.data);
}

export function sendQuotation(quotationId: number, confirmationToken: string): Promise<QuotationSendResult> {
  return apiClient.post<QuotationSendResult>(`/quotations/${quotationId}/send`, { confirmationToken }).then((response) => response.data);
}

export function previewQuotationSchedule(input: {
  items: Array<{ productId: number; quantity: number }>;
  requestedDueDate?: string;
  sameDayStart?: boolean;
}): Promise<QuotationSchedulePreview> {
  return apiClient.post<QuotationSchedulePreview>("/quotations/schedule", {
    items: input.items,
    sameDayStart: input.sameDayStart ?? false,
    requestedDueDate: input.requestedDueDate || undefined,
  }).then((response) => response.data);
}

export function previewQuotationReschedule(quotationId: number, requestedDueDate?: string): Promise<QuotationSchedulePreview> {
  return apiClient.post<QuotationSchedulePreview>(`/quotations/${quotationId}/schedule`, {
    requestedDueDate: requestedDueDate || undefined,
  }).then((response) => response.data);
}

export function updateQuotationSchedule(quotationId: number, requestedDueDate: string): Promise<QuotationDetail> {
  return apiClient.patch<QuotationDetail>(`/quotations/${quotationId}/schedule`, { requestedDueDate }).then((response) => response.data);
}

export function createQuotationPdf(input: QuotationCreateInput): Promise<QuotationPdfPreview> {
  return apiClient.post<QuotationPdfPreview>("/quotations/pdf", input).then((response) => response.data);
}

export function updateQuotationPdf(quotationId: number, input: QuotationCreateInput): Promise<QuotationPdfPreview> {
  return apiClient.put<QuotationPdfPreview>(`/quotations/${quotationId}/pdf`, input).then((response) => response.data);
}

export function regenerateQuotationPdf(quotationId: number): Promise<QuotationPdfPreview> {
  return apiClient.post<QuotationPdfPreview>(`/quotations/${quotationId}/pdf/regenerate`).then((response) => response.data);
}

export function getQuotationPdf(quotationId: number): Promise<QuotationPdfPreview> {
  return apiClient.get<QuotationPdfPreview>(`/quotations/${quotationId}/pdf`).then((response) => response.data);
}

export function listLineCapacities(): Promise<Array<{ dailyCapacity: number; status: string }>> {
  return apiClient.get<{ lines: Array<{ productionCapacity: number; status: string }> }>("/lines").then((response) =>
    response.data.lines.map((line) => ({ dailyCapacity: line.productionCapacity, status: line.status })),
  );
}

export function listDailyPlanned(startDate: string, endDate: string): Promise<Array<{ date: string; plannedQuantity: number }>> {
  return apiClient.get<Array<{ date: string; plannedQuantity: number }>>("/statistics/production/daily", {
    params: { startDate, endDate },
  }).then((response) => response.data);
}

export function readPdfFailure(error: unknown): { message: string; quotationId: number | null } | null {
  if (!axios.isAxiosError(error)) return null;
  const data = error.response?.data as { message?: unknown; quotationId?: unknown } | undefined;
  if (!data || typeof data !== "object") return null;
  const quotationId = typeof data.quotationId === "number" ? data.quotationId : null;
  if (quotationId === null && typeof data.message !== "string") return null;
  return { message: typeof data.message === "string" ? data.message : readApiErrorMessage(error), quotationId };
}
