import { apiClient } from "@/lib/apiClient.ts";

export type PaymentType = "DEPOSIT" | "BALANCE";
export type PaymentMethod = "VA" | "MD";
export type PaymentStatus =
  | "READY"
  | "WAITING"
  | "PAID"
  | "FAILED"
  | "CANCELLED"
  | "REQUESTED"
  | "ISSUE_UNCERTAIN"
  | "REISSUE_CLOSING"
  | "PENDING"
  | "PAY_PENDING"
  | "VIRTUAL_ACCOUNT_ISSUED"
  | "PARTIAL_CANCELLED";
export type VirtualAccountStatus = "ACTIVE" | "EXPIRED" | "CANCELLED" | "USED";

export interface PaymentSummary {
  totalScheduledAmount: number;
  waitingAmount: number;
  completedAmount: number;
  unpaidAmount: number;
}

export interface PaymentSearchParams {
  orderNumber?: string;
  clientName?: string;
  paymentType?: PaymentType;
  paymentStatus?: PaymentStatus;
  startDate?: string;
  endDate?: string;
  page: number;
  size: number;
  sort: string;
}

export interface PaymentListItem {
  paymentId: number;
  orderNumber: string;
  clientName: string;
  paymentType: PaymentType;
  scheduledAmount: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  bankName: string | null;
  accountNumber: string | null;
  expiresAt: string | null;
  receivedAt: string | null;
}

export interface PaymentPage {
  content: PaymentListItem[];
  number: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
  numberOfElements: number;
  empty: boolean;
}

export interface VirtualAccount {
  virtualAccountId: number;
  paymentId: number;
  bank: string;
  accountNumber: string;
  accountName: string | null;
  expiresAt: string;
  status: VirtualAccountStatus;
}

export interface PaymentHistory {
  paymentHistoryId: number;
  paymentId: number;
  virtualAccountId: number | null;
  transactionId: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface PaymentDetail {
  order: {
    orderId: number;
    orderNumber: string;
    clientName: string;
    totalAmount: number;
    orderStatus: string;
  };
  payment: {
    paymentId: number;
    paymentType: PaymentType;
    scheduledAmount: number;
    status: PaymentStatus;
    paymentMethod: PaymentMethod;
    createdAt: string;
    actualPaidAmount: number;
    portonePaymentId: string | null;
  };
  virtualAccount: VirtualAccount | null;
  paymentHistory: PaymentHistory | null;
  reissueAvailable: boolean;
}

export interface PaymentIssueResponse {
  paymentId: number;
  orderId: number;
  orderNo: string;
  paymentType: PaymentType;
  amount: number;
  status: PaymentStatus;
  paymentMethod: PaymentMethod;
  virtualAccount: VirtualAccount;
}

export function getPaymentSummary(): Promise<PaymentSummary> {
  return apiClient.get<PaymentSummary>("/payments/summary", { timeout: 15_000 }).then((response) => response.data);
}

export function getPayments(params: PaymentSearchParams): Promise<PaymentPage> {
  return apiClient.get<PaymentPage>("/payments", { params, timeout: 15_000 }).then((response) => response.data);
}

export function getPaymentDetail(paymentId: number): Promise<PaymentDetail> {
  return apiClient.get<PaymentDetail>(`/payments/${paymentId}`, { timeout: 15_000 }).then((response) => response.data);
}

export function reissueVirtualAccount(paymentId: number): Promise<PaymentIssueResponse> {
  // 재발급 조건과 새 계좌 값은 서버가 확정하므로 요청 본문을 보내거나 낙관적으로 상태를 바꾸지 않는다.
  return apiClient.post<PaymentIssueResponse>(`/payments/${paymentId}/reissue`, undefined, { timeout: 20_000 }).then((response) => response.data);
}
