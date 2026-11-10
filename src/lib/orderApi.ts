import { apiClient } from "@/lib/apiClient.ts";
import { fetchWorkOrders, type WorkOrderRow } from "@/lib/workOrdersApi.ts";
import type { ConfirmationStatus, NotifyChannel, OrderStatus, PaymentStatus } from "@/types/domain.ts";

export interface OrderClient {
  id: number;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
}

export interface OrderItem {
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

export interface OrderDelay {
  level: "late" | "risk";
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
  client: OrderClient;
  items: OrderItem[];
  vatIncluded: boolean;
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
  totalQuantity: number;
  requestedDueDate: string;
  dueDate: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  productionCompletedAt: string | null;
  depositDueDate: string | null;
  shippingAddress: string;
  receiverName: string;
  receiverPhone: string;
  notifyChannel: NotifyChannel;
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

export interface OrderVirtualAccount {
  virtualAccountId: number;
  paymentId: number;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  expiresAt: string | null;
  status: string;
}

export interface OrderPaymentHistory {
  paymentHistoryId: number;
  paymentId: number;
  virtualAccountId: number | null;
  transactionId: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface OrderPaymentRow {
  paymentId: number;
  paymentType: "DEPOSIT" | "BALANCE";
  amount: number;
  status: string;
  paymentMethod: string | null;
  createdAt: string;
  virtualAccount: OrderVirtualAccount | null;
  paymentHistory: OrderPaymentHistory | null;
}

export interface OrderPayments {
  orderId: number;
  totalAmount: number;
  depositAmount: number;
  paidAmount: number;
  balanceAmount: number;
  payments: OrderPaymentRow[];
}

export function screenPaymentStatus(status: string): PaymentStatus {
  if (status === "PAID") return "PAID";
  if (status === "PARTIAL" || status === "PARTIALLY_PAID") return "PARTIAL";
  return "UNPAID";
}

export function screenOrderStatus(status: string): OrderStatus {
  if (status === "PRODUCTION_READY") return "CONFIRMED";
  if (status === "WAITING" || status === "ON_HOLD" || status === "CONFIRMED" || status === "IN_PRODUCTION" || status === "PACKING" || status === "READY_TO_SHIP" || status === "SHIPPING" || status === "COMPLETED" || status === "CANCELLED") {
    return status;
  }
  return "CANCELLED";
}

export async function getOrder(orderId: number): Promise<OrderDetail> {
  const { data } = await apiClient.get<OrderDetail>(`/orders/${orderId}`);
  return data;
}

export async function getOrderHistories(orderId: number): Promise<OrderHistory[]> {
  const { data } = await apiClient.get<OrderHistory[]>(`/orders/${orderId}/histories`);
  return data;
}

export async function getOrderPayments(orderId: number): Promise<OrderPayments> {
  const { data } = await apiClient.get<OrderPayments>("/payments", { params: { orderId } });
  return data;
}

export interface ManualDepositResult {
  paymentId: number;
  orderId: number;
  amount: number;
  paymentMethod: "VA" | "MD";
  paidAt: string;
  orderStatus: string;
  confirmationStatus: ConfirmationStatus;
  paymentStatus: string;
  workOrderIds: number[];
}

export async function recordManualDeposit(orderId: number, amount: number): Promise<ManualDepositResult> {
  const { data } = await apiClient.post<ManualDepositResult>("/payments/deposit/manual", { orderId, amount });
  return data;
}

export interface OrderListItem {
  id: number;
  orderNo: string;
  clientId: number;
  clientCompany: string;
  items: Array<{ id: number; productId: number; productName: string; quantity: number }>;
  itemCount: number;
  totalQuantity: number;
  totalAmount: number;
  dueDate: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  depositDueDate: string | null;
  confirmationStatus: ConfirmationStatus;
  statusCodeId: number;
  status: string;
  statusName: string;
  paymentStatus: string;
  carrierName: string | null;
  trackingNumber: string | null;
  completedAt: string | null;
  createdAt: string;
  delay: OrderDelay | null;
}

export interface OrderListPageResult {
  content: OrderListItem[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface ClientOrderData {
  id: number;
  orderNo: string;
  createdAt: string;
  estimatedDueDate: string;
  endDate: string | null;
  statusCode: {
    id: number;
    code: string;
    name: string;
  };
  confirmationStatus: ConfirmationStatus;
  paymentStatus: string;
  totalAmount: number;
}

export interface ClientOrder {
  customerOrder: ClientOrderData;
  productName: string;
}

export interface ClientOrderPage {
  content: ClientOrder[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface OrderSummary {
  waiting: number;
  making: number;
  shipping: number;
  doneThisMonth: number;
  openCount: number;
  doneCount: number;
}

export interface OrderStatusOption {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
}

export interface OrderListQuery {
  tab: "OPEN" | "DONE";
  keyword?: string;
  confirmationStatus?: ConfirmationStatus;
  statusCodeId?: number;
  paymentStatus?: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  sortType?: "CREATED_AT" | "COMPLETED_AT";
  page?: number;
  size?: number;
}

export interface CreateOrderInput {
  quotationId: number;
  items: Array<{ quotationItemId: number; quantity: number }>;
  dueDate: string;
  useCompanyAddress: boolean;
  shippingAddress?: { zipcode: string; roadAddress: string; detailAddress: string };
  receiverName: string;
  receiverPhone: string;
  notifyChannel: "SMS" | "EMAIL";
  memo?: string;
}

export interface CreateOrderResult {
  id: number;
  orderNo: string;
  quotationId: number;
  totalAmount: number;
  dueDate: string;
  depositDueDate: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  status: string;
  confirmationStatus: ConfirmationStatus;
  paymentStatus: string;
}

function orderListParams(query: OrderListQuery, paged: boolean) {
  return {
    tab: query.tab,
    keyword: query.keyword?.trim() || undefined,
    confirmationStatus: query.confirmationStatus || undefined,
    statusCodeId: query.statusCodeId || undefined,
    paymentStatus: query.paymentStatus || undefined,
    sortType: query.sortType ?? "CREATED_AT",
    page: paged ? query.page ?? 0 : undefined,
    size: paged ? query.size ?? 8 : undefined,
  };
}

export async function listOrders(query: OrderListQuery): Promise<OrderListPageResult> {
  const { data } = await apiClient.get<OrderListPageResult>("/orders", { params: orderListParams(query, true) });
  return data;
}

export async function getRecentClientOrder(clientId: number): Promise<ClientOrder> {
  const { data } = await apiClient.get<ClientOrder>(`/orders/clients/${clientId}/recent`);
  return data;
}

export async function listClientOrders(clientId: number, page: number, size: number): Promise<ClientOrderPage> {
  const { data } = await apiClient.get<ClientOrderPage>(`/orders/clients/${clientId}`, {
    params: { page, size, sort: "createdAt,desc" },
  });
  return data;
}

export async function getOrderSummary(): Promise<OrderSummary> {
  const { data } = await apiClient.get<OrderSummary>("/orders/summary");
  return data;
}

export async function getOrderStatuses(): Promise<OrderStatusOption[]> {
  const { data } = await apiClient.get<OrderStatusOption[]>("/orders/statuses");
  return data;
}

export async function exportOrders(query: OrderListQuery): Promise<Blob> {
  const { data } = await apiClient.get<Blob>("/orders/export", { params: orderListParams(query, false), responseType: "blob" });
  return data;
}

export async function createCustomerOrder(body: CreateOrderInput): Promise<CreateOrderResult> {
  const { data } = await apiClient.post<CreateOrderResult>("/orders", {
    quotationId: body.quotationId,
    items: body.items,
    dueDate: body.dueDate,
    useCompanyAddress: body.useCompanyAddress,
    shippingAddress: body.useCompanyAddress ? undefined : body.shippingAddress,
    receiverName: body.receiverName,
    receiverPhone: body.receiverPhone,
    notifyChannel: body.notifyChannel,
    memo: body.memo?.trim() || undefined,
  });
  return data;
}

export async function listOrderWorkOrders(orderId: number): Promise<WorkOrderRow[]> {
  const rows: WorkOrderRow[] = [];
  let page = 0;
  let totalPages = 1;
  while (page < totalPages && page < 20) {
    const result = await fetchWorkOrders({ orderId, page, size: 100 });
    rows.push(...result.content);
    totalPages = result.totalPages;
    page += 1;
  }
  return rows;
}
