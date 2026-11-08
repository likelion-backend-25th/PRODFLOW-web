import type { WorkOrderStatus } from "@/types/domain.ts";
import { fetchDailyPlans } from "@/lib/workOrdersApi.ts";

export interface ProductionSchedule {
  lineName: string;
  workOrderId: number;
  workNo: string;
  plannedStartDate: string;
  plannedEndDate: string;
  status: string;
  orderNo: string;
  productName: string;
  quantity: number;
  orderPlannedStartDate: string;
  orderPlannedEndDate: string;
}

const workStatuses: WorkOrderStatus[] = ["PREPARE", "PRODUCE", "SUSPEND", "HALT", "PACK", "PACK_DONE"];

// 생산 캘린더 조회가 진행 중으로 보는 작업지시 상태다. 포장완료는 빠진다.
const activeStatuses = new Set(["PREPARE", "PRODUCE", "PACK", "SUSPEND"]);

export function asWorkOrderStatus(status: string): WorkOrderStatus | null {
  return workStatuses.find((code) => code === status) ?? null;
}

// 날짜 기준은 작업지시의 생산계획일이다. 같은 작업지시의 같은 계획일은 한 번만 둔다.
export async function fetchProductionDays(): Promise<ProductionSchedule[]> {
  const plans = await fetchDailyPlans();
  const seen = new Set<string>();
  const rows: ProductionSchedule[] = [];
  for (const plan of plans) {
    const key = `${plan.workOrderId}:${plan.planDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      lineName: plan.lineName,
      workOrderId: plan.workOrderId,
      workNo: plan.workNo,
      plannedStartDate: plan.planDate,
      plannedEndDate: plan.planDate,
      status: plan.status,
      orderNo: plan.orderNo,
      productName: plan.productName,
      quantity: plan.quantity,
      orderPlannedStartDate: plan.plannedStartDate,
      orderPlannedEndDate: plan.plannedEndDate,
    });
  }
  return rows;
}

export async function fetchProductionCalender(): Promise<ProductionSchedule[]> {
  const rows = await fetchProductionDays();
  return rows.filter((row) => activeStatuses.has(row.status));
}

// 막대는 작업지시 하나의 계획 시작일~종료일이다. 수주나 제품명이 같아도 다른 작업지시는 잇지 않는다.
export function workOrderSpans(rows: ProductionSchedule[]): ProductionSchedule[] {
  const unique = new Map<number, ProductionSchedule>();
  for (const row of rows) {
    if (unique.has(row.workOrderId)) continue;
    if (!row.orderPlannedStartDate || !row.orderPlannedEndDate || row.orderPlannedStartDate > row.orderPlannedEndDate) continue;
    unique.set(row.workOrderId, {
      ...row,
      plannedStartDate: row.orderPlannedStartDate,
      plannedEndDate: row.orderPlannedEndDate,
    });
  }
  return [...unique.values()];
}

export function schedulesOnDate(rows: ProductionSchedule[], iso: string): ProductionSchedule[] {
  const seen = new Set<number>();
  return rows.filter((row) => {
    if (row.plannedStartDate > iso || iso > row.plannedEndDate) return false;
    if (seen.has(row.workOrderId)) return false;
    seen.add(row.workOrderId);
    return true;
  }).sort((left, right) => left.workNo.localeCompare(right.workNo));
}
