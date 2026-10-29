import { useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, Check, Pencil } from "lucide-react";
import { AddressPicker } from "@/components/AddressPicker.tsx";
import { Badge, Button, Card, TextField } from "@/components/ui.tsx";
import { localDateTime, todayISO } from "@/lib/dates.ts";
import { useDb } from "@/lib/db.ts";
import { orderStatusLabel, orderStatusTone, paymentStatusLabel, paymentTone, registrationLabel, registrationTone, workOrderStatusLabel } from "@/lib/labels.ts";
import type { OrderStatus } from "@/types/domain.ts";
import { delayOf, delayTone, workOrdersOf } from "@/lib/delay.ts";
import { depositTarget, formatWon, lineAmount, orderQuantity, orderTotal } from "@/lib/money.ts";
import { DueDateError, cancelOrder, clientFullAddress, completeDelivery, markReadyToShip, recordPayment, shipOrder, updateOrderQuantities, updateShippingAddress } from "@/lib/workflow.ts";
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
  const [editingItems, setEditingItems] = useState(false);
  const [laterDue, setLaterDue] = useState("");
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  if (!order || !user) return <p>수주를 찾을 수 없습니다.</p>;
  const currentOrder = order;
  const actor = user;

  const client = db.clients.find((item) => item.id === order.clientId);
  const workOrders = workOrdersOf(db.workOrders, order.id);
  const orderHistory = db.histories.filter((item) => item.entity === "ORDER" && item.entityId === order.id);
  const delay = delayOf(order, workOrders.find((item) => item.status === "READY" && !item.assigneeId) ?? workOrders[0], todayISO());
  const qtyMap = Object.fromEntries(order.lines.map((line) => [line.id, quantities[line.id] ?? line.quantity]));
  const locked = order.status === "COMPLETED" || order.status === "CANCELLED";
  const canEditQty = !locked && !["PACKING", "READY_TO_SHIP", "SHIPPING"].includes(order.status);
  const editing = editingItems && canEditQty && canManageOrders(user.role);
  const notice = db.notifications.find((item) => item.orderId === order.id && item.success);
  const quote = db.quotations.find((item) => item.id === order.quotationId);
  const shownLines = order.lines.map((line) => ({ ...line, quantity: editing ? (qtyMap[line.id] ?? line.quantity) : line.quantity }));
  const supply = shownLines.reduce((sum, line) => sum + supplyOf(line, order.vatIncluded), 0);
  const shownTotal = orderTotal(shownLines, order.vatIncluded);
  const deposit = depositTarget(shownTotal);
  const balance = Math.max(0, shownTotal - order.paidAmount);
  const assignee = db.users.find((item) => item.id === workOrders.find((work) => work.assigneeId)?.assigneeId);
  const payments = orderHistory.filter((item) => item.note?.includes("입금"));
  const dueToday = order.dueDate.slice(0, 10) === todayISO();
  const step = progressIndex(order.status);
  const registrar = orderHistory.find((item) => item.fromStatus === "NONE")?.actorName;
  const depositLabel = order.paymentStatus === "PARTIAL" ? "계약금 입금" : order.paymentStatus === "PAID" ? "전액 입금" : "미입금";

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

  function saveQuantities(acceptLaterDue: boolean) {
    if (currentOrder.lines.some((line) => (qtyMap[line.id] ?? line.quantity) > line.quantity)) {
      show("수량은 줄일 수만 있습니다. 늘리려면 견적을 다시 작성하세요.");
      return;
    }
    try {
      updateOrderQuantities(currentOrder.id, qtyMap, acceptLaterDue, actor);
      show(acceptLaterDue ? `${laterDue}로 납기를 변경했습니다.` : "수량을 수정하고 일정을 다시 계산했습니다.");
      setQuantities({});
      setLaterDue("");
      setEditingItems(false);
    } catch (error: unknown) {
      if (error instanceof DueDateError) setLaterDue(error.earliestDue);
      show(error instanceof Error ? error.message : "처리하지 못했습니다.");
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
              <Badge className={orderStatusTone(order.status)}>{orderStatusLabel[order.status]}</Badge>
              <Badge className={paymentTone(order.paymentStatus)}>{depositLabel}</Badge>
            </div>
            <p className="mt-2 text-sm text-muted">
              {client?.companyName ?? "거래처 없음"}
              {quote ? <> · 원본 <Link className="text-primary" to={`/quotations/${quote.id}`}>{quote.quotationNo}</Link></> : null}
              {registrar ? <> · 등록자 {registrar}</> : null}
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
          {client ? <Link to={`/clients/${client.id}`} className="text-sm font-semibold text-primary">거래처 상세 →</Link> : null}
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
          <Field label="회사명" value={client?.companyName || "-"} />
          <Field label="담당자명" value={client?.contactName || client?.representative || "-"} />
          <Field label="연락처" value={client?.phone || "-"} />
          <div className="sm:col-span-3">
            <dt className="text-xs text-muted">회사 주소</dt>
            <dd className="mt-1">{client ? clientFullAddress(client) : "-"}</dd>
          </div>
        </dl>
      </Card>
      <section id="order-items" className="overflow-hidden rounded-xl border border-line bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
          <div>
            <h2 className="font-semibold">생산품목 및 금액</h2>
            <p className="mt-1 text-sm text-muted">{editing ? "수량은 등록된 수량 이하로만 줄일 수 있습니다. 단가는 바꾸지 않습니다." : "수주에 담긴 품목과 단가입니다."}</p>
          </div>
          <p className="text-sm text-muted">{order.lines.length}개 품목 · 총 {orderQuantity(order.lines).toLocaleString("ko-KR")}개</p>
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
              {order.lines.map((line) => {
                const product = db.products.find((item) => item.id === line.productId);
                const nextQuantity = editing ? (qtyMap[line.id] ?? line.quantity) : line.quantity;
                return (
                  <tr key={line.id} className="border-b border-line">
                    <td className="px-5 py-3">
                      <p className="font-semibold">{product?.productName ?? "품목"}</p>
                      <p className="text-xs text-muted">{[product?.modelName, product?.description].filter(Boolean).join(" · ") || "-"}</p>
                    </td>
                    <td className="px-3 text-right tabular-nums">
                      {editing ? (
                        <input aria-label={`${product?.productName ?? "품목"} 수량`} type="number" min={1} max={line.quantity} className="h-9 w-24 rounded-lg border border-line px-2 text-right" value={nextQuantity} onChange={(event) => setQuantities({ ...qtyMap, [line.id]: Number(event.target.value) })} />
                      ) : line.quantity.toLocaleString("ko-KR")}
                    </td>
                    <td className="px-3 text-right tabular-nums">{line.unitPrice.toLocaleString("ko-KR")}</td>
                    <td className="px-5 text-right font-semibold tabular-nums">{formatWon(supplyOf({ ...line, quantity: nextQuantity }, order.vatIncluded))}</td>
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
        {order.coveredQuantity < orderQuantity(order.lines) && order.status !== "WAITING" && order.status !== "CANCELLED" ? (
          <p className="px-5 pb-4 text-sm text-warning">추가 선금이 확인되기 전에는 늘어난 수량을 작업지시에 넣지 않습니다. 자리만 잡아 둡니다.</p>
        ) : null}
      </section>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">생산 및 배송 정보</h2>
          {dueToday ? <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">오늘 납기</span> : null}
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
          <Field label="납기일" value={order.dueDate} />
          <Field label="생산 시작" value={order.plannedStartDate || "-"} />
          <Field label="담당자" value={assignee?.name ?? "미배정"} />
          <Field label="수신자" value={order.receiverName || "-"} />
          <Field label="배송 수신 연락처" value={order.receiverPhone || "-"} />
          <Field label="생산 완료" value={order.plannedEndDate || "-"} />
          <div className="sm:col-span-3">
            <AddressPicker label="배송지" value={order.shippingAddress} onChange={(address) => {
              if (!canManageOrders(user.role)) return;
              act(() => updateShippingAddress(order.id, address, user), "배송지를 수정했습니다.");
            }} />
          </div>
        </dl>
        {delay ? <p className={`mt-3 rounded-lg px-3 py-2 text-sm font-semibold ${delayTone(delay.level)}`}>{delay.level === "late" ? "지연" : "주의"} · {delay.reason}</p> : null}
        {order.requestedDueDate !== order.dueDate ? <p className="mt-2 text-sm text-muted">희망 납기 {order.requestedDueDate}</p> : null}
        {order.memo ? <p className="mt-3 text-sm text-muted">업무 메모 · {order.memo}</p> : null}
        {workOrders.length > 0 ? (
          <ul className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
            {workOrders.map((item) => {
              const worker = db.users.find((person) => person.id === item.assigneeId);
              const line = db.lines.find((itemLine) => itemLine.id === item.lineId);
              return (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2">
                  <p>{workOrderStatusLabel[item.status]}<span className="text-muted"> · {item.quantity.toLocaleString("ko-KR")}개 · {line?.name ?? "라인 미정"} · 담당 {worker?.name ?? "미배정"}</span></p>
                  <Link className="font-semibold text-primary" to={`/work-orders/${item.id}`}>작업 이력</Link>
                </li>
              );
            })}
          </ul>
        ) : <p className="mt-3 text-sm text-muted">작업지시서는 계약금 확인 후 생성됩니다.</p>}
      </Card>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">입금 내역</h2>
          <Badge className={paymentTone(order.paymentStatus)}>{paymentStatusLabel[order.paymentStatus]}</Badge>
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
              {payments.length > 0 ? payments.map((item) => (
                <tr key={item.id} className="border-b border-line">
                  <td className="py-2">{localDateTime(item.at)}</td>
                  <td className="py-2">{item.note}</td>
                  <td className="py-2 text-muted">{item.actorName}</td>
                </tr>
              )) : (
                <tr><td className="py-3 text-muted" colSpan={3}>{order.paidAmount > 0 ? `누적 입금 ${formatWon(order.paidAmount)}` : "아직 입금 내역이 없습니다."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-muted">계약금 {formatWon(deposit)} · 누적 입금 {formatWon(order.paidAmount)} · 잔금 {formatWon(balance)}</p>
      </Card>
      <Card>
        <div id="order-ship" className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">배송 알림</h2>
          <span className="text-xs text-muted">{order.trackingNo ? "발송됨" : "발송 대기"}</span>
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
          <Field label="수신 연락처" value={order.receiverPhone || "-"} />
          <Field label="알림 채널" value={order.notifyChannel === "EMAIL" ? "이메일" : "SMS"} />
          <Field label="택배사" value={order.carrier || "-"} />
          <Field label="운송장" value={order.trackingNo || "-"} />
        </dl>
        {notice ? <p className="mt-3 text-sm text-success">{notice.message}</p> : <p className="mt-3 text-sm text-muted">아직 발송 이력이 없습니다.</p>}
        {order.trackingNo ? <Button tone="ghost" className="mt-3" onClick={() => setTrackingOpen((open) => !open)}>배송조회</Button> : null}
        {trackingOpen ? <p className="mt-3 text-sm">택배넷 샌드박스 예시 응답: {order.carrier} {order.trackingNo} / {order.status === "COMPLETED" ? "배송완료" : "간선상차"}</p> : null}
        <div className="mt-4 space-y-2">
          {(canProduce(user.role) || canManageOrders(user.role)) && order.status === "PACKING" ? <Button onClick={() => act(() => markReadyToShip(order.id, user), "출고대기로 변경했습니다.")}>출고 대기로</Button> : null}
          {canManageOrders(user.role) && order.status === "READY_TO_SHIP" ? (
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <TextField label="택배사" value={carrier} onChange={(event) => setCarrier(event.target.value)} />
              <TextField label="운송장" value={trackingNo} onChange={(event) => setTrackingNo(event.target.value)} />
              <Button onClick={() => act(() => shipOrder(order.id, carrier, trackingNo, user), "출고하고 알림을 성공으로 기록했습니다.")}>출고</Button>
            </div>
          ) : null}
          {canManageOrders(user.role) && order.status === "SHIPPING" ? <Button onClick={() => act(() => completeDelivery(order.id, user), "배송 완료로 변경했습니다.")}>배송 완료</Button> : null}
          {canManageOrders(user.role) && order.status === "WAITING" && order.paidAmount === 0 ? (
            cancelling ? (
              <div className="space-y-2">
                <TextField label="취소 사유" value={cancelReason} placeholder="거래처 확인 내용" onChange={(event) => setCancelReason(event.target.value)} />
                <div className="flex gap-2">
                  <Button tone="ghost" onClick={() => setCancelling(false)}>닫기</Button>
                  <Button tone="danger" onClick={() => act(() => cancelOrder(order.id, cancelReason, user), "수주를 취소하고 생산량을 되돌렸습니다.")}>수주 취소</Button>
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
          <div className="flex justify-between gap-3"><dt className="text-muted">납기일</dt><dd>{order.dueDate}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">거래처</dt><dd className="text-right">{client?.companyName ?? "-"}</dd></div>
        </dl>
        <ul className="space-y-1 text-sm text-muted">
          {order.lines.map((line) => {
            const product = db.products.find((item) => item.id === line.productId);
            return <li key={line.id} className="flex justify-between gap-3"><span>{product?.productName ?? "품목"}</span><span className="tabular-nums">{(qtyMap[line.id] ?? line.quantity).toLocaleString("ko-KR")}개</span></li>;
          })}
        </ul>
        <div className="rounded-lg bg-primary-soft px-3 py-3">
          <p className="text-xs text-primary">총 수주 금액</p>
          <p className="text-2xl font-semibold text-primary tabular-nums">{formatWon(shownTotal)}</p>
        </div>
      </Card>
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">수주 입금 처리</h2>
          <Badge className={paymentTone(order.paymentStatus)}>{paymentStatusLabel[order.paymentStatus]}</Badge>
        </div>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-muted">계약금</dt><dd className="tabular-nums">{formatWon(deposit)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">입금</dt><dd className="tabular-nums">{formatWon(order.paidAmount)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">잔금</dt><dd className="tabular-nums">{formatWon(balance)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">계약금 마감</dt><dd>{order.depositDueDate || "-"}</dd></div>
        </dl>
        <p className="text-sm">가상계좌 {order.virtualAccount}</p>
        {order.paidAmount < shownTotal && order.status !== "WAITING" && order.status !== "CANCELLED" ? (
          <p className="text-sm text-warning">{order.status === "COMPLETED" ? "거래처 물건 확인 후 잔금 입금 대기" : "잔금은 배송 완료 후 입금"}</p>
        ) : null}
        {canManageOrders(user.role) && order.paymentStatus !== "PAID" && order.status !== "CANCELLED" ? (
          <>
            <TextField label="입금 금액" type="number" value={amount || ""} onChange={(event) => setAmount(Number(event.target.value))} />
            <Button className="w-full" onClick={() => act(() => recordPayment(order.id, amount, user), "입금을 반영했습니다.")}>입금 처리</Button>
          </>
        ) : null}
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">상태 변경 이력</h2>
        <ul className="space-y-3 text-sm">
          {orderHistory.map((item) => (
            <li key={item.id}>
              <p className="font-semibold">{item.fromStatus === item.toStatus ? "정보 변경" : `${statusText(item.fromStatus)} → ${statusText(item.toStatus)}`}</p>
              <p className="text-xs text-muted">{localDateTime(item.at)} · {item.actorName}</p>
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

function statusText(value: string): string {
  if (value === "NONE") return "등록";
  if (value in orderStatusLabel) return orderStatusLabel[value as OrderStatus];
  return value;
}

function progressIndex(status: OrderStatus): number {
  if (status === "COMPLETED") return 4;
  if (status === "READY_TO_SHIP" || status === "SHIPPING") return 3;
  if (status === "PACKING") return 2;
  if (status === "CONFIRMED" || status === "IN_PRODUCTION" || status === "ON_HOLD") return 1;
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
