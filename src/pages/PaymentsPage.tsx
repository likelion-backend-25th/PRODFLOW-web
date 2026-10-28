import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight, RotateCcw, Search, X } from "lucide-react";
import { Badge, Button } from "@/components/ui.tsx";
import { useDb } from "@/lib/db.ts";
import { localDate, todayISO } from "@/lib/dates.ts";
import { depositTarget, formatWon, orderTotal } from "@/lib/money.ts";
import type { Order, StatusHistory } from "@/types/domain.ts";

type PayKind = "DEPOSIT" | "BALANCE";
type PayState = "WAITING" | "PAID" | "FAILED" | "CANCELLED";

interface Filters {
  orderNo: string;
  client: string;
  kind: PayKind | "";
  state: PayState | "";
  from: string;
  to: string;
}

interface PaymentRow {
  id: string;
  orderId: string;
  orderNo: string;
  clientName: string;
  kind: PayKind;
  amount: number;
  state: PayState;
  bank: string;
  account: string;
  dueDate: string;
  paidAt: string;
  paidAmount: number;
  total: number;
}

const emptyFilters: Filters = { orderNo: "", client: "", kind: "", state: "", from: "", to: "" };

const kindLabel: Record<PayKind, string> = { DEPOSIT: "계약금", BALANCE: "잔여대금" };
const stateLabel: Record<PayState, string> = { WAITING: "입금대기", PAID: "입금완료", FAILED: "결제실패", CANCELLED: "입금취소" };

export function PaymentsPage() {
  const db = useDb();
  const today = todayISO();
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [applied, setApplied] = useState<Filters>(emptyFilters);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState("");

  const rows = useMemo(() => paymentRows(db.orders, db.clients, db.histories), [db]);
  const matched = rows.filter((row) => matches(row, applied));
  const pageCount = Math.max(1, Math.ceil(matched.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const slice = matched.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const summary = summarize(db.orders, today);
  const paidDelta = paidMonthDelta(db.histories, today);

  function search() {
    if (draft.from && draft.to && draft.from > draft.to) {
      setRangeError("시작일은 종료일보다 늦을 수 없습니다.");
      return;
    }
    setRangeError("");
    setApplied(draft);
    setPage(1);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">입금 관리</h1>
      <p className="mt-1 text-sm text-muted">등록된 수주의 계약금과 잔여대금을 조회합니다.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <SummaryCard label="전체 결제 예정 금액" value={formatWon(summary.scheduled)} hint="취소되지 않은 수주 총액" />
        <SummaryCard label="입금 대기 금액" value={formatWon(summary.waiting)} hint="기한이 지나지 않은 미입금" />
        <SummaryCard label="입금 완료 금액" value={formatWon(summary.paid)} hint={paidDelta} />
        <SummaryCard label="미수 금액" value={formatWon(summary.receivable)} hint="기한이 지났거나 배송 후 남은 금액" />
      </div>
      <section className="mt-4 rounded-xl border border-line bg-white p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="수주번호">
            <input className={inputClass} value={draft.orderNo} placeholder="수주번호" onChange={(event) => setDraft({ ...draft, orderNo: event.target.value })} />
          </Field>
          <Field label="거래처">
            <input className={inputClass} value={draft.client} placeholder="거래처명" onChange={(event) => setDraft({ ...draft, client: event.target.value })} />
          </Field>
          <Field label="결제구분">
            <select className={inputClass} value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as Filters["kind"] })}>
              <option value="">전체</option>
              <option value="DEPOSIT">계약금</option>
              <option value="BALANCE">잔여대금</option>
            </select>
          </Field>
          <Field label="결제상태">
            <select className={inputClass} value={draft.state} onChange={(event) => setDraft({ ...draft, state: event.target.value as Filters["state"] })}>
              <option value="">전체</option>
              <option value="WAITING">입금대기</option>
              <option value="PAID">입금완료</option>
              <option value="FAILED">결제실패</option>
              <option value="CANCELLED">입금취소</option>
            </select>
          </Field>
          <Field label="기간 시작">
            <input className={inputClass} type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} />
          </Field>
          <Field label="기간 종료">
            <input className={inputClass} type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} />
          </Field>
        </div>
        {rangeError ? <p className="mt-2 text-sm text-danger">{rangeError}</p> : null}
        <div className="mt-3 flex gap-2">
          <Button onClick={search}><Search size={16} className="mr-1" />조회</Button>
          <Button tone="ghost" onClick={() => { setDraft(emptyFilters); setApplied(emptyFilters); setRangeError(""); setPage(1); }}><RotateCcw size={16} className="mr-1" />초기화</Button>
        </div>
      </section>
      <section className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="bg-primary-soft/40 text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">수주번호</th>
                <th className="py-3 font-medium">거래처</th>
                <th className="py-3 font-medium">결제구분</th>
                <th className="py-3 font-medium">결제 예정금액</th>
                <th className="py-3 font-medium">결제상태</th>
                <th className="py-3 font-medium">가상계좌 은행</th>
                <th className="py-3 font-medium">가상계좌번호</th>
                <th className="py-3 font-medium">입금기한</th>
                <th className="py-3 font-medium">입금완료일</th>
                <th className="pr-4 py-3 font-medium">상세</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="px-4 py-3 font-semibold">{row.orderNo}</td>
                  <td>{row.clientName}</td>
                  <td>{kindLabel[row.kind]}</td>
                  <td>{formatWon(row.amount)}</td>
                  <td><Badge className={stateTone(row.state)}>{stateLabel[row.state]}</Badge></td>
                  <td>{row.bank}</td>
                  <td>{row.account}</td>
                  <td>{row.dueDate || "배송 완료 후"}</td>
                  <td>{row.paidAt || "-"}</td>
                  <td className="pr-4">
                    <button type="button" className="font-semibold text-primary" onClick={() => setSelectedId(row.id)}>상세보기</button>
                  </td>
                </tr>
              ))}
              {slice.length === 0 ? <tr><td className="px-4 py-8 text-center text-muted" colSpan={10}>조회 결과가 없습니다.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-muted">
          <p>총 {matched.length}건 중 {matched.length === 0 ? "0-0" : `${(safePage - 1) * pageSize + 1}-${Math.min(safePage * pageSize, matched.length)}`}건 표시</p>
          <div className="flex items-center gap-2">
            <select className="h-8 rounded-lg border border-line bg-white px-2" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} aria-label="페이지당 표시 건수">
              <option value={10}>10건</option>
              <option value={20}>20건</option>
              <option value={50}>50건</option>
            </select>
            <button type="button" className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-white disabled:opacity-40" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} aria-label="이전 페이지"><ChevronLeft size={16} /></button>
            <span className="grid h-8 min-w-8 place-items-center rounded-lg bg-primary px-2 text-white">{safePage}</span>
            <button type="button" className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-white disabled:opacity-40" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} aria-label="다음 페이지"><ChevronRight size={16} /></button>
          </div>
        </div>
      </section>
      {selected ? <PaymentDrawer row={selected} onClose={() => setSelectedId(null)} /> : null}
    </div>
  );
}

