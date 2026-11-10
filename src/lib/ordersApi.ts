import { apiClient } from "@/lib/apiClient.ts";
import type { ConfirmationStatus } from "@/types/domain.ts";

export interface OrderDetailItem {
  id: number;
  productId: number;
  productName: string;
  deviceName: string;
  quantity: number;
  unitPrice: number;
  supplyAmount: number;
  vatAmount: number;
  lineAmount: number;
}

export interface OrderDetailClient {
  id: number;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
}

export interface OrderDelay {
  level: string;
  reason: string;
}

export interface OrderDetail {
  id: number;
  orderNo: string;
  quotationId: number;
  quotationNo: string;
  userId: number;
  userName: string;
  createdAt: string;
  updatedAt: string;
  confirmationStatus: ConfirmationStatus;
  statusCodeId: number;
  status: string;
  statusName: string;
  paymentStatus: string;
  client: OrderDetailClient;
  items: OrderDetailItem[];
  vatIncluded: boolean;
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
  totalQuantity: number;
  requestedDueDate: string;
  dueDate: string;
  plannedStartDate: string;
  plannedEndDate: string;
  productionCompletedAt: string | null;
  depositDueDate: string;
  shippingAddress: string;
  receiverName: string;
  receiverPhone: string;
  notifyChannel: "EMAIL" | "SMS";
  memo: string | null;
  delay: OrderDelay | null;
}

export interface OrderHistory {
  id: number;
  fromStatus: string;
  toStatus: string;
  userId: number | null;
  userName: string | null;
  note: string | null;
  createdAt: string;
}

export async function fetchOrder(orderId: number): Promise<OrderDetail> {
  const { data } = await apiClient.get<OrderDetail>(`/orders/${orderId}`);
  return data;
}

export async function fetchOrderHistories(orderId: number): Promise<OrderHistory[]> {
  const { data } = await apiClient.get<OrderHistory[]>(`/orders/${orderId}/histories`);
  return data;
}
