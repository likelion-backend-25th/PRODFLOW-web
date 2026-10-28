import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Badge, Button } from "@/components/ui.tsx";
import { localDate } from "@/lib/dates.ts";
import { useDb } from "@/lib/db.ts";
import { quotationStatusLabel, quotationStatusTone } from "@/lib/labels.ts";
import { formatWon, orderTotal } from "@/lib/money.ts";
import { canManageOrders, useAuthStore } from "@/stores/useAuthStore.ts";
import type { Quotation, QuotationStatus } from "@/types/domain.ts";

const filters: QuotationStatus[] = ["SENT", "APPROVED", "REJECTED", "CANCELLED", "EXPIRED"];
const dateFields = ["createdAt", "requestedDueDate", "estimatedDueDate", "validUntil"] as const;
type DateField = (typeof dateFields)[number];

const dateFieldLabel: Record<DateField, string> = {
  createdAt: "작성일",
  requestedDueDate: "희망 납기",
  estimatedDueDate: "예상 납기",
  validUntil: "유효기간",
};

function quoteDate(quote: Quotation, field: DateField): string {
  return field === "createdAt" ? localDate(quote.createdAt) : quote[field];
}

export function QuoteListPage() {
  const db = useDb();
  const role = useAuthStore((state) => state.user?.role);
  const [params] = useSearchParams();
  const openPending = params.get("pending") === "1";
  const [status, setStatus] = useState<QuotationStatus | "">(openPending ? "APPROVED" : "");
  const [pendingOnly, setPendingOnly] = useState(openPending);
  const [keyword, setKeyword] = useState("");
  const [dateField, setDateField] = useState<DateField>("createdAt");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const rows = useMemo(() => db.quotations.filter((quote) => {
    const client = db.clients.find((item) => item.id === quote.clientId);
    const author = db.users.find((item) => item.id === quote.userId);
    const text = `${quote.quotationNo} ${client?.companyName ?? ""} ${author?.name ?? ""}`.includes(keyword.trim());
    const date = quoteDate(quote, dateField);
    const inRange = (!from || date >= from) && (!to || date <= to);
    const waitingOrder = pendingOnly && quote.status === "APPROVED" && !db.orders.some((order) => order.quotationId === quote.id && order.status !== "CANCELLED");
    return text && inRange && (!status || quote.status === status) && (!pendingOnly || waitingOrder);
  }), [dateField, db, from, keyword, pendingOnly, status, to]);
  const pageCount = Math.max(1, Math.ceil(rows.length / 12));
  const currentPage = Math.min(page, pageCount - 1);
  const slice = rows.slice(currentPage * 12, currentPage * 12 + 12);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">견적</h1>
          <p className="mt-1 text-muted">가격과 납기를 제안합니다. 배송지는 수주 등록에서 받습니다.</p>
        </div>
        {canManageOrders(role) ? <Link to="/quotations/new" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 font-semibold text-white">견적 작성</Link> : null}
      </div>
      <section className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
        <div className="flex flex-wrap gap-2 p-4">
          <input className="h-10 min-w-56 flex-1 rounded-lg border border-line px-3" value={keyword} placeholder="견적번호, 거래처, 작성자 검색" onChange={(event) => { setKeyword(event.target.value); setPage(0); }} />
          <select className="h-10 rounded-lg border border-line bg-white px-3" value={status} onChange={(event) => { setStatus(event.target.value as QuotationStatus | ""); setPage(0); }}>
            <option value="">상태 전체</option>
            {filters.map((key) => <option key={key} value={key}>{quotationStatusLabel[key]}</option>)}
          </select>
          <select className="h-10 rounded-lg border border-line bg-white px-3" value={dateField} onChange={(event) => { setDateField(event.target.value as DateField); setPage(0); }}>
            {dateFields.map((key) => <option key={key} value={key}>{dateFieldLabel[key]}</option>)}
          </select>
          <input className="h-10 rounded-lg border border-line px-3" type="date" aria-label="시작일" value={from} onChange={(event) => { setFrom(event.target.value); setPage(0); }} />
          <span className="self-center text-sm text-muted">~</span>
          <input className="h-10 rounded-lg border border-line px-3" type="date" aria-label="종료일" value={to} onChange={(event) => { setTo(event.target.value); setPage(0); }} />
          <Button tone={pendingOnly ? "primary" : "ghost"} onClick={() => { setPendingOnly((value) => !value); setStatus(pendingOnly ? "" : "APPROVED"); setPage(0); }}>수주 대기</Button>
          <Button tone="ghost" onClick={() => { setKeyword(""); setStatus(""); setPendingOnly(false); setDateField("createdAt"); setFrom(""); setTo(""); setPage(0); }}>초기화</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-canvas text-xs text-muted">
              <tr>
                {["견적번호", "거래처", "희망 납기", "예상 납기", "총액", "상태", "수주", "유효기간", "작성자"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}
                <th className="px-4 py-3 text-[11px] font-medium">작성일</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((quote) => {
                const client = db.clients.find((item) => item.id === quote.clientId);
                const author = db.users.find((item) => item.id === quote.userId);
                const order = db.orders.find((item) => item.quotationId === quote.id && item.status !== "CANCELLED");
                return (
                  <tr key={quote.id} className="border-t border-line">
                    <td className="px-4 py-3 font-semibold"><Link to={`/quotations/${quote.id}`} className="text-primary">{quote.quotationNo}</Link></td>
                    <td className="px-4 py-3">{client?.companyName ?? "-"}</td>
                    <td className="px-4 py-3">{quote.requestedDueDate}</td>
                    <td className="px-4 py-3">{quote.estimatedDueDate}</td>
                    <td className="px-4 py-3">{formatWon(orderTotal(quote.lines, quote.vatIncluded))}</td>
                    <td className="px-4 py-3"><Badge className={quotationStatusTone(quote.status)}>{quotationStatusLabel[quote.status]}</Badge></td>
                    <td className="px-4 py-3">
                      {order ? <Link to={`/orders/${order.id}`} className="text-primary">{order.orderNo}</Link> : quote.status === "APPROVED" ? (canManageOrders(role) ? <Link to={`/orders/new?quotationId=${quote.id}`} className="font-semibold text-primary">수주 대기</Link> : "수주 대기") : "-"}
                    </td>
                    <td className="px-4 py-3">{quote.validUntil}</td>
                    <td className="px-4 py-3">{author?.name ?? "-"}</td>
                    <td className="px-4 py-3 text-xs text-muted">{localDate(quote.createdAt)}</td>
                  </tr>
                );
              })}
              {rows.length === 0 ? <tr><td className="px-4 py-8 text-center text-muted" colSpan={10}>견적이 없습니다.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-5 py-3 text-sm text-muted">
          <span>총 {rows.length}건 중 {rows.length === 0 ? 0 : currentPage * 12 + 1}-{Math.min(rows.length, currentPage * 12 + 12)}건 표시</span>
          <span className="flex gap-2">
            <Button tone="ghost" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>이전</Button>
            <Button tone="ghost" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>다음</Button>
          </span>
        </div>
      </section>
    </div>
  );
}
