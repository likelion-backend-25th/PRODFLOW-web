import { useState } from "react";
import { Link } from "react-router";
import { ScheduleDrawer } from "@/components/ScheduleDrawer.tsx";
import { Button, Card, PageHeader } from "@/components/ui.tsx";
import { cn } from "@/lib/cn.ts";
import { addDays, todayISO } from "@/lib/dates.ts";
import { useDb } from "@/lib/db.ts";
import { orderStatusLabel } from "@/lib/labels.ts";
import { orderItems } from "@/lib/orderText.ts";
import { factoryCapacity, isWorkingDay, occupiedOn, occupiesFactory } from "@/lib/schedule.ts";
import { canManageOrders, useAuthStore } from "@/stores/useAuthStore.ts";
import type { Order, OrderStatus } from "@/types/domain.ts";

const barStatuses: OrderStatus[] = ["WAITING", "CONFIRMED", "IN_PRODUCTION", "ON_HOLD"];

function barTone(status: OrderStatus): string {
  if (status === "WAITING") return "bg-teal-500 text-white";
  if (status === "CONFIRMED") return "bg-sky-200 text-sky-900";
  if (status === "IN_PRODUCTION") return "bg-emerald-500 text-white";
  return "bg-amber-100 text-amber-900";
}

function legendDot(status: OrderStatus): string {
  if (status === "WAITING") return "bg-teal-500";
  if (status === "CONFIRMED") return "bg-sky-200 ring-1 ring-sky-300";
  if (status === "IN_PRODUCTION") return "bg-emerald-500";
  return "bg-amber-100 ring-1 ring-amber-200";
}

function contiguousRuns(dates: string[]): Array<{ start: string; end: string }> {
  const sorted = [...new Set(dates)].sort();
  const runs: Array<{ start: string; end: string }> = [];
  sorted.forEach((date) => {
    const last = runs.at(-1);
    if (last && addDays(last.end, 1) === date) {
      last.end = date;
      return;
    }
    runs.push({ start: date, end: date });
  });
  return runs;
}

function assignLanes(segments: Array<{ start: string; end: string }>): number[] {
  const ends: string[] = [];
  return segments.map((segment) => {
    const lane = ends.findIndex((end) => end < segment.start);
    if (lane === -1) {
      ends.push(segment.end);
      return ends.length - 1;
    }
    ends[lane] = segment.end;
    return lane;
  });
}

export function CalendarPage() {
  const db = useDb();
  const role = useAuthStore((state) => state.user?.role);
  const now = new Date();
  const today = todayISO();
  const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [selected, setSelected] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const holidays = db.holidays.map((holiday) => holiday.date);
  const leading = first.getDay();
  const cells: Array<string | null> = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: days }, (_, index) => `${year}-${String(month + 1).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  const occupying = db.orders.filter((order) => occupiesFactory(order.status));
  const selectedOrders = selected ? occupying.filter((order) => order.allocations.some((slot) => slot.date === selected)) : [];
  const selectedWorking = selected ? isWorkingDay(selected, holidays) : false;
  const selectedCapacity = selectedWorking ? factoryCapacity(db.lines) : 0;
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <ul className="flex flex-wrap items-center gap-3">
          {barStatuses.map((status) => (
            <li key={status} className="flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-full", legendDot(status))} />
              {orderStatusLabel[status]}
            </li>
          ))}
        </ul>
        <p>같은 날 수주는 아래로 나뉘어 보입니다. 막대를 누르면 그 수주 일정이 열립니다.</p>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-7 border-b border-line bg-canvas px-2 py-2 text-sm text-muted">
            {["일", "월", "화", "수", "목", "금", "토"].map((label) => <div key={label}>{label}</div>)}
          </div>
          {weeks.map((week, weekIndex) => (
            <WeekRow
              key={weekIndex}
              week={week}
              holidays={holidays}
              occupying={occupying}
              selected={selected}
              today={today}
              onSelect={setSelected}
              onOpen={setDetailId}
            />
          ))}
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

function WeekRow({
  week,
  holidays,
  occupying,
  selected,
  today,
  onSelect,
  onOpen,
}: {
  week: Array<string | null>;
  holidays: string[];
  occupying: Order[];
  selected: string | null;
  today: string;
  onSelect: (iso: string) => void;
  onOpen: (orderId: string) => void;
}) {
  const db = useDb();
  const capacity = factoryCapacity(db.lines);
  const segments = occupying.flatMap((order) => {
    const dates = order.allocations.map((slot) => slot.date).filter((date) => week.includes(date));
    return contiguousRuns(dates).map((run) => ({
      order,
      ...run,
      startCol: week.indexOf(run.start) + 1,
      endCol: week.indexOf(run.end) + 2,
    }));
  }).sort((left, right) => left.start.localeCompare(right.start) || right.end.localeCompare(left.end));
  const lanes = assignLanes(segments);
  const laneCount = lanes.length === 0 ? 0 : Math.max(...lanes) + 1;

  return (
    <div className="border-b border-line last:border-b-0">
      <div className="grid grid-cols-7">
        {week.map((iso, index) => {
          if (!iso) return <div key={`empty-${index}`} className="px-2 py-2" />;
          const working = isWorkingDay(iso, holidays);
          const used = occupiedOn(iso, occupying);
          return (
            <button
              key={iso}
              type="button"
              className={cn("px-2 py-2 text-left", selected === iso && "bg-primary-soft/50", !working && "bg-canvas/60")}
              onClick={() => onSelect(iso)}
            >
              <span className={cn(
                "inline-flex h-6 w-6 items-center justify-center text-sm font-semibold",
                iso === today && "rounded-full bg-primary text-white",
              )}>
                {Number(iso.slice(8))}
              </span>
              <p className="mt-0.5 text-xs text-muted">{working ? `잔여 ${Math.max(0, capacity - used).toLocaleString("ko-KR")}` : "휴무"}</p>
            </button>
          );
        })}
      </div>
      {laneCount > 0 ? (
        <div className="grid grid-cols-7 gap-y-1 px-1 pb-2" style={{ gridTemplateRows: `repeat(${laneCount}, 1.75rem)` }}>
          {segments.map((segment, index) => {
            const product = orderItems(db.products, segment.order.lines).first;
            const label = `${segment.order.orderNo} ${product}`;
            return (
              <button
                key={`${segment.order.id}-${segment.start}`}
                type="button"
                title={`${label} · ${orderStatusLabel[segment.order.status]} · ${segment.start} ~ ${segment.end}`}
                className={cn("mx-0.5 flex items-center truncate rounded-md px-2 text-left text-xs font-semibold", barTone(segment.order.status))}
                style={{ gridColumn: `${segment.startCol} / ${segment.endCol}`, gridRow: lanes[index] + 1 }}
                onClick={() => onOpen(segment.order.id)}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : <div className="h-2" />}
    </div>
  );
}
