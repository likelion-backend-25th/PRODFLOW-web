import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight, Plus, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui.tsx";
import { cn } from "@/lib/cn.ts";
import { useDb } from "@/lib/db.ts";
import { addDays, parseISO, todayISO, toISO } from "@/lib/dates.ts";
import { activeWorkOrder, delayOf, workOrdersOf } from "@/lib/delay.ts";
import { orderQuantity } from "@/lib/money.ts";
import { orderItemsText } from "@/lib/orderText.ts";
import { canManageOrders, useAuthStore } from "@/stores/useAuthStore.ts";
import type { Order, OrderStatus } from "@/types/domain.ts";

type ProductionState = "WAITING" | "IN_PRODUCTION" | "DONE";
type DueState = "OK" | "RISK" | "LATE";
type SortKey = "start-asc" | "start-desc" | "due-asc";
type View = "month" | "week" | "list" | "range";

interface Filters {
  clientId: string;
  productId: string;
  production: ProductionState | "";
  due: DueState | "";
  from: string;
  to: string;
}

const productionLabel: Record<ProductionState, string> = {
  WAITING: "대기",
  IN_PRODUCTION: "생산중",
  DONE: "생산완료",
};

const dueLabel: Record<DueState, string> = {
  OK: "정상",
  RISK: "납기임박",
  LATE: "납기지연",
};

