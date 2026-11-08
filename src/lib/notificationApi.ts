import { apiClient } from "@/lib/apiClient.ts";

export type LineNotificationType = "AVAILABLE" | "MAINTENANCE" | "BROKEN";
export type OrderNotificationType = "DELIVERY_IMMINENT" | "DELIVERY_DELAYED";
export type NoticeSource = "line" | "order";

export interface NoticeItem {
  source: NoticeSource;
  id: number;
  typeLabel: string;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
}

interface LineNotificationResponse {
  notification: number;
  lineName: string | null;
  notificationType: LineNotificationType;
  message: string;
  createdAt: string;
  readAt: string | null;
  isRead?: boolean;
  read?: boolean;
}

interface OrderNotificationResponse {
  notification: number;
  orderNo: string | null;
  clientName: string | null;
  notificationType: OrderNotificationType;
  message: string;
  createdAt: string;
  readAt: string | null;
  isRead?: boolean;
  read?: boolean;
}

const lineTypeLabel: Record<LineNotificationType, string> = {
  AVAILABLE: "라인 가동",
  MAINTENANCE: "라인 점검",
  BROKEN: "라인 고장",
};

const orderTypeLabel: Record<OrderNotificationType, string> = {
  DELIVERY_IMMINENT: "납기 임박",
  DELIVERY_DELAYED: "납기 지연",
};

function readFlag(row: { isRead?: boolean; read?: boolean; readAt: string | null }): boolean {
  if (typeof row.isRead === "boolean") return row.isRead;
  if (typeof row.read === "boolean") return row.read;
  return row.readAt != null;
}

function lineTitle(row: LineNotificationResponse): string {
  return row.lineName ? `${lineTypeLabel[row.notificationType]} · ${row.lineName}` : lineTypeLabel[row.notificationType];
}

function orderTitle(row: OrderNotificationResponse): string {
  const type = orderTypeLabel[row.notificationType];
  const who = [row.orderNo, row.clientName].filter((part) => part).join(" · ");
  return who ? `${type} · ${who}` : type;
}

export async function fetchLineNotifications(): Promise<NoticeItem[]> {
  const { data } = await apiClient.get<LineNotificationResponse[]>("/notifications");
  return data.map((row) => ({
    source: "line",
    id: row.notification,
    typeLabel: lineTypeLabel[row.notificationType],
    title: lineTitle(row),
    message: row.message,
    createdAt: row.createdAt,
    isRead: readFlag(row),
  }));
}

export async function fetchOrderNotifications(): Promise<NoticeItem[]> {
  const { data } = await apiClient.get<OrderNotificationResponse[]>("/order-notifications");
  return data.map((row) => ({
    source: "order",
    id: row.notification,
    typeLabel: orderTypeLabel[row.notificationType],
    title: orderTitle(row),
    message: row.message,
    createdAt: row.createdAt,
    isRead: readFlag(row),
  }));
}

export async function fetchUnreadCount(): Promise<number> {
  const [line, order] = await Promise.all([
    apiClient.get<number>("/notifications/unread-count"),
    apiClient.get<number>("/order-notifications/unread-count"),
  ]);
  return line.data + order.data;
}

export async function markNoticeRead(item: Pick<NoticeItem, "source" | "id">): Promise<void> {
  const path = item.source === "line"
    ? `/notifications/${item.id}/read`
    : `/order-notifications/${item.id}/read`;
  await apiClient.patch(path);
}
