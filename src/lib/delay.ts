import { parseISO } from "@/lib/dates.ts";
import type { Order, WorkOrder } from "@/types/domain.ts";

export interface DelaySignal {
  level: "late" | "risk";
  reason: string;
}

function daysBetween(from: string, to: string): number {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000);
}

const beforeShipping: Order["status"][] = ["WAITING", "CONFIRMED", "IN_PRODUCTION", "ON_HOLD", "PACKING", "PACKED"];
const producing: Order["status"][] = ["CONFIRMED", "IN_PRODUCTION", "ON_HOLD"];

export function delayOf(order: Order, workOrder: WorkOrder | undefined, today: string): DelaySignal | null {
  if (order.status === "COMPLETED" || order.status === "CANCELLED") return null;
  if (order.dueDate < today) return { level: "late", reason: `납기 ${daysBetween(order.dueDate, today)}일 초과` };
  if (producing.includes(order.status) && order.plannedEndDate < today) return { level: "late", reason: `생산 완료 예정일(${order.plannedEndDate}) 지남` };
  if (order.status === "ON_HOLD") return { level: "risk", reason: "생산 일시정지" };
  if (order.status === "CONFIRMED" && workOrder && !workOrder.assigneeId) return { level: "risk", reason: "담당자 미배정" };
  if (order.status === "CONFIRMED" && order.plannedStartDate < today) return { level: "risk", reason: `착수 지연 (시작 예정 ${order.plannedStartDate})` };
  if (order.status === "WAITING" && order.plannedStartDate <= today) return { level: "risk", reason: "선금 미확인 · 생산 시작일 도래" };
  const left = daysBetween(today, order.dueDate);
  if (beforeShipping.includes(order.status) && left <= 3) return { level: "risk", reason: left === 0 ? "오늘 납기 · 미출고" : `납기 D-${left} · 미출고` };
  return null;
}

export function delayTone(level: DelaySignal["level"]): string {
  return level === "late" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800";
}

export function activeWorkOrder(workOrders: WorkOrder[], orderId: string): WorkOrder | undefined {
  return workOrders.find((item) => item.orderId === orderId && item.status !== "CANCELLED");
}
