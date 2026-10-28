import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Badge, Button } from "@/components/ui.tsx";
import { useDb } from "@/lib/db.ts";
import { localDate, todayISO } from "@/lib/dates.ts";
import { activeWorkOrder, delayOf, delayTone } from "@/lib/delay.ts";
import { orderItems, orderItemsText } from "@/lib/orderText.ts";
import { orderStatusLabel, orderStatusTone, paymentStatusLabel, paymentTone, registrationLabel, registrationStatus, registrationTone, workStatusOrder } from "@/lib/labels.ts";
import { formatWon, orderQuantity, orderTotal } from "@/lib/money.ts";
import { canManageOrders, useAuthStore } from "@/stores/useAuthStore.ts";
import type { OrderStatus, PaymentStatus } from "@/types/domain.ts";

export function OrderListPage() {
  const db = useDb();
  const role = useAuthStore((state) => state.user?.role);
  const [tab, setTab] = useState<"open" | "done">("open");
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [registration, setRegistration] = useState<"" | "RESERVED" | "CONFIRMED">("");
  const [payment, setPayment] = useState<PaymentStatus | "">("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(0);
  const month = todayISO().slice(0, 7);
  const rows = useMemo(() => db.orders.filter((order) => {
    const client = db.clients.find((item) => item.id === order.clientId);
    const text = `${order.orderNo} ${client?.companyName ?? ""} ${orderItems(db.products, order.lines).names.join(" ")}`.includes(keyword.trim());
    const inTab = tab === "done" ? order.status === "COMPLETED" : order.status !== "COMPLETED" && order.status !== "CANCELLED";
    const registered = !registration || registrationStatus(order.status) === registration;
    return text && inTab && registered && (!status || order.status === status) && (!payment || order.paymentStatus === payment);
  }), [db, keyword, payment, registration, status, tab]);
  const slice = rows.slice(page * 8, page * 8 + 8);
  const waiting = db.orders.filter((order) => order.status === "CONFIRMED").length;
  const making = db.orders.filter((order) => order.status === "IN_PRODUCTION" || order.status === "PACKING" || order.status === "ON_HOLD").length;
  const shipping = db.orders.filter((order) => order.status === "PACKED" || order.status === "READY_TO_SHIP" || order.status === "SHIPPING").length;
  const done = db.orders.filter((order) => order.status === "COMPLETED" && order.completedAt && localDate(order.completedAt).startsWith(month)).length;
  const finished = db.orders.filter((order) => order.status === "COMPLETED");

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">수주 및 생산기록</h1>
          <p className="mt-1 text-muted">생산 예정부터 완료 기록까지, 모든 수주의 흐름을 한곳에서 관리합니다.</p>
        </div>
        <div className="flex gap-2">
          <Button tone="ghost" onClick={() => download(db.orders.map((order) => {
            const client = db.clients.find((item) => item.id === order.clientId);
            return [order.orderNo, client?.companyName ?? "", order.dueDate, registrationLabel(order.status), orderStatusLabel[order.status], paymentStatusLabel[order.paymentStatus], String(orderTotal(order.lines))].join(",");
          }).join("\n"), "수주목록.csv")}>엑셀 내보내기</Button>
          {canManageOrders(role) ? <Link to="/quotes?pending=1" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 font-semibold text-white">승인 견적에서 등록</Link> : null}
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <Metric label="생산대기" value={`${waiting}건`} />
        <Metric label="생산중" value={`${making}건`} />
        <Metric label="배송중" value={`${shipping}건`} />
        <Metric label="이번 달 완료" value={`${done}건`} />
      </div>
      <section className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
        <div className="flex gap-4 border-b border-line px-5 pt-4 text-sm">
          <button type="button" className={tab === "open" ? "border-b-2 border-primary pb-3 font-semibold text-primary" : "pb-3 text-muted"} onClick={() => { setTab("open"); setPage(0); }}>생산 예정 · {db.orders.filter((order) => order.status !== "COMPLETED" && order.status !== "CANCELLED").length}</button>
          <button type="button" className={tab === "done" ? "border-b-2 border-primary pb-3 font-semibold text-primary" : "pb-3 text-muted"} onClick={() => { setTab("done"); setPage(0); }}>과거 생산기록 {finished.length}</button>
        </div>
        <div className="flex flex-wrap gap-2 p-4">
          <input className="h-10 min-w-56 flex-1 rounded-lg border border-line px-3" value={keyword} placeholder="수주번호, 클라이언트, 품목 검색" onChange={(event) => { setKeyword(event.target.value); setPage(0); }} />
          <select className="h-10 rounded-lg border border-line bg-white px-3" value={registration} onChange={(event) => { setRegistration(event.target.value as "" | "RESERVED" | "CONFIRMED"); setPage(0); }}>
            <option value="">등록 전체</option>
            <option value="RESERVED">예정</option>
            <option value="CONFIRMED">확정</option>
          </select>
          <select className="h-10 rounded-lg border border-line bg-white px-3" value={status} onChange={(event) => { setStatus(event.target.value as OrderStatus | ""); setPage(0); }}>
            <option value="">작업 전체</option>
            {workStatusOrder.map((key) => <option key={key} value={key}>{orderStatusLabel[key]}</option>)}
          </select>
          <select className="h-10 rounded-lg border border-line bg-white px-3" value={payment} onChange={(event) => { setPayment(event.target.value as PaymentStatus | ""); setPage(0); }}>
            <option value="">입금 전체</option>
            {Object.entries(paymentStatusLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <Button tone="ghost" onClick={() => { setKeyword(""); setStatus(""); setRegistration(""); setPayment(""); setPage(0); }}>초기화</Button>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-left">
          <thead className="bg-primary-soft/40 text-muted">
            <tr>
              <th className="px-5 py-3 font-medium">수주번호 / 클라이언트</th>
              <th className="py-3 font-medium">생산품목</th>
              <th className="py-3 font-medium">수주 금액</th>
              <th className="py-3 font-medium">납기일</th>
              <th className="py-3 font-medium">수주 등록</th>
              <th className="py-3 font-medium">작업 상태</th>
              <th className="py-3 font-medium">입금 확인</th>
              <th className="py-3 pr-5 font-medium">배송 알림 내역</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((order) => {
              const client = db.clients.find((item) => item.id === order.clientId);
              const items = orderItems(db.products, order.lines);
              return (
                <tr key={order.id} className="border-t border-line">
                  <td className="px-5 py-3">
                    <Link className="font-semibold text-ink" to={`/orders/${order.id}`}>{order.orderNo}</Link>
                    <p className="text-muted">{client?.companyName}</p>
                  </td>
                  <td className="py-3">
                    {items.extra ? (
                      <>
                        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">{order.lines.length}개 품목 · 총 {orderQuantity(order.lines).toLocaleString("ko-KR")}개</span>
                        <ul className="mt-1 space-y-0.5 text-sm">
                          {items.names.map((name, index) => <li key={order.lines[index]?.id ?? name} className="before:mr-1 before:text-muted before:content-['·']">{name}</li>)}
                        </ul>
                      </>
                    ) : (
                      <>{items.first}<p className="text-muted">{orderQuantity(order.lines).toLocaleString("ko-KR")}개</p></>
                    )}
                  </td>
                  <td className="font-semibold">{formatWon(orderTotal(order.lines))}</td>
                  <td>
                    {order.dueDate}
                    {(() => {
                      const delay = delayOf(order, activeWorkOrder(db.workOrders, order.id), todayISO());
                      return delay ? <span className={`ml-1 rounded px-1.5 py-0.5 text-xs font-semibold ${delayTone(delay.level)}`} title={delay.reason}>{delay.level === "late" ? "지연" : "주의"}</span> : null;
                    })()}
                  </td>
                  <td><Badge className={registrationTone(order.status)}>{registrationLabel(order.status)}</Badge></td>
                  <td><Badge className={orderStatusTone(order.status)}>{orderStatusLabel[order.status]}</Badge></td>
                  <td><Badge className={paymentTone(order.paymentStatus)}>{paymentStatusLabel[order.paymentStatus]}</Badge></td>
                  <td className="pr-5 text-muted">{order.trackingNo ? `${order.carrier} ${order.trackingNo}` : "발송 대기"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        <div className="flex items-center justify-between px-5 py-3 text-sm text-muted">
          <span>총 {rows.length}건 중 {rows.length === 0 ? 0 : page * 8 + 1}-{Math.min(rows.length, page * 8 + 8)}건 표시</span>
          <span className="flex gap-2">
            <Button tone="ghost" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>이전</Button>
            <Button tone="ghost" disabled={(page + 1) * 8 >= rows.length} onClick={() => setPage((current) => current + 1)}>다음</Button>
          </span>
        </div>
      </section>
      <section className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
        <h2 className="px-5 pt-5 font-semibold">최근 완료 기록</h2>
        <p className="px-5 text-sm text-muted">완료된 수주는 과거 생산기록에 보관됩니다.</p>
        <table className="mt-3 w-full text-left">
          <thead className="bg-primary-soft/40 text-muted">
            <tr><th className="px-5 py-3 font-medium">수주번호</th><th className="py-3 font-medium">클라이언트 / 품목</th><th className="py-3 font-medium">생산량</th><th className="py-3 font-medium">완료일</th><th className="py-3 pr-5 font-medium">입금</th></tr>
          </thead>
          <tbody>
            {finished.slice(0, 3).map((order) => {
              const client = db.clients.find((item) => item.id === order.clientId);
              return (
                <tr key={order.id} className="border-t border-line">
                  <td className="px-5 py-3"><Link className="font-semibold" to={`/orders/${order.id}`}>{order.orderNo}</Link></td>
                  <td>{client?.companyName} · {orderItemsText(db.products, order.lines)}</td>
                  <td>{orderQuantity(order.lines).toLocaleString("ko-KR")}개</td>
                  <td>{order.completedAt ? localDate(order.completedAt) : ""}</td>
                  <td className="pr-5"><Badge className={paymentTone(order.paymentStatus)}>{paymentStatusLabel[order.paymentStatus]}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <section className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-muted">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></section>;
}

function download(content: string, name: string) {
  const blob = new Blob([`\uFEFF수주번호,클라이언트,납기,수주등록,작업상태,입금,총액\n${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