function PaymentDrawer({ row, onClose }: { row: PaymentRow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40" role="dialog" aria-modal="true" aria-labelledby="payment-drawer-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="payment-drawer-title" className="text-lg font-semibold">입금 상세</h2>
          <button type="button" className="text-muted" onClick={onClose} aria-label="닫기"><X size={18} /></button>
        </div>
        <dl className="mt-4 space-y-3 text-sm">
          <Detail label="수주번호" value={row.orderNo} />
          <Detail label="거래처" value={row.clientName} />
          <Detail label="결제구분" value={kindLabel[row.kind]} />
          <Detail label="결제 예정금액" value={formatWon(row.amount)} />
          <Detail label="결제상태" value={stateLabel[row.state]} />
          <Detail label="가상계좌" value={`${row.bank} ${row.account}`} />
          <Detail label="입금기한" value={row.dueDate || "배송 완료 후"} />
          <Detail label="입금완료일" value={row.paidAt || "-"} />
          <Detail label="수주 누적 입금" value={`${formatWon(row.paidAmount)} / ${formatWon(row.total)}`} />
        </dl>
        <Link to={`/orders/${row.orderId}`} className="mt-5 inline-flex h-10 items-center rounded-lg bg-primary px-4 font-semibold text-white">수주 상세</Link>
      </aside>
    </div>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <section className="rounded-xl border border-line bg-white p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs text-muted">{label}<span className="mt-1 block">{children}</span></label>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3"><dt className="text-muted">{label}</dt><dd className="text-right font-medium">{value}</dd></div>;
}

function paymentRows(orders: Order[], clients: { id: string; companyName: string }[], histories: StatusHistory[]): PaymentRow[] {
  return orders.flatMap((order) => {
    const total = orderTotal(order.lines, order.vatIncluded);
    const deposit = depositTarget(total);
    const balance = Math.max(0, total - deposit);
    const clientName = clients.find((client) => client.id === order.clientId)?.companyName ?? "삭제된 거래처";
    const account = splitAccount(order.virtualAccount);
    const paidNotes = histories
      .filter((item) => item.entity === "ORDER" && item.entityId === order.id && item.note?.includes("입금"))
      .slice()
      .sort((left, right) => left.at.localeCompare(right.at));
    const depositPaidAt = paidDate(paidNotes, deposit);
    const balancePaidAt = order.paymentStatus === "PAID" && paidNotes.length > 0 ? localDate(paidNotes[paidNotes.length - 1].at) : "";
    const cancelled = order.status === "CANCELLED";
    const base = { orderId: order.id, orderNo: order.orderNo, clientName, bank: account.bank, account: account.number, paidAmount: order.paidAmount, total };
    return [
      {
        ...base,
        id: `${order.id}-deposit`,
        kind: "DEPOSIT" as const,
        amount: deposit,
        state: rowState(cancelled, order.paidAmount >= deposit && deposit > 0),
        dueDate: order.depositDueDate,
        paidAt: order.paidAmount >= deposit ? depositPaidAt : "",
      },
      {
        ...base,
        id: `${order.id}-balance`,
        kind: "BALANCE" as const,
        amount: balance,
        state: rowState(cancelled, order.paymentStatus === "PAID"),
        dueDate: order.completedAt ? localDate(order.completedAt) : "",
        paidAt: order.paymentStatus === "PAID" ? balancePaidAt : "",
      },
    ];
  });
}

function rowState(cancelled: boolean, paid: boolean): PayState {
  if (cancelled) return "CANCELLED";
  if (paid) return "PAID";
  return "WAITING";
}

function paidDate(notes: StatusHistory[], target: number): string {
  const hit = notes.find((item) => cumulativeOf(item.note ?? "") >= target);
  return hit ? localDate(hit.at) : "";
}

function cumulativeOf(note: string): number {
  const match = note.match(/누적\s*([0-9,]+)원/);
  return match ? Number(match[1].replaceAll(",", "")) : 0;
}

function splitAccount(value: string): { bank: string; number: string } {
  const trimmed = value.trim();
  const space = trimmed.indexOf(" ");
  if (!trimmed) return { bank: "-", number: "-" };
  if (space < 0) return { bank: "-", number: trimmed };
  return { bank: trimmed.slice(0, space), number: trimmed.slice(space + 1) };
}

function matches(row: PaymentRow, filters: Filters): boolean {
  if (filters.orderNo && !row.orderNo.includes(filters.orderNo.trim())) return false;
  if (filters.client && !row.clientName.includes(filters.client.trim())) return false;
  if (filters.kind && row.kind !== filters.kind) return false;
  if (filters.state && row.state !== filters.state) return false;
  if ((filters.from || filters.to) && !row.dueDate) return false;
  if (filters.from && row.dueDate < filters.from) return false;
  if (filters.to && row.dueDate > filters.to) return false;
  return true;
}

function summarize(orders: Order[], today: string) {
  return orders.filter((order) => order.status !== "CANCELLED").reduce((sum, order) => {
    const total = orderTotal(order.lines, order.vatIncluded);
    const unpaid = Math.max(0, total - order.paidAmount);
    const overdue = (order.depositDueDate < today && order.paidAmount < depositTarget(total)) || (order.status === "COMPLETED" && unpaid > 0);
    return {
      scheduled: sum.scheduled + total,
      paid: sum.paid + order.paidAmount,
      waiting: sum.waiting + (overdue ? 0 : unpaid),
      receivable: sum.receivable + (overdue ? unpaid : 0),
    };
  }, { scheduled: 0, paid: 0, waiting: 0, receivable: 0 });
}

function paidMonthDelta(histories: StatusHistory[], today: string): string {
  const current = today.slice(0, 7);
  const previousDate = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1);
  const previous = `${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, "0")}`;
  const amountOf = (month: string) => histories.reduce((sum, item) => {
    if (!item.note?.includes("입금") || !localDate(item.at).startsWith(month)) return sum;
    const match = item.note.match(/입금\s*([0-9,]+)원/);
    return sum + (match ? Number(match[1].replaceAll(",", "")) : 0);
  }, 0);
  const before = amountOf(previous);
  const now = amountOf(current);
  if (before <= 0) return now > 0 ? "이번 달 입금이 있습니다" : "전월 입금 내역 없음";
  const rate = Math.round(((now - before) / before) * 100);
  return `전월 대비 ${rate > 0 ? "+" : ""}${rate}%`;
}

function stateTone(state: PayState): string {
  if (state === "PAID") return "bg-emerald-50 text-emerald-700";
  if (state === "WAITING") return "bg-amber-50 text-amber-800";
  if (state === "FAILED") return "bg-red-50 text-red-700";
  return "bg-slate-100 text-slate-600";
}

const inputClass = "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink";
