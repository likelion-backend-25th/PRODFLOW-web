import { useState } from "react";
import { Link } from "react-router";
import { ScheduleDrawer } from "@/components/ScheduleDrawer.tsx";
import { Badge } from "@/components/ui.tsx";
import { useDb } from "@/lib/db.ts";
import { localDate, todayISO } from "@/lib/dates.ts";
import { orderStatusLabel, orderStatusTone, paymentStatusLabel, paymentTone } from "@/lib/labels.ts";
import { formatWon, orderQuantity, orderTotal } from "@/lib/money.ts";
import { activeWorkOrder, delayOf, delayTone, type DelaySignal } from "@/lib/delay.ts";
import { orderItemsText } from "@/lib/orderText.ts";
import { factoryCapacity, isWorkingDay, occupiedOn } from "@/lib/schedule.ts";
import { canManageOrders, useAuthStore } from "@/stores/useAuthStore.ts";
import type { Order } from "@/types/domain.ts";

export function DashboardPage() {
  const db = useDb();
  const role = useAuthStore((state) => state.user?.role);
  const [detailId, setDetailId] = useState<string | null>(null);
  const today = todayISO();
  const month = today.slice(0, 7);
  const active = db.orders.filter((order) => order.status !== "CANCELLED");
  const monthOrders = active.filter((order) => localDate(order.createdAt).startsWith(month));
  const produced = db.workOrders
    .filter((item) => item.status === "COMPLETED" && item.completedAt && localDate(item.completedAt).startsWith(month))
    .reduce((sum, item) => sum + item.quantity, 0);
  const completed = active.filter((order) => order.status === "COMPLETED");
  const onTime = completed.filter((order) => order.completedAt && localDate(order.completedAt) <= order.dueDate).length;
  const open = active.filter((order) => order.status !== "COMPLETED");
  const risks = open
    .map((order) => ({ order, delay: delayOf(order, activeWorkOrder(db.workOrders, order.id), today) }))
    .filter((item): item is { order: Order; delay: DelaySignal } => item.delay !== null)
    .sort((left, right) => (left.delay.level === right.delay.level ? left.order.dueDate.localeCompare(right.order.dueDate) : left.delay.level === "late" ? -1 : 1));
  const lateCount = risks.filter((item) => item.delay.level === "late").length;
  const lastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
  const weeks = [0, 0, 0, 0];
  active.forEach((order) => {
    order.allocations.forEach((slot) => {
      if (!slot.date.startsWith(month)) return;
      const bucket = Math.min(3, Math.floor((Number(slot.date.slice(8)) - 1) / 7));
      weeks[bucket] += slot.quantity;
    });
  });
  const maxWeek = Math.max(1, ...weeks);
  const mix = new Map<string, number>();
  monthOrders.forEach((order) => order.lines.forEach((line) => mix.set(line.productId, (mix.get(line.productId) ?? 0) + line.quantity)));
  const mixTotal = Math.max(1, [...mix.values()].reduce((sum, value) => sum + value, 0));
  const shares = db.products.map((product) => ({ product, qty: mix.get(product.id) ?? 0 }));
  const slices = shares.map((share, index) => {
    const start = shares.slice(0, index).reduce((sum, item) => sum + (item.qty / mixTotal) * 100, 0);
    return { ...share, start, end: start + (share.qty / mixTotal) * 100 };
  });
  const days = weekdays(today);
  const holidays = db.holidays.map((holiday) => holiday.date);
  const capacity = factoryCapacity(db.lines);
  const detailOrder = detailId ? db.orders.find((order) => order.id === detailId) : undefined;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">오늘의 생산 흐름</h1>
          <p className="mt-1 text-muted">{labelDate(today)} {weekdayLabel(today)}요일 · 오늘도 빈틈없는 생산 운영을 시작하세요.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-line bg-white px-3 py-2 text-sm">{month.replace("-", ".")}.01 - {month.slice(5)}.{lastDay}</span>
          {canManageOrders(role) ? <Link to="/orders/new" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 font-semibold text-white">+ 신규 수주 등록</Link> : null}
        </div>
      </div>
      {risks.length > 0 ? (
        <div className={`mt-4 flex items-center justify-between rounded-xl px-4 py-3 ${lateCount > 0 ? "bg-red-50 text-red-700" : "bg-warning-soft text-warning"}`}>
          <span>{lateCount > 0 ? `지연 ${lateCount}건` : ""}{lateCount > 0 && risks.length > lateCount ? " · " : ""}{risks.length > lateCount ? `주의 ${risks.length - lateCount}건` : ""}이 있습니다. 아래 목록에서 사유를 확인하세요.</span>
          <a href="#risks" className="font-semibold">목록 보기 →</a>
        </div>
      ) : null}
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <Metric label="이번 달 수주 건수" value={`${monthOrders.length}건`} hint="등록된 수주" />
        <Metric label="이번 달 생산 완료량" value={`${produced.toLocaleString("ko-KR")}개`} hint="이번 달 완료된 작업지시 수량" />
        <Metric label="납기 이행률" value={completed.length === 0 ? "-" : `${Math.round((onTime / completed.length) * 1000) / 10}%`} hint={`${onTime}/${completed.length}건 정시 완료`} />
        <Metric label="생산 예정 및 진행" value={`${open.length}건`} hint="완료 전 수주" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <section className="rounded-xl border border-line bg-white p-5">
          <h2 className="font-semibold">주간 생산 계획량</h2>
          <p className="text-sm text-muted">{month.replace("-", "년 ")}월 일정 배분 기준 · 1주는 1~7일 · 단위: 개</p>
          <div className="mt-6 flex h-48 items-end gap-8 px-4">
            {weeks.map((qty, index) => (
              <div key={index} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-xs text-muted">{qty.toLocaleString("ko-KR")}</span>
                <div className="flex h-36 w-full items-end justify-center">
                  <div className="w-10 rounded-t bg-primary" style={{ height: `${Math.max(6, (qty / maxWeek) * 100)}%` }} />
                </div>
                <span className="text-xs text-muted">{index + 1}주</span>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-line bg-white p-5">
          <h2 className="font-semibold">품목별 생산 비중</h2>
          <p className="text-sm text-muted">이번 달 등록 수주 수량 기준</p>
          <div className="mt-4 flex items-center gap-4">
            <div className="grid h-36 w-36 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${slices.map((slice, index) => `${donutColor(index)} ${slice.start}% ${slice.end}%`).join(", ")})` }}>
              <div className="grid h-20 w-20 place-items-center rounded-full bg-white text-center text-sm font-semibold">{mixTotal.toLocaleString("ko-KR")}<span className="block text-xs font-normal text-muted">개</span></div>
            </div>
            <ul className="space-y-1 text-sm">
              {slices.map((slice) => (
                <li key={slice.product.id} className="flex justify-between gap-3">
                  <span className="truncate">{slice.product.productName}</span>
                  <span className="text-muted">{Math.round((slice.qty / mixTotal) * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
      <section className="mt-4 rounded-xl border border-line bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">이번 주 생산 일정</h2>
          <Link to="/calendar" className="text-sm font-semibold text-primary">전체 일정 →</Link>
        </div>
        <div className="grid gap-3 md:grid-cols-5">
          {days.map((iso) => {
            const jobs = active.filter((order) => order.allocations.some((slot) => slot.date === iso));
            const working = isWorkingDay(iso, holidays);
            const left = Math.max(0, capacity - occupiedOn(iso, db.orders));
            return (
              <div key={iso} className="rounded-xl bg-canvas p-3">
                <p className="text-sm font-semibold">{weekdayLabel(iso)} {Number(iso.slice(8))} {iso === today ? "오늘" : ""}</p>
                <p className="text-xs text-muted">
                  {jobs.length}건 · {working ? <span className={left === 0 ? "font-semibold text-warning" : "font-semibold text-primary"}>가용 생산량 {left.toLocaleString("ko-KR")}개</span> : "휴무"}
                </p>
                <ul className="mt-2 space-y-2">
                  {jobs.slice(0, 2).map((order) => {
                    const client = db.clients.find((item) => item.id === order.clientId);
                    return (
                      <li key={order.id}>
                        <button type="button" className="w-full rounded-lg bg-white p-2 text-left hover:ring-1 hover:ring-primary" onClick={() => setDetailId(order.id)}>
                          <span className="block font-semibold text-primary">{client?.companyName}</span>
                          <span className="block truncate text-xs text-muted">{orderItemsText(db.products, order.lines)}</span>
                          <Badge className={orderStatusTone(order.status)}>{orderStatusLabel[order.status]}</Badge>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
      <section id="risks" className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
        <div className="flex items-center justify-between px-5 pt-5">
          <div>
            <h2 className="font-semibold">지연·위험 수주</h2>
            <p className="text-xs text-muted">납기 초과, 완료 예정일 경과, 착수 지연, 담당자 미배정, 일시정지, 납기 3일 이내 미출고</p>
          </div>
          <Link to="/orders" className="text-sm font-semibold text-primary">수주 목록으로 →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="mt-3 w-full min-w-[760px] text-left">
            <thead className="bg-primary-soft/40 text-muted">
              <tr>
                <th className="px-5 py-3 font-medium">수주번호</th>
                <th className="py-3 font-medium">사유</th>
                <th className="py-3 font-medium">클라이언트 / 품목</th>
                <th className="py-3 font-medium">납기일</th>
                <th className="py-3 font-medium">작업 상태</th>
                <th className="py-3 pr-5 font-medium">입금</th>
              </tr>
            </thead>
            <tbody>
              {risks.map(({ order, delay }) => {
                const client = db.clients.find((item) => item.id === order.clientId);
                return (
                  <tr key={order.id} className="border-t border-line">
                    <td className="px-5 py-3"><Link className="font-semibold text-primary" to={`/orders/${order.id}`}>{order.orderNo}</Link></td>
                    <td><Badge className={delayTone(delay.level)}>{delay.level === "late" ? "지연" : "주의"} · {delay.reason}</Badge></td>
                    <td>{client?.companyName} · {orderItemsText(db.products, order.lines)}</td>
                    <td>{order.dueDate}</td>
                    <td><Badge className={orderStatusTone(order.status)}>{orderStatusLabel[order.status]}</Badge></td>
                    <td className="pr-5"><Badge className={paymentTone(order.paymentStatus)}>{paymentStatusLabel[order.paymentStatus]}</Badge> · {orderQuantity(order.lines).toLocaleString("ko-KR")}개 · {formatWon(orderTotal(order.lines))}</td>
                  </tr>
                );
              })}
              {risks.length === 0 ? <tr><td colSpan={6} className="px-5 py-8 text-center text-muted">지연되거나 주의가 필요한 수주가 없습니다.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
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

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <section className="rounded-xl border border-line bg-white p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </section>
  );
}

function donutColor(index: number): string {
  const colors = ["var(--color-primary)", "color-mix(in srgb, var(--color-primary) 70%, white)", "color-mix(in srgb, var(--color-primary) 45%, white)", "var(--color-muted)"];
  return colors[index % colors.length] ?? "var(--color-primary)";
}

function weekdays(today: string): string[] {
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  const weekday = date.getDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  date.setDate(date.getDate() + mondayOffset);
  return Array.from({ length: 5 }, (_, index) => {
    const next = new Date(date);
    next.setDate(date.getDate() + index);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
  });
}

function weekdayLabel(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return ["일", "월", "화", "수", "목", "금", "토"][new Date(year, (month ?? 1) - 1, day ?? 1).getDay()] ?? "";
}

function labelDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}
