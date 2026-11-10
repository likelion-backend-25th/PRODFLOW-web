import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  RotateCcw,
  Search,
} from "lucide-react";
import { PaymentDetailDrawer } from "@/components/payments/PaymentDetailDrawer.tsx";
import { Badge, Button } from "@/components/ui.tsx";
import { readApiErrorMessage } from "@/lib/apiClient.ts";
import {
  bankLabel,
  formatLocalDateTime,
  formatPaymentAmount,
  paymentMethodLabel,
  paymentStatusLabel,
  paymentStatusTone,
  paymentTypeLabel,
} from "@/lib/paymentFormatters.ts";
import {
  getPayments,
  getPaymentSummary,
  type PaymentPage,
  type PaymentSearchParams,
  type PaymentStatus,
  type PaymentSummary,
  type PaymentType,
} from "@/lib/paymentApi.ts";
import { cn } from "@/lib/cn.ts";

interface Filters {
  orderNumber: string;
  clientName: string;
  paymentType: PaymentType | "";
  paymentStatus: PaymentStatus | "";
  startDate: string;
  endDate: string;
}

const emptyFilters: Filters = {
  orderNumber: "",
  clientName: "",
  paymentType: "",
  paymentStatus: "",
  startDate: "",
  endDate: "",
};

const paymentStatuses: PaymentStatus[] = [
  "READY",
  "WAITING",
  "PAID",
  "FAILED",
  "CANCELLED",
  "REQUESTED",
  "ISSUE_UNCERTAIN",
  "REISSUE_CLOSING",
  "PENDING",
  "PAY_PENDING",
  "VIRTUAL_ACCOUNT_ISSUED",
  "PARTIAL_CANCELLED",
];

