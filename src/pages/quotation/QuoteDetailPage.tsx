import { useState } from "react";
import { Link, useParams } from "react-router";
import { Badge, Button } from "@/components/ui.tsx";
import { todayISO } from "@/lib/dates.ts";
import { useDb } from "@/lib/db.ts";
import { quotationStatusLabel, quotationStatusTone } from "@/lib/labels.ts";
import { depositTarget, formatWon, lineAmount, orderQuantity, orderTotal } from "@/lib/money.ts";
import { recalculateQuotation, setQuotationStatus } from "@/lib/workflow.ts";
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
  if (!quote) return <p>견적서를 찾을 수 없습니다.</p>;

  const client = db.clients.find((item) => item.id === quote.clientId);
  const author = db.users.find((item) => item.id === quote.userId);
  const order = db.orders.find((item) => item.quotationId === quote.id && item.status !== "CANCELLED");
  const total = orderTotal(quote.lines);
  const supply = quote.lines.reduce((sum, line) => sum + supplyOf(line), 0);
  const active = quote.plans.find((plan) => plan.status === "ACTIVE");
  const history = quote.plans.filter((plan) => plan.status === "RECALCULATED");
  const canChange = quote.status === "SENT" && canManageOrders(role);
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
            <dd className="mt-1">{client?.address || "-"}</dd>
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
                    <td className="px-5 text-right font-semibold tabular-nums">{formatWon(supplyOf(line))}</td>
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
            {canChange ? <Button tone="ghost" onClick={() => { setDue(quote.requestedDueDate); setOpen(true); }}>납기 재산정</Button> : null}
            {canChange && user ? <Button tone="ghost" onClick={() => act(() => setQuotationStatus(quote.id, "REJECTED", user), "견적을 거절했습니다.")}>거절</Button> : null}
            {canChange && user ? <Button tone="ghost" className="text-danger" onClick={() => act(() => setQuotationStatus(quote.id, "CANCELLED", user), "견적을 취소했습니다.")}>취소</Button> : null}
          </div>
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
          <Field label="희망 납기" value={quote.requestedDueDate} />
          <Field label="예상 납기" value={quote.estimatedDueDate} />
          <Field label="유효기간" value={quote.validUntil} />
          <Field label="생산 시작" value={active?.plannedStartDate ?? "-"} />
          <Field label="생산 완료" value={active?.plannedEndDate ?? "-"} />
          <Field label="작성" value={author?.name ?? "-"} />
        </dl>
        <p className="mt-4 text-sm text-muted">이 일정은 견적을 낸 날의 참고입니다. 자리를 잡아 두지 않으며, 수주 등록 때 다시 계산합니다.</p>
        {history.length > 0 ? (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted">이전 납기 {history.length}건</summary>
            <ul className="mt-2 space-y-1 text-muted">
              {history.map((plan) => <li key={plan.id}>{plan.estimatedDueDate} · {plan.plannedStartDate} ~ {plan.plannedEndDate}</li>)}
            </ul>
          </details>
        ) : null}
      </section>

      {open ? (
        <div className="fixed inset-0 z-30 grid place-items-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5">
            <h2 className="text-lg font-semibold">납기 재산정</h2>
            <p className="mt-1 text-sm text-muted">예상 납기와 임시 계획만 바꿉니다. 품목과 단가는 그대로입니다.</p>
            <label className="mt-4 block text-sm">희망 납기
              <input type="date" className="mt-1 h-10 w-full rounded-lg border border-line px-3" value={due} onChange={(event) => setDue(event.target.value)} />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Button tone="ghost" onClick={() => setOpen(false)}>닫기</Button>
              <Button onClick={() => act(() => recalculateQuotation(quote.id, due), "임시 계획을 재산정했습니다.")}>재산정</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function supplyOf(line: { quantity: number; unitPrice: number; vatIncluded: boolean }) {
  const amount = lineAmount(line);
  return line.vatIncluded ? Math.round(amount / 1.1) : line.quantity * line.unitPrice;
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
