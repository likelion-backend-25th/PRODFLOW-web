import type { PaymentStatus } from "@/types/domain.ts";

export function lineAmount(line: { quantity: number; unitPrice: number }, vatIncluded: boolean): number {
  const base = line.quantity * line.unitPrice;
  return vatIncluded ? base : Math.round(base * 1.1);
}

export function orderTotal(lines: Array<{ quantity: number; unitPrice: number }>, vatIncluded: boolean): number {
  return lines.reduce((sum, line) => sum + lineAmount(line, vatIncluded), 0);
}

export function orderQuantity(lines: Array<{ quantity: number }>): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

export function depositTarget(total: number): number {
  return Math.round(total * 0.5);
}

export function paymentStatusOf(paid: number, total: number): PaymentStatus {
  if (total <= 0 || paid <= 0) return "UNPAID";
  if (paid >= total) return "PAID";
  if (paid >= depositTarget(total)) return "PARTIAL";
  return "UNPAID";
}

export function formatWon(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function nextModelCode(codes: string[]): string {
  const max = codes.reduce((highest, code) => {
    const match = /^PM-(\d+)$/.exec(code);
    return Math.max(highest, match ? Number(match[1]) : 0);
  }, 0);
  return `PM-${String(max + 1).padStart(4, "0")}`;
}

export function productKey(productName: string, modelName: string): string {
  const collapse = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
  return `${collapse(productName)}|${collapse(modelName)}`;
}
