import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, Check, Pencil } from "lucide-react";
import { AddressPicker } from "@/components/AddressPicker.tsx";
import { Badge, Button, Card, TextField } from "@/components/ui.tsx";
import { readApiErrorMessage } from "@/lib/apiClient.ts";
import { localDateTime, todayISO } from "@/lib/dates.ts";
import { delayTone } from "@/lib/delay.ts";
import { orderStatusLabel, orderStatusTone, paymentStatusLabel, paymentTone, registrationLabel, registrationTone, workOrderStatusLabel } from "@/lib/labels.ts";
import { depositTarget, formatWon, lineAmount, orderTotal } from "@/lib/money.ts";
import {
  getOrder,
  getOrderHistories,
  getOrderPayments,
  getOrderShipment,
  listOrderWorkOrders,
  recordManualDeposit,
  registerShipment,
  screenOrderStatus,
  screenPaymentStatus,
  trackShipment,
  type OrderDetail,
  type OrderHistory,
  type OrderPayments,
  type OrderShipment,
} from "@/lib/orderApi.ts";
import type { WorkOrderRow } from "@/lib/workOrdersApi.ts";
import type { OrderStatus } from "@/types/domain.ts";
import { canManageOrders, canProduce, useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";

export function OrderDetailPage() {
  const { orderId = "" } = useParams();
  const user = useAuthStore((state) => state.user);
  const show = useToastStore((state) => state.show);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [histories, setHistories] = useState<OrderHistory[]>([]);
  const [payments, setPayments] = useState<OrderPayments | null>(null);
  const [shipment, setShipment] = useState<OrderShipment | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState("");
  const [amount, setAmount] = useState(0);
  const [carrier, setCarrier] = useState("CJ대한통운");
  const [trackingNo, setTrackingNo] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [editingItems, setEditingItems] = useState(false);
  const [laterDue, setLaterDue] = useState("");
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [trackingText, setTrackingText] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [shipping, setShipping] = useState(false);
  const [depositing, setDepositing] = useState(false);
  const [depositSaved, setDepositSaved] = useState(false);

  useEffect(() => {
    const id = Number(orderId);
    if (!Number.isInteger(id) || id <= 0) {
      setLoading(false);
      setOrder(null);
      setMissing("수주를 찾을 수 없습니다.");
      return;
    }
    let ignore = false;
    setDepositSaved(false);
    setLoading(true);
    load(id).then((loaded) => {
      if (ignore) return;
      apply(loaded);
      setMissing("");
      setLoading(false);
    }).catch((error: unknown) => {
      if (ignore) return;
      setOrder(null);
      setMissing(readApiErrorMessage(error));
      setLoading(false);
    });
    return () => {
      ignore = true;
    };

    function apply(loaded: LoadedOrder) {
      setOrder(loaded.order);
      setHistories(loaded.histories);
      setPayments(loaded.payments);
      setShipment(loaded.shipment);
      setWorkOrders(loaded.workOrders);
    }
  }, [orderId]);

  useEffect(() => {
    if (!trackingOpen || !shipment) return;
    let ignore = false;
    setTrackingText("배송 정보를 조회하는 중입니다.");
    trackShipment(shipment.carrierCode, shipment.trackingNumber).then((info) => {
      if (ignore) return;
      const state = info.complete ? "배송완료" : info.result === "Y" ? `진행단계 ${info.level ?? "-"}` : "조회 결과 없음";
      setTrackingText(`${shipment.carrierName} ${info.invoiceNo || shipment.trackingNumber} / ${state}${info.estimate ? ` / ${info.estimate}` : ""}`);
    }).catch((error: unknown) => {
      if (!ignore) setTrackingText(readApiErrorMessage(error));
    });
    return () => {
      ignore = true;
    };
  }, [shipment, trackingOpen]);

  if (loading) return <p>수주를 불러오는 중입니다.</p>;
  if (!order || !user) return <p>{missing || "수주를 찾을 수 없습니다."}</p>;
  const currentOrder = order;
  const client = order.client;
  const paymentStatus = screenPaymentStatus(order.paymentStatus);
  const status = screenOrderStatus(order.status);
  const orderHistory = histories;
  const delay = order.delay;
  const qtyMap = Object.fromEntries(order.items.map((line) => [String(line.id), quantities[String(line.id)] ?? line.quantity]));
  const locked = order.status === "COMPLETED" || order.status === "CANCELLED";
  const canEditQty = !locked && !["PACKING", "READY_TO_SHIP", "SHIPPING"].includes(order.status);
  const editing = editingItems && canEditQty && canManageOrders(user.role);
  const shownLines = order.items.map((line) => ({ ...line, quantity: editing ? (qtyMap[String(line.id)] ?? line.quantity) : line.quantity }));
  const supply = editing ? shownLines.reduce((sum, line) => sum + supplyOf(line, order.vatIncluded), 0) : order.supplyAmount;
  const shownTotal = editing ? orderTotal(shownLines, order.vatIncluded) : order.totalAmount;
  const paidAmount = payments?.paidAmount ?? 0;
  const deposit = editing || !payments ? depositTarget(shownTotal) : payments.depositAmount;
  const balance = editing || !payments ? Math.max(0, shownTotal - paidAmount) : payments.balanceAmount;
  const assigneeName = workOrders.find((item) => item.assignedName)?.assignedName || "미배정";
  const depositRows = (payments?.payments ?? []).filter((item) => item.status === "PAID" || item.paymentHistory);
  const account = payments?.payments.find((item) => item.virtualAccount)?.virtualAccount;
  const virtualAccount = account ? `${account.bankCode} ${account.accountNumber}` : "-";
  const dueToday = (order.dueDate ?? "").slice(0, 10) === todayISO();
  const step = progressIndex(order.status);
  const depositLabel = paymentStatus === "PARTIAL" ? "계약금 입금" : paymentStatus === "PAID" ? "전액 입금" : "미입금";

  function unavailable(message: string) {
    show(message);
  }

  function saveQuantities(acceptLaterDue: boolean) {
    if (currentOrder.items.some((line) => (qtyMap[String(line.id)] ?? line.quantity) > line.quantity)) {
      show("수량은 줄일 수만 있습니다. 늘리려면 견적을 다시 작성하세요.");
      return;
    }
    unavailable(acceptLaterDue ? "납기를 변경하는 API가 없습니다." : "수량을 변경하는 API가 없습니다.");
  }

  async function recordDeposit() {
    if (depositing || depositSaved) return;
    const depositAmount = payments?.depositAmount;
    if (depositAmount == null) {
      show("입금 정보를 확인하지 못했습니다.");
      return;
    }
    if (!Number.isInteger(amount) || amount <= 0 || amount !== depositAmount) {
      show("입금 금액은 계약금과 같아야 합니다.");
      return;
    }
    setDepositing(true);
    try {
      await recordManualDeposit(currentOrder.id, amount);
      try {
        const loaded = await load(currentOrder.id);
        setOrder(loaded.order);
        setHistories(loaded.histories);
        setPayments(loaded.payments);
        setShipment(loaded.shipment);
        setWorkOrders(loaded.workOrders);
        setAmount(0);
        show("계약금 입금을 반영했습니다.");
      } catch {
        setDepositSaved(true);
        show("입금은 처리되었습니다. 화면을 다시 불러오지 못했습니다. 페이지를 새로고침해 주세요.");
      }
    } catch (error: unknown) {
      show(readApiErrorMessage(error));
    } finally {
      setDepositing(false);
    }
  }

  async function ship() {
    if (shipping) return;
    setShipping(true);
    try {
      await registerShipment(currentOrder.id, carrier, trackingNo);
      const loaded = await load(currentOrder.id);
      setOrder(loaded.order);
      setHistories(loaded.histories);
      setPayments(loaded.payments);
      setShipment(loaded.shipment);
      setWorkOrders(loaded.workOrders);
      setTrackingNo("");
      setTrackingOpen(false);
      show("운송장을 등록하고 배송중으로 변경했습니다.");
    } catch (error: unknown) {
      show(readApiErrorMessage(error));
    } finally {
      setShipping(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">수주 상세</h1>
          <p className="mt-1 text-sm text-muted">수주 정보와 생산 진행, 입금 확인 및 배송 알림 이력을 확인합니다.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/orders" className="inline-flex h-10 items-center gap-1 rounded-lg border border-line bg-white px-3 text-sm font-semibold"><ArrowLeft size={16} />수주 목록으로</Link>
          {canEditQty && canManageOrders(user.role) ? (
            <button
              type="button"
              className="inline-flex h-10 items-center gap-1 rounded-lg border border-line bg-white px-3 text-sm font-semibold"
              onClick={() => {
                setEditingItems(true);
                setLaterDue("");
                document.getElementById("order-items")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              <Pencil size={15} />수주 수정
            </button>
          ) : null}
        </div>
      </div>
      <section className="rounded-xl border border-line bg-white px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{order.orderNo}</h2>
              <Badge className={registrationTone(order.confirmationStatus)}>{registrationLabel(order.confirmationStatus)}</Badge>
              <Badge className={orderStatusTone(status)}>{order.statusName || orderStatusLabel[status]}</Badge>
              <Badge className={paymentTone(paymentStatus)}>{depositLabel}</Badge>
            </div>
            <p className="mt-2 text-sm text-muted">
              {client.companyName || "거래처 없음"}
              {order.quotationNo ? <> · 원본 <Link className="text-primary" to={`/quotations/${order.quotationId}`}>{order.quotationNo}</Link></> : null}
              {order.userName ? <> · 등록자 {order.userName}</> : null}
            </p>
          </div>
        </div>
        <ol className="mt-5 flex items-center">
          {["대기", "생산중", "포장중", "배송중", "완료"].map((label, index) => {
            const done = index < step;
            const current = index === step && order.status !== "CANCELLED";
            return (
              <li key={label} className="flex min-w-0 flex-1 items-center last:flex-none">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done || current ? "bg-primary text-white" : "bg-canvas text-muted"}`}>
                  {done ? <Check size={14} /> : index + 1}
                </span>
                <span className={`ml-2 shrink-0 text-sm ${current ? "font-semibold text-primary" : done ? "font-semibold" : "text-muted"}`}>{label}</span>
                {index < 4 ? <span className={`mx-3 h-px min-w-4 flex-1 ${index < step ? "bg-primary" : "bg-line"}`} /> : null}
              </li>
            );
          })}
        </ol>
      </section>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">거래처 정보</h2>
          {client.id ? <Link to={`/clients/${client.id}`} className="text-sm font-semibold text-primary">거래처 상세 →</Link> : null}
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
          <Field label="회사명" value={client.companyName || "-"} />
          <Field label="담당자명" value={client.contactName || "-"} />
          <Field label="연락처" value={client.phone || "-"} />
          <div className="sm:col-span-3">
            <dt className="text-xs text-muted">회사 주소</dt>
            <dd className="mt-1">{client.address || "-"}</dd>
          </div>
        </dl>
      </Card>
      <section id="order-items" className="overflow-hidden rounded-xl border border-line bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
          <div>
            <h2 className="font-semibold">생산품목 및 금액</h2>
            <p className="mt-1 text-sm text-muted">{editing ? "수량은 등록된 수량 이하로만 줄일 수 있습니다. 단가는 바꾸지 않습니다." : "수주에 담긴 품목과 단가입니다."}</p>
          </div>
          <p className="text-sm text-muted">{order.items.length}개 품목 · 총 {order.totalQuantity.toLocaleString("ko-KR")}개</p>
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
              {order.items.map((line) => {
                const nextQuantity = editing ? (qtyMap[String(line.id)] ?? line.quantity) : line.quantity;
                const supplyPrice = editing ? supplyOf({ ...line, quantity: nextQuantity }, order.vatIncluded) : line.supplyAmount;
                return (
                  <tr key={line.id} className="border-b border-line">
                    <td className="px-5 py-3">
                      <p className="font-semibold">{line.productName || "품목"}</p>
                      <p className="text-xs text-muted">{line.deviceName || "-"}</p>
                    </td>
                    <td className="px-3 text-right tabular-nums">
                      {editing ? (
                        <input aria-label={`${line.productName || "품목"} 수량`} type="number" min={1} max={line.quantity} className="h-9 w-24 rounded-lg border border-line px-2 text-right" value={nextQuantity} onChange={(event) => setQuantities({ ...qtyMap, [String(line.id)]: Number(event.target.value) })} />
                      ) : line.quantity.toLocaleString("ko-KR")}
                    </td>
                    <td className="px-3 text-right tabular-nums">{line.unitPrice.toLocaleString("ko-KR")}</td>
                    <td className="px-5 text-right font-semibold tabular-nums">{formatWon(supplyPrice)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4 px-5 py-4">
          <div>
            <p className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">{order.vatIncluded ? "VAT 포함" : "VAT 별도 청구"}</p>
            {editing ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button tone="ghost" onClick={() => saveQuantities(false)}>수량 저장</Button>
                {laterDue ? <Button onClick={() => saveQuantities(true)}>{laterDue}로 납기 변경</Button> : null}
                <Button tone="ghost" onClick={() => { setEditingItems(false); setQuantities({}); setLaterDue(""); }}>취소</Button>
              </div>
            ) : null}
          </div>
          <dl className="w-full max-w-xs space-y-1 text-sm">
            <Money label="공급가액" value={formatWon(supply)} />
            <Money label="부가세 (10%)" value={formatWon(shownTotal - supply)} />
            <div className="flex items-baseline justify-between gap-4 pt-1">
              <dt className="text-muted">총액</dt>
              <dd className="text-xl font-semibold text-primary tabular-nums">{formatWon(shownTotal)}</dd>
            </div>
          </dl>
        </div>
      </section>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">생산 및 배송 정보</h2>
          {dueToday ? <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">오늘 납기</span> : null}
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
          <Field label="납기일" value={order.dueDate || "-"} />
          <Field label="생산 시작" value={order.plannedStartDate || "-"} />
          <Field label="담당자" value={assigneeName} />
          <Field label="수신자" value={order.receiverName || "-"} />
          <Field label="배송 수신 연락처" value={order.receiverPhone || "-"} />
          <Field label="생산 완료" value={order.plannedEndDate || "-"} />
          <div className="sm:col-span-3">
            <AddressPicker label="배송지" value={order.shippingAddress} onChange={() => {
              if (!canManageOrders(user.role)) return;
              unavailable("배송지를 수정하는 API가 없습니다.");
            }} />
          </div>
        </dl>
        {delay ? <p className={`mt-3 rounded-lg px-3 py-2 text-sm font-semibold ${delayTone(delay.level)}`}>{delay.level === "late" ? "지연" : "주의"} · {delay.reason}</p> : null}
        {order.requestedDueDate !== order.dueDate ? <p className="mt-2 text-sm text-muted">희망 납기 {order.requestedDueDate}</p> : null}
        {order.memo ? <p className="mt-3 text-sm text-muted">업무 메모 · {order.memo}</p> : null}
        {workOrders.length > 0 ? (
          <ul className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
            {workOrders.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2">
                <p>{workOrderStatusLabel[item.status] ?? item.status}<span className="text-muted"> · {item.quantity.toLocaleString("ko-KR")}개 · {item.lineName || "라인 미정"} · 담당 {item.assignedName || "미배정"}</span></p>
                <Link className="font-semibold text-primary" to={`/work-orders/${item.id}`}>작업 이력</Link>
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-sm text-muted">작업지시서는 계약금 확인 후 생성됩니다.</p>}
      </Card>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">입금 내역</h2>
          <Badge className={paymentTone(paymentStatus)}>{paymentStatusLabel[paymentStatus]}</Badge>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-y border-line">
                <th className="py-2 font-medium">입금일</th>
                <th className="py-2 font-medium">내용</th>
                <th className="py-2 font-medium">처리</th>
              </tr>
            </thead>
            <tbody>
              {depositRows.length > 0 ? depositRows.map((item) => (
                <tr key={item.paymentId} className="border-b border-line">
                  <td className="py-2">{localDateTime(item.paymentHistory?.receivedAt || item.paymentHistory?.createdAt || item.createdAt)}</td>
                  <td className="py-2">{item.paymentType === "DEPOSIT" ? "계약금" : "잔금"} {formatWon(item.amount)}</td>
                  <td className="py-2 text-muted">{item.paymentHistory?.transactionId || paymentResultLabel(item.status)}</td>
                </tr>
              )) : (
                <tr><td className="py-3 text-muted" colSpan={3}>{paidAmount > 0 ? `누적 입금 ${formatWon(paidAmount)}` : "아직 입금 내역이 없습니다."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-muted">계약금 {formatWon(deposit)} · 누적 입금 {formatWon(paidAmount)} · 잔금 {formatWon(balance)}</p>
      </Card>
      <Card>
        <div id="order-ship" className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">배송 알림</h2>
          <span className="text-xs text-muted">{shipment?.trackingNumber ? "발송됨" : "발송 대기"}</span>
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
          <Field label="수신 연락처" value={order.receiverPhone || "-"} />
          <Field label="알림 채널" value={order.notifyChannel === "EMAIL" ? "이메일" : "SMS"} />
          <Field label="택배사" value={shipment?.carrierName || "-"} />
          <Field label="운송장" value={shipment?.trackingNumber || "-"} />
        </dl>
        <p className="mt-3 text-sm text-muted">아직 발송 이력이 없습니다.</p>
        {shipment?.trackingNumber ? <Button tone="ghost" className="mt-3" onClick={() => setTrackingOpen((open) => !open)}>배송조회</Button> : null}
        {trackingOpen ? <p className="mt-3 text-sm">{trackingText}</p> : null}
        <div className="mt-4 space-y-2">
          {(canProduce(user.role) || canManageOrders(user.role)) && order.status === "PACKING" ? <Button onClick={() => unavailable("출고 대기로 바꾸는 API가 없습니다.")}>출고 대기로</Button> : null}
          {canManageOrders(user.role) && order.status === "READY_TO_SHIP" ? (
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <TextField label="택배사" value={carrier} onChange={(event) => setCarrier(event.target.value)} />
              <TextField label="운송장" value={trackingNo} onChange={(event) => setTrackingNo(event.target.value)} />
              <Button onClick={() => void ship()}>출고</Button>
            </div>
          ) : null}
          {canManageOrders(user.role) && order.status === "SHIPPING" ? <Button onClick={() => unavailable("배송 완료로 바꾸는 API가 없습니다.")}>배송 완료</Button> : null}
          {canManageOrders(user.role) && order.status === "WAITING" && paidAmount === 0 ? (
            cancelling ? (
              <div className="space-y-2">
                <TextField label="취소 사유" value={cancelReason} placeholder="거래처 확인 내용" onChange={(event) => setCancelReason(event.target.value)} />
                <div className="flex gap-2">
                  <Button tone="ghost" onClick={() => setCancelling(false)}>닫기</Button>
                  <Button tone="danger" onClick={() => unavailable("수주를 취소하는 API가 없습니다.")}>수주 취소</Button>
                </div>
              </div>
            ) : <Button tone="danger" onClick={() => { setCancelling(true); setCancelReason(""); }}>수주 취소</Button>
          ) : null}
        </div>
      </Card>
      </div>
      <div className="space-y-4 lg:sticky lg:top-6">
      <Card className="space-y-3">
        <h2 className="font-semibold">수주 요약</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-muted">수주 번호</dt><dd>{order.orderNo}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">납기일</dt><dd>{order.dueDate || "-"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">거래처</dt><dd className="text-right">{client.companyName || "-"}</dd></div>
        </dl>
        <ul className="space-y-1 text-sm text-muted">
          {order.items.map((line) => (
            <li key={line.id} className="flex justify-between gap-3"><span>{line.productName || "품목"}</span><span className="tabular-nums">{(qtyMap[String(line.id)] ?? line.quantity).toLocaleString("ko-KR")}개</span></li>
          ))}
        </ul>
        <div className="rounded-lg bg-primary-soft px-3 py-3">
          <p className="text-xs text-primary">총 수주 금액</p>
          <p className="text-2xl font-semibold text-primary tabular-nums">{formatWon(shownTotal)}</p>
        </div>
      </Card>
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">수주 입금 처리</h2>
          <Badge className={paymentTone(paymentStatus)}>{paymentStatusLabel[paymentStatus]}</Badge>
        </div>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-muted">계약금</dt><dd className="tabular-nums">{formatWon(deposit)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">입금</dt><dd className="tabular-nums">{formatWon(paidAmount)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">잔금</dt><dd className="tabular-nums">{formatWon(balance)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">계약금 마감</dt><dd>{order.depositDueDate || "-"}</dd></div>
        </dl>
        <p className="text-sm">가상계좌 {virtualAccount}</p>
        {paidAmount < shownTotal && order.status !== "WAITING" && order.status !== "CANCELLED" ? (
          <p className="text-sm text-warning">{order.status === "COMPLETED" ? "거래처 물건 확인 후 잔금 입금 대기" : "잔금은 배송 완료 후 입금"}</p>
        ) : null}
        {canManageOrders(user.role) && order.status === "WAITING" && paymentStatus === "UNPAID" && !depositSaved ? (
          <>
            <TextField label="입금 금액" type="number" value={amount || ""} onChange={(event) => setAmount(Number(event.target.value))} />
            <Button className="w-full" disabled={depositing} onClick={() => void recordDeposit()}>입금 처리</Button>
          </>
        ) : null}
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">상태 변경 이력</h2>
        <ul className="space-y-3 text-sm">
          {orderHistory.map((item) => (
            <li key={item.id}>
              <p className="font-semibold">{item.fromStatus === item.toStatus ? "정보 변경" : `${statusText(item.fromStatus)} → ${statusText(item.toStatus)}`}</p>
              <p className="text-xs text-muted">{localDateTime(item.createdAt)} · {item.userName || "시스템"}</p>
              {item.note ? <p className="text-xs text-muted">{item.note}</p> : null}
            </li>
          ))}
          {orderHistory.length === 0 ? <li className="text-sm text-muted">아직 처리 이력이 없습니다.</li> : null}
        </ul>
      </Card>
      </div>
      </div>
    </div>
  );
}

interface LoadedOrder {
  order: OrderDetail;
  histories: OrderHistory[];
  payments: OrderPayments;
  shipment: OrderShipment | null;
  workOrders: WorkOrderRow[];
}

async function load(orderId: number): Promise<LoadedOrder> {
  const [detail, historyRows, paymentRows, shipmentRow, works] = await Promise.all([
    getOrder(orderId),
    getOrderHistories(orderId),
    getOrderPayments(orderId),
    getOrderShipment(orderId),
    listOrderWorkOrders(orderId),
  ]);
  return { order: detail, histories: historyRows, payments: paymentRows, shipment: shipmentRow, workOrders: works };
}

function statusText(value: string): string {
  if (value === "NONE") return "등록";
  if (value === "PRODUCTION_READY") return "생산대기";
  if (value in orderStatusLabel) return orderStatusLabel[value as OrderStatus];
  return value;
}

function paymentResultLabel(status: string): string {
  if (status === "PAID") return "입금 완료";
  if (status === "WAITING") return "입금 대기";
  if (status === "READY") return "결제 준비";
  if (status === "FAILED") return "실패";
  if (status === "CANCELLED") return "취소";
  return status;
}

function progressIndex(status: string): number {
  if (status === "COMPLETED") return 4;
  if (status === "READY_TO_SHIP" || status === "SHIPPING") return 3;
  if (status === "PACKING") return 2;
  if (status === "CONFIRMED" || status === "PRODUCTION_READY" || status === "IN_PRODUCTION" || status === "ON_HOLD") return 1;
  return 0;
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
