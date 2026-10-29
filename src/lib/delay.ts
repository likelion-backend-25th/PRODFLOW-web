import { parseISO } from "@/lib/dates.ts";
import type { Order, WorkOrder } from "@/types/domain.ts";

export interface DelaySignal {
  level: "late" | "risk";
  reason: string;
}

function daysBetween(from: string, to: string): number {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000);
}

const beforeShipping: Order["status"][] = ["WAITING", "CONFIRMED", "IN_PRODUCTION", "ON_HOLD", "PACKING", "READY_TO_SHIP"];
const producing: Order["status"][] = ["CONFIRMED", "IN_PRODUCTION", "ON_HOLD"];

export function delayOf(order: Order, workOrder: WorkOrder | undefined, today: string): DelaySignal | null {
  if (order.status === "COMPLETED" || order.status === "CANCELLED") return null;
  if (order.dueDate < today) return { level: "late", reason: `납기 ${daysBetween(order.dueDate, today)}일 초과` };
  if (producing.includes(order.status) && order.plannedEndDate < today) return { level: "late", reason: `생산 완료 예정일(${order.plannedEndDate}) 지남` };
  if (order.status === "ON_HOLD") return { level: "risk", reason: "생산 일시정지" };
  if (order.status === "CONFIRMED" && workOrder && !workOrder.assigneeId) return { level: "risk", reason: "담당자 미배정" };
  if (order.status === "CONFIRMED" && order.plannedStartDate < today) return { level: "risk", reason: `착수 지연 (시작 예정 ${order.plannedStartDate})` };
  if (order.status === "WAITING" && order.depositDueDate && order.depositDueDate <= today) {
    return { level: "risk", reason: order.depositDueDate === today ? "오늘 계약금 입금 마감" : "계약금 입금 마감일이 지났습니다" };
  }
  if (order.status === "WAITING" && order.plannedStartDate <= today) return { level: "risk", reason: "선금 미확인 · 생산 시작일 도래" };
  const left = daysBetween(today, order.dueDate);
  if (beforeShipping.includes(order.status) && left <= 3) return { level: "risk", reason: left === 0 ? "오늘 납기 · 미출고" : `납기 D-${left} · 미출고` };
  return null;
}

export function delayTone(level: DelaySignal["level"]): string {
  return level === "late" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800";
}

export function workOrdersOf(workOrders: WorkOrder[], orderId: string): WorkOrder[] {
  return workOrders.filter((item) => item.orderId === orderId && item.status !== "CANCELLED");
}

export function activeWorkOrder(workOrders: WorkOrder[], orderId: string): WorkOrder | undefined {
  const list = workOrdersOf(workOrders, orderId);
  return (
    list.find((item) => item.status === "IN_PRODUCTION") ??
    list.find((item) => item.status === "PAUSED") ??
    list.find((item) => item.status === "READY" && !item.assigneeId) ??
    list.find((item) => item.status === "READY") ??
    list[0]
  );
}