export function PaymentsPage() {
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [applied, setApplied] = useState<Filters>(emptyFilters);
  const [rangeError, setRangeError] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [pageData, setPageData] = useState<PaymentPage | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");
  const [selectedPaymentId, setSelectedPaymentId] = useState<number | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);
  const listRequestRef = useRef(0);
  const summaryRequestRef = useRef(0);

  const loadSummary = useCallback(async () => {
    const requestId = ++summaryRequestRef.current;
    setSummaryLoading(true);
    setSummaryError("");
    try {
      const result = await getPaymentSummary();
      if (requestId === summaryRequestRef.current) setSummary(result);
    } catch (error: unknown) {
      if (requestId === summaryRequestRef.current) setSummaryError(readApiErrorMessage(error));
    } finally {
      if (requestId === summaryRequestRef.current) setSummaryLoading(false);
    }
  }, []);

  const requestParams = useMemo<PaymentSearchParams>(() => ({
    ...(applied.orderNumber.trim() ? { orderNumber: applied.orderNumber.trim() } : {}),
    ...(applied.clientName.trim() ? { clientName: applied.clientName.trim() } : {}),
    ...(applied.paymentType ? { paymentType: applied.paymentType } : {}),
    ...(applied.paymentStatus ? { paymentStatus: applied.paymentStatus } : {}),
    ...(applied.startDate ? { startDate: applied.startDate } : {}),
    ...(applied.endDate ? { endDate: applied.endDate } : {}),
    page,
    size: pageSize,
    sort: "id,desc",
  }), [applied, page, pageSize]);

  const loadPayments = useCallback(async () => {
    const requestId = ++listRequestRef.current;
    setListLoading(true);
    setListError("");
    try {
      const result = await getPayments(requestParams);
      if (requestId !== listRequestRef.current) return;
      setPageData(result);
      if (result.totalPages > 0 && page >= result.totalPages) setPage(result.totalPages - 1);
    } catch (error: unknown) {
      if (requestId === listRequestRef.current) setListError(readApiErrorMessage(error));
    } finally {
      if (requestId === listRequestRef.current) setListLoading(false);
    }
  }, [page, requestParams]);

  useEffect(() => {
    void Promise.resolve().then(() => loadSummary());
  }, [loadSummary]);

  useEffect(() => {
    void Promise.resolve().then(() => loadPayments());
  }, [listRefreshKey, loadPayments]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.startDate && draft.endDate && draft.startDate > draft.endDate) {
      setRangeError("조회 시작일은 종료일보다 늦을 수 없습니다.");
      return;
    }
    setRangeError("");
    setApplied({ ...draft });
    setPage(0);
    if (page === 0 && filtersEqual(applied, draft)) setListRefreshKey((key) => key + 1);
  }

  function reset() {
    setDraft(emptyFilters);
    setApplied(emptyFilters);
    setRangeError("");
    setPage(0);
    setListRefreshKey((key) => key + 1);
  }

  const refreshAfterChange = useCallback(async () => {
    await Promise.all([loadSummary(), loadPayments()]);
  }, [loadPayments, loadSummary]);

  const totalElements = pageData?.totalElements ?? 0;
  const firstIndex = totalElements === 0 || !pageData ? 0 : pageData.number * pageData.size + 1;
  const lastIndex = totalElements === 0 || !pageData ? 0 : Math.min(firstIndex + pageData.numberOfElements - 1, totalElements);

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold">입금관리</h1>
        <p className="mt-1 text-sm text-muted">수주별 계약금·잔여대금 결제상태와 가상계좌 및 입금내역을 조회합니다.</p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="전체 결제 예정 금액" value={summary?.totalScheduledAmount} icon={<CircleDollarSign size={18} />} loading={summaryLoading} />
        <SummaryCard label="입금 대기 금액" value={summary?.waitingAmount} icon={<Clock3 size={18} />} loading={summaryLoading} tone="warning" />
        <SummaryCard label="입금 완료 금액" value={summary?.completedAmount} icon={<CheckCircle2 size={18} />} loading={summaryLoading} tone="success" />
        <SummaryCard label="미수 금액" value={summary?.unpaidAmount} icon={<AlertCircle size={18} />} loading={summaryLoading} tone="danger" />
      </div>
      {summaryError ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>입금 통계를 불러오지 못했습니다. {summaryError}</span>
          <button type="button" className="font-semibold underline" onClick={() => void loadSummary()}>다시 시도</button>
        </div>
      ) : null}

      <form className="mt-4 rounded-xl border border-line bg-white p-4" onSubmit={search}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <FilterField label="수주번호">
            <input className={inputClass} value={draft.orderNumber} placeholder="수주번호 검색" onChange={(event) => setDraft({ ...draft, orderNumber: event.target.value })} />
          </FilterField>
          <FilterField label="거래처">
            <input className={inputClass} value={draft.clientName} placeholder="거래처명 검색" onChange={(event) => setDraft({ ...draft, clientName: event.target.value })} />
          </FilterField>
          <FilterField label="결제구분">
            <select className={inputClass} value={draft.paymentType} onChange={(event) => setDraft({ ...draft, paymentType: event.target.value as Filters["paymentType"] })}>
              <option value="">전체</option>
              <option value="DEPOSIT">계약금</option>
              <option value="BALANCE">잔여대금</option>
            </select>
          </FilterField>
          <FilterField label="결제상태">
            <select className={inputClass} value={draft.paymentStatus} onChange={(event) => setDraft({ ...draft, paymentStatus: event.target.value as Filters["paymentStatus"] })}>
              <option value="">전체</option>
              {paymentStatuses.map((status) => <option key={status} value={status}>{paymentStatusLabel(status)}</option>)}
            </select>
          </FilterField>
          <div className="sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-muted">기간조회 <span className="font-normal">(결제건 생성일)</span></span>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <input className={inputClass} type="date" value={draft.startDate} aria-label="조회 시작일" onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} />
              <span className="text-muted">~</span>
              <input className={inputClass} type="date" value={draft.endDate} aria-label="조회 종료일" onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} />
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className={cn("text-sm", rangeError ? "text-danger" : "text-muted")}>
            {rangeError || "선택한 기간은 결제건 생성일을 기준으로 조회합니다."}
          </p>
          <div className="flex gap-2">
            <Button type="submit"><Search size={16} className="mr-1.5" />조회</Button>
            <Button tone="ghost" onClick={reset}><RotateCcw size={16} className="mr-1.5" />초기화</Button>
          </div>
        </div>
      </form>

      <section className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <p className="flex items-center gap-2 font-semibold"><Banknote size={17} className="text-primary" />입금 내역</p>
          <span className="text-sm text-muted">총 {totalElements.toLocaleString("ko-KR")}건</span>
        </div>

        {listError ? (
          <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-5 text-center text-sm text-red-700">
            <p>입금 목록을 불러오지 못했습니다. {listError}</p>
            <Button tone="ghost" className="mt-3" onClick={() => void loadPayments()}>다시 시도</Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1460px] text-left text-sm">
              <thead className="bg-canvas text-xs text-muted">
                <tr>
                  <TableHead className="pl-4">수주번호</TableHead>
                  <TableHead>거래처</TableHead>
                  <TableHead>결제구분</TableHead>
                  <TableHead>결제 예정금액</TableHead>
                  <TableHead>결제상태</TableHead>
                  <TableHead>입금방식</TableHead>
                  <TableHead>가상계좌 은행</TableHead>
                  <TableHead>가상계좌번호</TableHead>
                  <TableHead>입금기한</TableHead>
                  <TableHead>입금완료일</TableHead>
                  <TableHead className="pr-4 text-center">상세보기</TableHead>
                </tr>
              </thead>
              <tbody className={cn("divide-y divide-line", listLoading && pageData ? "opacity-50" : "")}>
                {pageData?.content.map((row) => (
                  <tr key={row.paymentId} className={cn("hover:bg-primary-soft/30", selectedPaymentId === row.paymentId && "bg-primary-soft/50")}>
                    <TableCell className="pl-4">
                      <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setSelectedPaymentId(row.paymentId)}>
                        {row.orderNumber}
                      </button>
                    </TableCell>
                    <TableCell>{row.clientName}</TableCell>
                    <TableCell>{paymentTypeLabel(row.paymentType)}</TableCell>
                    <TableCell className="font-medium">{formatPaymentAmount(row.scheduledAmount)}</TableCell>
                    <TableCell><Badge className={paymentStatusTone(row.paymentStatus)}>{paymentStatusLabel(row.paymentStatus)}</Badge></TableCell>
                    <TableCell><Badge className="bg-primary-soft text-primary">{row.paymentMethod} · {paymentMethodLabel(row.paymentMethod)}</Badge></TableCell>
                    <TableCell>{bankLabel(row.bankName)}</TableCell>
                    <TableCell>{row.accountNumber ?? "-"}</TableCell>
                    <TableCell>{formatLocalDateTime(row.expiresAt)}</TableCell>
                    <TableCell>{formatLocalDateTime(row.receivedAt)}</TableCell>
                    <TableCell className="pr-4 text-center">
                      <button type="button" className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:border-primary hover:text-primary" onClick={() => setSelectedPaymentId(row.paymentId)}>
                        상세보기
                      </button>
                    </TableCell>
                  </tr>
                ))}
                {listLoading && !pageData ? <LoadingRows /> : null}
                {!listLoading && pageData?.content.length === 0 ? (
                  <tr><td className="px-4 py-14 text-center text-muted" colSpan={11}>조건에 맞는 입금 내역이 없습니다.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-muted">
          <p>총 {totalElements.toLocaleString("ko-KR")}건 중 {firstIndex.toLocaleString("ko-KR")}~{lastIndex.toLocaleString("ko-KR")}건 표시</p>
          <div className="flex items-center gap-2">
            <select
              className="h-9 rounded-lg border border-line bg-white px-2 text-sm text-ink"
              value={pageSize}
              aria-label="페이지당 표시 건수"
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(0);
              }}
            >
              <option value={10}>10건</option>
              <option value={20}>20건</option>
              <option value={50}>50건</option>
            </select>
            <button type="button" className={pageButtonClass} disabled={!pageData || pageData.first || listLoading} onClick={() => setPage((current) => Math.max(0, current - 1))} aria-label="이전 페이지">
              <ChevronLeft size={16} />
            </button>
            {pageNumbers(pageData?.number ?? 0, pageData?.totalPages ?? 0).map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                className={cn(pageButtonClass, pageData?.number === pageNumber && "border-primary bg-primary text-white")}
                disabled={listLoading}
                onClick={() => setPage(pageNumber)}
                aria-current={pageData?.number === pageNumber ? "page" : undefined}
              >
                {pageNumber + 1}
              </button>
            ))}
            <button type="button" className={pageButtonClass} disabled={!pageData || pageData.last || listLoading} onClick={() => setPage((current) => current + 1)} aria-label="다음 페이지">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {selectedPaymentId != null ? (
        <PaymentDetailDrawer
          key={selectedPaymentId}
          paymentId={selectedPaymentId}
          onClose={() => setSelectedPaymentId(null)}
          onChanged={refreshAfterChange}
        />
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  loading,
  tone = "primary",
}: {
  label: string;
  value: number | undefined;
  icon: ReactNode;
  loading: boolean;
  tone?: "primary" | "warning" | "success" | "danger";
}) {
  const iconTone = {
    primary: "bg-primary-soft text-primary",
    warning: "bg-warning-soft text-warning",
    success: "bg-emerald-50 text-success",
    danger: "bg-red-50 text-danger",
  }[tone];
  return (
    <section className="rounded-xl border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        <span className={cn("grid h-8 w-8 place-items-center rounded-lg", iconTone)}>{icon}</span>
      </div>
      {loading && value == null
        ? <div className="mt-3 h-8 w-3/4 animate-pulse rounded bg-canvas" />
        : <p className="mt-3 text-2xl font-semibold tracking-tight">{formatPaymentAmount(value)}</p>}
    </section>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

function TableHead({ children, className }: { children: ReactNode; className?: string }) {
  return <th className={cn("whitespace-nowrap px-3 py-3 font-medium", className)}>{children}</th>;
}

function TableCell({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("whitespace-nowrap px-3 py-3", className)}>{children}</td>;
}

function LoadingRows() {
  return (
    <>
      {Array.from({ length: 6 }, (_, index) => (
        <tr key={index}>
          <td colSpan={11} className="px-4 py-2">
            <div className="h-7 animate-pulse rounded bg-canvas" />
          </td>
        </tr>
      ))}
    </>
  );
}

function pageNumbers(current: number, total: number): number[] {
  if (total <= 5) return Array.from({ length: total }, (_, index) => index);
  const start = Math.max(0, Math.min(current - 2, total - 5));
  return Array.from({ length: 5 }, (_, index) => start + index);
}

function filtersEqual(left: Filters, right: Filters): boolean {
  return left.orderNumber === right.orderNumber
    && left.clientName === right.clientName
    && left.paymentType === right.paymentType
    && left.paymentStatus === right.paymentStatus
    && left.startDate === right.startDate
    && left.endDate === right.endDate;
}

const inputClass = "h-10 w-full min-w-0 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-soft";
const pageButtonClass = "grid h-9 min-w-9 place-items-center rounded-lg border border-line bg-white px-2 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-40";
