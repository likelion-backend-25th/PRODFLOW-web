import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { Bell, Calendar, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui.tsx";
import { apiStatus, readApiErrorMessage } from "@/lib/apiClient.ts";
import { fetchDashboard } from "@/lib/dashboardApi.ts";
import { addDays, parseISO, toISO, todayISO } from "@/lib/dates.ts";
import { paymentStatusLabel, paymentTone, workOrderStatusLabel, workOrderTone } from "@/lib/labels.ts";
import { formatWon } from "@/lib/money.ts";
import { fetchSentOrderNotifications, notifyNotificationsChanged, sendOrderDueNotification, type OrderNotificationType } from "@/lib/notificationApi.ts";
import { listOrderWorkOrders } from "@/lib/orderApi.ts";
import { asWorkOrderStatus, fetchProductionCalender, schedulesOnDate, type ProductionSchedule } from "@/lib/productionCalenderApi.ts";
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

const SHARE_PREVIEW_COUNT = 5;
const RISK_PAGE_SIZE = 10;

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

function dueNotificationType(due: string, today: string): OrderNotificationType {
  return daysUntilDue(due, today) < 0 ? "DELIVERY_DELAYED" : "DELIVERY_IMMINENT";
}

function noticeKey(orderId: number, type: OrderNotificationType): string {
  return `${orderId}:${type}`;
}

// 수주 상세는 기존 /orders/:orderId 다. 로컬 시드 id로 바꾸지 않고 API 수주 id를 넘긴다.
function orderDetailPath(orderId: number): string {
  return `/orders/${orderId}`;
}

function ScheduleJobLink({ job }: { job: ProductionSchedule }) {
  const status = asWorkOrderStatus(job.status);
  return (
    <Link to={`/work-orders/${job.workOrderId}`} className="flex w-full items-center gap-2 rounded-lg bg-white p-2 text-left hover:ring-1 hover:ring-primary">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-primary">{job.workNo}</span>
        <span className="block truncate text-xs text-muted">{job.orderNo} · {job.productName}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-xs text-muted">배정</span>
        <span className="block text-xs font-semibold">{job.quantity.toLocaleString("ko-KR")}개</span>
        {status ? <Badge className={workOrderTone(status)}>{workOrderStatusLabel[status]}</Badge> : <Badge>{job.status}</Badge>}
      </span>
    </Link>
  );
}

export function DashboardPage() {
  const role = useAuthStore((state) => state.user?.role);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const [weekOffset, setWeekOffset] = useState(0);
  const today = todayISO();
  const [selectedDate, setSelectedDate] = useState(today);
  const [moreDate, setMoreDate] = useState<string | null>(null);
  const [shareExpanded, setShareExpanded] = useState(false);
  const [riskPageIndex, setRiskPageIndex] = useState(0);
  const scheduleRef = useRef<HTMLElement>(null);
  const [period, setPeriod] = useState(() => monthRange(today));
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [workOrdersByOrder, setWorkOrdersByOrder] = useState<Map<number, WorkOrderStatus[]> | null>(null);
  const [result, setResult] = useState<{ key: string; error: string | null } | null>(null);
  const [schedules, setSchedules] = useState<ProductionSchedule[] | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [sentNoticeKeys, setSentNoticeKeys] = useState<Set<string> | null>(null);
  const [sendingOrderId, setSendingOrderId] = useState<number | null>(null);
  const [noticeError, setNoticeError] = useState<string | null>(null);
  const periodKey = `${period.startDate}~${period.endDate}`;
  const loading = result?.key !== periodKey;
  const error = result?.key === periodKey ? result.error : null;

  useEffect(() => {
    let ignore = false;
    const [startDate = "", endDate = ""] = periodKey.split("~");
    void fetchDashboard(startDate, endDate).then((response) => {
      if (ignore) return;
      setData(response);
      setResult({ key: periodKey, error: null });
    }).catch((reason: unknown) => {
      if (ignore) return;
      // 토큰 갱신까지 실패한 401은 세션이 끝난 것이므로 로그인으로 돌려보낸다.
      if (apiStatus(reason) === 401) {
        void logout();
        navigate("/login", { replace: true });
        return;
      }
      setResult({ key: periodKey, error: readApiErrorMessage(reason) });
    });
    return () => {
      ignore = true;
    };
  }, [periodKey, logout, navigate]);

  useEffect(() => {
    const orderIds = data?.deliveryRiskStatistics.items.map((item) => item.orderId) ?? [];
    if (!data) return;
    let ignore = false;
    void Promise.allSettled(orderIds.map(async (orderId) => {
      const rows = await listOrderWorkOrders(orderId);
      const statuses = rows.flatMap((row) => {
        const status = asWorkOrderStatus(row.status);
        return status ? [status] : [];
      });
      return [orderId, statuses] as const;
    })).then((rows) => {
      if (ignore) return;
      const loaded = rows.flatMap((row) => row.status === "fulfilled" ? [row.value] : []);
      setWorkOrdersByOrder(loaded.length === orderIds.length ? new Map(loaded) : null);
    });
    return () => {
      ignore = true;
    };
  }, [data]);

  useEffect(() => {
    if (!data) return;
    let ignore = false;
    void fetchSentOrderNotifications().then((rows) => {
      if (ignore) return;
      setSentNoticeKeys(new Set(rows.map((row) => noticeKey(row.orderId, row.notificationType))));
    }).catch((reason: unknown) => {
      if (ignore) return;
      if (apiStatus(reason) === 401) return;
      setNoticeError(readApiErrorMessage(reason));
      setSentNoticeKeys(new Set());
    });
    return () => {
      ignore = true;
    };
  }, [data]);

  useEffect(() => {
    let ignore = false;
    void fetchProductionCalender().then((rows) => {
      if (ignore) return;
      setSchedules(rows);
      setScheduleError(null);
    }).catch((reason: unknown) => {
      if (ignore) return;
      if (apiStatus(reason) === 401) return;
      setSchedules([]);
      setScheduleError(readApiErrorMessage(reason));
    });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!moreDate) return;
    function close(event: MouseEvent) {
      if (!scheduleRef.current?.contains(event.target as Node)) setMoreDate(null);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [moreDate]);

  const days = weekdays(addDays(today, weekOffset * 7));
  const scheduleRows = schedules ?? [];

  const risks = data?.deliveryRiskStatistics.items ?? [];
  const riskPageCount = Math.ceil(risks.length / RISK_PAGE_SIZE);
  // 목록이 줄어 저장된 페이지가 없어지면 마지막 페이지로 맞춘다.
  if (riskPageIndex > 0 && riskPageIndex > riskPageCount - 1) setRiskPageIndex(Math.max(0, riskPageCount - 1));
  const riskPage = riskPageCount === 0 ? 0 : Math.min(riskPageIndex, riskPageCount - 1);
  const riskRows = risks.slice(riskPage * RISK_PAGE_SIZE, riskPage * RISK_PAGE_SIZE + RISK_PAGE_SIZE);
  const delayedCount = risks.filter((item) => item.riskType === "DELAYED").length;
  const urgentCount = risks.filter((item) => item.riskType === "URGENT").length;
  const unpaidCount = risks.filter((item) => item.paymentStatus === "UNPAID").length;
  const unpaidAmount = data?.summary.unpaidAmount ?? 0;
  const progress = groupProgress(data?.orderStatusStatistics ?? []);
  const inProgress = progress.WAITING + progress.PRODUCING + progress.SHIPPING;
  const weeksMatchPeriod = result?.key === periodKey;
  const weeks = weeksMatchPeriod ? [...(data?.weeklyProductionStatistics ?? [])].sort((left, right) => left.week - right.week) : [];
  const orderTotal = data?.orderStatistics.totalOrderCount ?? 0;
  const orderRate = !data || orderTotal === 0 ? 0 : (data.orderStatistics.periodOrderCount / orderTotal) * 100;
  const scale = axisMax(Math.max(0, ...weeks.map((week) => Math.max(week.plannedQuantity, week.completedQuantity))));
  const ticks = [scale, (scale * 3) / 4, scale / 2, scale / 4, 0];
  const share = data?.productProductionShare;
  // 집계 응답은 품목 번호 순이다. 화면은 완료 수량이 많은 품목부터 보여 준다.
  const shareItems = [...(share?.items ?? [])].sort((left, right) => right.completedQuantity - left.completedQuantity || left.productId - right.productId);
  const slices = shareItems.map((item, index, items) => {
    const start = items.slice(0, index).reduce((sum, prev) => sum + prev.productionShare, 0);
    return { ...item, start, end: start + item.productionShare };
  });
  const hiddenShareCount = Math.max(0, slices.length - SHARE_PREVIEW_COUNT);
  const visibleSlices = shareExpanded ? slices : slices.slice(0, SHARE_PREVIEW_COUNT);
  const chartMonth = period.endDate.slice(0, 7).replace("-", "년 ");
  const notices = [
    delayedCount > 0 ? `지연 ${delayedCount}건` : "",
    urgentCount > 0 ? `주의 ${urgentCount}건` : "",
    unpaidCount > 0 ? `선금 미입금 ${unpaidCount}건` : "",
    unpaidAmount > 0 ? `미입금 ${formatWon(unpaidAmount)}` : "",
  ].filter((item) => item.length > 0);

  async function sendNotice(orderId: number) {
    if (sendingOrderId != null) return;
    setSendingOrderId(orderId);
    setNoticeError(null);
    try {
      const result = await sendOrderDueNotification(orderId);
      setSentNoticeKeys((current) => {
        const next = new Set(current);
        next.add(noticeKey(result.orderId, result.notificationType));
        return next;
      });
      notifyNotificationsChanged();
    } catch (reason: unknown) {
      if (apiStatus(reason) === 401) return;
      setNoticeError(readApiErrorMessage(reason));
    } finally {
      setSendingOrderId((current) => current === orderId ? null : current);
    }
  }

  function selectMonth(value: string) {
    const [year, month] = value.split("-").map(Number);
    if (!year || !month) return;
    setPeriod(monthRange(`${year}-${String(month).padStart(2, "0")}-01`));
    setShareExpanded(false);
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
              meter={<RateBar label="전체 수주 대비 이번 달 비율" rate={orderRate} />}
            />
            <Metric
              label="이번 달 누적 생산량"
              value={quantityUnit(data.summary.completedQuantity)}
              hint={data.summary.plannedQuantity === 0
                ? `계획 ${quantityUnit(data.summary.plannedQuantity)}`
                : `계획 ${quantityUnit(data.summary.plannedQuantity)} · 진행률 ${data.summary.productionProgressRate}%`}
              meter={<RateBar label="계획 대비 진행률" rate={data.summary.plannedQuantity === 0 ? 0 : data.summary.productionProgressRate} />}
            />
            <Metric
              label="납기 이행률"
              value={data.deliveryPerformance.totalOrderCount === 0 ? "-" : `${data.deliveryPerformance.onTimeDeliveryRate}%`}
              hint={`정시 납품 ${countUnit(data.deliveryPerformance.onTimeOrderCount)} / 전체 대상 ${countUnit(data.deliveryPerformance.totalOrderCount)}`}
              meter={<RateBar label="납기 이행률" rate={data.deliveryPerformance.totalOrderCount === 0 ? 0 : data.deliveryPerformance.onTimeDeliveryRate} />}
            />
            <Metric
              label="진행 중인 수주"
              value={countUnit(inProgress)}
              hint={<StatusLegend counts={progress} />}
              meter={<StatusBar counts={progress} />}
            />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
            <section className="rounded-xl border border-line bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold">월간 생산량</h2>
                  <p className="text-sm text-muted">{chartMonth}월 주차별 계획과 완료 · 단위: 개</p>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted">
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[#B8D9D5]" />계획</span>
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[#12786F]/90" />완료</span>
                </div>
              </div>
              {!weeksMatchPeriod || weeks.length === 0 ? <div className="mt-6 flex h-40 items-center justify-center text-sm text-muted">{weeksMatchPeriod ? "주간 생산 데이터가 없습니다." : ""}</div> : (
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
                          <div key={`${period.startDate}-${week.week}`} className="flex h-full min-w-0 flex-1 items-end justify-center gap-[8%]">
                            <div className="w-[36%] rounded-t bg-[#B8D9D5]" style={{ height: `${(week.plannedQuantity / scale) * 100}%` }} />
                            <div className="w-[36%] rounded-t bg-[#12786F]/90" style={{ height: `${(week.completedQuantity / scale) * 100}%` }} />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-2 flex">
                      {weeks.map((week) => (
                        <span key={`${period.startDate}-${week.week}`} className="min-w-0 flex-1 text-center text-xs text-muted">{week.week}주차</span>
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
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white px-1 text-sm font-semibold whitespace-nowrap">{(share?.totalCompletedQuantity ?? 0).toLocaleString("ko-KR")} <span className="font-normal text-muted">개</span></div>
                </div>
                <ul className="min-w-0 flex-1 space-y-2 text-sm">
                  {visibleSlices.map((slice, index) => (
                    <li key={slice.productId} className="flex items-start justify-between gap-3">
                      <span className="flex min-w-0 items-start gap-1.5">
                        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: donutColor(index) }} />
                        <span className="min-w-0">
                          <span className="block truncate">{slice.productName}</span>
                          <span className="block text-xs text-muted">{slice.completedQuantity.toLocaleString("ko-KR")}개</span>
                        </span>
                      </span>
                      <span className="shrink-0 text-muted">{slice.productionShare}%</span>
                    </li>
                  ))}
                  {slices.length === 0 ? <li className="text-muted">생산 완료된 품목이 없습니다.</li> : null}
                </ul>
              </div>
              {hiddenShareCount > 0 ? (
                <div className="mt-3 flex justify-end">
                  <button type="button" className="text-sm font-semibold text-primary" aria-expanded={shareExpanded} onClick={() => setShareExpanded((open) => !open)}>
                    {shareExpanded ? "접기" : `그 외 ${hiddenShareCount}개`}
                  </button>
                </div>
              ) : null}
            </section>
          </div>
        </>
      ) : null}
      <section ref={scheduleRef} className="mt-4 rounded-xl border border-line bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">주간 생산 일정</h2>
          <div className="flex flex-wrap items-center">
            <p className="text-sm text-muted">{weekRangeLabel(days[0] ?? today, days[4] ?? today)}</p>
            <div className="ml-3 flex items-center gap-2">
              <button type="button" aria-label="이전 주" className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-white text-muted hover:bg-canvas" onClick={() => { setWeekOffset((value) => value - 1); setMoreDate(null); }}>
                <ChevronLeft size={16} />
              </button>
              <button type="button" className="h-8 rounded-lg bg-primary-soft px-3 text-sm font-semibold text-primary" onClick={() => { setWeekOffset(0); setSelectedDate(today); setMoreDate(null); }}>오늘</button>
              <button type="button" aria-label="다음 주" className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-white text-muted hover:bg-canvas" onClick={() => { setWeekOffset((value) => value + 1); setMoreDate(null); }}>
                <ChevronRight size={16} />
              </button>
            </div>
            <Link to="/calendar" className="ml-6 text-sm font-semibold text-primary">전체 일정 →</Link>
          </div>
        </div>
        {schedules == null ? <p className="mb-3 text-sm text-muted">생산 일정을 불러오는 중입니다.</p> : null}
        {scheduleError ? <p className="mb-3 text-sm text-danger">{scheduleError}</p> : null}
        <div className="grid gap-3 md:grid-cols-5">
          {days.map((iso) => {
            const jobs = schedulesOnDate(scheduleRows, iso);
            const assigned = jobs.reduce((sum, job) => sum + job.quantity, 0);
            const shownCount = Math.min(jobs.length, 2);
            const hiddenCount = jobs.length - shownCount;
            const selected = selectedDate === iso;
            return (
              <div key={iso} className={`relative flex h-[300px] flex-col rounded-xl p-3 ${selected ? "bg-primary-soft ring-2 ring-primary" : "bg-canvas"}`}>
                <button type="button" className="flex items-center gap-1 text-left" aria-pressed={selected} onClick={() => { setSelectedDate(iso); setMoreDate(null); }}>
                  <span className="text-sm font-semibold">{weekdayLabel(iso)}</span>
                  <span className={iso === today ? "inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white" : "inline-flex h-6 w-6 items-center justify-center text-sm font-semibold"}>
                    {Number(iso.slice(8))}
                  </span>
                  {iso === today ? <span className="text-xs font-semibold text-primary">오늘</span> : null}
                </button>
                <div className="mt-2 grid grid-cols-2 gap-1 text-center">
                  <div className="rounded-md bg-white px-1 py-1" title="이 날짜의 생산계획에 있는 작업지시">
                    <p className="text-xs text-muted">작업지시</p>
                    <p className="text-xs font-semibold">{jobs.length}건</p>
                  </div>
                  <div className="rounded-md bg-white px-1 py-1" title="이 날짜 생산계획 수량의 합">
                    <p className="text-xs text-muted">배정</p>
                    <p className="text-xs font-semibold text-primary">{assigned.toLocaleString("ko-KR")}개</p>
                  </div>
                </div>
                {jobs.length === 0 ? (
                  <p className="flex flex-1 items-center justify-center text-xs text-muted">등록된 일정 없음</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {jobs.slice(0, shownCount).map((job) => (
                      <li key={job.workOrderId}>
                        <ScheduleJobLink job={job} />
                      </li>
                    ))}
                  </ul>
                )}
                {hiddenCount > 0 ? (
                  <button type="button" className="mt-auto self-end pt-1.5 text-xs font-semibold text-primary" aria-expanded={moreDate === iso} onClick={() => setMoreDate((current) => current === iso ? null : iso)}>
                    +{hiddenCount}건 더보기
                  </button>
                ) : null}
                {moreDate === iso ? (
                  <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-48 space-y-1 overflow-auto rounded-lg border border-line bg-white p-2 shadow-lg">
                    {jobs.slice(shownCount).map((job) => (
                      <li key={job.workOrderId}>
                        <ScheduleJobLink job={job} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
      {data ? (
        <section id="risks" className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
            <div>
              <h2 className="font-semibold">납기 위험 수주</h2>
              <p className="text-sm text-muted">납기일이 지났거나 3일 이내인 수주</p>
            </div>
            <Link to="/orders" className="text-sm font-semibold text-primary">수주 목록으로 →</Link>
          </div>
          {noticeError ? <p className="px-5 pt-3 text-sm text-danger">{noticeError}</p> : null}
          <div className="overflow-x-auto">
            <table className="mt-3 w-full min-w-[1080px] text-left text-sm">
              <thead className="bg-primary-soft/40 text-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">수주번호</th>
                  <th className="px-5 py-3 font-medium">거래처 / 품목</th>
                  <th className="px-5 py-3 font-medium">납기일</th>
                  <th className="px-5 py-3 font-medium">완료 예정일</th>
                  <th className="px-5 py-3 font-medium">작업 상태</th>
                  <th className="px-5 py-3 font-medium">위험 사유</th>
                  <th className="px-5 py-3 font-medium">입금 상태</th>
                  <th className="px-5 py-3 font-medium">알림 전송</th>
                  <th className="w-14 py-3 pr-5 font-medium"><span className="sr-only">수주 상세</span></th>
                </tr>
              </thead>
              <tbody>
                {riskRows.map((item) => {
                  const workStatuses = workOrdersByOrder?.get(item.orderId);
                  const currentWorks = workStatuses ? currentWorkStatuses(workStatuses) : null;
                  return (
                    <tr key={item.orderId} className="border-t border-line">
                      <td className="px-5 py-3 align-middle font-semibold whitespace-nowrap">{item.orderNo}</td>
                      <td className="px-5 py-3 align-middle">
                        <span className="block font-semibold">{item.customerName}</span>
                        <span className="block text-sm text-muted">{item.productName} · {item.quantity.toLocaleString("ko-KR")}개</span>
                      </td>
                      <td className="px-5 py-3 align-middle font-semibold whitespace-nowrap">{dotDate(item.requestedDueDate)}</td>
                      <td className="px-5 py-3 align-middle whitespace-nowrap text-muted">{item.plannedEndDate ? dotDate(item.plannedEndDate) : "-"}</td>
                      <td className="px-5 py-3 align-middle">
                        {currentWorks == null ? <span className="text-muted">-</span> : currentWorks.length === 0 ? <Badge className="bg-canvas text-muted">작업지시 대기</Badge> : (
                          <span className="flex flex-wrap gap-1">
                            {currentWorks.map((status) => <Badge key={status} className={workStatusTone(status)}>{workOrderStatusLabel[status]}</Badge>)}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 align-middle">
                        <Badge className={`whitespace-nowrap ${riskReasonTone(item.requestedDueDate, today)}`}>{riskReasonText(item.requestedDueDate, undefined, today)}</Badge>
                      </td>
                      <td className="px-5 py-3 align-middle"><Badge className={paymentTone(toPaymentStatus(item.paymentStatus))}>{paymentStatusLabel[toPaymentStatus(item.paymentStatus)]}</Badge></td>
                      <td className="px-5 py-3 align-middle">
                        {sentNoticeKeys?.has(noticeKey(item.orderId, dueNotificationType(item.requestedDueDate, today))) ? (
                          <span className="text-xs font-semibold whitespace-nowrap text-primary">전송 완료</span>
                        ) : (
                          <button
                            type="button"
                            className="grid h-9 w-9 place-items-center rounded-lg text-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label={`${item.orderNo} 알림 전송`}
                            aria-busy={sendingOrderId === item.orderId}
                            disabled={sentNoticeKeys == null || sendingOrderId === item.orderId}
                            onClick={() => void sendNotice(item.orderId)}
                          >
                            {sendingOrderId === item.orderId ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />}
                          </button>
                        )}
                      </td>
                      <td className="pr-5 align-middle">
                        <Link to={orderDetailPath(item.orderId)} aria-label={`${item.orderNo} 수주 상세`} className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-canvas hover:text-primary">
                          <ChevronRight size={18} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {risks.length === 0 ? <tr><td colSpan={9} className="px-5 py-8 text-center text-muted">납기 위험 수주가 없습니다.</td></tr> : null}
              </tbody>
            </table>
          </div>
          {risks.length > RISK_PAGE_SIZE ? (
            <div className="flex items-center justify-end gap-2 px-5 py-3">
              <button type="button" aria-label="이전 페이지" disabled={riskPage === 0} className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-white text-muted hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40" onClick={() => setRiskPageIndex(riskPage - 1)}>
                <ChevronLeft size={16} />
              </button>
              <span className="grid h-8 min-w-8 place-items-center rounded-lg bg-primary-soft px-2 text-sm font-semibold text-primary" aria-current="page">{riskPage + 1}</span>
              <button type="button" aria-label="다음 페이지" disabled={riskPage >= riskPageCount - 1} className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-white text-muted hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40" onClick={() => setRiskPageIndex(riskPage + 1)}>
                <ChevronRight size={16} />
              </button>
            </div>
          ) : null}
        </section>
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

function Metric({ label, value, hint, meter }: { label: string; value: string; hint?: ReactNode; meter?: ReactNode }) {
  return (
    <section className="flex h-full flex-col rounded-xl border border-line bg-white p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
      {hint ? <div className="mt-1 min-h-5 text-sm text-muted">{hint}</div> : <div className="mt-1 min-h-5" />}
      {meter ? <div className="mt-auto">{meter}</div> : <div className="mt-auto h-1.5" />}
    </section>
  );
}

function RateBar({ label, rate }: { label: string; rate: number }) {
  const width = Math.min(100, Math.max(0, rate));
  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-primary-soft" role="progressbar" aria-valuenow={width} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
    </div>
  );
}

const splitColor: Record<ProgressGroup, string> = {
  WAITING: "#D9A441",
  PRODUCING: "#12786F",
  SHIPPING: "#8B70B5",
};

function StatusLegend({ counts }: { counts: Record<ProgressGroup, number> }) {
  const groups = Object.keys(progressGroupLabel) as ProgressGroup[];
  return (
    <ul className="flex flex-nowrap items-center gap-x-2">
      {groups.map((group) => (
        <li key={group} className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: splitColor[group] }} />
          {progressGroupLabel[group]} {countUnit(counts[group])}
        </li>
      ))}
    </ul>
  );
}

function StatusBar({ counts }: { counts: Record<ProgressGroup, number> }) {
  const groups = Object.keys(progressGroupLabel) as ProgressGroup[];
  const total = groups.reduce((sum, group) => sum + counts[group], 0);
  const shown = groups.filter((group) => counts[group] > 0);
  if (total === 0) return <RateBar label="진행 중인 수주 없음" rate={0} />;
  return (
    <div className="mt-3 flex h-1.5 overflow-hidden rounded-full" role="img" aria-label={progressHint(counts)}>
      {shown.map((group) => (
        <div key={group} style={{ width: `${(counts[group] / total) * 100}%`, backgroundColor: splitColor[group] }} title={`${progressGroupLabel[group]} ${countUnit(counts[group])}`} />
      ))}
    </div>
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

// 포장완료만 남으면 그 상태를 보여 준다. 끝나지 않은 지시가 있으면 생산, 일시정지, 포장, 중지, 준비 순으로 지금 걸린 상태를 모두 보여 준다.
const workProgressOrder: readonly WorkOrderStatus[] = ["PRODUCE", "SUSPEND", "PACK", "HALT", "PREPARE", "PACK_DONE"];

function currentWorkStatuses(statuses: WorkOrderStatus[]): WorkOrderStatus[] {
  const present = new Set(statuses);
  const active = workProgressOrder.filter((status) => status !== "PACK_DONE" && present.has(status));
  if (active.length > 0) return active;
  return present.has("PACK_DONE") ? ["PACK_DONE"] : [];
}

function workStatusTone(status: WorkOrderStatus): string {
  return workOrderTone(status);
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
