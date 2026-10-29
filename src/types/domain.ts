export type Role = "SUPER_ADMIN" | "ORDER_MANAGER" | "PRODUCTION_MANAGER" | "VIEWER";

/** 수주 진행 상태. VARCHAR(20). 본선: WAITING→CONFIRMED→IN_PRODUCTION→PACKING→READY_TO_SHIP→SHIPPING→COMPLETED. 예외: ON_HOLD, CANCELLED. */
export type OrderStatus =
  | "WAITING"
  | "ON_HOLD"
  | "CONFIRMED"
  | "IN_PRODUCTION"
  | "PACKING"
  | "READY_TO_SHIP"
  | "SHIPPING"
  | "COMPLETED"
  | "CANCELLED";

export type WorkOrderStatus = "READY" | "IN_PRODUCTION" | "PAUSED" | "COMPLETED" | "CANCELLED";

export type PaymentStatus = "UNPAID" | "PARTIAL" | "PAID";

export type LineStatus = "AVAILABLE" | "RUNNING" | "MAINTENANCE" | "BROKEN";

export type AccountStatus = "ACTIVE" | "INACTIVE" | "DELETED";

export interface User {
  id: string;
  accountNo: string;
  loginId: string;
  password: string;
  name: string;
  email: string;
  department: string;
  role: Role;
  status: AccountStatus;
  clockedIn: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface Client {
  id: string;
  companyName: string;
  representative: string;
  zipcode: string;
  roadAddress: string;
  detailAddress: string;
  phone: string;
  contactName: string;
  contactMobile: string;
  taxEmail: string;
  createdAt: string;
}

export interface Product {
  id: string;
  modelCode: string;
  productName: string;
  modelName: string;
  description: string;
  unitPrice: number;
  designImageUrl: string;
  drawingPdfName?: string;
  drawingPdfUrl?: string;
  createdAt: string;
  updatedAt: string;
  createdByName: string;
}

export interface OrderLine {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
}

export type ConfirmationStatus = "PENDING" | "CONFIRMED" | "CANCELLED";

export interface DayAllocation {
  date: string;
  quantity: number;
}

export interface WorkOrderItem {
  productId: string;
  quantity: number;
}

export type NotifyChannel = "SMS" | "EMAIL";

export type QuotationStatus = "SENT" | "APPROVED" | "REJECTED" | "CANCELLED" | "EXPIRED";

export interface Quotation {
  id: string;
  quotationNo: string;
  clientId: string;
  userId: string;
  lines: OrderLine[];
  requestedDueDate: string;
  estimatedDueDate: string;
  plannedStartDate: string;
  plannedEndDate: string;
  validUntil: string;
  status: QuotationStatus;
  vatIncluded: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  orderNo: string;
  quotationId?: string;
  clientId: string;
  lines: OrderLine[];
  requestedDueDate: string;
  dueDate: string;
  plannedStartDate: string;
  plannedEndDate: string;
  depositDueDate: string;
  allocations: DayAllocation[];
  shippingAddress: string;
  receiverName: string;
  receiverPhone: string;
  notifyChannel: NotifyChannel;
  memo: string;
  status: OrderStatus;
  confirmationStatus: ConfirmationStatus;
  vatIncluded: boolean;
  paymentStatus: PaymentStatus;
  paidAmount: number;
  virtualAccount: string;
  coveredQuantity: number;
  producedQuantity: number;
  carrier: string;
  trackingNo: string;
  createdAt: string;
  completedAt: string | null;
}

export interface WorkOrder {
  id: string;
  orderId: string;
  status: WorkOrderStatus;
  assigneeId: string | null;
  lineId: string | null;
  quantity: number;
  items: WorkOrderItem[];
  allocations: DayAllocation[];
  issuedAt: string;
  plannedStartDate: string;
  plannedEndDate: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface Line {
  id: string;
  name: string;
  dailyCapacity: number;
  status: LineStatus;
}

export interface LineCapacityLog {
  id: string;
  lineId: string;
  beforeCapacity: number;
  afterCapacity: number;
  reason: string;
  userId: string;
  changedAt: string;
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
}

export interface StatusHistory {
  id: string;
  entity: "ORDER" | "WORK_ORDER";
  entityId: string;
  fromStatus: string;
  toStatus: string;
  at: string;
  actorId: string;
  actorName: string;
  note?: string;
}

export interface Attendance {
  id: string;
  userId: string;
  clockInAt: string;
  clockOutAt: string | null;
}

export interface NotificationLog {
  id: string;
  orderId: string;
  success: boolean;
  message: string;
  at: string;
}

export interface Database {
  users: User[];
  clients: Client[];
  products: Product[];
  quotations: Quotation[];
  orders: Order[];
  workOrders: WorkOrder[];
  lines: Line[];
  lineCapacityLogs: LineCapacityLog[];
  holidays: Holiday[];
  histories: StatusHistory[];
  notifications: NotificationLog[];
  attendance: Attendance[];
}
