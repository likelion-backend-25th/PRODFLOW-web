import { apiClient } from "@/lib/apiClient.ts";
import { getUsers } from "@/lib/userApi.ts";
import type { LineStatus, WorkOrderStatus } from "@/types/domain.ts";

export interface LineListItem {
  lineId: number;
  lineName: string;
  status: LineStatus;
  productionCapacity: number;
  workNo: string | null;
  productName: string | null;
  orderNo: string | null;
  managerName: string | null;
}

export interface LineListResponse {
  totalCount: number;
  runningCount: number;
  availableCount: number;
  inspectionOrBrokenCount: number;
  lines: LineListItem[];
}

export interface LineWorkOrder {
  workNo: string;
  orderNo: string;
  productName: string;
  quantity: number;
  plannedStartDate: string;
  plannedEndDate: string;
  status: WorkOrderStatus;
}

export interface LineCapacityLog {
  changedAt: string;
  beforeCapacity: number;
  afterCapacity: number;
  reason: string;
  managerName: string;
}

export interface LineDetail {
  lineId: number;
  lineName: string;
  status: LineStatus;
  productionCapacity: number;
  workOrderCount: number;
  waitingCount: number;
  workNo: string | null;
  productName: string | null;
  orderNo: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  managerName: string | null;
  workOrders: LineWorkOrder[];
  capacityLogs: LineCapacityLog[];
}

export interface LineSaved {
  id: number;
  lineName: string;
  productionCapacity: number;
  status: LineStatus;
}

export interface StaffUser {
  id: number;
  name: string;
  role: string;
  status: string;
}

export async function fetchLines(): Promise<LineListResponse> {
  const { data } = await apiClient.get<LineListResponse>("/lines");
  return data;
}

export async function fetchLine(lineId: number): Promise<LineDetail> {
  const { data } = await apiClient.get<LineDetail>(`/lines/${lineId}`);
  return data;
}

export async function fetchLineCapacityHistory(lineId: number): Promise<LineCapacityLog[]> {
  const { data } = await apiClient.get<LineCapacityLog[]>(`/lines/${lineId}/capacity-history`);
  return data;
}

export async function createLine(lineName: string, productionCapacity: number): Promise<LineSaved> {
  const { data } = await apiClient.post<LineSaved>("/lines", { lineName, productionCapacity });
  return data;
}

export async function updateLine(
  lineId: number,
  body: { lineName: string; productionCapacity: number; reason: string },
): Promise<LineSaved> {
  const { data } = await apiClient.patch<LineSaved>(`/lines/${lineId}`, body);
  return data;
}

export async function changeLineStatus(lineId: number, status: LineStatus): Promise<LineSaved> {
  const { data } = await apiClient.patch<LineSaved>(`/lines/${lineId}/status`, { status });
  return data;
}

export async function fetchStaff(): Promise<StaffUser[]> {
  const staff: StaffUser[] = [];
  let page = 0;
  let totalPages = 1;
  while (page < totalPages) {
    const result = await getUsers({ status: "ACTIVE", page, size: 100 });
    staff.push(...result.content.map((user) => ({
      id: user.id,
      name: user.name,
      role: user.role,
      status: user.status,
    })));
    totalPages = result.totalPages;
    page += 1;
  }
  return staff;
}
