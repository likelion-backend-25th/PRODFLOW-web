import { apiClient } from "@/lib/apiClient.ts";
import type { WorkOrderStatus } from "@/types/domain.ts";

export interface WorkOrderRow {
  id: number;
  workNo: string;
  orderNo: string;
  clientName: string;
  productName: string;
  quantity: number;
  lineName: string;
  assignedName: string;
  workOrderDate: string;
  plannedEndDate: string;
  status: WorkOrderStatus;
}

export interface ProductionPlan {
  id: number;
  workOrderId: number;
  planDate: string;
  quantity: number;
}

export interface WorkOrderDetail extends WorkOrderRow {
  lineId: number;
  assignedId: number;
  plannedStartDate: string;
  completedAt: string | null;
  note: string | null;
  estimatedDueDate: string | null;
  plans?: ProductionPlan[];
}

export interface DailyPlanRow {
  planId: number;
  planDate: string;
  quantity: number;
  workOrderId: number;
  workNo: string;
  orderNo: string;
  clientName: string;
  productName: string;
  lineName: string;
  assignedId: number;
  assignedName: string;
  status: WorkOrderStatus;
}

export interface WorkOrderPage {
  content: WorkOrderRow[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface WorkOrderQuery {
  keyword?: string;
  from?: string;
  to?: string;
  status?: string;
  lineId?: number;
  page: number;
  size: number;
}

export async function fetchWorkOrders(query: WorkOrderQuery): Promise<WorkOrderPage> {
  const { data } = await apiClient.get<WorkOrderPage>("/work-orders", { params: query });
  return data;
}

export async function fetchWorkOrder(workOrderId: number): Promise<WorkOrderDetail> {
  const { data } = await apiClient.get<WorkOrderDetail>(`/work-orders/${workOrderId}`);
  return data;
}

export interface WorkOrderChangeHistory {
  previousLineName: string;
  newLineName: string;
  previousUserName: string;
  newUserName: string;
  changedByName: string;
}

export async function fetchWorkOrderHistory(workOrderId: number): Promise<WorkOrderChangeHistory[]> {
  const { data } = await apiClient.get<WorkOrderChangeHistory[]>(`/work-orders/${workOrderId}/history`);
  return data;
}

export async function fetchDailyPlans(): Promise<DailyPlanRow[]> {
  const rows: WorkOrderRow[] = [];
  let page = 0;
  let totalPages = 1;
  while (page < totalPages) {
    const result = await fetchWorkOrders({ page, size: 100 });
    rows.push(...result.content);
    totalPages = result.totalPages;
    page += 1;
  }
  const details = await Promise.all(rows.map((row) => fetchWorkOrder(row.id)));
  return details.flatMap((detail) => (detail.plans ?? []).map((plan) => ({
    planId: plan.id,
    planDate: plan.planDate,
    quantity: plan.quantity,
    workOrderId: detail.id,
    workNo: detail.workNo,
    orderNo: detail.orderNo,
    clientName: detail.clientName,
    productName: detail.productName,
    lineName: detail.lineName,
    assignedId: detail.assignedId,
    assignedName: detail.assignedName,
    status: detail.status,
  })));
}

export async function updateWorkOrder(
  workOrderId: number,
  body: { lineId?: number; assignedId?: number },
): Promise<WorkOrderDetail> {
  const { data } = await apiClient.patch<WorkOrderDetail>(`/work-orders/${workOrderId}`, body);
  return data;
}

export async function changeWorkOrderStatus(workOrderId: number, status: WorkOrderStatus, note?: string): Promise<WorkOrderDetail> {
  const { data } = await apiClient.patch<WorkOrderDetail>(`/work-orders/${workOrderId}/status`, { status, note });
  return data;
}
