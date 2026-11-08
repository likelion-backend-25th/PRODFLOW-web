import { Pencil, UserRound } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Badge, Button, PageHeader, TextField, tableClass } from "@/components/ui.tsx";
import { readApiErrorMessage } from "@/lib/apiClient.ts";
import { cn } from "@/lib/cn.ts";
import { localDateTime, todayISO } from "@/lib/dates.ts";
import {
  changeLineStatus,
  createLine,
  fetchLine,
  fetchLineCapacityHistory,
  fetchLines,
  updateLine,
  type LineCapacityLog,
  type LineDetail,
  type LineListItem,
  type LineWorkOrder,
} from "@/lib/linesApi.ts";
import { lineStatusLabel, lineTone, workOrderStatusLabel, workOrderTone, workProductionDone } from "@/lib/labels.ts";
import { fetchWorkOrders } from "@/lib/workOrdersApi.ts";
import { canManageOrders, useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";
import type { LineStatus, WorkOrderStatus } from "@/types/domain.ts";

function lineDot(status: LineStatus): string {
  if (status === "AVAILABLE") return "bg-slate-400";
  if (status === "INSPECTION") return "bg-warning";
  if (status === "BROKEN") return "bg-danger";
  return "bg-primary";
}

function canOperateLine(role: string | undefined): boolean {
  return role === "SUPER_ADMIN" || role === "ORDER_MANAGER" || role === "PRODUCTION_MANAGER";
}

export function LineListPage() {
  const role = useAuthStore((state) => state.user?.role);
  const show = useToastStore((state) => state.show);
  const [data, setData] = useState<{ total: number; running: number; available: number; stopped: number; lines: LineListItem[] } | null>(null);

  useEffect(() => {
    let ignore = false;
    void fetchLines().then((response) => {
      if (ignore) return;
      setData({
        total: response.totalCount,
        running: response.runningCount,
        available: response.availableCount,
        stopped: response.inspectionOrBrokenCount,
        lines: response.lines,
      });
    }).catch((error: unknown) => {
      if (!ignore) show(readApiErrorMessage(error));
    });
    return () => {
      ignore = true;
    };
  }, [show]);

  if (!data) return <p className="text-muted">생산라인을 불러오는 중입니다.</p>;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">생산라인</h1>
          <p className="mt-1 text-muted">라인별 가동 상태와 진행 수주, 담당 직원을 확인하세요.</p>
        </div>
        {canManageOrders(role) ? <Link to="/lines/new" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 font-semibold text-white">+ 라인 등록</Link> : null}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <section className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-muted">전체 라인</p><p className="mt-2 text-2xl font-semibold">{data.total}개</p></section>
        <section className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-muted">가동 중</p><p className="mt-2 text-2xl font-semibold">{data.running}개</p></section>
        <section className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-muted">가동 가능</p><p className="mt-2 text-2xl font-semibold">{data.available}개</p></section>
        <section className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-muted">점검·고장</p><p className="mt-2 text-2xl font-semibold">{data.stopped}개</p></section>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {data.lines.map((line) => (
          <section key={line.lineId} className="rounded-xl border border-line bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{line.lineName}</h2>
              <Badge className={lineTone(line.status)}>{lineStatusLabel[line.status]}</Badge>
            </div>
            <dl className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted">주문 품목</dt><dd className="text-right">{line.productName ?? "없음"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">진행 수주</dt><dd>{line.orderNo ?? "없음"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">담당 직원</dt><dd>{line.managerName ?? "미지정"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">하루 생산량</dt><dd>{line.productionCapacity.toLocaleString("ko-KR")}개</dd></div>
            </dl>
            <p className="mt-4 text-sm font-semibold text-primary">{line.workNo ?? "진행 중인 작업 없음"}</p>
            <div className="mt-4">
              <Link to={`/lines/${line.lineId}`} className="inline-flex h-10 items-center rounded-lg border border-line px-3 text-sm">라인 상세</Link>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function LineFormPage() {
  const { lineId } = useParams();
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.user?.role);
  const show = useToastStore((state) => state.show);
  const canRename = role === "SUPER_ADMIN";
  const [name, setName] = useState("");
  const [dailyCapacity, setDailyCapacity] = useState(1000);
  const [savedCapacity, setSavedCapacity] = useState(1000);
  const [reason, setReason] = useState("");
  const [ready, setReady] = useState(lineId == null);
  const capacityChanged = lineId != null && savedCapacity !== dailyCapacity;

  useEffect(() => {
    if (!lineId) return;
    const id = Number(lineId);
    if (!Number.isInteger(id)) return;
    let ignore = false;
    void fetchLine(id).then((line) => {
      if (ignore) return;
      setName(line.lineName);
      setDailyCapacity(line.productionCapacity);
      setSavedCapacity(line.productionCapacity);
      setReady(true);
    }).catch((error: unknown) => {
      if (!ignore) show(readApiErrorMessage(error));
    });
    return () => {
      ignore = true;
    };
  }, [lineId, show]);

  if (!ready) return <p className="text-muted">라인 정보를 불러오는 중입니다.</p>;

  return (
    <div>
      <PageHeader title={lineId ? "라인 정보 수정" : "라인 등록"} />
      <form className="grid max-w-md gap-3" onSubmit={(event) => {
        event.preventDefault();
        const id = lineId == null ? null : Number(lineId);
        if (name.trim().length === 0) {
          show("라인 이름을 입력하세요.");
          return;
        }
        if (dailyCapacity < 1) {
          show("하루 생산량은 1 이상이어야 합니다.");
          return;
        }
        if (capacityChanged && reason.trim().length < 2) {
          show("변경 사유는 2자 이상 입력하세요.");
          return;
        }
        const task = id == null
          ? createLine(name.trim(), dailyCapacity)
          : updateLine(id, { lineName: name.trim(), productionCapacity: dailyCapacity, reason: reason.trim() });
        void task.then((saved) => {
          show("라인 정보를 저장했습니다.");
          navigate(`/lines/${saved.id}`);
        }).catch((error: unknown) => {
          show(readApiErrorMessage(error));
        });
      }}>
        <TextField label="라인 이름" value={name} disabled={lineId != null && !canRename} onChange={(event) => setName(event.target.value)} />
        {lineId != null && !canRename ? <p className="-mt-1 text-xs text-muted">라인 이름은 최고 관리자만 바꿉니다.</p> : null}
        <TextField label="하루 생산량" type="number" min={1} value={dailyCapacity} onChange={(event) => setDailyCapacity(Number(event.target.value))} />
        {capacityChanged ? <TextField label="변경 사유" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="예: 설비 증설" /> : null}
        <div className="flex gap-2">
          <Button type="submit">저장</Button>
          <Button type="button" tone="ghost" onClick={() => navigate(lineId ? `/lines/${lineId}` : "/lines")}>취소</Button>
        </div>
      </form>
    </div>
  );
}

function workStatusView(status: WorkOrderStatus): { label: string; className: string } {
  return { label: workOrderStatusLabel[status], className: workOrderTone(status) };
}

function jobRank(status: WorkOrderStatus): number {
  if (status === "PRODUCE") return 0;
  if (status === "SUSPEND") return 1;
  return 2;
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] items-start gap-3 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 font-medium text-ink">{children}</dd>
    </div>
  );
}

export function LineDetailPage() {
  const { lineId = "" } = useParams();
  const user = useAuthStore((state) => state.user);
  const role = user?.role;
  const show = useToastStore((state) => state.show);
  const [lines, setLines] = useState<LineListItem[]>([]);
  const [line, setLine] = useState<LineDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [workOrderIds, setWorkOrderIds] = useState<Record<string, number>>({});
  const [capacityLogs, setCapacityLogs] = useState<LineCapacityLog[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const id = Number(lineId);
    if (!Number.isInteger(id)) {
      setMissing(true);
      return;
    }
    let ignore = false;
    setMissing(false);
    setCapacityLogs(null);
    void fetchLines().then((response) => {
      if (!ignore) setLines(response.lines);
    }).catch(() => {
      if (!ignore) setLines([]);
    });
    void fetchLine(id).then((detail) => {
      if (ignore) return;
      setLine(detail);
    }).catch((error: unknown) => {
      if (ignore) return;
      setMissing(true);
      show(readApiErrorMessage(error));
    });
    void fetchLineCapacityHistory(id).then((logs) => {
      if (!ignore) setCapacityLogs(logs);
    }).catch((error: unknown) => {
      if (ignore) return;
      setCapacityLogs([]);
      show(readApiErrorMessage(error));
    });
    void fetchWorkOrders({ lineId: id, page: 0, size: 100 }).then((page) => {
      if (ignore) return;
      const ids: Record<string, number> = {};
      page.content.forEach((row) => {
        ids[row.workNo] = row.id;
      });
      setWorkOrderIds(ids);
    }).catch(() => {
      if (!ignore) setWorkOrderIds({});
    });
    return () => {
      ignore = true;
    };
  }, [lineId, reloadKey, show]);

  if (missing) return <p>라인을 찾을 수 없습니다.</p>;
  if (!line) return <p className="text-muted">라인 정보를 불러오는 중입니다.</p>;

  const today = todayISO();
  const jobs = line.workOrders.slice().sort((left, right) => jobRank(left.status) - jobRank(right.status) || left.plannedStartDate.localeCompare(right.plannedStartDate));
  const running = jobs.filter((item) => item.status === "PRODUCE" || item.status === "SUSPEND");
  const waiting = jobs.filter((item) => item.status === "PREPARE");
  const runningQty = running.reduce((sum, item) => sum + item.quantity, 0);
  const waitingQty = waiting.reduce((sum, item) => sum + item.quantity, 0);
  const jobTotal = jobs.reduce((sum, item) => sum + item.quantity, 0);

  async function changeStatus(status: LineStatus) {
    if (status === line?.status) return;
    try {
      await changeLineStatus(line!.lineId, status);
      show("라인 상태를 변경했습니다.");
      setReloadKey((value) => value + 1);
    } catch (error: unknown) {
      show(readApiErrorMessage(error));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <nav className="flex flex-wrap gap-1.5" aria-label="생산라인">
            {lines.map((item) => {
              const selected = item.lineId === line.lineId;
              return (
                <Link
                  key={item.lineId}
                  to={`/lines/${item.lineId}`}
                  aria-current={selected ? "page" : undefined}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-semibold",
                    selected ? "border-primary bg-primary-soft text-primary" : "border-line bg-white text-ink hover:bg-canvas",
                  )}
                >
                  <span className={cn("size-1.5 shrink-0 rounded-full", lineDot(item.status))} />
                  {item.lineName}
                </Link>
              );
            })}
          </nav>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{line.lineName}</h1>
            <Badge className={lineTone(line.status)}>{lineStatusLabel[line.status]}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted">
            {today} 기준 · 이 라인에 배정된 준비·생산·일시정지 지시를 확인하고 가동 상태를 바꿉니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManageOrders(role) ? (
            <Link to={`/lines/${line.lineId}/edit`} className="inline-flex h-10 items-center gap-1 rounded-lg border border-line bg-white px-3 text-sm font-semibold">
              <Pencil size={16} />정보 수정
            </Link>
          ) : null}
          <Link to="/lines" className="inline-flex h-10 items-center rounded-lg border border-line bg-white px-3 text-sm font-semibold">목록으로 가기</Link>
          <Link to="/work-orders" className="inline-flex h-10 items-center rounded-lg border border-line bg-white px-3 text-sm font-semibold">작업지시 보기</Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-xl border border-line bg-white px-5 py-4">
          <p className="text-sm text-muted">일 최대 생산량</p>
          <p className="mt-2 text-3xl font-semibold">{line.productionCapacity.toLocaleString("ko-KR")}개</p>
          <p className="mt-1 text-sm text-muted">{line.lineName} 하루 기준 용량입니다.</p>
        </section>
        <section className="rounded-xl border border-line bg-white px-5 py-4">
          <p className="text-sm text-muted">이 라인 지시</p>
          <p className="mt-2 text-3xl font-semibold">{jobTotal.toLocaleString("ko-KR")}개</p>
          <p className="mt-1 text-sm text-muted">
            진행 {runningQty.toLocaleString("ko-KR")}개 · 대기 {waitingQty.toLocaleString("ko-KR")}개 · {jobs.length}건
          </p>
        </section>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="rounded-xl border border-line bg-white px-5 py-4">
          <h2 className="text-sm font-semibold">라인 현황</h2>
          <dl className="mt-2 grid gap-x-8 sm:grid-cols-2">
            <InfoRow label="라인명">{line.lineName}</InfoRow>
            <InfoRow label="가동 상태"><Badge className={lineTone(line.status)}>{lineStatusLabel[line.status]}</Badge></InfoRow>
            <InfoRow label="현재 수주">{line.orderNo ? `${line.orderNo}` : "없음"}</InfoRow>
            <InfoRow label="일 최대 생산량">{line.productionCapacity.toLocaleString("ko-KR")}개</InfoRow>
            <InfoRow label="주문 품목">{line.productName ?? "없음"}</InfoRow>
            <InfoRow label="현재 작업">
              {line.workNo ? (
                workOrderIds[line.workNo] != null ? (
                  <Link className="text-primary" to={`/work-orders/${workOrderIds[line.workNo]}`}>{line.workNo}</Link>
                ) : line.workNo
              ) : "없음"}
            </InfoRow>
            <InfoRow label="시작일">{line.plannedStartDate ?? "-"}</InfoRow>
            <InfoRow label="완료 예정">{line.plannedEndDate ?? "-"}</InfoRow>
          </dl>
        </section>

        <section className="rounded-xl border border-line bg-white px-5 py-4">
          <h2 className="text-sm font-semibold">담당 직원</h2>
          {line.managerName ? (
            <div className="mt-4 flex gap-3">
              <div className="grid size-12 shrink-0 place-items-center rounded-full bg-canvas text-muted">
                <UserRound size={22} />
              </div>
              <div className="min-w-0">
                <p className="font-semibold">{line.managerName}</p>
                <p className="mt-0.5 text-sm text-muted">현재 생산 담당</p>
              </div>
            </div>
          ) : (
            <p className="mt-6 text-sm text-muted">생산 중인 작업의 담당자가 없습니다.</p>
          )}
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold">이 라인 작업지시</h2>
            <p className="mt-0.5 text-xs text-muted">준비, 생산, 일시정지 지시입니다.</p>
          </div>
          <p className="text-sm text-muted">합계 {jobTotal.toLocaleString("ko-KR")}개</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-canvas text-xs text-muted">
              <tr>
                <th className="px-5 py-2.5 font-medium">작업지시</th>
                <th className="py-2.5 font-medium">수주번호</th>
                <th className="py-2.5 font-medium">생산품목</th>
                <th className="py-2.5 font-medium">작업수량</th>
                <th className="py-2.5 font-medium">시작일</th>
                <th className="py-2.5 font-medium">완료 예정</th>
                <th className="py-2.5 pr-5 font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((item) => (
                <JobRow key={item.workNo} item={item} today={today} workOrderId={workOrderIds[item.workNo]} />
              ))}
              {jobs.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-muted">이 라인에 배정된 작업지시가 없습니다.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-white px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">운영</h2>
            <p className="mt-1 text-sm text-muted">
              {line.status === "OPERATING"
                ? `생산 중 · 진행 ${running.length}건`
                : line.status === "AVAILABLE"
                  ? waiting.length > 0 ? `가동 가능 · 대기 ${waiting.length}건` : "가동 가능 · 배정된 작업 없음"
                  : `${lineStatusLabel[line.status]} · 공장 일일 용량에서 제외`}
            </p>
          </div>
          {canOperateLine(role) ? (
            <div className="flex flex-wrap gap-1.5">
              {(["AVAILABLE", "INSPECTION", "BROKEN"] as LineStatus[]).map((status) => (
                <button
                  key={status}
                  type="button"
                  className={cn("h-9 rounded-lg border px-3 text-sm font-semibold", line.status === status ? "border-primary bg-primary-soft text-primary" : "border-line bg-white text-muted")}
                  onClick={() => void changeStatus(status)}
                >
                  {lineStatusLabel[status]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>
      <section className="rounded-xl border border-line bg-white px-5 py-4">
        <h2 className="text-sm font-semibold">하루 생산량 변경 이력</h2>
        <p className="mt-1 text-xs text-muted">최근 3건입니다.</p>
        {capacityLogs == null ? <p className="mt-3 text-sm text-muted">변경 이력을 불러오는 중입니다.</p> : null}
        {capacityLogs != null && capacityLogs.length === 0 ? <p className="mt-3 text-sm text-muted">변경 이력이 없습니다.</p> : null}
        {capacityLogs != null && capacityLogs.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr className="border-b border-line text-sm text-muted">
                  <th>변경 일시</th>
                  <th>변경 전</th>
                  <th>변경 후</th>
                  <th>변경 사유</th>
                  <th>담당자</th>
                </tr>
              </thead>
              <tbody>
                {capacityLogs.map((log) => (
                  <tr key={`${log.changedAt}-${log.afterCapacity}`}>
                    <td>{localDateTime(log.changedAt)}</td>
                    <td>{log.beforeCapacity.toLocaleString("ko-KR")}개</td>
                    <td>{log.afterCapacity.toLocaleString("ko-KR")}개</td>
                    <td>{log.reason}</td>
                    <td>{log.managerName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function JobRow({ item, today, workOrderId }: { item: LineWorkOrder; today: string; workOrderId: number | undefined }) {
  const view = workStatusView(item.status);
  const overdue = item.plannedEndDate < today && !workProductionDone(item.status);
  return (
    <tr className="border-t border-line">
      <td className="px-5 py-2.5 font-semibold">
        {workOrderId != null ? <Link className="text-primary" to={`/work-orders/${workOrderId}`}>{item.workNo}</Link> : item.workNo}
      </td>
      <td className="py-2.5">{item.orderNo}</td>
      <td className="py-2.5">{item.productName}</td>
      <td className="py-2.5">{item.quantity.toLocaleString("ko-KR")}개</td>
      <td className="py-2.5">{item.plannedStartDate}</td>
      <td className={cn("py-2.5", overdue && "font-semibold text-danger")}>{item.plannedEndDate}</td>
      <td className="py-2.5 pr-5"><Badge className={view.className}>{view.label}</Badge></td>
    </tr>
  );
}
