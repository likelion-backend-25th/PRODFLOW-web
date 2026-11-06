import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { ScheduleDrawer } from "@/components/ScheduleDrawer.tsx";
import { Badge } from "@/components/ui.tsx";
import { apiStatus, readApiErrorMessage } from "@/lib/apiClient.ts";
import { fetchDashboard, fetchWorkOrderStatusCodes, type WorkStatusCode } from "@/lib/dashboardApi.ts";
import { useDb } from "@/lib/db.ts";
import { addDays, parseISO, toISO, todayISO } from "@/lib/dates.ts";
import { orderStatusLabel, orderStatusTone, paymentStatusLabel, paymentTone, workOrderTone } from "@/lib/labels.ts";
import { formatWon } from "@/lib/money.ts";
import { orderItemsText } from "@/lib/orderText.ts";
import { factoryCapacity, isWorkingDay, occupiedOn } from "@/lib/schedule.ts";
import { canManageOrders, useAuthStore } from "@/stores/useAuthStore.ts";
import type { DashboardOrderStatusStatistics, DashboardPaymentStatus, DashboardResponse, DashboardRiskType } from "@/types/dashboard.ts";
import type { PaymentStatus, WorkOrderStatus } from "@/types/domain.ts";

type ProgressGroup = "WAITING" | "PRODUCING" | "SHIPPING";

const progressGroupLabel: Record<ProgressGroup, string> = {
  WAITING: "대기",
  PRODUCING: "생산중",
  SHIPPING: "배송중",
};

// 진행 중 건수는 대기·생산중·배송중만 센다. 완료·취소는 빼고, 포장완료는 출고 전이라 배송중에 넣는다. 한글 상태명으로 분기하지 않는다.
const progressGroupOf: Record<string, ProgressGroup | "EXCLUDED"> = {
  WAITING: "WAITING",
  CONFIRMED: "WAITING",
  PRODUCTION_READY: "WAITING",
  PREPARE: "WAITING",
  IN_PRODUCTION: "PRODUCING",
  ON_HOLD: "PRODUCING",
  PAUSE: "PRODUCING",
  PACKING: "PRODUCING",
  PRODUCE: "PRODUCING",
  PACK: "PRODUCING",
  SUSPEND: "PRODUCING",
  HALT: "PRODUCING",
  READY_TO_SHIP: "SHIPPING",
  SHIPPING: "SHIPPING",
  PACK_DONE: "SHIPPING",
  COMPLETED: "EXCLUDED",
  CANCELLED: "EXCLUDED",
};

const riskTypeTone: Record<DashboardRiskType, string> = {
  DELAYED: "bg-red-50 text-danger",
  URGENT: "bg-warning-soft text-warning",
};

// 작업지시 코드(WORK_ORDER_STATUS)와 수주 상태 코드를 위험 문구 단계로 묶는다. 한글 상태명으로 분기하지 않는다.
// 생산 중지(HALT)·생산보류(ON_HOLD)·중지(PAUSE)도 라인이 멈춘 상태라 일시정지와 같이 생산 중단으로 본다.
// 포장(PACK)·포장완료(PACK_DONE)·출고대기(READY_TO_SHIP)는 생산이 끝나 출고를 기다리는 단계다.
type RiskPhase = "PREPARE" | "PRODUCE" | "PAUSED" | "DONE" | "SHIPPING";

const riskPhaseOf: Record<string, RiskPhase> = {
  PREPARE: "PREPARE",
  WAITING: "PREPARE",
  PRODUCTION_READY: "PREPARE",
  CONFIRMED: "PREPARE",
  PRODUCE: "PRODUCE",
  IN_PRODUCTION: "PRODUCE",
  SUSPEND: "PAUSED",
  HALT: "PAUSED",
  ON_HOLD: "PAUSED",
  PAUSE: "PAUSED",
  PACK: "DONE",
  PACK_DONE: "DONE",
  READY_TO_SHIP: "DONE",
  SHIPPING: "SHIPPING",
};

