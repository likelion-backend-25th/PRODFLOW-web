import { useState } from "react";
import { Link } from "react-router";
import { ScheduleDrawer } from "@/components/ScheduleDrawer.tsx";
import { Button, Card, PageHeader } from "@/components/ui.tsx";
import { cn } from "@/lib/cn.ts";
import { useDb } from "@/lib/db.ts";
import { todayISO } from "@/lib/dates.ts";
import { orderStatusLabel } from "@/lib/labels.ts";
import { factoryCapacity, isWorkingDay, occupiedOn, occupiesFactory } from "@/lib/schedule.ts";
import { canManageOrders, useAuthStore } from "@/stores/useAuthStore.ts";
import type { Client, Order } from "@/types/domain.ts";

const MAX_LANES = 4;

interface Scheduled {
  order: Order;
  first: string;
  last: string;
  dates: Set<string>;
}

interface Segment {
  item: Scheduled;
  start: number;
  end: number;
  lane: number;
  openLeft: boolean;
  openRight: boolean;
}

export function CalendarPage() {
  const db = useDb();
  const role = useAuthStore((state) => state.user?.role);
  const today = todayISO();
  const now = new Date();
  const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [selected, setSelected] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const holidays = db.holidays.map((holiday) => holiday.date);
  const capacity = factoryCapacity(db.lines);
  const cells: (string | null)[] = Array.from({ length: Math.ceil((first.getDay() + days) / 7) * 7 }, (_, index) => {
    const day = index - first.getDay() + 1;
    if (day < 1 || day > days) return null;
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  });
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  const scheduled: Scheduled[] = db.orders
    .filter((order) => occupiesFactory(order.status) && order.allocations.length > 0)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map((order) => {
      const dates = order.allocations.map((slot) => slot.date).sort();
      return { order, first: dates[0] ?? "", last: dates[dates.length - 1] ?? "", dates: new Set(dates) };
    });
  const selectedOrders = selected ? scheduled.filter((item) => item.dates.has(selected)).map((item) => item.order) : [];
  const selectedWorking = selected ? isWorkingDay(selected, holidays) : false;
  const selectedCapacity = selectedWorking ? capacity : 0;
  const selectedUsed = selected ? occupiedOn(selected, db.orders) : 0;
  const detailOrder = detailId ? db.orders.find((order) => order.id === detailId) : undefined;

  return (
    <div>
      <PageHeader title="생산 캘린더" action={
        <div className="flex gap-2">
          <button type="button" className="h-10 rounded-lg border border-line bg-white px-3" onClick={() => setCursor(new Date(year, month - 1, 1))}>이전달</button>
          <span className="self-center font-semibold">{year}.{String(month + 1).padStart(2, "0")}</span>
          <button type="button" className="h-10 rounded-lg border border-line bg-white px-3" onClick={() => setCursor(new Date(year, month + 1, 1))}>다음달</button>
        </div>
      } />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted">
            {(["WAITING", "CONFIRMED", "IN_PRODUCTION", "ON_HOLD"] as const).map((status) => (
              <span key={status} className="inline-flex items-center gap-1">
                <span className={cn("h-3 w-5 rounded-full", barTone(status))} />
                {status === "WAITING" ? "예정(선금 전)" : orderStatusLabel[status]}
              </span>
            ))}
            <span className="ml-auto">막대 끝이 평평하면 다음 주나 다른 달로 이어집니다.</span>
          </div>
          <div className="overflow-hidden rounded-lg border border-line">
            <div className="grid grid-cols-7 bg-canvas">
              {["일", "월", "화", "수", "목", "금", "토"].map((label) => <div key={label} className="px-2 py-2 text-muted">{label}</div>)}
            </div>
            {weeks.map((week, weekIndex) => {
              const segments = weekSegments(week, scheduled);
              const visible = segments.filter((segment) => segment.lane < MAX_LANES);
              const hidden = week.map((_, column) => segments.filter((segment) => segment.lane >= MAX_LANES && segment.start <= column && column <= segment.end).length);
              return (
                <div key={weekIndex} className="relative border-t border-line">
                  <div className="absolute inset-0 grid grid-cols-7">
                    {week.map((iso, column) => {
                      if (!iso) return <div key={`empty-${column}`} className="border-l border-line bg-canvas/40 first:border-l-0" />;
                      const working = isWorkingDay(iso, holidays);
                      const used = occupiedOn(iso, db.orders);
                      return (
                        <div
                          key={iso}
                          role="button"
                          tabIndex={0}
                          className={cn("relative cursor-pointer border-l border-line p-2 first:border-l-0", !working && "bg-canvas/60", selected === iso && "ring-2 ring-primary ring-inset")}
                          onClick={() => setSelected(iso)}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            setSelected(iso);
                          }}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className={cn("grid h-6 min-w-6 place-items-center rounded-full font-semibold", iso === today && "bg-primary text-white")}>{Number(iso.slice(8))}</span>
                            <span className="truncate text-xs text-muted">{working ? `잔여 ${Math.max(0, capacity - used).toLocaleString("ko-KR")}` : "휴무"}</span>
                          </div>
                          {hidden[column] ? <span className="absolute bottom-1 left-2 text-xs text-muted">외 {hidden[column]}건</span> : null}
                        </div>
                      );
                    })}
                  </div>
                  <div className="pointer-events-none relative grid min-h-28 grid-cols-7 content-start gap-y-1 pt-10 pb-6">
                    {visible.map((segment) => {
                      const { order } = segment.item;
                      const client = clientName(db.clients, order.clientId);
                      return (
                        <button
                          key={order.id}
                          type="button"
                          title={`${order.orderNo} · ${client}\n${segment.item.first} ~ ${segment.item.last} · ${orderStatusLabel[order.status]}`}
                          className={cn(
                            "pointer-events-auto h-6 truncate px-2 text-left text-xs font-semibold",
                            barTone(order.status),
                            segment.openLeft ? "rounded-l-none" : "ml-1 rounded-l-full",
                            segment.openRight ? "rounded-r-none" : "mr-1 rounded-r-full",
                            hoveredId === order.id && "ring-2 ring-primary-deep",
                          )}
                          style={{ gridColumn: `${segment.start + 1} / ${segment.end + 2}`, gridRow: segment.lane + 1 }}
                          onMouseEnter={() => setHoveredId(order.id)}
                          onMouseLeave={() => setHoveredId(null)}
                          onClick={() => setDetailId(order.id)}
                        >
                          {segment.openLeft ? "↳ " : ""}{order.orderNo} · {client}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card className="sticky top-6 space-y-3">
          {selected ? (
            <>
              <h2 className="font-semibold">{selected}</h2>
              <p className="text-muted">{selectedWorking ? `잔여 ${Math.max(0, selectedCapacity - selectedUsed).toLocaleString("ko-KR")}개 / ${selectedCapacity.toLocaleString("ko-KR")}개` : "휴무일입니다."}</p>
              <ul className="space-y-2">
                {selectedOrders.length === 0 ? <li className="text-muted">이 날짜에 잡힌 수주가 없습니다.</li> : null}
                {selectedOrders.map((order) => (
                  <li key={order.id}>
                    <button type="button" className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left hover:bg-primary-soft/40" onClick={() => setDetailId(order.id)}>
                      <span className="font-semibold text-primary">{order.orderNo}</span>
                      <span className="text-muted">{orderStatusLabel[order.status]}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {canManageOrders(role) ? <Link to="/orders/new"><Button className="w-full">수주 등록</Button></Link> : null}
            </>
          ) : (
            <p className="text-muted">날짜를 누르면 그날의 수주와 남은 생산량이, 막대를 누르면 생산 일정 상세가 열립니다.</p>
          )}
        </Card>
      </div>
      {detailOrder ? (
        <ScheduleDrawer
          order={detailOrder}
          clients={db.clients}
          products={db.products}
          users={db.users}
          workOrders={db.workOrders}
          today={today}
          onClose={() => setDetailId(null)}
        />
      ) : null}
    </div>
  );
}

function weekSegments(week: (string | null)[], scheduled: Scheduled[]): Segment[] {
  const segments = scheduled.flatMap((item) => {
    const columns = week.flatMap((iso, column) => (iso && item.dates.has(iso) ? [column] : []));
    const start = columns[0];
    const end = columns[columns.length - 1];
    if (start === undefined || end === undefined) return [];
    return [{ item, start, end, lane: 0, openLeft: week[start] !== item.first, openRight: week[end] !== item.last }];
  });
  // 등록 순 큐를 유지한 채, 겹치지 않는 가장 위 줄에 막대를 놓는다.
  const laneEnds: number[] = [];
  segments
    .sort((left, right) => left.start - right.start)
    .forEach((segment) => {
      const lane = laneEnds.findIndex((end) => end < segment.start);
      segment.lane = lane === -1 ? laneEnds.length : lane;
      laneEnds[segment.lane] = segment.end;
    });
  return segments;
}

function barTone(status: Order["status"]): string {
  if (status === "IN_PRODUCTION") return "bg-primary text-white";
  if (status === "CONFIRMED") return "bg-primary-soft text-primary";
  if (status === "ON_HOLD") return "bg-warning-soft text-warning";
  return "bg-slate-100 text-slate-600";
}

function clientName(clients: Client[], clientId: string): string {
  return clients.find((client) => client.id === clientId)?.companyName ?? "삭제된 거래처";
}
