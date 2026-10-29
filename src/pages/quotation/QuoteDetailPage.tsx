import { Calendar, Check } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { DueDateCalendar } from "@/components/DueDateCalendar.tsx";
import { Badge, Button } from "@/components/ui.tsx";
import { cn } from "@/lib/cn.ts";
import { parseISO, todayISO } from "@/lib/dates.ts";
import { useDb } from "@/lib/db.ts";
import { quotationStatusLabel, quotationStatusTone } from "@/lib/labels.ts";
import { depositTarget, formatWon, lineAmount, orderQuantity, orderTotal } from "@/lib/money.ts";
import { clientFullAddress, previewDuePlan, previewSchedule, quoteNotBefore, recalculateQuotation, setQuotationStatus } from "@/lib/workflow.ts";
import { canManageOrders, useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";

export function QuoteDetailPage() {
  const { quotationId = "" } = useParams();
  const db = useDb();
  const user = useAuthStore((state) => state.user);
  const role = user?.role;
  const show = useToastStore((state) => state.show);
  const quote = db.quotations.find((item) => item.id === quotationId);
  const [open, setOpen] = useState(false);
  const [due, setDue] = useState(quote?.requestedDueDate ?? "");
  const [dueOpen, setDueOpen] = useState(false);
  const dueRef = useRef<HTMLDivElement>(null);
  const quantityForPreview = quote?.lines.reduce((sum, line) => sum + line.quantity, 0) ?? 0;
  const scheduleResult = useMemo(() => {
    if (!open || quantityForPreview <= 0) return null;
    try {
      return previewSchedule(quantityForPreview, undefined, quoteNotBefore());
    } catch (reason: unknown) {
      return reason instanceof Error ? reason.message : "납기를 계산하지 못했습니다.";
    }
  }, [db, open, quantityForPreview]);
  const earliest = scheduleResult && typeof scheduleResult !== "string" ? scheduleResult.earliestDueDate : null;
  const duePlan = useMemo(() => {
    if (!due || !earliest || due < earliest) return null;
    try {
      return previewDuePlan(quantityForPreview, due, quoteNotBefore());
    } catch {
      return null;
    }
  }, [db, due, earliest, quantityForPreview]);
  useEffect(() => {
    if (!dueOpen) return;
    function close(event: MouseEvent) {
      if (!dueRef.current?.contains(event.target as Node)) setDueOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [dueOpen]);
  if (!quote) return <p>견적서를 찾을 수 없습니다.</p>;

  const client = db.clients.find((item) => item.id === quote.clientId);
  const author = db.users.find((item) => item.id === quote.userId);
  const order = db.orders.find((item) => item.quotationId === quote.id && item.status !== "CANCELLED");
  const total = orderTotal(quote.lines, quote.vatIncluded);
  const supply = quote.lines.reduce((sum, line) => sum + supplyOf(line, quote.vatIncluded), 0);
  const canChange = quote.status === "SENT" && canManageOrders(role);
  const dueTooSoon = Boolean(due && earliest && due < earliest);
  const deposit = depositTarget(total);
  const dueToday = quote.estimatedDueDate.slice(0, 10) === todayISO();

  function act(action: () => void, message: string) {
    try {
      action();
      show(message);
      setOpen(false);
    } catch (error: unknown) {
      show(error instanceof Error ? error.message : "처리하지 못했습니다.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted"><Link to="/quotations" className="hover:text-primary">견적 목록</Link></p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{quote.quotationNo}</h1>
            <Badge className={quotationStatusTone(quote.status)}>{quotationStatusLabel[quote.status]}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted">
            {quote.status === "SENT" ? "이 단가로 유효기간 안에 승인할 수 있습니다. 수주를 등록할 때 납기를 다시 확인합니다." : null}
            {quote.status === "APPROVED" && !order ? "승인된 견적입니다. 수주는 아직 없습니다. 등록 화면에서 납기를 다시 계산합니다." : null}
            {quote.status === "APPROVED" && order ? "이 견적으로 수주가 등록되어 있습니다. 단가와 수량은 견적에 남은 값입니다." : null}
            {quote.status === "EXPIRED" ? "유효기간이 지났습니다. 거래처가 다시 연락하면 견적을 새로 작성합니다." : null}
            {quote.status === "REJECTED" || quote.status === "CANCELLED" ? "거절되거나 취소된 견적은 수주를 만들 수 없습니다." : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canChange && user ? <Button onClick={() => act(() => setQuotationStatus(quote.id, "APPROVED", user), "견적을 승인했습니다.")}>승인</Button> : null}
          {quote.status === "APPROVED" && !order && canManageOrders(role) ? <Link to={`/orders/new?quotationId=${quote.id}`} className="inline-flex h-10 items-center rounded-lg bg-primary px-4 font-semibold text-white">수주 등록</Link> : null}
          {order ? <Link to={`/orders/${order.id}`} className="inline-flex h-10 items-center rounded-lg bg-primary px-4 font-semibold text-white">수주 {order.orderNo}</Link> : null}
          {quote.status === "EXPIRED" && canManageOrders(role) ? <Link to="/quotations/new" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 font-semibold text-white">새 견적 작성</Link> : null}
        </div>
      </div>

      <section className="rounded-xl border border-line bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">거래처 정보</h2>
          {client ? <Link to={`/clients/${client.id}`} className="text-sm font-semibold text-primary">거래처 상세 →</Link> : null}
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
          <Field label="회사명" value={client?.companyName || "-"} />
          <Field label="담당자명" value={client?.contactName || client?.representative || "-"} />
          <Field label="연락처" value={client?.phone || "-"} />
          <Field label="이메일" value={client?.taxEmail || "-"} />
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted">회사 주소</dt>
            <dd className="mt-1">{client ? clientFullAddress(client) : "-"}</dd>
          </div>
        </dl>
      </section>

      <section className="overflow-hidden rounded-xl border border-line bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
          <div>
            <h2 className="font-semibold">생산품목 및 금액</h2>
            <p className="mt-1 text-sm text-muted">견적에 담긴 품목과 단가입니다.</p>
          </div>
          <p className="text-sm text-muted">{quote.lines.length}개 품목 · 총 {orderQuantity(quote.lines).toLocaleString("ko-KR")}개</p>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-y border-line">
                <th className="px-5 py-2 font-medium">생산품목</th>
                <th className="px-3 py-2 text-right font-medium">수량</th>
                <th className="px-3 py-2 text-right font-medium">단가 (원)</th>
                <th className="px-5 py-2 text-right font-medium">공급가격</th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((line) => {
                const product = db.products.find((item) => item.id === line.productId);
                return (
                  <tr key={line.id} className="border-b border-line">
                    <td className="px-5 py-3">
                      <p className="font-semibold">{product?.productName ?? "품목"}</p>
                      <p className="text-xs text-muted">{[product?.modelName, product?.description].filter(Boolean).join(" · ") || "-"}</p>
                    </td>
                    <td className="px-3 text-right tabular-nums">{line.quantity.toLocaleString("ko-KR")}개</td>
                    <td className="px-3 text-right tabular-nums">{formatWon(line.unitPrice)}</td>
                    <td className="px-5 text-right font-semibold tabular-nums">{formatWon(supplyOf(line, quote.vatIncluded))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4 px-5 py-4">
          <p className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">{quote.vatIncluded ? "VAT 포함" : "VAT 별도 청구"}</p>
          <dl className="w-full max-w-xs space-y-1 text-sm">
            <Money label="공급가액" value={formatWon(supply)} />
            <Money label="부가세 (10%)" value={formatWon(total - supply)} />
            <Money label="계약금 50%" value={formatWon(deposit)} />
            <Money label="잔금 50%" value={formatWon(total - deposit)} />
            <div className="flex items-baseline justify-between gap-4 pt-1">
              <dt className="text-muted">총액</dt>
              <dd className="text-xl font-semibold text-primary tabular-nums">{formatWon(total)}</dd>
            </div>
          </dl>
        </div>
        <p className="px-5 pb-5 text-xs text-muted">{quote.vatIncluded ? "단가에 부가세가 포함되어 있습니다." : "단가는 부가세 별도이며, 부가세율은 10%입니다."}</p>
      </section>

      <section className="rounded-xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">납기</h2>
          <div className="flex flex-wrap items-center gap-2">
            {dueToday ? <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">오늘 납기</span> : null}
            {canChange ? <Button tone="ghost" onClick={() => { setDue(quote.requestedDueDate); setOpen((value) => !value); }}>{open ? "재산정 닫기" : "납기 재산정"}</Button> : null}
            {canChange && user ? <Button tone="ghost" onClick={() => act(() => setQuotationStatus(quote.id, "REJECTED", user), "견적을 거절했습니다.")}>거절</Button> : null}
            {canChange && user ? <Button tone="ghost" className="text-danger" onClick={() => act(() => setQuotationStatus(quote.id, "CANCELLED", user), "견적을 취소했습니다.")}>취소</Button> : null}
          </div>
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
          <Field label="희망 납기" value={quote.requestedDueDate} />
          <Field label="예상 납기" value={quote.estimatedDueDate} />
          <Field label="유효기간" value={quote.validUntil} />
          <Field label="생산 시작" value={quote.plannedStartDate} />
          <Field label="생산 완료" value={quote.plannedEndDate} />
          <Field label="작성" value={author?.name ?? "-"} />
        </dl>
        <p className="mt-4 text-sm text-muted">이 일정은 견적을 낸 날의 참고입니다. 자리를 잡아 두지 않으며, 수주 등록 때 다시 계산합니다.</p>
        {open && canChange ? (
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-sm text-muted">하늘색 날짜만 약속할 수 있습니다. 오늘 등록한다고 보고, 생산은 오늘부터 3일 뒤보다 앞에 두지 않습니다. 그 날이 주말이나 휴일이면 다음 생산일부터 잡습니다. 저장하면 희망 납기, 예상 납기, 생산 시작·완료만 덮어쓰고 이전 날짜는 남기지 않습니다.</p>
            {scheduleResult && typeof scheduleResult !== "string" ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary-soft px-3 py-2.5">
                <div>
                  <p className="text-xs font-semibold text-primary">가장 빠른 납기</p>
                  <p className="mt-0.5 text-base font-bold">{labelDate(scheduleResult.earliestDueDate)}</p>
                </div>
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1 rounded-lg bg-white px-3 text-sm font-semibold text-primary disabled:text-muted"
                  disabled={due === scheduleResult.earliestDueDate}
                  onClick={() => { setDue(scheduleResult.earliestDueDate); setDueOpen(false); }}
                >
                  {due === scheduleResult.earliestDueDate ? <><Check size={15} />선택됨</> : "이 날짜로 선택"}
                </button>
              </div>
            ) : (
              <p className="mt-3 text-sm font-semibold text-warning">{typeof scheduleResult === "string" ? scheduleResult : "납기를 계산하지 못했습니다."}</p>
            )}
            <div className="relative mt-4 max-w-sm" ref={dueRef}>
              <span className="text-sm font-semibold">희망 납기</span>
              <button
                type="button"
                className={cn("mt-1 flex h-11 w-full items-center gap-2 rounded-lg border bg-white px-3 text-left text-sm", dueTooSoon ? "border-warning" : "border-line")}
                onClick={() => setDueOpen((value) => !value)}
              >
                <Calendar size={16} className="shrink-0 text-muted" />
                <span className={due ? "font-semibold" : "text-muted"}>{due ? labelDate(due) : "날짜 선택"}</span>
              </button>
              {dueOpen ? (
                <div className="absolute z-20 mt-1 w-full min-w-[280px]">
                  <DueDateCalendar
                    value={due}
                    earliest={earliest}
                    ready={quantityForPreview > 0}
                    emptyHint="수량을 확인하면 색이 표시됩니다."
                    onChange={(iso) => { setDue(iso); setDueOpen(false); }}
                  />
                </div>
              ) : null}
              <p className={`mt-1 text-xs ${dueTooSoon ? "font-semibold text-warning" : "text-muted"}`}>
                {dueTooSoon && earliest ? `이 날은 불가합니다. 가장 빠른 날은 ${labelDate(earliest)}입니다.` : duePlan ? "가능한 납기입니다." : "달력의 하늘색 날짜를 고르세요."}
              </p>
            </div>
            {duePlan ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg bg-canvas px-3 py-2">
                  <p className="text-xs text-muted">생산 시작</p>
                  <p className="mt-1 text-sm font-semibold">{labelDate(duePlan.plannedStartDate)}</p>
                </div>
                <div className="rounded-lg bg-canvas px-3 py-2">
                  <p className="text-xs text-muted">생산 완료</p>
                  <p className="mt-1 text-sm font-semibold">{labelDate(duePlan.plannedEndDate)}</p>
                </div>
                <div className="rounded-lg bg-canvas px-3 py-2">
                  <p className="text-xs text-muted">희망 납기</p>
                  <p className="mt-1 text-sm font-semibold">{labelDate(due)}</p>
                </div>
              </div>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button tone="ghost" onClick={() => { setOpen(false); setDueOpen(false); }}>닫기</Button>
              <Button
                disabled={!duePlan || (due === quote.requestedDueDate && due === quote.estimatedDueDate && duePlan.plannedStartDate === quote.plannedStartDate && duePlan.plannedEndDate === quote.plannedEndDate)}
                onClick={() => act(() => recalculateQuotation(quote.id, due), "납기를 다시 계산해 저장했습니다.")}
              >이 날짜로 저장</Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

function labelDate(iso: string): string {
  const date = parseISO(iso);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}.${month}.${day} (${weekdays[date.getDay()]})`;
}

function supplyOf(line: { quantity: number; unitPrice: number }, vatIncluded: boolean) {
  const amount = lineAmount(line, vatIncluded);
  return vatIncluded ? Math.round(amount / 1.1) : line.quantity * line.unitPrice;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 break-all font-medium">{value}</dd>
    </div>
  );
}

function Money({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
