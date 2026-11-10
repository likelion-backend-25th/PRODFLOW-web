import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router";
import axios from "axios";
import { Badge, Button } from "@/components/ui.tsx";
import { readApiErrorMessage } from "@/lib/apiClient.ts";
import { cn } from "@/lib/cn.ts";
import { localDateTime } from "@/lib/dates.ts";
import { orderStatusLabel, orderStatusTone, paymentStatusLabel, paymentTone } from "@/lib/labels.ts";
import { formatWon } from "@/lib/money.ts";
import { getOrderPayments, screenOrderStatus, screenPaymentStatus } from "@/lib/orderApi.ts";
import { completeShipment, listCarriers, listShipments, markReadyToShip, refreshShipmentTracking, registerShipment, type Carrier, type ShipmentList, type ShipmentListItem, type ShipmentTab } from "@/lib/shipmentApi.ts";
import { canManageOrders, useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";

const tabs: Array<{ id: ShipmentTab; label: string; card: string; hint: string }> = [
  { id: "PACKING", label: "포장중", card: "포장 완료", hint: "생산이 끝나 포장 완료인 수주" },
  { id: "READY_TO_SHIP", label: "출고대기", card: "출고대기", hint: "운송장 입력 후 출고" },
  { id: "SHIPPING", label: "배송중", card: "배송중", hint: "출고 후 거래처 도착 전" },
  { id: "BALANCE", label: "잔금 대기", card: "잔금 대기", hint: "배송 완료 · 거래처 확인 후 잔금 입금 대기" },
];

const emptyCounts = { packing: 0, readyToShip: 0, shipping: 0, balance: 0 };

function countOf(tab: ShipmentTab, counts: ShipmentList["counts"]): number {
  if (tab === "PACKING") return counts.packing;
  if (tab === "READY_TO_SHIP") return counts.readyToShip;
  if (tab === "SHIPPING") return counts.shipping;
  return counts.balance;
}

function dateText(value: string | null): string {
  if (!value) return "-";
  return value.slice(0, 10);
}

const SHIPMENT_PAGE_SIZE = 10;

function pageNumbers(page: number, totalPages: number): number[] {
  if (totalPages <= 0) return [];
  const current = Math.min(page + 1, totalPages);
  const start = Math.max(1, current - 2);
  const end = Math.min(totalPages, start + 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function ShippingPage() {
  const user = useAuthStore((state) => state.user);
  const show = useToastStore((state) => state.show);
  const [tab, setTab] = useState<ShipmentTab>("READY_TO_SHIP");
  const [page, setPage] = useState(0);
  const [list, setList] = useState<ShipmentList | null>(null);
  const [balances, setBalances] = useState<Record<number, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [carrierOptions, setCarrierOptions] = useState<Carrier[]>([]);
  const [carriers, setCarriers] = useState<Record<number, string>>({});
  const [tracking, setTracking] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let ignore = false;
    listCarriers().then((items) => {
      if (!ignore) setCarrierOptions(items);
    }).catch((reason: unknown) => {
      if (!ignore) show(readApiErrorMessage(reason));
    });
    return () => {
      ignore = true;
    };
  }, [show]);

  useEffect(() => {
    let ignore = false;
    let accepted = false;
    setLoading(true);
    listShipments(tab, page).then(async (result) => {
      if (ignore) return;
      const totalPages = result.page.totalPages;
      if (page > 0 && page >= totalPages) {
        setPage(Math.max(0, totalPages - 1));
        return;
      }
      accepted = true;
      setList(result);
      setError("");
      if (tab !== "BALANCE") {
        setBalances({});
        return;
      }
      const entries = await Promise.all(result.page.content.map(async (item) => {
        try {
          const payment = await getOrderPayments(item.orderId);
          return [item.orderId, payment.balanceAmount] as const;
        } catch {
          return [item.orderId, null] as const;
        }
      }));
      if (!ignore) setBalances(Object.fromEntries(entries));
    }).catch((reason: unknown) => {
      if (ignore) return;
      accepted = true;
      const message = readApiErrorMessage(reason);
      setError(message);
      show(message);
    }).finally(() => {
      if (!ignore && accepted) setLoading(false);
    });
    return () => {
      ignore = true;
    };
  }, [page, tab, reloadKey, show]);

  if (!user) return null;
  const counts = list?.counts ?? emptyCounts;
  const currentPage = list?.tab === tab ? list.page : null;
  const rows = currentPage?.content ?? [];
  const totalElements = currentPage?.totalElements ?? 0;
  const totalPages = currentPage?.totalPages ?? 0;
  const numbers = pageNumbers(page, totalPages);
  const rangeStart = totalElements === 0 ? 0 : page * SHIPMENT_PAGE_SIZE + 1;
  const rangeEnd = Math.min(totalElements, page * SHIPMENT_PAGE_SIZE + rows.length);
  const canShip = canManageOrders(user.role);
  const defaultCarrier = carrierOptions[0]?.code ?? "";

  async function run(orderId: number, action: () => Promise<string>) {
    if (busyId !== null) return;
    setBusyId(orderId);
    try {
      show(await action());
      setReloadKey((value) => value + 1);
    } catch (reason: unknown) {
      show(reason instanceof Error && !axios.isAxiosError(reason) ? reason.message : readApiErrorMessage(reason));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold">배송 관리</h1>
        <p className="mt-1 text-sm text-muted">포장중, 출고대기, 배송중, 잔금 대기를 조회하고 운송장 등록과 배송 완료를 처리합니다.</p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {tabs.map((item) => (
          <button key={item.id} type="button" className={cn("rounded-xl border bg-white p-4 text-left", tab === item.id ? "border-primary ring-1 ring-primary" : "border-line")} onClick={() => { setTab(item.id); setPage(0); }}>
            <p className="text-sm text-muted">{item.card}</p>
            <p className="mt-2 text-2xl font-semibold">{countOf(item.id, counts)}건</p>
            <p className="mt-1 text-xs text-muted">{item.hint}</p>
          </button>
        ))}
      </div>

      <section className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
        <div className="flex items-center justify-between px-5 py-3">
          <h2 className="font-semibold">{tabs.find((item) => item.id === tab)?.label} 목록</h2>
          <span className="text-sm text-muted">납기 빠른 순 · {loading ? "불러오는 중" : `총 ${totalElements}건`}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-primary-soft/40 text-muted">
              <tr>
                <th className="px-5 py-3 font-medium">수주번호</th>
                <th className="py-3 font-medium">거래처 / 품목</th>
                <th className="py-3 font-medium">배송지</th>
                <th className="py-3 font-medium">납기</th>
                {tab === "PACKING" ? null : <th className="py-3 font-medium">상태</th>}
                <th className="py-3 font-medium">{tab === "BALANCE" ? "잔금" : tab === "SHIPPING" ? "운송장" : "입금"}</th>
                <th className="py-3 pr-5 font-medium">처리</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => (
                <ShipmentRow
                  key={order.orderId}
                  order={order}
                  tab={tab}
                  canShip={canShip}
                  busy={busyId === order.orderId}
                  carrierOptions={carrierOptions}
                  carrier={carriers[order.orderId] ?? defaultCarrier}
                  trackingNo={tracking[order.orderId] ?? ""}
                  balance={balances[order.orderId]}
                  onCarrier={(value) => setCarriers({ ...carriers, [order.orderId]: value })}
                  onTracking={(value) => setTracking({ ...tracking, [order.orderId]: value.replace(/[^0-9-]/g, "") })}
                  onReady={() => void run(order.orderId, async () => {
                    await markReadyToShip(order.orderId);
                    setTab("READY_TO_SHIP");
                    setPage(0);
                    return "출고 대기로 변경했습니다.";
                  })}
                  onShip={() => void run(order.orderId, async () => {
                    const carrierCode = carriers[order.orderId] ?? defaultCarrier;
                    const number = (tracking[order.orderId] ?? "").trim();
                    if (!carrierCode) throw new Error("택배사를 선택하세요.");
                    if (!number) throw new Error("운송장 번호를 입력하세요.");
                    await registerShipment(order.orderId, carrierCode, number);
                    return "출고했습니다.";
                  })}
                  onComplete={() => void run(order.orderId, async () => {
                    if (order.shipmentId == null) throw new Error("운송장 정보가 없어 배송 완료할 수 없습니다.");
                    await completeShipment(order.shipmentId);
                    return "배송 완료로 변경했습니다.";
                  })}
                  onRefresh={() => void run(order.orderId, async () => {
                    if (order.shipmentId == null) throw new Error("운송장 정보가 없어 상태를 갱신할 수 없습니다.");
                    const updated = await refreshShipmentTracking(order.shipmentId);
                    return updated.complete || updated.orderStatus === "COMPLETED" ? "배송이 완료되어 수주를 완료로 바꿨습니다." : "운송장 상태를 갱신했습니다.";
                  })}
                />
              ))}
              {!loading && error && rows.length === 0 ? <tr><td colSpan={tab === "PACKING" ? 6 : 7} className="px-5 py-10 text-center text-danger">{error}</td></tr> : null}
              {!loading && !error && rows.length === 0 ? <tr><td colSpan={tab === "PACKING" ? 6 : 7} className="px-5 py-10 text-center text-muted">처리할 수주가 없습니다.</td></tr> : null}
              {loading && rows.length === 0 ? <tr><td colSpan={tab === "PACKING" ? 6 : 7} className="px-5 py-10 text-center text-muted">배송 목록을 불러오는 중입니다.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-line px-5 py-3 text-xs text-muted">
          <span>총 {totalElements}건 중 {rangeStart === 0 ? 0 : `${rangeStart}–${rangeEnd}`}건 표시</span>
          <span className="flex items-center gap-1">
            <button type="button" className="grid size-7 place-items-center rounded-md disabled:opacity-30" disabled={page === 0 || loading} onClick={() => setPage((value) => value - 1)} aria-label="이전 페이지">
              <ChevronLeft className="size-4" />
            </button>
            {numbers.map((number) => (
              <button key={number} type="button" className={number === page + 1 ? "grid size-7 place-items-center rounded-md bg-primary-soft font-semibold text-primary" : "grid size-7 place-items-center rounded-md font-semibold text-ink"} onClick={() => setPage(number - 1)}>
                {number}
              </button>
            ))}
            <button type="button" className="grid size-7 place-items-center rounded-md disabled:opacity-30" disabled={loading || totalPages === 0 || page + 1 >= totalPages} onClick={() => setPage((value) => value + 1)} aria-label="다음 페이지">
              <ChevronRight className="size-4" />
            </button>
          </span>
        </div>
      </section>
    </div>
  );
}

function ShipmentRow({
  order,
  tab,
  canShip,
  busy,
  carrierOptions,
  carrier,
  trackingNo,
  balance,
  onCarrier,
  onTracking,
  onReady,
  onShip,
  onComplete,
  onRefresh,
}: {
  order: ShipmentListItem;
  tab: ShipmentTab;
  canShip: boolean;
  busy: boolean;
  carrierOptions: Carrier[];
  carrier: string;
  trackingNo: string;
  balance: number | null | undefined;
  onCarrier: (value: string) => void;
  onTracking: (value: string) => void;
  onReady: () => void;
  onShip: () => void;
  onComplete: () => void;
  onRefresh: () => void;
}) {
  const status = screenOrderStatus(order.orderStatus);
  const payment = screenPaymentStatus(order.paymentStatus);
  return (
    <tr className="border-t border-line align-top">
      <td className="px-5 py-3"><Link className="font-semibold text-primary" to={`/orders/${order.orderId}`}>{order.orderNo}</Link></td>
      <td className="py-3">
        <p className="font-medium">{order.clientName}</p>
        <p className="text-xs text-muted">{order.productSummary || "품목 없음"} · 총 {order.totalQuantity.toLocaleString("ko-KR")}개</p>
      </td>
      <td className="max-w-48 py-3 text-xs">{order.shippingAddress}</td>
      <td className="py-3">{dateText(order.estimatedDueDate)}</td>
      {tab === "PACKING" ? null : <td className="py-3"><Badge className={orderStatusTone(status)}>{orderStatusLabel[status]}</Badge></td>}
      <td className="py-3 text-xs">
        {tab === "SHIPPING" ? (
          <>
            <p>{order.carrierName} {order.trackingNumber}</p>
            {order.startedAt ? <p className="text-muted">출고 {localDateTime(order.startedAt)}</p> : null}
          </>
        ) : tab === "BALANCE" ? (
          <>
            <p className="font-semibold text-warning">{balance == null ? "잔금 조회 중" : formatWon(balance)}</p>
            <p className="text-muted">배송 완료 {dateText(order.deliveredAt)}</p>
            <Badge className={cn("mt-1", paymentTone(payment))}>{paymentStatusLabel[payment]}</Badge>
          </>
        ) : (
          <Badge className={paymentTone(payment)}>{paymentStatusLabel[payment]}</Badge>
        )}
      </td>
      <td className="py-3 pr-5">
        {tab === "PACKING" ? (
          canShip ? (
            // 포장중 목록은 작업지시가 모두 포장완료인 수주만 온다. 행을 숨기지 않고 출고 대기 버튼을 켜 둔다.
            <Button disabled={busy} onClick={onReady}>출고 대기</Button>
          ) : <span className="text-xs text-muted">포장중</span>
        ) : null}
        {tab === "READY_TO_SHIP" ? (
          canShip ? (
            <div className="flex flex-wrap items-center gap-2">
              <select className="h-10 rounded-lg border border-line bg-white px-2" value={carrier} onChange={(event) => onCarrier(event.target.value)} aria-label="택배사" disabled={carrierOptions.length === 0}>
                {carrierOptions.length === 0 ? <option value="">택배사 없음</option> : null}
                {carrierOptions.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
              </select>
              <input className="h-10 w-36 rounded-lg border border-line px-3" value={trackingNo} placeholder="운송장 번호" aria-label="운송장 번호" onChange={(event) => onTracking(event.target.value)} />
              <Button disabled={busy || !carrier} onClick={onShip}>출고</Button>
            </div>
          ) : <span className="text-xs text-muted">수주 관리자가 처리</span>
        ) : null}
        {tab === "SHIPPING" ? (
          canShip ? (
            <div className="flex flex-wrap gap-2">
              <Button tone="ghost" disabled={busy || order.shipmentId == null} onClick={onRefresh}>상태 갱신</Button>
              <Button disabled={busy || order.shipmentId == null} onClick={onComplete}>배송 완료</Button>
            </div>
          ) : <span className="text-xs text-muted">수주 관리자가 처리</span>
        ) : null}
        {tab === "BALANCE" ? <span className="text-xs text-muted">잔금은 수주 상세의 결제 내역에서 확인합니다.</span> : null}
      </td>
    </tr>
  );
}
