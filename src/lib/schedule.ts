import { addDays, isWeekend } from "@/lib/dates.ts";
import type { DayAllocation, Line, Order, WorkOrder, WorkOrderItem } from "@/types/domain.ts";

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

const occupyingStatus: Order["status"][] = ["WAITING", "CONFIRMED", "IN_PRODUCTION", "ON_HOLD"];

export type OccupyingOrder = Pick<Order, "id" | "status" | "allocations">;

export function occupiesFactory(status: Order["status"]): boolean {
  return occupyingStatus.includes(status);
}

export function occupiedOn(iso: string, orders: OccupyingOrder[], ignoreOrderId?: string): number {
  return orders
    .filter((order) => order.id !== ignoreOrderId && occupiesFactory(order.status))
    .reduce((sum, order) => {
      const slot = order.allocations.find((item) => item.date === iso);
      return sum + (slot?.quantity ?? 0);
    }, 0);
}

export function mergeAllocations(slots: DayAllocation[]): DayAllocation[] {
  const daily = new Map<string, number>();
  slots.forEach((slot) => {
    if (slot.quantity <= 0) return;
    daily.set(slot.date, (daily.get(slot.date) ?? 0) + slot.quantity);
  });
  return [...daily.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([date, quantity]) => ({ date, quantity }));
}

export interface PackJob {
  id: string;
  quantity: number;
  notBefore?: string;
}

export function packJobs(
  jobs: PackJob[],
  fromDate: string,
  lines: Line[],
  holidays: string[],
  occupying: OccupyingOrder[],
): Map<string, ScheduleResult> {
  const placed: OccupyingOrder[] = occupying.map((order) => ({
    id: order.id,
    status: order.status,
    allocations: order.allocations.map((slot) => ({ ...slot })),
  }));
  const results = new Map<string, ScheduleResult>();
  for (const job of jobs) {
    if (job.quantity <= 0) continue;
    const start = job.notBefore && job.notBefore > fromDate ? job.notBefore : fromDate;
    const result = scheduleQuantity(job.quantity, start, lines, holidays, placed, job.id);
    results.set(job.id, result);
    placed.push({ id: job.id, status: "CONFIRMED", allocations: result.allocations });
  }
  return results;
}

/** 포장 1일과 배송 2일. 납기는 생산 완료일부터 이 날수만큼 뒤이며, 주말과 휴일은 세지 않는다. */
export const DUE_AFTER_PRODUCTION_DAYS = 3;

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
  orders: OccupyingOrder[],
): { total: number; available: number; lastProductionDate: string | null } {
  const daily = factoryCapacity(lines);
  let total = 0;
  let available = 0;
  let lastProductionDate: string | null = null;
  for (let cursor = fromDate, guard = 0; cursor <= dueDate && guard < 400; cursor = addDays(cursor, 1), guard += 1) {
    if (!isWorkingDay(cursor, holidays) || addWorkingDays(cursor, DUE_AFTER_PRODUCTION_DAYS, holidays) > dueDate) continue;
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
  orders: OccupyingOrder[],
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
    earliestDueDate: addWorkingDays(plannedEndDate, DUE_AFTER_PRODUCTION_DAYS, holidays),
    allocations,
  };
}

export function scheduleBackward(
  quantity: number,
  dueDate: string,
  fromDate: string,
  lines: Line[],
  holidays: string[],
  orders: OccupyingOrder[],
  ignoreOrderId?: string,
): ScheduleResult {
  if (quantity <= 0) throw new Error("수량은 1개 이상이어야 합니다.");
  const daily = factoryCapacity(lines);
  if (daily <= 0) throw new Error("가동할 수 있는 라인이 없어 일정을 잡을 수 없습니다.");

  let cursor = dueDate;
  let end = "";
  let guard = 0;
  while (cursor >= fromDate && guard < 400) {
    if (isWorkingDay(cursor, holidays) && addWorkingDays(cursor, DUE_AFTER_PRODUCTION_DAYS, holidays) <= dueDate) {
      end = cursor;
      break;
    }
    cursor = addDays(cursor, -1);
    guard += 1;
  }
  if (!end) throw new Error("납기까지 생산을 마칠 수 있는 날이 없습니다.");

  cursor = end;
  let left = quantity;
  const allocations: DayAllocation[] = [];
  guard = 0;
  while (left > 0 && cursor >= fromDate && guard < 500) {
    if (isWorkingDay(cursor, holidays)) {
      const remaining = Math.max(0, daily - occupiedOn(cursor, orders, ignoreOrderId));
      if (remaining > 0) {
        allocations.push({ date: cursor, quantity: Math.min(left, remaining) });
        left -= Math.min(left, remaining);
      }
    }
    if (left > 0) cursor = addDays(cursor, -1);
    guard += 1;
  }
  if (left > 0) throw new Error("가용 생산량 안에서 완료 예정일을 계산하지 못했습니다.");
  allocations.sort((leftSlot, rightSlot) => leftSlot.date.localeCompare(rightSlot.date));
  const plannedStartDate = allocations[0]?.date ?? end;
  const plannedEndDate = allocations[allocations.length - 1]?.date ?? end;
  return {
    plannedStartDate,
    plannedEndDate,
    earliestDueDate: addWorkingDays(plannedEndDate, DUE_AFTER_PRODUCTION_DAYS, holidays),
    allocations,
  };
}

