import type {
  AccountStatus,
  ConfirmationStatus,
  LineStatus,
  OrderStatus,
  PaymentStatus,
  QuotationStatus,
  Role,
  WorkOrderStatus,
} from "@/types/domain.ts";

export const quotationStatusLabel: Record<QuotationStatus, string> = {
  SENT: "발송완료",
  APPROVED: "승인",
  REJECTED: "거절",
  CANCELLED: "취소",
  EXPIRED: "만료",
};

export function quotationStatusTone(status: QuotationStatus): string {
  if (status === "SENT") return "bg-blue-50 text-blue-700";
  if (status === "APPROVED") return "bg-emerald-50 text-emerald-700";
  if (status === "REJECTED" || status === "CANCELLED") return "bg-red-50 text-red-700";
  return "bg-slate-100 text-slate-600";
}

export const roleLabel: Record<Role, string> = {
  SUPER_ADMIN: "최고 관리자",
  ORDER_MANAGER: "수주 관리자",
  PRODUCTION_MANAGER: "생산 현장 관리자",
  VIEWER: "업무 조회 담당",
};

export const orderStatusLabel: Record<OrderStatus, string> = {
  WAITING: "대기",
  CONFIRMED: "생산대기",
  IN_PRODUCTION: "생산중",
  PACKING: "포장중",
  READY_TO_SHIP: "출고대기",
  SHIPPING: "배송중",
  COMPLETED: "완료",
  ON_HOLD: "생산보류",
  CANCELLED: "취소",
};

export const workStatusOrder: OrderStatus[] = [
  "WAITING",
  "CONFIRMED",
  "IN_PRODUCTION",
  "PACKING",
  "READY_TO_SHIP",
  "SHIPPING",
  "COMPLETED",
  "ON_HOLD",
  "CANCELLED",
];

export function registrationLabel(status: ConfirmationStatus): string {
  if (status === "CANCELLED") return "취소";
  return status === "PENDING" ? "예정" : "확정";
}

export function registrationTone(status: ConfirmationStatus): string {
  if (status === "CANCELLED") return "bg-slate-100 text-slate-600";
  return status === "PENDING" ? "bg-orange-50 text-orange-700" : "bg-cyan-50 text-cyan-800";
}

export const workOrderStatusLabel: Record<WorkOrderStatus, string> = {
  READY: "준비",
  IN_PRODUCTION: "생산중",
  PAUSED: "일시정지",
  COMPLETED: "생산완료",
  CANCELLED: "취소",
};

export const paymentStatusLabel: Record<PaymentStatus, string> = {
  UNPAID: "미입금",
  PARTIAL: "계약금 입금",
  PAID: "전액 입금",
};

export const lineStatusLabel: Record<LineStatus, string> = {
  AVAILABLE: "가동 가능",
  RUNNING: "가동 중",
  MAINTENANCE: "점검 중",
  BROKEN: "고장",
};

export const accountStatusLabel: Record<AccountStatus, string> = {
  ACTIVE: "사용",
  INACTIVE: "비활성",
  DELETED: "삭제",
};

export function orderStatusTone(status: OrderStatus): string {
  if (status === "WAITING") return "bg-slate-100 text-slate-600";
  if (status === "CONFIRMED") return "bg-blue-50 text-blue-700";
  if (status === "IN_PRODUCTION") return "bg-primary-soft text-primary";
  if (status === "PACKING") return "bg-violet-50 text-violet-700";
  if (status === "READY_TO_SHIP") return "bg-teal-50 text-teal-800";
  if (status === "SHIPPING") return "bg-sky-50 text-sky-700";
  if (status === "COMPLETED") return "bg-emerald-50 text-emerald-700";
  if (status === "ON_HOLD") return "bg-amber-50 text-amber-800";
  return "bg-red-50 text-red-700";
}

export function paymentTone(status: PaymentStatus): string {
  if (status === "PAID") return "bg-lime-50 text-lime-800";
  if (status === "UNPAID") return "bg-rose-50 text-rose-700";
  return "bg-yellow-50 text-yellow-800";
}

export function lineTone(status: LineStatus): string {
  if (status === "AVAILABLE") return "bg-slate-100 text-muted";
  if (status === "MAINTENANCE") return "bg-warning-soft text-warning";
  if (status === "BROKEN") return "bg-red-50 text-danger";
  return "bg-primary-soft text-primary";
}
