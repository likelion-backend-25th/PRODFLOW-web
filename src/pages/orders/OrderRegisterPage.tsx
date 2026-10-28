import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AddressPicker } from "@/components/AddressPicker.tsx";
import { DueDateCalendar } from "@/components/DueDateCalendar.tsx";
import { Button, Card } from "@/components/ui.tsx";
import { cn } from "@/lib/cn.ts";
import { todayISO } from "@/lib/dates.ts";
import { useDb } from "@/lib/db.ts";
import { depositTarget, digitsOnly, formatWon, lineAmount, orderTotal } from "@/lib/money.ts";
import { createOrder, previewDuePlan, previewSchedule } from "@/lib/workflow.ts";
import { useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";
import type { NotifyChannel } from "@/types/domain.ts";

export function OrderRegisterPage() {
  const db = useDb();
  const navigate = useNavigate();
  const actor = useAuthStore((state) => state.user);
  const show = useToastStore((state) => state.show);
  const [params] = useSearchParams();
  const quote = db.quotations.find((item) => item.id === params.get("quotationId"));
  const client = db.clients.find((item) => item.id === quote?.clientId);
  const [shippingAddress, setShippingAddress] = useState("");
  const [receiverPhone, setReceiverPhone] = useState(client?.contactMobile ?? "");
  const [notifyChannel, setNotifyChannel] = useState<NotifyChannel>("SMS");
  const [memo, setMemo] = useState("");
  const [depositDueDate, setDepositDueDate] = useState(todayISO());
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [chosenDue, setChosenDue] = useState("");
  const [dueOpen, setDueOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const quantity = quote?.lines.reduce((sum, line) => sum + (quantities[line.id] ?? line.quantity), 0) ?? 0;
  const current = useMemo(() => {
    if (!quote || quote.status !== "APPROVED" || quantity <= 0) return null;
    try {
      return previewSchedule(quantity);
    } catch (reason: unknown) {
      return reason instanceof Error ? reason.message : "납기를 계산하지 못했습니다.";
    }
  }, [db, quantity, quote]);
  const selection = useMemo(() => {
    if (!quote || !current || typeof current === "string") return null;
    const slipped = quote.estimatedDueDate < current.earliestDueDate;
    const registerDue = slipped ? (chosenDue >= current.earliestDueDate ? chosenDue : current.earliestDueDate) : quote.estimatedDueDate;
    if (registerDue <= current.earliestDueDate) {
      return { slipped, registerDue, earliest: current.earliestDueDate, plannedStartDate: current.plannedStartDate, plannedEndDate: current.plannedEndDate };
    }
    try {
      const plan = previewDuePlan(quantity, registerDue);
      return { slipped, registerDue, earliest: current.earliestDueDate, plannedStartDate: plan.plannedStartDate, plannedEndDate: plan.plannedEndDate };
    } catch {
      return { slipped, registerDue: current.earliestDueDate, earliest: current.earliestDueDate, plannedStartDate: current.plannedStartDate, plannedEndDate: current.plannedEndDate };
    }
  }, [chosenDue, current, db, quantity, quote]);

  if (!quote || quote.status !== "APPROVED") {
    return (
      <Card>
        <h1 className="text-xl font-semibold">수주 등록</h1>
        <p className="mt-2 text-sm text-muted">승인된 견적에서만 수주를 등록합니다. 배송지는 이 화면에서 입력합니다.</p>
        <Link to="/quotes" className="mt-4 inline-flex h-10 items-center rounded-lg bg-primary px-4 font-semibold text-white">견적 목록</Link>
      </Card>
    );
  }

  const schedule = current && typeof current !== "string" ? current : null;
  const slipped = selection?.slipped ?? false;
  const registerDue = selection?.registerDue ?? "";
  const orderLines = quote.lines.map((line) => ({ ...line, quantity: quantities[line.id] ?? line.quantity }));
  const reduced = orderLines.some((line) => line.quantity < (quote.lines.find((item) => item.id === line.id)?.quantity ?? line.quantity));
  const orderAmount = orderTotal(orderLines);
  const needsConsent = reduced || slipped;
  const existing = db.orders.find((order) => order.quotationId === quote.id && order.status !== "CANCELLED");
  if (existing) {
    return (
      <Card>
        <p>이 견적은 이미 수주 {existing.orderNo}로 등록되어 있습니다.</p>
        <Link to={`/orders/${existing.id}`} className="mt-3 inline-flex text-primary">수주 상세</Link>
      </Card>
    );
  }

  function register() {
    if (!actor || !quote) return;
    if (!shippingAddress.trim()) {
      setError("배송지를 입력하세요.");
      return;
    }
    if (digitsOnly(receiverPhone).length < 9) {
      setError("수령 연락처를 확인하세요.");
      return;
    }
    if (!schedule || !registerDue) {
      setError(typeof current === "string" ? current : "납기를 계산하지 못했습니다.");
      return;
    }
    if (needsConsent && !agreed) {
      setError("변경된 수량이나 납기에 거래처가 동의한 뒤에 등록합니다.");
      return;
    }
    try {
      const order = createOrder({
        quotationId: quote.id,
        clientId: quote.clientId,
        lines: orderLines.map(({ productId, quantity: lineQuantity, unitPrice, vatIncluded }) => ({ productId, quantity: lineQuantity, unitPrice, vatIncluded })),
        requestedDueDate: quote.requestedDueDate,
        dueDate: registerDue,
        depositDueDate,
        plannedStartDate: selection?.plannedStartDate,
        plannedEndDate: selection?.plannedEndDate,
        shippingAddress,
        receiverPhone,
        notifyChannel,
        memo,
        actor,
      });
      show(`${order.orderNo} 수주를 등록했습니다. 확정은 예정, 진행은 대기입니다.`);
      navigate(`/orders/${order.id}`);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "등록하지 못했습니다.");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">수주 등록</h1>
        <p className="mt-1 text-sm text-muted">{quote.quotationNo}의 단가는 그대로입니다. 납기가 늦으면 이 화면에서 수량만 줄여 다시 계산합니다. 견적서의 수량은 바꾸지 않습니다.</p>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">{client?.companyName}</h2>
            <p className="text-sm text-muted">희망 납기 {quote.requestedDueDate} · 견적 예상 납기 {quote.estimatedDueDate}</p>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] table-fixed text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="w-[34%] py-2 font-medium">품목</th>
                  <th className="w-[14%] py-2 font-medium">견적 수량</th>
                  <th className="w-[18%] py-2 font-medium">수주 수량</th>
                  <th className="w-[16%] py-2 font-medium">단가</th>
                  <th className="w-[18%] py-2 text-right font-medium">금액</th>
                </tr>
              </thead>
              <tbody>
                {quote.lines.map((line) => {
                  const product = db.products.find((item) => item.id === line.productId);
                  const nextQuantity = quantities[line.id] ?? line.quantity;
                  return (
                    <tr key={line.id} className="border-t border-line align-middle">
                      <td className="py-3 pr-3">
                        <span className="block font-semibold">{product?.productName ?? "품목"}</span>
                        <span className="block text-xs text-muted">{product?.modelName}</span>
                      </td>
                      <td>{line.quantity.toLocaleString("ko-KR")}개</td>
                      <td>
                        <input
                          aria-label={`${product?.productName ?? "품목"} 수주 수량`}
                          type="number"
                          min={1}
                          max={line.quantity}
                          className="h-9 w-28 rounded-lg border border-line px-2 text-right"
                          value={nextQuantity}
                          onChange={(event) => {
                            const parsed = Number(event.target.value);
                            const next = Math.min(line.quantity, Math.max(1, Number.isFinite(parsed) ? Math.floor(parsed) : 1));
                            setQuantities((currentQuantities) => ({ ...currentQuantities, [line.id]: next }));
                            setAgreed(false);
                          }}
                        />
                      </td>
                      <td className="tabular-nums">{formatWon(line.unitPrice)}</td>
                      <td className="text-right font-semibold tabular-nums">{formatWon(lineAmount({ ...line, quantity: nextQuantity }))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">품목을 빼거나 단가를 바꾸려면 견적을 새로 작성합니다. 화면을 닫으면 수주는 만들어지지 않습니다.</p>
          <div className={`mt-3 rounded-lg px-3 py-2 text-sm leading-5 ${needsConsent ? "bg-warning-soft text-warning" : "bg-primary-soft text-primary"}`}>
            {typeof current === "string" ? (
              current
            ) : reduced && !slipped ? (
              <>수량을 줄이면 견적 예상 납기 {quote.estimatedDueDate}이 가능합니다. 거래처가 이 수량에 동의한 뒤에 등록합니다.</>
            ) : slipped ? (
              <>견적 예상 납기 {quote.estimatedDueDate}은 이 수량으로 어렵습니다. {schedule?.earliestDueDate}부터 고를 수 있습니다. 수량을 더 줄이거나, 거래처가 받은 날짜를 선택한 뒤에 등록합니다.</>
            ) : (
              <>견적 수량과 예상 납기 {quote.estimatedDueDate}이 지금도 가능합니다. 거래처에 다시 확인하지 않고 등록합니다.</>
            )}
          </div>
          {slipped && schedule ? (
            <div className="relative mt-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={cn("inline-flex h-10 items-center rounded-lg border bg-white px-3 text-sm font-semibold", dueOpen ? "border-primary" : "border-line")}
                  onClick={() => setDueOpen((open) => !open)}
                >
                  납기 {registerDue}
                </button>
                {registerDue !== schedule.earliestDueDate ? (
                  <button
                    type="button"
                    className="text-sm font-semibold text-primary"
                    onClick={() => { setChosenDue(schedule.earliestDueDate); setAgreed(false); setDueOpen(false); }}
                  >
                    가장 빠른 날로
                  </button>
                ) : null}
              </div>
              {dueOpen ? (
                <div className="absolute z-20 mt-1 w-[320px]">
                  <DueDateCalendar
                    value={registerDue}
                    earliest={schedule.earliestDueDate}
                    ready
                    onChange={(iso) => { setChosenDue(iso); setAgreed(false); setDueOpen(false); }}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>
        <Card className="space-y-3">
          <h2 className="font-semibold">배송</h2>
          <AddressPicker label="배송지" value={shippingAddress} onChange={setShippingAddress} />
          <label className="block text-sm">수령 연락처
            <input className="mt-1 h-10 w-full rounded-lg border border-line px-3" value={receiverPhone} onChange={(event) => setReceiverPhone(event.target.value)} />
          </label>
          <label className="block text-sm">알림 채널
            <select className="mt-1 h-10 w-full rounded-lg border border-line px-3" value={notifyChannel} onChange={(event) => setNotifyChannel(event.target.value as NotifyChannel)}>
              <option value="SMS">SMS</option>
              <option value="EMAIL">이메일</option>
            </select>
          </label>
          <label className="block text-sm">업무 메모
            <textarea className="mt-1 min-h-20 w-full rounded-lg border border-line px-3 py-2" value={memo} maxLength={200} onChange={(event) => setMemo(event.target.value)} />
          </label>
          <label className="block text-sm">계약금 입금 마감
            <input type="date" className="mt-1 h-10 w-full rounded-lg border border-line px-3" value={depositDueDate} onChange={(event) => setDepositDueDate(event.target.value)} />
          </label>
        </Card>
      </div>
      <Card>
        <p className="text-sm">등록 직후 확정 상태는 예정, 진행 상태는 대기입니다. 작업지시서는 계약금 확인 후에 만들어집니다.</p>
        <p className="mt-2 text-sm text-muted">지금 계산한 생산 예정 {selection?.plannedStartDate ?? "-"} ~ {selection?.plannedEndDate ?? "-"}</p>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-muted">견적 총액</dt><dd className="tabular-nums">{formatWon(orderTotal(quote.lines))}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">수주 총액</dt><dd className="font-semibold tabular-nums">{formatWon(orderAmount)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">계약금 50%</dt><dd className="tabular-nums">{formatWon(depositTarget(orderAmount))}</dd></div>
        </dl>
        <p className="mt-3 text-sm">등록할 예상 납기 <span className="font-semibold">{registerDue || "-"}</span></p>
        <div className="mt-3 min-h-16">
          {needsConsent ? (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--color-primary)]" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
              {reduced && slipped
                ? `거래처가 줄어든 수량과 ${registerDue} 납기에 동의했습니다.`
                : reduced
                  ? "거래처가 줄어든 수량에 동의했습니다. 단가는 그대로입니다."
                  : `거래처가 ${registerDue} 납기에 동의했습니다.`}
            </label>
          ) : null}
        </div>
        <p className="min-h-5 text-sm text-danger">{error}</p>
        <Button className="mt-4 w-full" disabled={needsConsent && !agreed} onClick={register}>수주 등록</Button>
      </Card>
      </div>
    </div>
  );
}
