import { useState } from "react";
import { Link, useParams } from "react-router";
import { AddressPicker } from "@/components/AddressPicker.tsx";
import { Badge, Button, Card, PageHeader, TextField } from "@/components/ui.tsx";
import { localDateTime, todayISO } from "@/lib/dates.ts";
import { useDb } from "@/lib/db.ts";
import { orderStatusLabel, orderStatusTone, paymentStatusLabel, paymentTone, registrationLabel, registrationTone, workOrderStatusLabel } from "@/lib/labels.ts";
import type { OrderStatus } from "@/types/domain.ts";
import { activeWorkOrder, delayOf, delayTone } from "@/lib/delay.ts";
import { depositTarget, formatWon, orderQuantity, orderTotal } from "@/lib/money.ts";
import { DueDateError, cancelOrder, completeDelivery, completePacking, recordPayment, shipOrder, updateOrderPrices, updateOrderQuantities, updateShippingAddress } from "@/lib/workflow.ts";
import { canManageOrders, canProduce, useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";

export function OrderDetailPage() {
  const { orderId = "" } = useParams();
  const db = useDb();
  const user = useAuthStore((state) => state.user);
  const show = useToastStore((state) => state.show);
  const order = db.orders.find((item) => item.id === orderId);
  const [amount, setAmount] = useState(0);
  const [carrier, setCarrier] = useState("CJ대한통운");
  const [trackingNo, setTrackingNo] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [laterDue, setLaterDue] = useState("");
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  if (!order || !user) return <p>수주를 찾을 수 없습니다.</p>;

  const client = db.clients.find((item) => item.id === order.clientId);
  const workOrder = activeWorkOrder(db.workOrders, order.id);
  const assignee = workOrder ? db.users.find((item) => item.id === workOrder.assigneeId) : undefined;
  const orderHistory = db.histories.filter((item) => item.entity === "ORDER" && item.entityId === order.id);
  const delay = delayOf(order, workOrder, todayISO());
  const total = orderTotal(order.lines);
  const qtyMap = Object.fromEntries(order.lines.map((line) => [line.id, quantities[line.id] ?? line.quantity]));
  const priceMap = Object.fromEntries(order.lines.map((line) => [line.id, prices[line.id] ?? line.unitPrice]));
  const locked = order.status === "COMPLETED" || order.status === "CANCELLED";
  const canEditQty = !locked && !["PACKING", "PACKED", "SHIPPING"].includes(order.status);
  const notice = db.notifications.find((item) => item.orderId === order.id && item.success);

  function act(action: () => void, success: string) {
    try {
      action();
      show(success);
      setLaterDue("");
    } catch (error: unknown) {
      if (error instanceof DueDateError) setLaterDue(error.earliestDue);
      show(error instanceof Error ? error.message : "처리하지 못했습니다.");
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title={order.orderNo} action={<span className="flex gap-2"><Badge className={registrationTone(order.status)}>{registrationLabel(order.status)}</Badge><Badge className={orderStatusTone(order.status)}>{orderStatusLabel[order.status]}</Badge></span>} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4">
      <Card>
        <h2 className="mb-3 font-semibold">품목</h2>
        {order.lines.map((line) => {
          const product = db.products.find((item) => item.id === line.productId);
          return (
            <div key={line.id} className="mb-3 grid items-center gap-3 md:grid-cols-[72px_1fr_120px_120px]">
              <img src={product?.designImageUrl} alt="" className="h-16 w-16 rounded-lg object-cover" />
              <div>
                <p className="font-semibold">{product?.productName} {product?.modelName}</p>
                <p className="text-muted">{line.vatIncluded ? "VAT 포함" : "VAT 별도"}</p>
              </div>
              <TextField label="수량" type="number" disabled={!canEditQty || !canManageOrders(user.role)} value={qtyMap[line.id]} onChange={(event) => setQuantities({ ...qtyMap, [line.id]: Number(event.target.value) })} />
              <TextField label="단가" type="number" disabled={order.status !== "WAITING" || !canManageOrders(user.role)} value={priceMap[line.id]} onChange={(event) => setPrices({ ...priceMap, [line.id]: Number(event.target.value) })} />
            </div>
          );
        })}
        {canManageOrders(user.role) && canEditQty ? (
          <div className="flex flex-wrap gap-2">
            <Button tone="ghost" onClick={() => act(() => updateOrderQuantities(order.id, qtyMap, false, user), "수량을 수정하고 일정을 다시 계산했습니다.")}>수량 저장</Button>
            {laterDue ? <Button onClick={() => act(() => updateOrderQuantities(order.id, qtyMap, true, user), `${laterDue}로 납기를 변경했습니다.`)}>{laterDue}로 납기 변경</Button> : null}
            {order.status === "WAITING" ? <Button tone="ghost" onClick={() => act(() => updateOrderPrices(order.id, priceMap, user), "단가를 수정했습니다.")}>단가 저장</Button> : null}
          </div>
        ) : null}
        {order.coveredQuantity < orderQuantity(order.lines) && order.status !== "WAITING" && order.status !== "CANCELLED" ? (
          <p className="mt-3 text-warning">추가 선금이 확인되기 전에는 늘어난 수량을 작업지시에 넣지 않습니다. 자리만 잡아 둡니다.</p>
        ) : null}
      </Card>
      <Card>
        <AddressPicker label="배송지" value={order.shippingAddress} onChange={(address) => {
          if (!canManageOrders(user.role)) return;
          act(() => updateShippingAddress(order.id, address, user), "배송지를 수정했습니다.");
        }} />
      </Card>
      {canProduce(user.role) && order.status === "PACKING" ? <Button onClick={() => act(() => completePacking(order.id, user), "포장 완료로 변경했습니다.")}>포장 완료</Button> : null}
      {canManageOrders(user.role) && order.status === "PACKED" ? (
        <Card className="grid gap-3 md:grid-cols-3">
          <TextField label="택배사" value={carrier} onChange={(event) => setCarrier(event.target.value)} />
          <TextField label="운송장" value={trackingNo} onChange={(event) => setTrackingNo(event.target.value)} />
          <div className="self-end"><Button onClick={() => act(() => shipOrder(order.id, carrier, trackingNo, user), "출고하고 알림을 성공으로 기록했습니다.")}>출고</Button></div>
        </Card>
      ) : null}
      {canManageOrders(user.role) && order.status === "SHIPPING" ? <Button onClick={() => act(() => completeDelivery(order.id, user), "배송 완료로 변경했습니다.")}>배송 완료</Button> : null}
      {order.trackingNo ? (
        <Card>
          <Button tone="ghost" onClick={() => setTrackingOpen(true)}>배송조회</Button>
          {trackingOpen ? <p className="mt-3">택배넷 샌드박스 예시 응답: {order.carrier} {order.trackingNo} / {order.status === "COMPLETED" ? "배송완료" : "간선상차"}</p> : null}
        </Card>
      ) : null}
      {notice ? <p className="text-success">{notice.message}</p> : null}
      {canManageOrders(user.role) && order.status === "WAITING" && order.paidAmount === 0 ? (
        cancelling ? (
          <Card className="space-y-2">
            <TextField label="취소 사유 (거래처 유선 확인 내용)" value={cancelReason} placeholder="예: 거래처 요청으로 발주 철회" onChange={(event) => setCancelReason(event.target.value)} />
            <div className="flex gap-2">
              <Button tone="ghost" onClick={() => setCancelling(false)}>닫기</Button>
              <Button tone="danger" onClick={() => act(() => cancelOrder(order.id, cancelReason, user), "수주를 취소하고 생산량을 되돌렸습니다.")}>수주 취소</Button>
            </div>
          </Card>
        ) : <Button tone="danger" onClick={() => { setCancelling(true); setCancelReason(""); }}>취소</Button>
      ) : null}
      <Card>
        <h2 className="mb-3 font-semibold">작업지시</h2>
        {workOrder ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p>
              {workOrderStatusLabel[workOrder.status]}
              <span className="text-muted"> · 담당 {assignee?.name ?? "미배정"}</span>
            </p>
            <Link className="font-semibold text-primary" to={`/work-orders/${workOrder.id}`}>작업 이력 보기</Link>
          </div>
        ) : (
          <p className="text-sm text-muted">작업지시서는 선금 확인 후 생성됩니다.</p>
        )}
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">처리 이력</h2>
        <ul className="space-y-2 text-sm">
          {orderHistory.map((item) => (
            <li key={item.id} className="border-t border-line pt-2 first:border-0 first:pt-0">
              <p>
                <span className="text-muted">{localDateTime(item.at)} · {item.actorName} · </span>
                {item.fromStatus === item.toStatus ? "정보 변경" : `${statusText(item.fromStatus)} → ${statusText(item.toStatus)}`}
              </p>
              {item.note ? <p className="text-xs text-muted">{item.note}</p> : null}
            </li>
          ))}
          {orderHistory.length === 0 ? <li className="text-sm text-muted">아직 처리 이력이 없습니다.</li> : null}
        </ul>
      </Card>
      </div>
      <Card className="sticky top-6 space-y-3">
        <div className="flex gap-2">
          <Badge className={registrationTone(order.status)}>{registrationLabel(order.status)}</Badge>
          <Badge className={orderStatusTone(order.status)}>{orderStatusLabel[order.status]}</Badge>
          <Badge className={paymentTone(order.paymentStatus)}>{paymentStatusLabel[order.paymentStatus]}</Badge>
        </div>
        <p className="text-2xl font-semibold text-primary">{formatWon(total)}</p>
        <p className="text-muted">선금 기준 {formatWon(depositTarget(total))}</p>
        <p>입금 {formatWon(order.paidAmount)}</p>
        {order.paidAmount < total && order.status !== "WAITING" && order.status !== "CANCELLED" ? (
          <p className="text-warning">잔금 {formatWon(total - order.paidAmount)} · {order.status === "COMPLETED" ? "거래처 물건 확인 후 입금 대기" : "배송 완료 후 입금"}</p>
        ) : null}
        <p>거래처 {client?.companyName}</p>
        <p>배송 수신 {order.receiverPhone || "-"} · {order.notifyChannel === "EMAIL" ? "이메일" : "SMS"} 알림</p>
        {order.memo ? <p className="rounded-lg bg-canvas px-3 py-2 text-sm">메모 · {order.memo}</p> : null}
        <p>가상계좌 {order.virtualAccount}</p>
        <p>생산 {order.plannedStartDate} ~ {order.plannedEndDate}</p>
        <p>납기 {order.dueDate}</p>
        {delay ? <p className={`rounded-lg px-3 py-2 text-sm font-semibold ${delayTone(delay.level)}`}>{delay.level === "late" ? "지연" : "주의"} · {delay.reason}</p> : null}
        <p>작업지시 수량 {order.coveredQuantity.toLocaleString("ko-KR")} / {orderQuantity(order.lines).toLocaleString("ko-KR")}개</p>
        {workOrder ? (
          <p>
            작업지시 {workOrderStatusLabel[workOrder.status]}
            <span className="text-muted"> · {assignee?.name ?? "미배정"}</span>
            {" · "}
            <Link className="font-semibold text-primary" to={`/work-orders/${workOrder.id}`}>상세</Link>
          </p>
        ) : (
          <p className="text-muted">작업지시서는 선금 확인 후 생성됩니다.</p>
        )}
        {canManageOrders(user.role) && order.paymentStatus !== "PAID" && order.status !== "CANCELLED" ? (
          <>
            <TextField label="입금 금액" type="number" value={amount || ""} onChange={(event) => setAmount(Number(event.target.value))} />
            <Button className="w-full" onClick={() => act(() => recordPayment(order.id, amount, user), "입금을 반영했습니다.")}>입금 처리</Button>
          </>
        ) : null}
      </Card>
      </div>
    </div>
  );
}

function statusText(value: string): string {
  if (value === "NONE") return "등록";
  if (value in orderStatusLabel) return orderStatusLabel[value as OrderStatus];
  return value;
}
