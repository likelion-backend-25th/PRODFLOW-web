import { apiClient } from "@/lib/apiClient.ts";

export type ShipmentTab = "PACKING" | "READY_TO_SHIP" | "SHIPPING" | "BALANCE";

export interface Carrier {
  code: string;
  name: string;
}

export interface ShipmentTabCounts {
  packing: number;
  readyToShip: number;
  shipping: number;
  balance: number;
}

export interface ShipmentListItem {
  orderId: number;
  orderNo: string;
  clientName: string;
  productSummary: string;
  totalQuantity: number;
  shippingAddress: string;
  estimatedDueDate: string | null;
  orderStatus: string;
  paymentStatus: string;
  totalAmount: number;
  shipmentId: number | null;
  carrierCode: string | null;
  carrierName: string | null;
  trackingNumber: string | null;
  startedAt: string | null;
  deliveredAt: string | null;
}

export interface ShipmentList {
  tab: string;
  counts: ShipmentTabCounts;
  items: ShipmentListItem[];
}

export interface OrderShipment {
  shipmentId: number;
  orderId: number;
  orderStatus: string;
  carrierCode: string;
  carrierName: string;
  trackingNumber: string;
  level: number | null;
  result: string | null;
  complete: boolean | null;
  estimate: string | null;
  startedAt: string | null;
  deliveredAt: string | null;
}

export interface TrackingResult {
  invoiceNo: string;
  result: string;
  complete: boolean;
  level: number;
  estimate: string | null;
}

export interface ShipmentRegistered {
  id: number;
  orderId: number;
  orderNo: string;
  orderStatus: string;
  carrierCode: string;
  carrierName: string;
  trackingNumber: string;
  startedAt: string | null;
}

export interface ShipmentCompleted {
  shipmentId: number;
  orderId: number;
  orderNo: string;
  orderStatus: string;
  complete: boolean | null;
  deliveredAt: string | null;
}

export function listCarriers(): Promise<Carrier[]> {
  return apiClient.get<Carrier[]>("/carriers").then((response) => response.data);
}

export function listShipments(tab: ShipmentTab): Promise<ShipmentList> {
  return apiClient.get<ShipmentList>("/shipments", { params: { tab } }).then((response) => response.data);
}

export function registerShipment(orderId: number, carrierCode: string, trackingNumber: string): Promise<ShipmentRegistered> {
  return apiClient.post<ShipmentRegistered>("/shipments", {
    orderId,
    carrierCode,
    trackingNumber: trackingNumber.trim(),
  }).then((response) => response.data);
}

export function completeShipment(shipmentId: number): Promise<ShipmentCompleted> {
  // 배송 완료 경로는 수주 ID가 아니라 운송장 ID다.
  return apiClient.post<ShipmentCompleted>(`/shipments/${shipmentId}/complete`).then((response) => response.data);
}

export function getOrderShipment(orderId: number): Promise<OrderShipment | null> {
  return apiClient.get<{ shipment: OrderShipment | null }>(`/shipments/${orderId}`).then((response) => response.data.shipment);
}

export function trackShipment(carrierCode: string, trackingNumber: string): Promise<TrackingResult> {
  return apiClient.get<TrackingResult>("/shipments/tracking", {
    params: { carrierCode, trackingNumber },
  }).then((response) => response.data);
}

export function refreshShipmentTracking(shipmentId: number): Promise<OrderShipment> {
  return apiClient.post<OrderShipment>(`/shipments/${shipmentId}/tracking/refresh`).then((response) => response.data);
}
