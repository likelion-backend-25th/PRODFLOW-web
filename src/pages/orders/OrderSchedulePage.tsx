import { useState } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight, RotateCcw, Search } from "lucide-react";
import { Badge, Button } from "@/components/ui.tsx";
import { useDb } from "@/lib/db.ts";
import { todayISO, toISO } from "@/lib/dates.ts";
import { activeWorkOrder, delayOf, delayTone } from "@/lib/delay.ts";
import { orderStatusLabel, orderStatusTone, workStatusOrder } from "@/lib/labels.ts";
import { orderQuantity } from "@/lib/money.ts";
import { orderItemsText } from "@/lib/orderText.ts";
import { canManageOrders, useAuthStore } from "@/stores/useAuthStore.ts";
import type { Order, OrderStatus } from "@/types/domain.ts";

const PAGE_SIZE = 10;

interface Filters {
  status: OrderStatus | "DELAYED" | "";
  orderNo: string;
  assigneeId: string;
  from: string;
  to: string;
}

function monthRange(): Pick<Filters, "from" | "to"> {
  const today = todayISO();
  const [year, month] = today.split("-").map(Number);
  return { from: `${today.slice(0, 8)}01`, to: toISO(new Date(year, month, 0)) };
}

export function OrderSchedulePage() {
  const db = useDb();
  const role = useAuthStore((state) => state.user?.role);
  const initial = { ...monthRange(), status: "" as const, orderNo: "", assigneeId: "all" };
  const [draft, setDraft] = useState<Filters>(initial);
  const [applied, setApplied] = useState<Filters>(initial);
  const [page, setPage] = useState(1);
  const today = todayISO();
  const managers = db.users.filter((user) => user.role === "PRODUCTION_MANAGER" && user.status === "ACTIVE");
  const matched = db.orders
    .filter((order) => matches(order, applied, db, today))
    .sort((left, right) => left.plannedStartDate.localeCompare(right.plannedStartDate) || left.orderNo.localeCompare(right.orderNo));
  const pageCount = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const rows = matched.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">수주 일정 관리</h1>
          <p className="mt-1 text-sm text-muted">선택한 납기 기간의 수주를 조회합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-line bg-white px-3 py-2 text-sm">{dot(applied.from)} - {dot(applied.to).slice(5)}</span>
          {canManageOrders(role) ? <Link to="/orders/new" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 font-semibold text-white">+ 신규 수주 등록</Link> : null}
        </div>
      </div>

      <section className="mt-4 rounded-xl border border-line bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted">상태
            <select className="mt-1 h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Filters["status"] })}>
              <option value="">전체 상태</option>
              {workStatusOrder.map((key) => <option key={key} value={key}>{orderStatusLabel[key]}</option>)}
              <option value="DELAYED">납기 지연</option>
            </select>
          </label>
          <label className="text-xs text-muted">수주번호
            <input className="mt-1 h-10 rounded-lg border border-line px-3 text-sm text-ink" value={draft.orderNo} placeholder="수주번호 입력" onChange={(event) => setDraft({ ...draft, orderNo: event.target.value })} />
          </label>
          <label className="text-xs text-muted">담당자
            <select className="mt-1 h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink" value={draft.assigneeId} onChange={(event) => setDraft({ ...draft, assigneeId: event.target.value })}>
              <option value="all">전체 담당자</option>
              <option value="none">미배정</option>
              {managers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted">납기일
            <span className="mt-1 flex items-center gap-2">
              <input className="h-10 rounded-lg border border-line px-3 text-sm text-ink" type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} />
              <span>~</span>
              <input className="h-10 rounded-lg border border-line px-3 text-sm text-ink" type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} />
            </span>
          </label>
          <Button onClick={() => { setApplied(draft); setPage(1); }}><Search size={15} className="mr-1" />조회</Button>
          <Button tone="ghost" onClick={() => { setDraft(initial); setApplied(initial); setPage(1); }}><RotateCcw size={15} className="mr-1" />초기화</Button>
        </div>
      </section>

      <section className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
        <p className="px-5 py-3 text-sm font-semibold">전체 <span className="font-normal text-muted">{matched.length}건</span></p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-primary-soft/50 text-muted">
              <tr>
                <th className="px-5 py-3 font-medium">날짜</th>
                <th className="py-3 font-medium">수주번호</th>
                <th className="py-3 font-medium">거래처</th>
                <th className="py-3 font-medium">품목</th>
                <th className="py-3 font-medium">수량</th>
                <th className="py-3 font-medium">생산라인</th>
                <th className="py-3 font-medium">담당자</th>
                <th className="py-3 font-medium">납기일</th>
                <th className="py-3 font-medium">상태</th>
                <th className="py-3 pr-5 font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => {
                const client = db.clients.find((item) => item.id === order.clientId);
                const jobs = db.workOrders.filter((item) => item.orderId === order.id && item.status !== "CANCELLED");
                const lineNames = [...new Set(jobs.flatMap((job) => {
                  const line = db.lines.find((item) => item.id === job.lineId);
                  return line ? [line.name] : [];
                }))];
                const assigneeNames = [...new Set(jobs.flatMap((job) => {
                  const person = db.users.find((user) => user.id === job.assigneeId);
                  return person ? [person.name] : [];
                }))];
                const late = delayOf(order, activeWorkOrder(db.workOrders, order.id), today)?.level === "late";
                return (
                  <tr key={order.id} className={`border-t border-line ${late ? "bg-red-50/70" : ""}`}>
                    <td className="px-5 py-3">{dot(order.plannedStartDate)}</td>
                    <td><Link className="font-semibold text-primary" to={`/orders/${order.id}`}>{order.orderNo}</Link></td>
                    <td>{client?.companyName ?? "삭제된 거래처"}</td>
                    <td>{orderItemsText(db.products, order.lines)}</td>
                    <td>{orderQuantity(order.lines).toLocaleString("ko-KR")}</td>
                    <td>{lineNames.length > 0 ? lineNames.join(", ") : "-"}</td>
                    <td>{assigneeNames.length > 0 ? assigneeNames.join(", ") : "미배정"}</td>
                    <td>{dot(order.dueDate)}</td>
                    <td>{late ? <Badge className={delayTone("late")}>납기 지연</Badge> : <Badge className={orderStatusTone(order.status)}>{orderStatusLabel[order.status]}</Badge>}</td>
                    <td className="pr-5"><Link className="font-semibold text-primary" to={`/orders/${order.id}`}>상세</Link></td>
                  </tr>
                );
              })}
              {rows.length === 0 ? <tr><td className="px-5 py-8 text-center text-muted" colSpan={10}>조건에 맞는 수주가 없습니다.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-5 py-3 text-sm text-muted">
          <p>총 {matched.length}건 중 {matched.length === 0 ? "0-0" : `${(safePage - 1) * PAGE_SIZE + 1}-${Math.min(safePage * PAGE_SIZE, matched.length)}`}건 표시</p>
          <div className="flex items-center gap-1">
            <button type="button" className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-white disabled:opacity-40" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} aria-label="이전 페이지"><ChevronLeft size={16} /></button>
            <span className="grid h-8 min-w-8 place-items-center rounded-lg bg-primary px-2 text-white">{safePage}</span>
            <button type="button" className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-white disabled:opacity-40" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} aria-label="다음 페이지"><ChevronRight size={16} /></button>
          </div>
        </div>
      </section>
    </div>
  );
}

function matches(order: Order, filters: Filters, db: ReturnType<typeof useDb>, today: string): boolean {
  if (filters.status !== "CANCELLED" && order.status === "CANCELLED") return false;
  const jobs = db.workOrders.filter((item) => item.orderId === order.id && item.status !== "CANCELLED");
  const late = delayOf(order, activeWorkOrder(db.workOrders, order.id), today)?.level === "late";
  if (filters.status === "DELAYED" && !late) return false;
  if (filters.status && filters.status !== "DELAYED" && order.status !== filters.status) return false;
  if (filters.orderNo.trim() && !order.orderNo.includes(filters.orderNo.trim())) return false;
  if (filters.assigneeId === "none" && jobs.some((job) => job.assigneeId)) return false;
  if (filters.assigneeId !== "all" && filters.assigneeId !== "none" && !jobs.some((job) => job.assigneeId === filters.assigneeId)) return false;
  if (filters.from && order.dueDate < filters.from) return false;
  if (filters.to && order.dueDate > filters.to) return false;
  return true;
}

function dot(iso: string): string {
  return iso.replaceAll("-", ".");
}