export interface LineWorkChunk {
  lineId: string;
  quantity: number;
  plannedStartDate: string;
  plannedEndDate: string;
  allocations: DayAllocation[];
}

export function allocateProductItems(
  lines: Array<{ productId: string; quantity: number }>,
  quantities: number[],
  reserved: WorkOrderItem[] = [],
): WorkOrderItem[][] {
  const remaining = lines.map((line) => ({ productId: line.productId, quantity: line.quantity }));
  for (const item of reserved) {
    const row = remaining.find((line) => line.productId === item.productId);
    if (row) row.quantity = Math.max(0, row.quantity - item.quantity);
  }
  return quantities.map((quantity) => {
    const items: WorkOrderItem[] = [];
    let left = quantity;
    for (const row of remaining) {
      if (left <= 0) break;
      const take = Math.min(left, row.quantity);
      if (take <= 0) continue;
      items.push({ productId: row.productId, quantity: take });
      row.quantity -= take;
      left -= take;
    }
    return items;
  });
}

export function usableLines(lines: Line[]): Line[] {
  return lines.filter((line) => line.status === "AVAILABLE" || line.status === "RUNNING");
}

function lineOf(lines: Line[], lineId: string | null): Line | undefined {
  return lineId ? lines.find((line) => line.id === lineId) : undefined;
}

export function quantityOnDate(workOrder: WorkOrder, iso: string, lines: Line[], holidays: string[]): number {
  if (workOrder.status === "CANCELLED" || workOrder.quantity <= 0) return 0;
  if (workOrder.allocations?.length) {
    return workOrder.allocations.find((slot) => slot.date === iso)?.quantity ?? 0;
  }
  const line = lineOf(lines, workOrder.lineId);
  if (!line || iso < workOrder.plannedStartDate || iso > workOrder.plannedEndDate || !isWorkingDay(iso, holidays)) return 0;
  let left = workOrder.quantity;
  for (let cursor = workOrder.plannedStartDate; cursor <= workOrder.plannedEndDate; cursor = addDays(cursor, 1)) {
    if (!isWorkingDay(cursor, holidays)) continue;
    const take = Math.min(left, line.dailyCapacity);
    if (cursor === iso) return take;
    left -= take;
    if (left <= 0) return 0;
  }
  return 0;
}

export function lineOccupiedOn(
  iso: string,
  lineId: string,
  workOrders: WorkOrder[],
  lines: Line[],
  holidays: string[],
): number {
  return workOrders
    .filter((item) => item.lineId === lineId && item.status !== "CANCELLED")
    .reduce((sum, item) => sum + quantityOnDate(item, iso, lines, holidays), 0);
}

function leftoverAllocations(
  allocations: DayAllocation[],
  locked: WorkOrder[],
  lines: Line[],
  holidays: string[],
): DayAllocation[] {
  return allocations
    .map((slot) => {
      const used = locked.reduce((sum, item) => sum + quantityOnDate(item, slot.date, lines, holidays), 0);
      return { date: slot.date, quantity: Math.max(0, slot.quantity - used) };
    })
    .filter((slot) => slot.quantity > 0);
}

