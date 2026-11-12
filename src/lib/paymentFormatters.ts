import type { PaymentMethod, PaymentStatus, PaymentType, VirtualAccountStatus } from "@/lib/paymentApi.ts";

const bankLabels: Record<string, string> = {
  KOOKMIN: "KB국민은행",
  SHINHAN: "신한은행",
  WOORI: "우리은행",
  HANA: "하나은행",
  NONGHYUP: "NH농협은행",
  IBK: "IBK기업은행",
  BUSAN: "부산은행",
  KYONGNAM: "경남은행",
  KWANGJU: "광주은행",
  DAEGU: "iM뱅크(대구은행)",
  SUHYUP: "Sh수협은행",
  KFCC: "새마을금고",
  POST: "우체국",
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  READY: "결제준비",
  WAITING: "입금대기",
  PAID: "입금완료",
  FAILED: "결제실패",
  CANCELLED: "결제취소",
  REQUESTED: "발급 요청 중",
  ISSUE_UNCERTAIN: "발급 확인 필요",
  REISSUE_CLOSING: "재발급 처리 중",
  PENDING: "처리 대기",
  PAY_PENDING: "승인 대기",
  VIRTUAL_ACCOUNT_ISSUED: "입금대기",
  PARTIAL_CANCELLED: "부분 취소",
};

const accountStatusLabels: Record<VirtualAccountStatus, string> = {
  ACTIVE: "정상(ACTIVE)",
  EXPIRED: "만료(EXPIRED)",
  CANCELLED: "취소(CANCELLED)",
  USED: "사용완료(USED)",
};

export function formatPaymentAmount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

export function formatLocalDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return match ? `${match[1]} ${match[2]}` : value;
}

export function formatOffsetDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export function paymentTypeLabel(type: PaymentType): string {
  return type === "DEPOSIT" ? "계약금" : "잔여대금";
}

export function paymentMethodLabel(method: PaymentMethod): string {
  return method === "VA" ? "가상계좌" : "수동입금";
}

export function paymentStatusLabel(status: string): string {
  return paymentStatusLabels[status as PaymentStatus] ?? status;
}

export function paymentStatusTone(status: string): string {
  if (status === "PAID") return "bg-emerald-50 text-emerald-700";
  if (status === "WAITING" || status === "VIRTUAL_ACCOUNT_ISSUED") return "bg-amber-50 text-amber-800";
  if (status === "FAILED") return "bg-red-50 text-red-700";
  if (status === "ISSUE_UNCERTAIN" || status === "REISSUE_CLOSING" || status === "PAY_PENDING") {
    return "bg-warning-soft text-warning";
  }
  return "bg-slate-100 text-slate-600";
}

export function bankLabel(bank: string | null | undefined): string {
  if (!bank) return "-";
  return bankLabels[bank] ?? bank;
}

export function effectiveAccountStatus(status: VirtualAccountStatus, expiresAt: string): VirtualAccountStatus {
  if (status !== "ACTIVE") return status;
  const expiry = new Date(expiresAt);
  return !Number.isNaN(expiry.getTime()) && expiry.getTime() <= Date.now() ? "EXPIRED" : status;
}

export function accountStatusLabel(status: VirtualAccountStatus): string {
  return accountStatusLabels[status];
}

export function accountStatusTone(status: VirtualAccountStatus): string {
  if (status === "ACTIVE" || status === "USED") return "bg-teal-100 text-teal-800";
  if (status === "EXPIRED") return "bg-red-50 text-red-700";
  return "bg-slate-100 text-slate-600";
}
