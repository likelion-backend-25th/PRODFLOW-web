import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { DueDateCalendar } from "@/components/DueDateCalendar.tsx";
import { Button, Card } from "@/components/ui.tsx";
import { cn } from "@/lib/cn.ts";
import { readApiErrorMessage } from "@/lib/apiClient.ts";
import { addDays, todayISO } from "@/lib/dates.ts";
import { useDb } from "@/lib/db.ts";
import { depositTarget, digitsOnly, formatWon, lineAmount, orderTotal } from "@/lib/money.ts";
import { getClient } from "@/lib/clientApi.ts";
import { createCustomerOrder } from "@/lib/orderApi.ts";
import { getQuotation, previewQuotationSchedule, type QuotationDetail, type QuotationSchedulePreview } from "@/lib/quotationApi.ts";
import { clientFullAddress, createOrder } from "@/lib/workflow.ts";
import { useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";
import type { NotifyChannel, Quotation } from "@/types/domain.ts";

export function OrderRegisterPage() {
  const db = useDb();
  const navigate = useNavigate();
  const actor = useAuthStore((state) => state.user);
  const show = useToastStore((state) => state.show);
  const [params] = useSearchParams();
  const quotationKey = params.get("quotationId") ?? "";
  const localQuote = db.quotations.find((item) => item.id === quotationKey);
  const [remote, setRemote] = useState<QuotationDetail | null>(null);
  const [remoteError, setRemoteError] = useState("");
  const [companyParts, setCompanyParts] = useState<{ zipcode: string; roadAddress: string; detailAddress: string } | null>(null);
  useEffect(() => {
    if (!quotationKey || localQuote) return;
    const id = Number(quotationKey);
    if (!Number.isInteger(id) || id <= 0) return;
    let ignore = false;
    getQuotation(id).then((detail) => {
      if (!ignore) setRemote(detail);
    }).catch((error: unknown) => {
      if (!ignore) setRemoteError(readApiErrorMessage(error));
    });
    return () => {
      ignore = true;
    };
  }, [localQuote, quotationKey]);
  useEffect(() => {
    const clientId = remote?.clientId;
    if (!clientId) return;
    let ignore = false;
    getClient(clientId).then((detail) => {
      if (!ignore) setCompanyParts({ zipcode: detail.zipcode ?? "", roadAddress: detail.roadAddress ?? "", detailAddress: detail.detailAddress ?? "" });
    }).catch(() => {
      if (!ignore) setCompanyParts(null);
    });
    return () => {
      ignore = true;
    };
  }, [remote?.clientId]);
  const quote: Quotation | null = localQuote ?? (remote?.status === "APPROVED" ? {
    id: String(remote.id),
    quotationNo: remote.quotationNo,
    clientId: String(remote.clientId),
    userId: String(remote.userId),
    lines: remote.items.map((item) => ({
      id: String(item.id),
      productId: String(item.productId),
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
    requestedDueDate: remote.requestedDueDate.slice(0, 10),
    estimatedDueDate: remote.estimatedDueDate.slice(0, 10),
    plannedStartDate: remote.plannedStartDate?.slice(0, 10) ?? "",
    plannedEndDate: remote.plannedEndDate?.slice(0, 10) ?? "",
    validUntil: remote.validUntil.slice(0, 10),
    status: remote.status,
    vatIncluded: remote.vatIncluded,
    createdAt: remote.createdAt,
    updatedAt: remote.updatedAt,
  } : null);
  const localClient = db.clients.find((item) => item.id === quote?.clientId);
  const registeredAddress = localClient
    ? { zipcode: localClient.zipcode, roadAddress: localClient.roadAddress, detailAddress: localClient.detailAddress }
    : companyParts;
  const client = localClient ?? (remote && quote ? {
    companyName: remote.clientCompany,
    contactName: remote.clientName,
    contactMobile: remote.clientPhone,
    zipcode: registeredAddress?.zipcode ?? "",
    roadAddress: registeredAddress?.roadAddress ?? "",
    detailAddress: registeredAddress?.detailAddress ?? "",
  } : undefined);
  const companyAddress = registeredAddress ? clientFullAddress(registeredAddress) : "";
  useEffect(() => {
    if (!remote || localClient) return;
    setReceiverName((current) => current || remote.clientName || "");
    setReceiverPhone((current) => current || remote.clientPhone || "");
  }, [localClient, remote]);
  const productName = (lineId: string, productId: string) => {
    const stored = db.products.find((item) => item.id === productId);
    if (stored) return { productName: stored.productName, modelName: stored.modelName };
    const item = remote?.items.find((row) => String(row.id) === lineId);
    return { productName: item?.productName ?? "품목", modelName: item?.deviceName ?? "" };
  };
  const [useCompanyAddress, setUseCompanyAddress] = useState(false);
  const [postalCode, setPostalCode] = useState("");
  const [roadAddress, setRoadAddress] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const registeredZip = registeredAddress?.zipcode ?? "";
  const registeredRoad = registeredAddress?.roadAddress ?? "";
  const registeredDetail = registeredAddress?.detailAddress ?? "";
  useEffect(() => {
    if (!useCompanyAddress || (!registeredZip && !registeredRoad && !registeredDetail)) return;
    setPostalCode(registeredZip);
    setRoadAddress(registeredRoad);
    setAddressDetail(registeredDetail);
    setShippingAddress(clientFullAddress({ zipcode: registeredZip, roadAddress: registeredRoad, detailAddress: registeredDetail }));
  }, [registeredDetail, registeredRoad, registeredZip, useCompanyAddress]);
  const [receiverName, setReceiverName] = useState(client?.contactName ?? "");
  const [receiverPhone, setReceiverPhone] = useState(client?.contactMobile ?? "");
  const [notifyChannel, setNotifyChannel] = useState<NotifyChannel>("SMS");
  const [memo, setMemo] = useState("");
  const depositDueDate = addDays(todayISO(), 3);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [chosenDue, setChosenDue] = useState("");
  const [dueOpen, setDueOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{
    key: string;
    result: QuotationSchedulePreview | null;
    error: string;
  } | null>(null);
  // 같은 조건의 응답만 사용해 수량·납기 변경 직후 이전 일정으로 등록하지 않는다.
  const previewKey = quote?.status === "APPROVED" ? JSON.stringify({
    quotationId: quote.id,
    estimatedDueDate: quote.estimatedDueDate,
    chosenDue,
    depositDueDate,
    items: quote.lines.map((line) => ({
      productId: Number(line.productId),
      quantity: quantities[line.id] ?? line.quantity,
    })),
  }) : "";
  const scheduleLoading = Boolean(previewKey) && preview?.key !== previewKey;
  const scheduleError = preview?.key === previewKey ? preview.error : "";
  const schedule = preview?.key === previewKey ? preview.result : null;

  useEffect(() => {
    if (!previewKey) return;
    const input: {
      estimatedDueDate: string;
      chosenDue: string;
      items: Array<{ productId: number; quantity: number }>;
    } = JSON.parse(previewKey);
    let ignore = false;
    const timer = window.setTimeout(async () => {
      try {
        if (input.items.some((item) => !Number.isInteger(item.productId) || item.productId <= 0
          || !Number.isInteger(item.quantity) || item.quantity < 100)) {
          throw new Error("서버에 등록된 품목과 품목별 100개 이상의 수량으로 납기를 계산할 수 있습니다.");
        }
        const initial = await previewQuotationSchedule({
          items: input.items,
          requestedDueDate: input.estimatedDueDate,
        });
        if (ignore) return;
        let result = initial;
        if (input.estimatedDueDate < initial.earliestDueDate) {
          result = await previewQuotationSchedule({
            items: input.items,
            requestedDueDate: input.chosenDue >= initial.earliestDueDate
              ? input.chosenDue : initial.earliestDueDate,
          });
        }
        if (ignore) return;
        if (!result.feasible || !result.plannedStartDate || !result.plannedEndDate) {
          throw new Error(`선택한 납기를 지킬 수 없습니다. 가능한 가장 빠른 납기일: ${result.earliestDueDate}`);
        }
        setPreview({ key: previewKey, result, error: "" });
      } catch (reason: unknown) {
        if (!ignore) setPreview({
          key: previewKey,
          result: null,
          error: reason instanceof Error && !("isAxiosError" in reason)
            ? reason.message : readApiErrorMessage(reason),
        });
      }
    }, 250);
    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [previewKey]);

  const selection = quote && schedule ? {
    slipped: quote.estimatedDueDate < schedule.earliestDueDate,
    registerDue: schedule.requestedDueDate ?? schedule.earliestDueDate,
    plannedStartDate: schedule.plannedStartDate,
    plannedEndDate: schedule.plannedEndDate,
  } : null;

  if (!quote && quotationKey && !localQuote && !remote && !remoteError) return <p>수주 등록 화면을 불러오는 중입니다.</p>;
  if (!quote || quote.status !== "APPROVED") {
    return (
      <Card>
        <h1 className="text-xl font-semibold">수주 등록</h1>
        <p className="mt-2 text-sm text-muted">승인된 견적에서만 수주를 등록합니다. 배송지는 이 화면에서 입력합니다.</p>
        <Link to="/quotations" className="mt-4 inline-flex h-10 items-center rounded-lg bg-primary px-4 font-semibold text-white">견적 목록</Link>
      </Card>
    );
  }

  const slipped = selection?.slipped ?? false;
  const registerDue = selection?.registerDue ?? "";
  const orderLines = quote.lines.map((line) => ({ ...line, quantity: quantities[line.id] ?? line.quantity }));
  const reduced = orderLines.some((line) => line.quantity < (quote.lines.find((item) => item.id === line.id)?.quantity ?? line.quantity));
  const orderAmount = orderTotal(orderLines, quote.vatIncluded);
  const needsConsent = reduced || slipped;
  const existing = db.orders.find((order) => order.quotationId === quote.id && order.status !== "CANCELLED")
    ?? (remote?.customerOrderId != null && remote.orderNo && remote.orderNo !== "-"
      ? { id: String(remote.customerOrderId), orderNo: remote.orderNo }
      : undefined);
  if (existing) {
    return (
      <Card>
        <p>이 견적은 이미 수주 {existing.orderNo}로 등록되어 있습니다.</p>
        <Link to={`/orders/${existing.id}`} className="mt-3 inline-flex text-primary">수주 상세</Link>
      </Card>
    );
  }

  async function register() {
    if (!actor || !quote || saving) return;
    if (useCompanyAddress && !companyAddress) {
      setError("등록된 회사 주소가 없습니다. 체크를 해제하고 배송지를 직접 입력하세요.");
      return;
    }
    if (!useCompanyAddress && (!postalCode.trim() || !roadAddress.trim() || !addressDetail.trim())) {
      setError("배송지를 입력하세요.");
      return;
    }
    if (useCompanyAddress && !shippingAddress.trim()) {
      setError("배송지를 입력하세요.");
      return;
    }
    if (!receiverName.trim()) {
      setError("수신자를 입력하세요.");
      return;
    }
    if (digitsOnly(receiverPhone).length < 9) {
      setError("수령 연락처를 확인하세요.");
      return;
    }
    if (!schedule || !registerDue) {
      setError(scheduleLoading ? "납기를 계산 중입니다. 잠시 기다려 주세요." : scheduleError || "납기를 계산하지 못했습니다.");
      return;
    }
    if (needsConsent && !agreed) {
      setError("변경된 수량이나 납기에 거래처가 동의한 뒤에 등록합니다.");
      return;
    }
    const quotationId = Number(quote.id);
    const items = orderLines.map((line) => ({ quotationItemId: Number(line.id), quantity: line.quantity }));
    const serverQuote = Number.isInteger(quotationId) && quotationId > 0 && items.every((item) => Number.isInteger(item.quotationItemId) && item.quotationItemId > 0);
    if (!serverQuote) {
      try {
        const order = createOrder({
          quotationId: quote.id,
          clientId: quote.clientId,
          lines: orderLines.map(({ productId, quantity: lineQuantity, unitPrice }) => ({ productId, quantity: lineQuantity, unitPrice })),
          requestedDueDate: quote.requestedDueDate,
          dueDate: registerDue,
          depositDueDate,
          plannedStartDate: selection?.plannedStartDate ?? undefined,
          plannedEndDate: selection?.plannedEndDate ?? undefined,
          shippingAddress,
          receiverName,
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
      return;
    }
    setSaving(true);
    try {
      const order = await createCustomerOrder({
        quotationId,
        items,
        dueDate: registerDue,
        useCompanyAddress,
        shippingAddress: { zipcode: postalCode.trim(), roadAddress: roadAddress.trim(), detailAddress: addressDetail.trim() },
        receiverName: receiverName.trim(),
        receiverPhone: receiverPhone.trim(),
        notifyChannel,
        memo,
      });
      show(`${order.orderNo} 수주를 등록했습니다. 확정은 예정, 진행은 대기입니다.`);
      navigate(`/orders/${order.id}`);
    } catch (reason: unknown) {
      setError(readApiErrorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">수주 등록</h1>
        <p className="mt-1 text-sm text-muted">{quote.quotationNo}의 단가는 그대로입니다. 납기가 늦으면 이 화면에서 수량만 줄여 다시 계산합니다. 견적서의 수량은 바꾸지 않습니다.</p>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
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
                  const product = productName(line.id, line.productId);
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
                      <td className="text-right font-semibold tabular-nums">{formatWon(lineAmount({ ...line, quantity: nextQuantity }, quote.vatIncluded))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">품목을 빼거나 단가를 바꾸려면 견적을 새로 작성합니다. 화면을 닫으면 수주는 만들어지지 않습니다.</p>
          <div className={`mt-3 rounded-lg px-3 py-2 text-sm leading-5 ${needsConsent ? "bg-warning-soft text-warning" : "bg-primary-soft text-primary"}`}>
            {scheduleLoading ? (
              "서버에서 생산 일정과 납기를 계산하고 있습니다."
            ) : scheduleError ? (
              scheduleError
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={useCompanyAddress}
              onChange={(event) => {
                const checked = event.target.checked;
                setUseCompanyAddress(checked);
                setError("");
                if (!checked) {
                  setPostalCode("");
                  setRoadAddress("");
                  setAddressDetail("");
                  setShippingAddress("");
                  return;
                }
                const postal = client?.zipcode ?? "";
                const road = client?.roadAddress ?? "";
                const detail = client?.detailAddress ?? "";
                setPostalCode(postal);
                setRoadAddress(road);
                setAddressDetail(detail);
                setShippingAddress([postal, road, detail].map((part) => part.trim()).filter(Boolean).join(" "));
              }}
            />
            등록된 회사 주소로 배송
          </label>
          <div className="space-y-2">
            <div className="flex gap-2">
              <input readOnly value={postalCode} placeholder="우편번호" className={`h-10 w-28 rounded-lg border border-line px-3 text-sm ${useCompanyAddress ? "bg-canvas" : "bg-white"}`} />
              <Button
                tone="ghost"
                className="shrink-0"
                disabled={useCompanyAddress}
                onClick={() => {
                  if (!window.daum?.Postcode) {
                    show("우편번호 서비스를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
                    return;
                  }
                  new window.daum.Postcode({
                    oncomplete: (data) => {
                      const postal = data.zonecode;
                      const road = data.roadAddress || data.address;
                      setPostalCode(postal);
                      setRoadAddress(road);
                      setShippingAddress([postal, road, addressDetail].map((part) => part.trim()).filter(Boolean).join(" "));
                      setError("");
                    },
                  }).open();
                }}
              >
                우편번호 찾기
              </Button>
            </div>
            <input readOnly value={roadAddress} placeholder="우편번호 찾기로 도로명 주소를 선택하세요" className={`h-10 w-full rounded-lg border border-line px-3 text-sm ${useCompanyAddress ? "bg-canvas" : "bg-white"}`} />
            <input
              readOnly={useCompanyAddress}
              value={addressDetail}
              placeholder="건물명, 층, 호수 등 상세 주소"
              className={`h-10 w-full rounded-lg border border-line px-3 text-sm ${useCompanyAddress ? "bg-canvas" : "bg-white"}`}
              onChange={(event) => {
                const detail = event.target.value;
                setAddressDetail(detail);
                setShippingAddress([postalCode, roadAddress, detail].map((part) => part.trim()).filter(Boolean).join(" "));
              }}
            />
          </div>
          <label className="block text-sm">수신자
            <input className="mt-1 h-10 w-full rounded-lg border border-line px-3" value={receiverName} onChange={(event) => setReceiverName(event.target.value)} placeholder="물건을 받는 사람" />
            <span className="mt-1 block text-xs text-muted">거래처 담당자와 다른 사람이 받아도 됩니다.</span>
          </label>
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
        </Card>
      </div>
      <Card className="space-y-5">
        <p className="text-sm leading-6 text-muted">등록 직후 확정 상태는 예정, 진행 상태는 대기입니다. 작업지시서는 계약금 확인 후에 만들어집니다.</p>
        <section>
          <h2 className="text-sm font-semibold">일정</h2>
          <dl className="mt-2 space-y-2.5 text-sm">
            <SummaryRow label="생산 시작" value={selection?.plannedStartDate ?? "-"} />
            <SummaryRow label="생산 완료" value={selection?.plannedEndDate ?? "-"} />
            <SummaryRow label="등록할 납기" value={registerDue || "-"} strong />
          </dl>
        </section>
        <section>
          <h2 className="text-sm font-semibold">금액</h2>
          <dl className="mt-2 space-y-2.5 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted">견적 총액</dt><dd className="tabular-nums">{formatWon(orderTotal(quote.lines, quote.vatIncluded))}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">수주 총액</dt><dd className="font-semibold tabular-nums">{formatWon(orderAmount)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">계약금 50%</dt><dd className="tabular-nums">{formatWon(depositTarget(orderAmount))}</dd></div>
          </dl>
        </section>
        <section className="rounded-lg bg-canvas px-3 py-3">
          <p className="text-xs text-muted">계약금 마감</p>
          <p className="mt-1 text-sm font-semibold">{depositDueDate}</p>
          <p className="mt-1 text-xs leading-5 text-muted">등록일부터 3일입니다. 이 날까지 계약금이 전혀 없으면 다음 날 대기 수주가 취소됩니다.</p>
        </section>
        {needsConsent ? (
          <label className="flex items-start gap-2 text-sm leading-6">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--color-primary)]" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
            {reduced && slipped
              ? `거래처가 줄어든 수량과 ${registerDue} 납기에 동의했습니다.`
              : reduced
                ? "거래처가 줄어든 수량에 동의했습니다. 단가는 그대로입니다."
                : `거래처가 ${registerDue} 납기에 동의했습니다.`}
          </label>
        ) : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button className="w-full" disabled={!schedule || scheduleLoading || (needsConsent && !agreed) || saving} onClick={() => void register()}>수주 등록</Button>
      </Card>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={strong ? "font-semibold tabular-nums" : "tabular-nums"}>{value}</dd>
    </div>
  );
}