function trimAllocations(allocations: DayAllocation[], quantity: number): DayAllocation[] {
  let left = quantity;
  const next: DayAllocation[] = [];
  for (const slot of allocations) {
    if (left <= 0) break;
    const take = Math.min(left, slot.quantity);
    next.push({ date: slot.date, quantity: take });
    left -= take;
  }
  if (left > 0) throw new Error("남은 일정에 작업지시 수량을 나누지 못했습니다.");
  return next;
}

export function splitQuantityByLines(
  allocations: DayAllocation[],
  quantity: number,
  lines: Line[],
  holidays: string[],
  occupying: WorkOrder[],
  locked: WorkOrder[] = [],
): LineWorkChunk[] {
  if (quantity <= 0) return [];
  const pool = usableLines(lines);
  if (pool.length === 0) throw new Error("가동할 수 있는 라인이 없어 작업지시를 나눌 수 없습니다.");
  const days = trimAllocations(leftoverAllocations(allocations, locked, lines, holidays), quantity);
  const byLine = new Map<string, LineWorkChunk>();

  for (const slot of days) {
    let left = slot.quantity;
    const ranked = [...pool].sort((leftLine, rightLine) => {
      const leftFree = Math.max(0, leftLine.dailyCapacity - lineOccupiedOn(slot.date, leftLine.id, occupying, lines, holidays));
      const rightFree = Math.max(0, rightLine.dailyCapacity - lineOccupiedOn(slot.date, rightLine.id, occupying, lines, holidays));
      return rightFree - leftFree || leftLine.name.localeCompare(rightLine.name, "ko");
    });
    for (const line of ranked) {
      if (left <= 0) break;
      const occupied = lineOccupiedOn(slot.date, line.id, occupying, lines, holidays);
      const take = Math.min(left, Math.max(0, line.dailyCapacity - occupied));
      if (take <= 0) continue;
      const current = byLine.get(line.id);
      if (current) {
        current.quantity += take;
        current.plannedEndDate = slot.date;
        current.allocations.push({ date: slot.date, quantity: take });
      } else {
        byLine.set(line.id, {
          lineId: line.id,
          quantity: take,
          plannedStartDate: slot.date,
          plannedEndDate: slot.date,
          allocations: [{ date: slot.date, quantity: take }],
        });
      }
      occupying = [
        ...occupying,
        {
          id: `split-${line.id}-${slot.date}`,
          orderId: "",
          status: "READY",
          assigneeId: null,
          lineId: line.id,
          quantity: take,
          allocations: [{ date: slot.date, quantity: take }],
          items: [],
          issuedAt: "",
          plannedStartDate: slot.date,
          plannedEndDate: slot.date,
          startedAt: null,
          completedAt: null,
        },
      ];
      left -= take;
    }
    if (left > 0) throw new Error("라인별 남은 용량으로 작업지시를 나누지 못했습니다.");
  }

  return [...byLine.values()];
}

export interface ProductLineChunk {
  lineId: string;
  productId: string;
  quantity: number;
  plannedStartDate: string;
  plannedEndDate: string;
  allocations: DayAllocation[];
}

/** 한 작업지시의 날짜별 수량을 품목 순서대로 나눈다. 같은 날은 한 품목이 끝난 뒤 다음 품목이 이어받는다. */
export function divideAllocationsByProduct(
  allocations: DayAllocation[],
  items: WorkOrderItem[],
): Array<{ productId: string; quantity: number; allocations: DayAllocation[] }> {
  const slots = allocations.map((slot) => ({ ...slot }));
  return items.map((item) => {
    let left = item.quantity;
    const next: DayAllocation[] = [];
    for (const slot of slots) {
      if (left <= 0) break;
      const take = Math.min(left, slot.quantity);
      if (take <= 0) continue;
      next.push({ date: slot.date, quantity: take });
      slot.quantity -= take;
      left -= take;
    }
    if (left > 0) {
      const date = next.at(-1)?.date ?? allocations.at(-1)?.date;
      if (date) {
        const row = next.find((slot) => slot.date === date);
        if (row) row.quantity += left;
        else next.push({ date, quantity: left });
      }
    }
    return { productId: item.productId, quantity: item.quantity, allocations: next };
  });
}

/**
 * 남은 수량을 품목 하나·라인 하나인 작업지시로 나눈다.
 * 여러 날은 같은 품목·같은 라인이면 한 장이다. 같은 날 같은 라인에 다른 품목이 용량만 남으면 별도 작업지시로 올라간다.
 */
