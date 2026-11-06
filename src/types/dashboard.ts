// 백엔드 DashboardDto.DashboardResponse와 필드명을 맞춘다. LocalDate는 "YYYY-MM-DD" 문자열이다.

export interface DashboardSummary {
  totalOrderCount: number;
  plannedQuantity: number;
  completedQuantity: number;
  productionProgressRate: number;
  onTimeDeliveryRate: number;
  unpaidAmount: number;
}

export interface DashboardOrderStatistics {
  totalOrderCount: number;
  periodOrderCount: number;
}

export interface DashboardOrderStatusStatistics {
  statusCode: string;
  statusName: string;
  orderCount: number;
}

export interface DashboardProduction {
  date: string;
  plannedQuantity: number;
  completedQuantity: number;
}

export interface DashboardMonthlyProduction {
  year: number;
  month: number;
  plannedQuantity: number;
  completedQuantity: number;
}

export interface DashboardWeeklyProduction {
  week: number;
  startDate: string;
  endDate: string;
  plannedQuantity: number;
  completedQuantity: number;
}

export interface DashboardDeliveryPerformance {
  totalOrderCount: number;
  onTimeOrderCount: number;
  onTimeDeliveryRate: number;
}

export interface DashboardProductProduction {
  productId: number;
  productName: string;
  completedQuantity: number;
}

export interface DashboardProductProductionShareItem {
  productId: number;
  productName: string;
  completedQuantity: number;
  productionShare: number;
}

export interface DashboardProductProductionShare {
  totalCompletedQuantity: number;
  items: DashboardProductProductionShareItem[];
}

export type DashboardRiskType = "DELAYED" | "URGENT";

export type DashboardPaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID";

export interface DashboardDeliveryRiskItem {
  orderId: number;
  orderNo: string;
  customerName: string;
  productName: string;
  quantity: number;
  requestedDueDate: string;
  plannedEndDate: string | null;
  statusCode: number;
  riskType: DashboardRiskType;
  riskReason: string;
  paymentStatus: DashboardPaymentStatus;
  paidAmount: number;
}

export interface DashboardDeliveryRiskStatistics {
  totalRiskOrderCount: number;
  items: DashboardDeliveryRiskItem[];
}

export interface DashboardResponse {
  summary: DashboardSummary;
  orderStatistics: DashboardOrderStatistics;
  orderStatusStatistics: DashboardOrderStatusStatistics[];
  productionStatistics: DashboardProduction[];
  monthlyProductionStatistics: DashboardMonthlyProduction[];
  weeklyProductionStatistics: DashboardWeeklyProduction[];
  deliveryPerformance: DashboardDeliveryPerformance;
  productStatistics: DashboardProductProduction[];
  productProductionShare: DashboardProductProductionShare;
  deliveryRiskStatistics: DashboardDeliveryRiskStatistics;
}
