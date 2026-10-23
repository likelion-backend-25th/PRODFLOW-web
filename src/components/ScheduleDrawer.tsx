import { AlertTriangle, ArrowUpRight, CalendarCheck, X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui.tsx";
import { cn } from "@/lib/cn.ts";
import { localDate, parseISO } from "@/lib/dates.ts";
import { activeWorkOrder, delayOf, delayTone, workOrdersOf } from "@/lib/delay.ts";
import { orderStatusLabel, orderStatusTone } from "@/lib/labels.ts";
import { orderQuantity } from "@/lib/money.ts";
import { orderItems, orderItemsText } from "@/lib/orderText.ts";
import type { Client, Order, Product, User, WorkOrder } from "@/types/domain.ts";

interface ScheduleDrawerProps {
  order: Order;
  clients: Client[];
  products: Product[];
  users: User[];
  workOrders: WorkOrder[];
  today: string;
  onClose: () => void;
}

export function ScheduleDrawer({ order, clients, products, users, workOrders, today, onClose }: ScheduleDrawerProps) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  const client = clients.find((item) => item.id === order.clientId);
  const items = orderItems(products, order.lines);
  const quantity = orderQuantity(order.lines).toLocaleString("ko-KR");
  const orderWorks = workOrdersOf(workOrders, order.id);
  const startedStamps = orderWorks.flatMap((item) => (item.startedAt ? [item.startedAt] : [])).sort();
  const startDate = startedStamps[0] ? localDate(startedStamps[0]) : order.plannedStartDate;
  const assigneeIds = [...new Set(orderWorks.flatMap((item) => (item.assigneeId ? [item.assigneeId] : [])))];
  const assignees = assigneeIds
    .map((id) => users.find((user) => user.id === id))
    .filter((user): user is User => user !== undefined)
    .map((user) => `${user.name} · ${user.department}`);
  const delay = delayOf(order, activeWorkOrder(workOrders, order.id), today);
  const daysLeft = Math.round((parseISO(order.dueDate).getTime() - parseISO(today).getTime()) / 86_400_000);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40" role="dialog" aria-modal="true" aria-labelledby="schedule-drawer-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 id="schedule-drawer-title" className="text-lg font-semibold">생산 일정 상세</h2>
          <button type="button" className="rounded-lg p-1 text-muted hover:bg-canvas" aria-label="닫기" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted">{order.orderNo}</span>
            <Badge className={orderStatusTone(order.status)}>{orderStatusLabel[order.status]}</Badge>
          </div>
          <p className="mt-2 text-2xl font-semibold">{client?.companyName ?? "삭제된 거래처"}</p>
          <p className="mt-1 text-muted">{orderItemsText(products, order.lines)} · {quantity}개</p>
          <dl className="mt-5 border-t border-line">
            <Row label="수주번호">{order.orderNo}</Row>
            <Row label="거래처명">{client?.companyName ?? "-"}</Row>
            <Row label="생산품목">
              {items.extra ? <ul className="space-y-1">{items.names.map((name) => <li key={name}>{name}</li>)}</ul> : items.first}
            </Row>
            <Row label="생산수량">{quantity}개</Row>
            <Row label={startedStamps.length > 0 ? "생산 시작일" : "생산 시작 예정일"}>{dateLabel(startDate)}</Row>
            <Row label="납기일">{dateLabel(order.dueDate)}</Row>
            <Row label="현재 상태"><Badge className={orderStatusTone(order.status)}>{orderStatusLabel[order.status]}</Badge></Row>
            <Row label="담당자">
              {assignees.length > 0 ? <ul className="space-y-1">{assignees.map((name) => <li key={name}>{name}</li>)}</ul> : <span className="text-muted">{order.status === "WAITING" ? "선금 확인 후 배정" : "미배정"}</span>}
            </Row>
          </dl>
          <h3 className="mt-6 font-semibold">비고</h3>
          <p className="mt-2 rounded-lg bg-canvas p-4 text-sm whitespace-pre-wrap text-muted">{order.memo.trim() || "등록된 비고가 없습니다."}</p>
          <div className={cn("mt-5 flex items-center gap-2 rounded-lg px-4 py-3 text-sm", delay ? delayTone(delay.level) : "bg-primary-soft text-primary")}>
            {delay ? <AlertTriangle size={16} className="shrink-0" /> : <CalendarCheck size={16} className="shrink-0" />}
            <span>{delay ? `${delay.level === "late" ? "지연" : "주의"} · ${delay.reason}` : normalMessage(order, daysLeft)}</span>
          </div>
          <Link to={`/orders/${order.id}`} className="mt-5 flex h-11 w-full items-center justify-center gap-1 rounded-lg bg-primary font-semibold text-white">
            수주 상세보기 <ArrowUpRight size={16} />
          </Link>
        </div>
      </aside>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] items-center gap-3 border-b border-line py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}

function dateLabel(iso: string): string {
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][parseISO(iso).getDay()] ?? "";
  return `${iso.replaceAll("-", ".")} (${weekday})`;
}

function normalMessage(order: Order, daysLeft: number): string {
  if (order.status === "COMPLETED") return "배송까지 완료된 수주입니다.";
  if (order.status === "SHIPPING") return "출고되어 배송 중입니다.";
  return daysLeft === 0 ? "오늘 납기 · 정상 일정으로 진행 중입니다." : `납기까지 ${daysLeft}일 · 정상 일정으로 진행 중입니다.`;
}