export function OrderSchedulePage() {
  const db = useDb();
  const role = useAuthStore((state) => state.user?.role);
  const today = todayISO();
  const initial = { clientId: "", productId: "", production: "" as const, due: "" as const, from: "", to: "" };
  const [draft, setDraft] = useState<Filters>(initial);
  const [applied, setApplied] = useState<Filters>(initial);
  const [view, setView] = useState<View>("list");
  const [sort, setSort] = useState<SortKey>("start-asc");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  const matched = db.orders
    .filter((order) => matches(order, applied, db, today))
    .sort((left, right) => compareOrders(left, right, sort));
  const pageCount = Math.max(1, Math.ceil(matched.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const rows = matched.slice((safePage - 1) * pageSize, safePage * pageSize);

  const applyRange = (range: Pick<Filters, "from" | "to">, nextView: View) => {
    const next = { ...draft, ...range };
    setDraft(next);
    setApplied(next);
    setView(nextView);
    setPage(1);
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">생산 일정 관리</h1>
          <p className="mt-1 text-sm text-muted">생산 예정 및 진행 중인 전체 일정을 확인하고 관리합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-line bg-white px-3 py-2 text-sm">{rangeLabel(applied.from, applied.to)}</span>
          {canManageOrders(role) ? (
            <Link to="/orders/new" className="inline-flex h-10 items-center gap-1 rounded-lg bg-primary px-4 font-semibold text-white">
              <Plus size={16} /> 생산 일정 등록
            </Link>
          ) : null}
        </div>
      </div>

      <section className="mt-4 rounded-xl border border-line bg-white p-4">
        <div className="grid items-end gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_1.4fr_auto]">
          <Field label="거래처">
            <select className={selectClass} value={draft.clientId} onChange={(event) => setDraft({ ...draft, clientId: event.target.value })}>
              <option value="">전체 거래처</option>
              {db.clients.map((client) => <option key={client.id} value={client.id}>{client.companyName}</option>)}
            </select>
          </Field>
          <Field label="생산품목">
            <select className={selectClass} value={draft.productId} onChange={(event) => setDraft({ ...draft, productId: event.target.value })}>
              <option value="">전체 품목</option>
              {db.products.map((product) => <option key={product.id} value={product.id}>{product.productName}</option>)}
            </select>
          </Field>
          <Field label="생산상태">
            <select className={selectClass} value={draft.production} onChange={(event) => setDraft({ ...draft, production: event.target.value as Filters["production"] })}>
              <option value="">전체 상태</option>
              {(Object.keys(productionLabel) as ProductionState[]).map((key) => <option key={key} value={key}>{productionLabel[key]}</option>)}
            </select>
          </Field>
          <Field label="납기상태">
            <select className={selectClass} value={draft.due} onChange={(event) => setDraft({ ...draft, due: event.target.value as Filters["due"] })}>
              <option value="">전체 납기</option>
              {(Object.keys(dueLabel) as DueState[]).map((key) => <option key={key} value={key}>{dueLabel[key]}</option>)}
            </select>
          </Field>
          <Field label="생산예정일">
            <span className="flex items-center gap-2">
              <input className={selectClass} type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} />
              <span className="text-muted">-</span>
              <input className={selectClass} type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} />
            </span>
          </Field>
          <div className="flex gap-2">
            <Button onClick={() => { setApplied(draft); setView(draft.from || draft.to ? "range" : "list"); setPage(1); }}><Search size={15} className="mr-1" />검색</Button>
            <Button tone="ghost" onClick={() => { setDraft(initial); setApplied(initial); setView("list"); setPage(1); }}><RotateCcw size={15} className="mr-1" />초기화</Button>
          </div>
        </div>
      </section>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border border-line bg-white p-1 text-sm">
          <ViewTab active={view === "month"} onClick={() => applyRange(monthRange(today), "month")}>월간</ViewTab>
          <ViewTab active={view === "week"} onClick={() => applyRange(weekRange(today), "week")}>주간</ViewTab>
          <ViewTab active={view === "list"} onClick={() => {
            const next = { ...applied, from: "", to: "" };
            setDraft(next);
            setApplied(next);
            setView("list");
            setPage(1);
          }}>목록</ViewTab>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <select className="h-9 rounded-lg border border-line bg-white px-3" value={sort} onChange={(event) => { setSort(event.target.value as SortKey); setPage(1); }} aria-label="정렬">
            <option value="start-asc">생산예정일 오름차순</option>
            <option value="start-desc">생산예정일 내림차순</option>
            <option value="due-asc">납기일 오름차순</option>
          </select>
          <select className="h-9 rounded-lg border border-line bg-white px-3" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} aria-label="페이지 크기">
            {[10, 20, 50].map((size) => <option key={size} value={size}>{size}개씩 보기</option>)}
          </select>
        </div>
      </div>

      <section className="mt-3 overflow-hidden rounded-xl border border-line bg-white">
        <p className="px-5 py-3 text-sm">
          <span className="font-semibold">전체 {matched.length}건</span>
          <span className="ml-2 text-muted">{applied.from || applied.to ? `${rangeLabel(applied.from, applied.to)} · ` : ""}생산예정일 기준</span>
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-primary-soft/50 text-muted">
              <tr>
                <th className="px-5 py-3 font-medium">생산예정일</th>
                <th className="py-3 font-medium">수주번호</th>
                <th className="py-3 font-medium">거래처</th>
                <th className="py-3 font-medium">품목</th>
                <th className="py-3 font-medium">수량</th>
                <th className="py-3 font-medium">생산상태</th>
                <th className="py-3 font-medium">납기일</th>
                <th className="py-3 font-medium">담당자</th>
                <th className="py-3 pr-5 font-medium">상세보기</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => {
                const client = db.clients.find((item) => item.id === order.clientId);
                const jobs = workOrdersOf(db.workOrders, order.id);
                const assigneeNames = [...new Set(jobs.flatMap((job) => {
                  const person = db.users.find((user) => user.id === job.assigneeId);
                  return person ? [person.name] : [];
                }))];
                const due = dueState(order, db, today);
                const late = due === "LATE";
                return (
                  <tr key={order.id} className={cn("border-t border-line", late && "bg-red-50/80")}>
                    <td className="px-5 py-3">{dot(order.plannedStartDate)}</td>
                    <td className="font-semibold">{order.orderNo}</td>
                    <td>{client?.companyName ?? "삭제된 거래처"}</td>
                    <td>{orderItemsText(db.products, order.lines)}</td>
                    <td>{orderQuantity(order.lines).toLocaleString("ko-KR")}</td>
                    <td><StatusBadge late={late} production={productionState(order.status)} /></td>
                    <td className={late ? "font-semibold text-red-600" : undefined}>{dot(order.dueDate)}</td>
                    <td>{assigneeNames.length > 0 ? assigneeNames.join(", ") : "미배정"}</td>
                    <td className="pr-5">
                      <Link className="inline-flex items-center font-semibold text-primary" to={`/orders/${order.id}`}>
                        상세 <ChevronRight size={15} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? <tr><td className="px-5 py-8 text-center text-muted" colSpan={9}>조건에 맞는 일정이 없습니다.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-5 py-3 text-sm text-muted">
          <p>총 {matched.length}건 중 {matched.length === 0 ? "0-0" : `${(safePage - 1) * pageSize + 1}-${Math.min(safePage * pageSize, matched.length)}`}건 표시</p>
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs text-muted">
      {label}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function ViewTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" className={cn("h-8 rounded-md px-3", active ? "bg-canvas font-semibold text-ink" : "text-muted")} onClick={onClick}>
      {children}
    </button>
  );
}

function StatusBadge({ late, production }: { late: boolean; production: ProductionState }) {
  if (late) return <span className="inline-flex rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-600">납기지연</span>;
  if (production === "DONE") return <span className="inline-flex rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">생산완료</span>;
  if (production === "IN_PRODUCTION") return <span className="inline-flex rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-600">생산중</span>;
  return <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500">대기</span>;
}

const selectClass = "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink";

function productionState(status: OrderStatus): ProductionState {
  if (status === "WAITING" || status === "CONFIRMED") return "WAITING";
  if (status === "IN_PRODUCTION" || status === "ON_HOLD") return "IN_PRODUCTION";
  return "DONE";
}

function dueState(order: Order, db: ReturnType<typeof useDb>, today: string): DueState {
  const level = delayOf(order, activeWorkOrder(db.workOrders, order.id), today)?.level;
  if (level === "late") return "LATE";
  if (level === "risk") return "RISK";
  return "OK";
}

function matches(order: Order, filters: Filters, db: ReturnType<typeof useDb>, today: string): boolean {
  if (order.status === "CANCELLED") return false;
  if (filters.clientId && order.clientId !== filters.clientId) return false;
  if (filters.productId && !order.lines.some((line) => line.productId === filters.productId)) return false;
  if (filters.production && productionState(order.status) !== filters.production) return false;
  if (filters.due && dueState(order, db, today) !== filters.due) return false;
  if (filters.from && order.plannedStartDate < filters.from) return false;
  if (filters.to && order.plannedStartDate > filters.to) return false;
  return true;
}

function compareOrders(left: Order, right: Order, sort: SortKey): number {
  if (sort === "due-asc") return left.dueDate.localeCompare(right.dueDate) || left.orderNo.localeCompare(right.orderNo);
  const direction = sort === "start-desc" ? -1 : 1;
  return left.plannedStartDate.localeCompare(right.plannedStartDate) * direction || left.orderNo.localeCompare(right.orderNo);
}

function monthRange(iso: string): Pick<Filters, "from" | "to"> {
  const [year, month] = iso.split("-").map(Number);
  const from = `${iso.slice(0, 8)}01`;
  return { from, to: toISO(new Date(year, month, 0)) };
}

function weekRange(iso: string): Pick<Filters, "from" | "to"> {
  const day = parseISO(iso).getDay();
  const from = addDays(iso, day === 0 ? -6 : 1 - day);
  return { from, to: addDays(from, 6) };
}

function dot(iso: string): string {
  return iso.replaceAll("-", ".");
}

function rangeLabel(from: string, to: string): string {
  if (!from && !to) return "전체";
  if (from && to) return `${dot(from)} - ${dot(to).slice(5)}`;
  return dot(from || to);
}
