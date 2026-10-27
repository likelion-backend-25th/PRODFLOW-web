import { useState } from "react";
import { Link } from "react-router";
import { Badge, Button } from "@/components/ui.tsx";
import { cn } from "@/lib/cn.ts";
import { localDate, localDateTime, todayISO } from "@/lib/dates.ts";
import { useDb } from "@/lib/db.ts";
import { activeWorkOrder, delayOf, delayTone } from "@/lib/delay.ts";
import { orderStatusLabel, orderStatusTone, paymentStatusLabel, paymentTone } from "@/lib/labels.ts";
import { formatWon, orderQuantity, orderTotal } from "@/lib/money.ts";
import { orderItems, orderItemsText } from "@/lib/orderText.ts";
import { completeDelivery, completePacking, markReadyToShip, recordPayment, shipOrder } from "@/lib/workflow.ts";
import { canManageOrders, canProduce, useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";
import type { Order } from "@/types/domain.ts";

type Tab = "PACKING" | "PACKED" | "READY_TO_SHIP" | "SHIPPING" | "BALANCE";

const tabs: Array<{ id: Tab; label: string; hint: string }> = [
  { id: "PACKING", label: "포장중", hint: "생산이 끝나 포장 중인 수주" },
  { id: "PACKED", label: "포장완료", hint: "포장 끝 · 출고 대기로 넘김" },
  { id: "READY_TO_SHIP", label: "출고대기", hint: "운송장 입력 후 출고" },
  { id: "SHIPPING", label: "배송중", hint: "출고 후 거래처 도착 전" },
  { id: "BALANCE", label: "잔금 대기", hint: "배송 완료 · 거래처 확인 후 잔금 입금 대기" },
];

const CARRIERS = ["CJ대한통운", "한진택배", "롯데택배", "우체국택배", "로젠택배"];

function inTab(order: Order, tab: Tab): boolean {
  if (tab === "BALANCE") return order.status === "COMPLETED" && order.paymentStatus !== "PAID";
  return order.status === tab;
}

export function ShippingPage() {
  const db = useDb();
  const user = useAuthStore((state) => state.user);
  const show = useToastStore((state) => state.show);
  const [tab, setTab] = useState<Tab>("READY_TO_SHIP");
  const [carriers, setCarriers] = useState<Record<string, string>>({});
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [payments, setPayments] = useState<Record<string, string>>({});
  if (!user) return null;
  const today = todayISO();
  const rows = db.orders.filter((order) => inTab(order, tab)).sort((left, right) => left.dueDate.localeCompare(right.dueDate));

  function act(action: () => void, success: string) {
    try {
      action();
      show(success);
    } catch (error: unknown) {
      show(error instanceof Error ? error.message : "처리하지 못했습니다.");
    }
  }

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold">배송 관리</h1>
        <p className="mt-1 text-sm text-muted">포장 완료 후 출고대기·출고·배송 완료·잔금 입금까지 한 화면에서 처리합니다. 잔금은 거래처가 물건을 확인한 뒤 입금합니다.</p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-5">
        {tabs.map((item) => {
          const count = db.orders.filter((order) => inTab(order, item.id)).length;
          return (
            <button key={item.id} type="button" className={cn("rounded-xl border bg-white p-4 text-left", tab === item.id ? "border-primary ring-1 ring-primary" : "border-line")} onClick={() => setTab(item.id)}>
              <p className="text-sm text-muted">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold">{count}건</p>
              <p className="mt-1 text-xs text-muted">{item.hint}</p>
            </button>
          );
        })}
      </div>

      <section className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
        <div className="flex items-center justify-between px-5 py-3">
          <h2 className="font-semibold">{tabs.find((item) => item.id === tab)?.label} 목록</h2>
          <span className="text-sm text-muted">납기 빠른 순 · {rows.length}건</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-primary-soft/40 text-muted">
              <tr>
                <th className="px-5 py-3 font-medium">수주번호</th>
                <th className="py-3 font-medium">거래처 / 품목</th>
                <th className="py-3 font-medium">배송지</th>
                <th className="py-3 font-medium">납기</th>
                <th className="py-3 font-medium">상태</th>
                <th className="py-3 font-medium">{tab === "BALANCE" ? "잔금" : tab === "SHIPPING" ? "운송장" : "입금"}</th>
                <th className="py-3 pr-5 font-medium">처리</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => {
                const client = db.clients.find((item) => item.id === order.clientId);
                const delay = delayOf(order, activeWorkOrder(db.workOrders, order.id), today);
                const total = orderTotal(order.lines);
                const balance = total - order.paidAmount;
                const shippedAt = db.histories.find((item) => item.entityId === order.id && item.toStatus === "SHIPPING" && item.fromStatus !== "SHIPPING")?.at;
                return (
                  <tr key={order.id} className="border-t border-line align-top">
                    <td className="px-5 py-3"><Link className="font-semibold text-primary" to={`/orders/${order.id}`}>{order.orderNo}</Link></td>
                    <td className="py-3">
                      <p className="font-medium">{client?.companyName}</p>
                      <p className="text-xs text-muted" title={orderItems(db.products, order.lines).names.join("\n")}>{orderItemsText(db.products, order.lines)} · 총 {orderQuantity(order.lines).toLocaleString("ko-KR")}개</p>
                    </td>
                    <td className="max-w-48 py-3 text-xs">{order.shippingAddress}</td>
                    <td className="py-3">
                      <p>{order.dueDate}</p>
                      {delay ? <Badge className={cn("mt-1", delayTone(delay.level))}>{delay.reason}</Badge> : null}
                    </td>
                    <td className="py-3"><Badge className={orderStatusTone(order.status)}>{orderStatusLabel[order.status]}</Badge></td>
                    <td className="py-3 text-xs">
                      {tab === "SHIPPING" ? (
                        <>
                          <p>{order.carrier} {order.trackingNo}</p>
                          {shippedAt ? <p className="text-muted">출고 {localDateTime(shippedAt)}</p> : null}
                        </>
                      ) : tab === "BALANCE" ? (
                        <>
                          <p className="font-semibold text-warning">{formatWon(balance)}</p>
                          <p className="text-muted">배송 완료 {order.completedAt ? localDate(order.completedAt) : "-"}</p>
                        </>
                      ) : (
                        <Badge className={paymentTone(order.paymentStatus)}>{paymentStatusLabel[order.paymentStatus]}</Badge>
                      )}
                    </td>
                    <td className="py-3 pr-5">
                      {tab === "PACKING" ? (
                        canProduce(user.role) ? <Button onClick={() => act(() => completePacking(order.id, user), "포장 완료로 변경했습니다.")}>포장 완료</Button> : <span className="text-xs text-muted">현장 관리자가 처리</span>
                      ) : null}
                      {tab === "PACKED" ? (
                        canManageOrders(user.role) ? <Button onClick={() => act(() => markReadyToShip(order.id, user), "출고대기로 변경했습니다.")}>출고 대기로</Button> : <span className="text-xs text-muted">수주 관리자가 처리</span>
                      ) : null}
                      {tab === "READY_TO_SHIP" ? (
                        canManageOrders(user.role) ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <select className="h-10 rounded-lg border border-line bg-white px-2" value={carriers[order.id] ?? CARRIERS[0]} onChange={(event) => setCarriers({ ...carriers, [order.id]: event.target.value })} aria-label="택배사">
                              {CARRIERS.map((name) => <option key={name}>{name}</option>)}
                            </select>
                            <input className="h-10 w-36 rounded-lg border border-line px-3" value={tracking[order.id] ?? ""} placeholder="운송장 번호" aria-label="운송장 번호" onChange={(event) => setTracking({ ...tracking, [order.id]: event.target.value.replace(/[^0-9-]/g, "") })} />
                            <Button onClick={() => act(() => shipOrder(order.id, carriers[order.id] ?? CARRIERS[0], tracking[order.id] ?? "", user), "출고했습니다. 거래처에 출고 알림을 보냈습니다.")}>출고</Button>
                          </div>
                        ) : <span className="text-xs text-muted">수주 관리자가 처리</span>
                      ) : null}
                      {tab === "SHIPPING" ? (
                        canManageOrders(user.role) ? <Button onClick={() => act(() => completeDelivery(order.id, user), "배송 완료로 변경했습니다. 잔금 대기로 넘어갑니다.")}>배송 완료</Button> : <span className="text-xs text-muted">수주 관리자가 처리</span>
                      ) : null}
                      {tab === "BALANCE" ? (
                        canManageOrders(user.role) ? (
                          <div className="flex items-center gap-2">
                            <input className="h-10 w-32 rounded-lg border border-line px-3" type="number" min={1} max={balance} value={payments[order.id] ?? String(balance)} aria-label="입금 금액" onChange={(event) => setPayments({ ...payments, [order.id]: event.target.value })} />
                            <Button onClick={() => act(() => recordPayment(order.id, Number(payments[order.id] ?? balance), user), "잔금 입금을 반영했습니다.")}>입금 확인</Button>
                          </div>
                        ) : <span className="text-xs text-muted">수주 관리자가 처리</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? <tr><td colSpan={7} className="px-5 py-10 text-center text-muted">처리할 수주가 없습니다.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
