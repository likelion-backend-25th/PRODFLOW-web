export type Role = "SUPER_ADMIN" | "ORDER_MANAGER" | "PRODUCTION_MANAGER" | "VIEWER";

export type OrderStatus =
  | "WAITING"
  | "ON_HOLD"
  | "CONFIRMED"
  | "IN_PRODUCTION"
  | "PACKING"
  | "PACKED"
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
  businessNumber: string;
  companyName: string;
  representative: string;
  address: string;
  phone: string;
  contactName: string;
  contactMobile: string;
  taxEmail: string;
}

export interface Product {
  id: string;
  productName: string;
  modelName: string;
  description: string;
  unitPrice: number;
  designImageUrl: string;
  createdAt: string;
  updatedAt: string;
  createdByName: string;
}

export interface OrderLine {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  vatIncluded: boolean;
}

export interface DayAllocation {
  date: string;
  quantity: number;
}

export type NotifyChannel = "SMS" | "EMAIL";

export interface Order {
  id: string;
  orderNo: string;
  clientId: string;
  lines: OrderLine[];
  requestedDueDate: string;
  dueDate: string;
  plannedStartDate: string;
  plannedEndDate: string;
  allocations: DayAllocation[];
  shippingAddress: string;
  receiverPhone: string;
  notifyChannel: NotifyChannel;
  memo: string;
  status: OrderStatus;
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
  orders: Order[];
  workOrders: WorkOrder[];
  lines: Line[];
  holidays: Holiday[];
  histories: StatusHistory[];
  notifications: NotificationLog[];
  attendance: Attendance[];
}