const riskDetail: Record<RiskPhase, { late: string; soon: string }> = {
  PREPARE: { late: "생산 미착수", soon: "생산 미착수" },
  PRODUCE: { late: "생산 지연", soon: "생산 진행 중" },
  PAUSED: { late: "생산 중단", soon: "생산 중단" },
  DONE: { late: "출고 대기", soon: "출고 대기" },
  SHIPPING: { late: "배송 지연", soon: "배송 진행 중" },
};

function daysUntilDue(due: string, today: string): number {
  const dueDay = due.slice(0, 10);
  return Math.round((parseISO(dueDay).getTime() - parseISO(today).getTime()) / 86_400_000);
}

function riskReasonText(due: string, statusCode: string | undefined, today: string): string {
  const days = daysUntilDue(due, today);
  const overdue = days < 0;
  const head = overdue ? `납기 ${Math.abs(days)}일 초과` : `D-${days}`;
  const phase = statusCode ? riskPhaseOf[statusCode] : undefined;
  const detail = phase ? riskDetail[phase][overdue ? "late" : "soon"] : undefined;
  return detail ? `${head} · ${detail}` : head;
}

function riskReasonTone(due: string, today: string): string {
  return daysUntilDue(due, today) < 0 ? riskTypeTone.DELAYED : riskTypeTone.URGENT;
}

// 수주 상세는 기존 /orders/:orderId 다. 로컬 시드 id로 바꾸지 않고 API 수주 id를 넘긴다.
function orderDetailPath(orderId: number): string {
  return `/orders/${orderId}`;
}

