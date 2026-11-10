import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Badge, Button } from "@/components/ui.tsx";
import { readApiErrorMessage } from "@/lib/apiClient.ts";
import { localDate } from "@/lib/dates.ts";
import { delayTone } from "@/lib/delay.ts";
import { orderStatusTone, paymentStatusLabel, paymentTone, registrationLabel, registrationTone } from "@/lib/labels.ts";
import { formatWon } from "@/lib/money.ts";
import { exportOrders, getOrderStatuses, getOrderSummary, listOrders, screenOrderStatus, screenPaymentStatus, type OrderListItem, type OrderListQuery, type OrderStatusOption, type OrderSummary } from "@/lib/orderApi.ts";
import { canManageOrders, useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";
import type { ConfirmationStatus, PaymentStatus } from "@/types/domain.ts";

const emptySummary: OrderSummary = { waiting: 0, making: 0, shipping: 0, doneThisMonth: 0, openCount: 0, doneCount: 0 };

export function OrderListPage() {
  const role = useAuthStore((state) => state.user?.role);
  const show = useToastStore((state) => state.show);
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<"open" | "done">("open");
  const [statusCodeId, setStatusCodeId] = useState("");
  const [registration, setRegistration] = useState<ConfirmationStatus | "">("");
  const [payment, setPayment] = useState<PaymentStatus | "">("");
  const [keyword, setKeyword] = useState(() => searchParams.get("keyword") ?? "");
  const [page, setPage] = useState(0);
  const [summary, setSummary] = useState<OrderSummary>(emptySummary);
  const [statuses, setStatuses] = useState<OrderStatusOption[]>([]);
  const [rows, setRows] = useState<OrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [recent, setRecent] = useState<OrderListItem[]>([]);
  const [exporting, setExporting] = useState(false);
  const query = useMemo(
    () => listQuery(tab, keyword, registration, statusCodeId, payment, page),
    [tab, keyword, registration, statusCodeId, payment, page],
  );

  useEffect(() => {
    let ignore = false;
    getOrderSummary().then((next) => {
      if (!ignore) setSummary(next);
    }).catch((error: unknown) => {
      if (!ignore) show(readApiErrorMessage(error));
    });
    getOrderStatuses().then((next) => {
      if (!ignore) setStatuses([...next].sort((left, right) => left.sortOrder - right.sortOrder));
    }).catch((error: unknown) => {
      if (!ignore) show(readApiErrorMessage(error));
    });
    listOrders({ tab: "DONE", confirmationStatus: "CONFIRMED", sortType: "COMPLETED_AT", page: 0, size: 3 }).then((result) => {
      if (!ignore) setRecent(result.content);
    }).catch((error: unknown) => {
      if (!ignore) show(readApiErrorMessage(error));
    });
    return () => {
      ignore = true;
    };
  }, [show]);

  useEffect(() => {
    let ignore = false;
    listOrders(query).then((result) => {
      if (ignore) return;
      setRows(result.content);
      setTotal(result.totalElements);
    }).catch((error: unknown) => {
      if (ignore) return;
      setRows([]);
      setTotal(0);
      show(readApiErrorMessage(error));
    });
    return () => {
      ignore = true;
    };
  }, [query, show]);

  function changeTab(nextTab: "open" | "done") {
    setTab(nextTab);
    setStatusCodeId("");
    setRegistration("");
    setPage(0);
  }

  async function downloadCsv() {
    if (exporting) return;
    setExporting(true);
    try {
      const file = await exportOrders(query);
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = "수주목록.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error: unknown) {
      show(await blobErrorMessage(error));
    } finally {
      setExporting(false);
    }
  }

  const visibleStatuses = statuses.filter((item) => tab === "done"
    ? item.code === "COMPLETED" || item.code === "CANCELLED"
    : item.code !== "COMPLETED" && item.code !== "CANCELLED");
  const from = total === 0 ? 0 : page * 8 + 1;
  const to = Math.min(total, page * 8 + 8);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">수주 관리</h1>
          <p className="mt-1 text-muted">생산 예정부터 완료·취소까지, 모든 수주의 흐름을 한곳에서 관리합니다.</p>
        </div>
        <div className="flex gap-2">
          <Button tone="ghost" onClick={() => void downloadCsv()}>엑셀 내보내기</Button>
          {canManageOrders(role) ? <Link to="/quotations?pending=1" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 font-semibold text-white">승인 견적에서 등록</Link> : null}
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <Metric label="생산대기" value={`${summary.waiting}건`} />
        <Metric label="생산중" value={`${summary.making}건`} />
        <Metric label="배송중" value={`${summary.shipping}건`} />
        <Metric label="이번 달 완료" value={`${summary.doneThisMonth}건`} />
      </div>
      <section className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
        <div className="flex gap-4 border-b border-line px-5 pt-4 text-sm">
          <button type="button" className={tab === "open" ? "border-b-2 border-primary pb-3 font-semibold text-primary" : "pb-3 text-muted"} onClick={() => changeTab("open")}>생산 예정 · {summary.openCount}</button>
          <button type="button" className={tab === "done" ? "border-b-2 border-primary pb-3 font-semibold text-primary" : "pb-3 text-muted"} onClick={() => changeTab("done")}>종료 수주 · {summary.doneCount}</button>
        </div>
        <div className="flex flex-wrap gap-2 p-4">
          <input className="h-10 min-w-56 flex-1 rounded-lg border border-line px-3" value={keyword} placeholder="수주번호, 클라이언트, 품목 검색" onChange={(event) => { setKeyword(event.target.value); setPage(0); }} />
          <select className="h-10 rounded-lg border border-line bg-white px-3" value={registration} onChange={(event) => { setRegistration(event.target.value as ConfirmationStatus | ""); setPage(0); }}>
            <option value="">등록 전체</option>
            {tab === "open" ? <option value="PENDING">예정</option> : null}
            <option value="CONFIRMED">확정</option>
            {tab === "done" ? <option value="CANCELLED">취소</option> : null}
          </select>
          <select className="h-10 rounded-lg border border-line bg-white px-3" value={statusCodeId} onChange={(event) => { setStatusCodeId(event.target.value); setPage(0); }}>
            <option value="">작업 전체</option>
            {visibleStatuses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select className="h-10 rounded-lg border border-line bg-white px-3" value={payment} onChange={(event) => { setPayment(event.target.value as PaymentStatus | ""); setPage(0); }}>
            <option value="">입금 전체</option>
            {Object.entries(paymentStatusLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <Button tone="ghost" onClick={() => { setKeyword(""); setStatusCodeId(""); setRegistration(""); setPayment(""); setPage(0); }}>초기화</Button>
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
            {rows.map((order) => {
              const paymentStatus = screenPaymentStatus(order.paymentStatus);
              return (
                <tr key={order.id} className="border-t border-line">
                  <td className="px-5 py-3">
                    <Link className="font-semibold text-ink" to={`/orders/${order.id}`}>{order.orderNo}</Link>
                    <p className="text-muted">{order.clientCompany}</p>
                  </td>
                  <td className="py-3">
                    {order.items.length > 1 ? (
                      <>
                        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">{order.itemCount}개 품목 · 총 {order.totalQuantity.toLocaleString("ko-KR")}개</span>
                        <ul className="mt-1 space-y-0.5 text-sm">
                          {order.items.map((item) => <li key={item.id} className="before:mr-1 before:text-muted before:content-['·']">{item.productName} · {item.quantity.toLocaleString("ko-KR")}개</li>)}
                        </ul>
                      </>
                    ) : (
                      <>{order.items[0]?.productName ?? "품목 없음"}<p className="text-muted">{order.totalQuantity.toLocaleString("ko-KR")}개</p></>
                    )}
                  </td>
                  <td className="font-semibold">{formatWon(order.totalAmount)}</td>
                  <td>
                    {order.dueDate}
                    {order.delay ? <span className={`ml-1 rounded px-1.5 py-0.5 text-xs font-semibold ${delayTone(order.delay.level === "late" ? "late" : "risk")}`} title={order.delay.reason}>{order.delay.level === "late" ? "지연" : "주의"}</span> : null}
                  </td>
                  <td><Badge className={registrationTone(order.confirmationStatus)}>{registrationLabel(order.confirmationStatus)}</Badge></td>
                  <td><Badge className={orderStatusTone(screenOrderStatus(order.status))}>{order.statusName}</Badge></td>
                  <td><Badge className={paymentTone(paymentStatus)}>{paymentStatusLabel[paymentStatus]}</Badge></td>
                  <td className="pr-5 text-muted">{order.trackingNumber ? `${order.carrierName ?? ""} ${order.trackingNumber}` : "발송 대기"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        <div className="flex items-center justify-between px-5 py-3 text-sm text-muted">
          <span>총 {total}건 중 {from}-{to}건 표시</span>
          <span className="flex gap-2">
            <Button tone="ghost" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>이전</Button>
            <Button tone="ghost" disabled={(page + 1) * 8 >= total} onClick={() => setPage((current) => current + 1)}>다음</Button>
          </span>
        </div>
      </section>
      <section className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
        <h2 className="px-5 pt-5 font-semibold">최근 완료 기록</h2>
        <p className="px-5 text-sm text-muted">완료·취소 수주는 종료 수주에서 조회할 수 있습니다. 아래에는 완료된 수주만 표시합니다.</p>
        <table className="mt-3 w-full text-left">
          <thead className="bg-primary-soft/40 text-muted">
            <tr><th className="px-5 py-3 font-medium">수주번호</th><th className="py-3 font-medium">클라이언트 / 품목</th><th className="py-3 font-medium">생산량</th><th className="py-3 font-medium">완료일</th><th className="py-3 pr-5 font-medium">입금</th></tr>
          </thead>
          <tbody>
            {recent.map((order) => {
              const paymentStatus = screenPaymentStatus(order.paymentStatus);
              return (
                <tr key={order.id} className="border-t border-line">
                  <td className="px-5 py-3"><Link className="font-semibold" to={`/orders/${order.id}`}>{order.orderNo}</Link></td>
                  <td>{order.clientCompany} · {itemsText(order.items)}</td>
                  <td>{order.totalQuantity.toLocaleString("ko-KR")}개</td>
                  <td>{order.completedAt ? localDate(order.completedAt) : ""}</td>
                  <td className="pr-5"><Badge className={paymentTone(paymentStatus)}>{paymentStatusLabel[paymentStatus]}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function listQuery(tab: "open" | "done", keyword: string, registration: ConfirmationStatus | "", statusCodeId: string, payment: PaymentStatus | "", page: number): OrderListQuery {
  return {
    tab: tab === "done" ? "DONE" : "OPEN",
    keyword,
    confirmationStatus: registration || undefined,
    statusCodeId: statusCodeId ? Number(statusCodeId) : undefined,
    paymentStatus: payment === "PARTIAL" ? "PARTIALLY_PAID" : payment || undefined,
    sortType: "CREATED_AT",
    page,
    size: 8,
  };
}

function itemsText(items: Array<{ productName: string }>): string {
  if (items.length === 0) return "품목 없음";
  if (items.length === 1) return items[0].productName;
  return `${items[0].productName} 외 ${items.length - 1}개 품목`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <section className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-muted">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></section>;
}

async function blobErrorMessage(error: unknown): Promise<string> {
  const data = typeof error === "object" && error !== null && "response" in error
    ? (error as { response?: { data?: unknown } }).response?.data
    : undefined;
  if (data instanceof Blob) {
    try {
      const parsed: unknown = JSON.parse(await data.text());
      if (typeof parsed === "object" && parsed !== null && "message" in parsed && typeof parsed.message === "string") return parsed.message;
    } catch {
      return "파일을 내려받지 못했습니다.";
    }
  }
  return readApiErrorMessage(error);
}
