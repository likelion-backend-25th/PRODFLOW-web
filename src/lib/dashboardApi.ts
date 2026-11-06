import { apiClient } from "@/lib/apiClient.ts";
import type { DashboardResponse } from "@/types/dashboard.ts";

export interface WorkStatusCode {
  id: number;
  code: string;
  name: string;
}

export async function fetchDashboard(startDate: string, endDate: string): Promise<DashboardResponse> {
  const response = await apiClient.get<DashboardResponse>("/statistics/dashboard", { params: { startDate, endDate } });
  return response.data;
}

export async function fetchWorkOrderStatusCodes(): Promise<WorkStatusCode[]> {
  const response = await apiClient.get<WorkStatusCode[]>("/common-codes", { params: { groupCode: "WORK_ORDER_STATUS" } });
  return response.data;
}