export function DashboardPage() {
  const db = useDb();
  const role = useAuthStore((state) => state.user?.role);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const today = todayISO();
  const [period, setPeriod] = useState(() => monthRange(today));
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [workStatuses, setWorkStatuses] = useState<WorkStatusCode[]>([]);
  const [result, setResult] = useState<{ key: string; error: string | null } | null>(null);
  const periodKey = `${period.startDate}~${period.endDate}`;
  const loading = result?.key !== periodKey;
  const error = result?.key === periodKey ? result.error : null;

  useEffect(() => {
    let ignore = false;
    const [startDate = "", endDate = ""] = periodKey.split("~");
    void Promise.all([
      fetchDashboard(startDate, endDate),
      fetchWorkOrderStatusCodes().catch(() => [] as WorkStatusCode[]),
    ]).then(([response, codes]) => {
      if (ignore) return;
      setData(response);
      setWorkStatuses(codes);
      setResult({ key: periodKey, error: null });
    }).catch((reason: unknown) => {
      if (ignore) return;
      // 토큰 갱신까지 실패한 401은 세션이 끝난 것이므로 로그인으로 돌려보낸다.
      if (apiStatus(reason) === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setResult({ key: periodKey, error: readApiErrorMessage(reason) });
    });
    return () => {
      ignore = true;
    };
  }, [periodKey, logout, navigate]);

  const active = db.orders.filter((order) => order.status !== "CANCELLED");
  const days = weekdays(addDays(today, weekOffset * 7));
  const holidays = db.holidays.map((holiday) => holiday.date);
  const capacity = factoryCapacity(db.lines);
  const detailOrder = detailId ? db.orders.find((order) => order.id === detailId) : undefined;

  const risks = data?.deliveryRiskStatistics.items ?? [];
  const workStatusById = new Map(workStatuses.map((code) => [code.id, code]));
  const delayedCount = risks.filter((item) => item.riskType === "DELAYED").length;
  const urgentCount = risks.filter((item) => item.riskType === "URGENT").length;
  const unpaidCount = risks.filter((item) => item.paymentStatus === "UNPAID").length;
  const unpaidAmount = data?.summary.unpaidAmount ?? 0;
  const progress = groupProgress(data?.orderStatusStatistics ?? []);
  const inProgress = progress.WAITING + progress.PRODUCING + progress.SHIPPING;
  const weeks = data?.weeklyProductionStatistics ?? [];
  const scale = axisMax(Math.max(0, ...weeks.map((week) => Math.max(week.plannedQuantity, week.completedQuantity))));
  const ticks = [scale, (scale * 3) / 4, scale / 2, scale / 4, 0];
  const share = data?.productProductionShare;
  const slices = (share?.items ?? []).map((item, index, items) => {
    const start = items.slice(0, index).reduce((sum, prev) => sum + prev.productionShare, 0);
    return { ...item, start, end: start + item.productionShare };
  });
  const chartMonth = period.endDate.slice(0, 7).replace("-", "년 ");
  const notices = [
    delayedCount > 0 ? `지연 ${delayedCount}건` : "",
    urgentCount > 0 ? `주의 ${urgentCount}건` : "",
    unpaidCount > 0 ? `선금 미입금 ${unpaidCount}건` : "",
    unpaidAmount > 0 ? `미입금 ${formatWon(unpaidAmount)}` : "",
  ].filter((item) => item.length > 0);

  function selectMonth(value: string) {
    const [year, month] = value.split("-").map(Number);
    if (!year || !month) return;
    setPeriod(monthRange(`${year}-${String(month).padStart(2, "0")}-01`));
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">오늘의 생산 흐름</h1>
          <p className="mt-1 text-muted">{labelDate(today)} {weekdayLabel(today)}요일 · 오늘도 빈틈없는 생산 운영을 시작하세요.</p>
        </div>
        <div className="flex items-center gap-2">
          <MonthPicker value={period.startDate.slice(0, 7)} onChange={selectMonth} />
          {canManageOrders(role) ? <Link to="/quotations/new" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 font-semibold text-white">+ 견적 작성</Link> : null}
        </div>
      </div>
      {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-danger">{error}</p> : null}
      {loading && !data ? <p className="mt-4 rounded-xl border border-line bg-white px-4 py-3 text-muted">통계를 불러오는 중입니다.</p> : null}
      {data && notices.length > 0 ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-warning-soft px-4 py-3 text-warning">
          <span>{notices.join(" · ")}이 있습니다.{risks.length > 0 ? " 아래 목록에서 확인하세요." : ""}</span>
          {risks.length > 0 ? <a href="#risks" className="shrink-0 font-semibold">수주 확인 →</a> : null}
        </div>
      ) : null}
      {data ? (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <Metric
              label="이번 달 수주 건수"
              value={countUnit(data.orderStatistics.periodOrderCount)}
              hint={`이번 달 ${countUnit(data.orderStatistics.periodOrderCount)} · 전체 ${countUnit(data.orderStatistics.totalOrderCount)}`}
            />
            <Metric
              label="이번 달 누적 생산량"
              value={quantityUnit(data.summary.completedQuantity)}
              hint={`계획 ${quantityUnit(data.summary.plannedQuantity)} · 진행률 ${data.summary.productionProgressRate}%`}
              progress={data.summary.productionProgressRate}
            />
            <Metric
              label="납기 이행률"
              value={data.deliveryPerformance.totalOrderCount === 0 ? "-" : `${data.deliveryPerformance.onTimeDeliveryRate}%`}
              hint={`정시 납품 ${countUnit(data.deliveryPerformance.onTimeOrderCount)} / 전체 대상 ${countUnit(data.deliveryPerformance.totalOrderCount)}`}
            />
            <Metric label="진행 중인 수주" value={countUnit(inProgress)} hint={progressHint(progress)} />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
            <section className="rounded-xl border border-line bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold">월간 생산량</h2>
                  <p className="text-sm text-muted">{chartMonth}월 주차별 계획과 완료 · 단위: 개</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted">
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-primary-soft" />계획</span>
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-primary" />완료</span>
                </div>
              </div>
              {weeks.length === 0 ? <p className="mt-10 text-center text-sm text-muted">주간 생산 데이터가 없습니다.</p> : (
                <div className="mt-6 flex items-end gap-3">
                  <div className="flex h-40 flex-col justify-between text-right text-xs text-muted">
                    {ticks.map((tick) => <span key={tick}>{tick.toLocaleString("ko-KR")}</span>)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="relative h-40">
                      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                        {ticks.map((tick) => <div key={tick} className="border-t border-line" />)}
                      </div>
                      <div className="absolute inset-0 flex items-end">
                        {weeks.map((week) => (
                          <div key={week.week} className="flex h-full flex-1 items-end justify-center gap-1">
                            <div className="w-5 rounded-t bg-primary-soft" style={{ height: `${(week.plannedQuantity / scale) * 100}%` }} />
                            <div className="w-5 rounded-t bg-primary" style={{ height: `${(week.completedQuantity / scale) * 100}%` }} />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-2 flex">
                      {weeks.map((week) => (
                        <span key={week.week} className="flex-1 text-center text-xs text-muted">{week.week}주차</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>
            <section className="rounded-xl border border-line bg-white p-5">
              <h2 className="font-semibold">품목별 생산 비중</h2>
              <p className="text-sm text-muted">{chartMonth}월 생산 완료 수량 기준</p>
              <div className="mt-4 flex items-center gap-4">
                <div
                  className="grid h-36 w-36 shrink-0 place-items-center rounded-full bg-canvas"
                  style={slices.length > 0 ? { background: `conic-gradient(${slices.map((slice, index) => `${donutColor(index)} ${slice.start}% ${slice.end}%`).join(", ")})` } : undefined}
                >
                  <div className="grid h-20 w-20 place-items-center rounded-full bg-white text-center text-lg font-semibold">{(share?.totalCompletedQuantity ?? 0).toLocaleString("ko-KR")}<span className="block text-xs font-normal text-muted">개</span></div>
                </div>
                <ul className="min-w-0 flex-1 space-y-2 text-sm">
                  {slices.map((slice, index) => (
                    <li key={slice.productId} className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: donutColor(index) }} />
                        <span className="truncate">{slice.productName}</span>
                      </span>
                      <span className="shrink-0 text-muted">{slice.productionShare}%</span>
                    </li>
                  ))}
                  {slices.length === 0 ? <li className="text-muted">생산 완료된 품목이 없습니다.</li> : null}
                </ul>
              </div>
            </section>
          </div>
        </>
      ) : null}
      <section className="mt-4 rounded-xl border border-line bg-white p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">주간 생산 일정</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-sm text-muted">{weekRangeLabel(days[0] ?? today, days[4] ?? today)}</p>
              <button type="button" aria-label="이전 주" className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-white text-muted hover:bg-canvas" onClick={() => setWeekOffset((value) => value - 1)}>
                <ChevronLeft size={16} />
              </button>
              <button type="button" className="h-8 rounded-lg bg-primary-soft px-3 text-sm font-semibold text-primary" onClick={() => setWeekOffset(0)}>오늘</button>
              <button type="button" aria-label="다음 주" className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-white text-muted hover:bg-canvas" onClick={() => setWeekOffset((value) => value + 1)}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <Link to="/calendar" className="text-sm font-semibold text-primary">전체 일정 →</Link>
        </div>
        <div className="grid gap-3 md:grid-cols-5">
          {days.map((iso) => {
            const jobs = active.filter((order) => order.allocations.some((slot) => slot.date === iso));
            const working = isWorkingDay(iso, holidays);
            const left = Math.max(0, capacity - occupiedOn(iso, db.orders));
            return (
              <div key={iso} className={`flex h-[220px] flex-col rounded-xl p-3 ${iso === today ? "bg-primary-soft" : "bg-canvas"}`}>
                <p className="text-sm font-semibold">{weekdayLabel(iso)} {Number(iso.slice(8))} {iso === today ? "오늘" : ""}</p>
                <p className="text-xs text-muted">
                  {jobs.length}건 · {working ? <span className={left === 0 ? "font-semibold text-warning" : "font-semibold text-primary"}>가용 생산량 {left.toLocaleString("ko-KR")}개</span> : "휴무"}
                </p>
                {jobs.length === 0 ? (
                  <p className="flex flex-1 items-center justify-center text-xs text-muted">등록된 일정 없음</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {jobs.slice(0, 2).map((order) => {
                      const client = db.clients.find((item) => item.id === order.clientId);
                      return (
                        <li key={order.id}>
                          <button type="button" className="w-full rounded-lg bg-white p-2 text-left hover:ring-1 hover:ring-primary" onClick={() => setDetailId(order.id)}>
                            <span className="block font-semibold text-primary">{client?.companyName}</span>
                            <span className="block truncate text-xs text-muted">{orderItemsText(db.products, order.lines)}</span>
                            <Badge className={orderStatusTone(order.status)}>{orderStatusLabel[order.status]}</Badge>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>
      {data ? (
        <section id="risks" className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
          <div className="flex items-center justify-between px-5 pt-5">
            <div>
              <h2 className="font-semibold">납기 위험 수주</h2>
              <p className="text-xs text-muted">납기일이 지났거나 3일 이내인 수주</p>
            </div>
            <Link to="/orders" className="text-sm font-semibold text-primary">수주 목록으로 →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="mt-3 w-full min-w-[920px] text-left text-sm">
              <thead className="bg-primary-soft/40 text-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">수주번호</th>
                  <th className="px-4 py-3 font-medium">클라이언트 / 품목</th>
                  <th className="px-4 py-3 font-medium">납기일</th>
                  <th className="px-4 py-3 font-medium">작업 상태</th>
                  <th className="px-4 py-3 font-medium">위험 사유</th>
                  <th className="px-4 py-3 font-medium">입금 상태</th>
                  <th className="w-14 py-3 pr-4 font-medium"><span className="sr-only">수주 상세</span></th>
                </tr>
              </thead>
              <tbody>
                {risks.map((item) => {
                  const workStatus = workStatusById.get(item.statusCode);
                  return (
                    <tr key={item.orderId} className="border-t border-line">
                      <td className="px-5 py-3 align-middle font-semibold whitespace-nowrap">{item.orderNo}</td>
                      <td className="px-4 py-3 align-middle">
                        <span className="block">{item.customerName}</span>
                        <span className="block text-xs text-muted">{item.productName} · {item.quantity.toLocaleString("ko-KR")}개</span>
                      </td>
                      <td className="px-4 py-3 align-middle whitespace-nowrap">
                        <span className="block">{dotDate(item.requestedDueDate)}</span>
                        {item.plannedEndDate ? <span className="block text-xs text-muted">완료 예정 {dotDate(item.plannedEndDate)}</span> : null}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        {workStatus ? <Badge className={workStatusTone(workStatus.code)}>{workStatus.name}</Badge> : <span className="text-muted">-</span>}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <Badge className={`whitespace-nowrap ${riskReasonTone(item.requestedDueDate, today)}`}>{riskReasonText(item.requestedDueDate, workStatus?.code, today)}</Badge>
                      </td>
                      <td className="px-4 py-3 align-middle"><Badge className={`whitespace-nowrap ${paymentTone(toPaymentStatus(item.paymentStatus))}`}>{paymentStatusLabel[toPaymentStatus(item.paymentStatus)]}</Badge></td>
                      <td className="pr-4 align-middle">
                        <Link to={orderDetailPath(item.orderId)} aria-label={`${item.orderNo} 수주 상세`} className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-canvas hover:text-primary">
                          <ChevronRight size={18} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {risks.length === 0 ? <tr><td colSpan={7} className="px-5 py-8 text-center text-muted">납기 위험 수주가 없습니다.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {detailOrder ? (
        <ScheduleDrawer
          order={detailOrder}
          clients={db.clients}
          products={db.products}
          users={db.users}
          workOrders={db.workOrders}
          today={today}
          onClose={() => setDetailId(null)}
        />
      ) : null}
    </div>
  );
}

function MonthPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [yearText = "", monthText = ""] = value.split("-");
  const selectedYear = Number(yearText);
  const selectedMonth = Number(monthText);
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(selectedYear);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="조회 월"
        aria-expanded={open}
        className="flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm"
        onClick={() => {
          setViewYear(selectedYear);
          setOpen((current) => !current);
        }}
      >
        <Calendar size={16} className="text-muted" />
        <span>{selectedYear}년 {selectedMonth}월</span>
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-line bg-white p-3">
          <div className="flex items-center justify-between">
            <button type="button" className="h-8 w-8 rounded-md text-muted hover:bg-canvas" aria-label="이전 해" onClick={() => setViewYear((year) => year - 1)}>‹</button>
            <p className="text-sm font-semibold">{viewYear}</p>
            <button type="button" className="h-8 w-8 rounded-md text-muted hover:bg-canvas" aria-label="다음 해" onClick={() => setViewYear((year) => year + 1)}>›</button>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1">
            {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => {
              const selected = viewYear === selectedYear && month === selectedMonth;
              return (
                <button
                  key={month}
                  type="button"
                  aria-label={`${viewYear}년 ${month}월`}
                  className={selected ? "h-9 rounded-md bg-primary font-semibold text-white" : "h-9 rounded-md hover:bg-canvas"}
                  onClick={() => {
                    onChange(`${viewYear}-${String(month).padStart(2, "0")}`);
                    setOpen(false);
                  }}
                >
                  {month}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value, hint, progress }: { label: string; value: string; hint: string; progress?: number }) {
  const rate = progress === undefined ? undefined : Math.min(100, Math.max(0, progress));
  return (
    <section className="rounded-xl border border-line bg-white p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
      {rate !== undefined ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary-soft" role="progressbar" aria-valuenow={rate} aria-valuemin={0} aria-valuemax={100} aria-label="계획 대비 진행률">
          <div className="h-full rounded-full bg-primary" style={{ width: `${rate}%` }} />
        </div>
      ) : null}
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </section>
  );
}

function groupProgress(rows: DashboardOrderStatusStatistics[]): Record<ProgressGroup, number> {
  const counts: Record<ProgressGroup, number> = { WAITING: 0, PRODUCING: 0, SHIPPING: 0 };
  rows.forEach((row) => {
    const group = progressGroupOf[row.statusCode];
    if (group && group !== "EXCLUDED") counts[group] += row.orderCount;
  });
  return counts;
}

function progressHint(progress: Record<ProgressGroup, number>): string {
  return (Object.keys(progressGroupLabel) as ProgressGroup[])
    .map((group) => `${progressGroupLabel[group]} ${countUnit(progress[group])}`)
    .join(" · ");
}

function countUnit(count: number): string {
  return `${count.toLocaleString("ko-KR")}건`;
}

function quantityUnit(quantity: number): string {
  return `${quantity.toLocaleString("ko-KR")}개`;
}

const workOrderStatuses: readonly WorkOrderStatus[] = ["PREPARE", "PRODUCE", "SUSPEND", "HALT", "PACK", "PACK_DONE"];

function workStatusTone(code: string): string {
  return workOrderStatuses.includes(code as WorkOrderStatus) ? workOrderTone(code as WorkOrderStatus) : "bg-slate-100 text-muted";
}

// 백엔드 OrderPaymentStatus는 계약금 입금을 PARTIALLY_PAID로 보내므로 프론트 PARTIAL 라벨로 맞춘다.
function toPaymentStatus(status: DashboardPaymentStatus): PaymentStatus {
  return status === "PARTIALLY_PAID" ? "PARTIAL" : status;
}

function monthRange(today: string): { startDate: string; endDate: string } {
  const [year, month] = today.split("-").map(Number);
  const start = new Date(year ?? 1970, (month ?? 1) - 1, 1);
  const end = new Date(year ?? 1970, month ?? 1, 0);
  return { startDate: toISO(start), endDate: toISO(end) };
}

function axisMax(maxValue: number): number {
  if (maxValue <= 0) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(maxValue));
  const leading = maxValue / magnitude;
  const nice = leading <= 1 ? 1 : leading <= 2 ? 2 : leading <= 4 ? 4 : leading <= 5 ? 5 : 10;
  return nice * magnitude;
}

function dotDate(iso: string): string {
  return iso.replaceAll("-", ".");
}

function donutColor(index: number): string {
  const colors = ["var(--color-primary)", "color-mix(in srgb, var(--color-primary) 70%, white)", "color-mix(in srgb, var(--color-primary) 45%, white)", "var(--color-muted)"];
  return colors[index % colors.length] ?? "var(--color-primary)";
}

function weekdays(today: string): string[] {
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  const weekday = date.getDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  date.setDate(date.getDate() + mondayOffset);
  return Array.from({ length: 5 }, (_, index) => {
    const next = new Date(date);
    next.setDate(date.getDate() + index);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
  });
}

function weekRangeLabel(start: string, end: string): string {
  const [, startMonth, startDay] = start.split("-");
  const [, endMonth, endDay] = end.split("-");
  return `${Number(startMonth)}월 ${Number(startDay)}일 ~ ${Number(endMonth)}월 ${Number(endDay)}일`;
}

function weekdayLabel(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return ["일", "월", "화", "수", "목", "금", "토"][new Date(year, (month ?? 1) - 1, day ?? 1).getDay()] ?? "";
}

function labelDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}
