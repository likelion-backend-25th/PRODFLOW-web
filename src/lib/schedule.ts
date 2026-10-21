import { addDays, isWeekend } from "@/lib/dates.ts";
import type { DayAllocation, Line, Order } from "@/types/domain.ts";

export interface ScheduleResult {
  plannedStartDate: string;
  plannedEndDate: string;
  earliestDueDate: string;
  allocations: DayAllocation[];
}

function holidaySet(holidays: string[]): Set<string> {
  return new Set(holidays);
}

export function isWorkingDay(iso: string, holidays: string[]): boolean {
  return !isWeekend(iso) && !holidaySet(holidays).has(iso);
}

export function factoryCapacity(lines: Line[]): number {
  return lines
    .filter((line) => line.status === "AVAILABLE" || line.status === "RUNNING")
    .reduce((sum, line) => sum + line.dailyCapacity, 0);
}

export function occupiedOn(iso: string, orders: Order[], ignoreOrderId?: string): number {
  return orders
    .filter((order) => order.id !== ignoreOrderId && order.status !== "CANCELLED")
    .reduce((sum, order) => {
      const slot = order.allocations.find((item) => item.date === iso);
      return sum + (slot?.quantity ?? 0);
    }, 0);
}

export function addWorkingDays(iso: string, count: number, holidays: string[]): string {
  let cursor = iso;
  let left = count;
  let guard = 0;
  while (left > 0 && guard < 400) {
    cursor = addDays(cursor, 1);
    if (isWorkingDay(cursor, holidays)) left -= 1;
    guard += 1;
  }
  return cursor;
}

export function capacityUntil(
  dueDate: string,
  fromDate: string,
  lines: Line[],
  holidays: string[],
  orders: Order[],
): { total: number; available: number; lastProductionDate: string | null } {
  const daily = factoryCapacity(lines);
  let total = 0;
  let available = 0;
  let lastProductionDate: string | null = null;
  for (let cursor = fromDate, guard = 0; cursor <= dueDate && guard < 400; cursor = addDays(cursor, 1), guard += 1) {
    if (!isWorkingDay(cursor, holidays) || addWorkingDays(cursor, 2, holidays) > dueDate) continue;
    total += daily;
    available += Math.max(0, daily - occupiedOn(cursor, orders));
    lastProductionDate = cursor;
  }
  return { total, available, lastProductionDate };
}

export function scheduleQuantity(
  quantity: number,
  fromDate: string,
  lines: Line[],
  holidays: string[],
  orders: Order[],
  ignoreOrderId?: string,
): ScheduleResult {
  if (quantity <= 0) throw new Error("수량은 1개 이상이어야 합니다.");
  const daily = factoryCapacity(lines);
  if (daily <= 0) throw new Error("가동할 수 있는 라인이 없어 일정을 잡을 수 없습니다.");

  let cursor = fromDate;
  let plannedStart = "";
  let left = quantity;
  const allocations: DayAllocation[] = [];
  let guard = 0;

  while (left > 0 && guard < 500) {
    if (isWorkingDay(cursor, holidays)) {
      const remaining = Math.max(0, daily - occupiedOn(cursor, orders, ignoreOrderId));
      if (!plannedStart) {
        if (remaining > 0) plannedStart = cursor;
      }
      if (plannedStart && remaining > 0) {
        const take = Math.min(left, remaining);
        allocations.push({ date: cursor, quantity: take });
        left -= take;
      }
    }
    if (left > 0) cursor = addDays(cursor, 1);
    guard += 1;
  }

  if (!plannedStart || left > 0) throw new Error("가용 생산량 안에서 완료 예정일을 계산하지 못했습니다.");
  const plannedEndDate = allocations[allocations.length - 1]?.date ?? plannedStart;
  return {
    plannedStartDate: plannedStart,
    plannedEndDate,
    earliestDueDate: addWorkingDays(plannedEndDate, 2, holidays),
    allocations,
  };
}