export function splitProductsAcrossLines(
  products: Array<{ productId: string; quantity: number }>,
  allocations: DayAllocation[],
  lines: Line[],
  holidays: string[],
  occupying: WorkOrder[],
  locked: WorkOrder[] = [],
): ProductLineChunk[] {
  const pool = usableLines(lines);
  if (pool.length === 0) throw new Error("가동할 수 있는 라인이 없어 작업지시를 나눌 수 없습니다.");
  const lockedByProduct = new Map<string, number>();
  for (const workOrder of locked) {
    for (const item of workOrder.items ?? []) {
      lockedByProduct.set(item.productId, (lockedByProduct.get(item.productId) ?? 0) + item.quantity);
    }
  }
  const queue = products
    .map((product) => ({ productId: product.productId, quantity: Math.max(0, product.quantity - (lockedByProduct.get(product.productId) ?? 0)) }))
    .filter((product) => product.quantity > 0);
  const days = leftoverAllocations(allocations, locked, lines, holidays).sort((left, right) => left.date.localeCompare(right.date));
  const productLeft = queue.reduce((sum, product) => sum + product.quantity, 0);
  const dayLeft = days.reduce((sum, slot) => sum + slot.quantity, 0);
  if (productLeft !== dayLeft) throw new Error("품목 수량과 날짜별 수량이 맞지 않아 작업지시를 나누지 못했습니다.");
  const byKey = new Map<string, ProductLineChunk>();

  for (const slot of days) {
    let dayRemaining = slot.quantity;
    while (dayRemaining > 0 && queue.length > 0) {
      const product = queue[0];
      const want = Math.min(dayRemaining, product.quantity);
      let left = want;
      const ranked = [...pool].sort((leftLine, rightLine) => {
        const leftFree = Math.max(0, leftLine.dailyCapacity - lineOccupiedOn(slot.date, leftLine.id, occupying, lines, holidays));
        const rightFree = Math.max(0, rightLine.dailyCapacity - lineOccupiedOn(slot.date, rightLine.id, occupying, lines, holidays));
        return rightFree - leftFree || leftLine.name.localeCompare(rightLine.name, "ko");
      });
      for (const line of ranked) {
        if (left <= 0) break;
        const occupied = lineOccupiedOn(slot.date, line.id, occupying, lines, holidays);
        const take = Math.min(left, Math.max(0, line.dailyCapacity - occupied));
        if (take <= 0) continue;
        const key = `${line.id}:${product.productId}`;
        const current = byKey.get(key);
        if (current) {
          current.quantity += take;
          if (slot.date < current.plannedStartDate) current.plannedStartDate = slot.date;
          if (slot.date > current.plannedEndDate) current.plannedEndDate = slot.date;
          const sameDay = current.allocations.find((row) => row.date === slot.date);
          if (sameDay) sameDay.quantity += take;
          else current.allocations.push({ date: slot.date, quantity: take });
        } else {
          byKey.set(key, {
            lineId: line.id,
            productId: product.productId,
            quantity: take,
            plannedStartDate: slot.date,
            plannedEndDate: slot.date,
            allocations: [{ date: slot.date, quantity: take }],
          });
        }
        occupying = [
          ...occupying,
          {
            id: `split-${line.id}-${product.productId}-${slot.date}`,
            orderId: "",
            status: "READY",
            assigneeId: null,
            lineId: line.id,
            quantity: take,
            allocations: [{ date: slot.date, quantity: take }],
            items: [{ productId: product.productId, quantity: take }],
            issuedAt: "",
            plannedStartDate: slot.date,
            plannedEndDate: slot.date,
            startedAt: null,
            completedAt: null,
          },
        ];
        left -= take;
      }
      if (left > 0) throw new Error("라인별 남은 용량으로 작업지시를 나누지 못했습니다.");
      product.quantity -= want;
      dayRemaining -= want;
      if (product.quantity <= 0) queue.shift();
    }
    if (dayRemaining > 0) throw new Error("라인별 남은 용량으로 작업지시를 나누지 못했습니다.");
  }
  if (queue.some((product) => product.quantity > 0)) throw new Error("품목 수량을 작업지시로 나누지 못했습니다.");
  return [...byKey.values()];
}
