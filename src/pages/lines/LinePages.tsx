import { UserRound } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Badge, Button, PageHeader, TextField, tableClass } from "@/components/ui.tsx";
import { cn } from "@/lib/cn.ts";
import { useDb } from "@/lib/db.ts";
import { localDate, localDateTime, todayISO } from "@/lib/dates.ts";
import { lineStatusLabel, lineTone, roleLabel } from "@/lib/labels.ts";
import { orderItemsText, workItemsText } from "@/lib/orderText.ts";
import { saveLine, saveLineCapacity, setLineStatus } from "@/lib/workflow.ts";
import { canManageOrders, canProduce, useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";
import type { LineStatus, WorkOrder, WorkOrderStatus } from "@/types/domain.ts";

function lineDot(status: LineStatus): string {
  if (status === "AVAILABLE") return "bg-slate-400";
  if (status === "MAINTENANCE") return "bg-warning";
  if (status === "BROKEN") return "bg-danger";
  return "bg-primary";
}

export function LineListPage() {
  const db = useDb();
  const role = useAuthStore((state) => state.user?.role);
  const running = db.lines.filter((line) => line.status === "RUNNING").length;
  const available = db.lines.filter((line) => line.status === "AVAILABLE").length;
  const stopped = db.lines.filter((line) => line.status === "MAINTENANCE" || line.status === "BROKEN").length;
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
        <section className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-muted">전체 라인</p><p className="mt-2 text-2xl font-semibold">{db.lines.length}개</p></section>
        <section className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-muted">가동 중</p><p className="mt-2 text-2xl font-semibold">{running}개</p></section>
        <section className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-muted">가동 가능</p><p className="mt-2 text-2xl font-semibold">{available}개</p></section>
        <section className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-muted">점검·고장</p><p className="mt-2 text-2xl font-semibold">{stopped}개</p></section>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {db.lines.map((line) => {
          const current = db.workOrders.find((item) => item.lineId === line.id && (item.status === "IN_PRODUCTION" || item.status === "PAUSED"));
          const order = db.orders.find((item) => item.id === current?.orderId);
          const assignee = db.users.find((item) => item.id === current?.assigneeId);
          return (
            <section key={line.id} className="rounded-xl border border-line bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{line.name}</h2>
                <Badge className={lineTone(line.status)}>{lineStatusLabel[line.status]}</Badge>
              </div>
              <dl className="mt-4 space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-muted">가능 케이스</dt><dd className="text-right">{order ? orderItemsText(db.products, order.lines) : "없음"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">진행 수주</dt><dd>{order?.orderNo ?? "없음"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">담당 직원</dt><dd>{assignee?.name ?? "미지정"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">하루 생산량</dt><dd>{line.dailyCapacity.toLocaleString("ko-KR")}개</dd></div>
              </dl>
              <p className="mt-4 text-sm font-semibold text-primary">
                {current ? `${current.status === "PAUSED" ? "일시정지 · " : ""}${current.quantity.toLocaleString("ko-KR")}개 · 완료 예정 ${current.plannedEndDate}` : "진행 중인 작업 없음"}
              </p>
              <Link to={`/lines/${line.id}`} className="mt-4 inline-flex h-10 items-center rounded-lg border border-line px-3 text-sm">라인 상세 →</Link>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function LineFormPage() {
  const { lineId } = useParams();
  const db = useDb();
  const navigate = useNavigate();
  const show = useToastStore((state) => state.show);
  const actorId = useAuthStore((state) => state.user?.id);
  const current = db.lines.find((line) => line.id === lineId);
  const [name, setName] = useState(current?.name ?? "");
  const [dailyCapacity, setDailyCapacity] = useState(current?.dailyCapacity ?? 500);
  const [reason, setReason] = useState("");
  const capacityChanged = current != null && current.dailyCapacity !== dailyCapacity;
  return (
    <div>
      <PageHeader title={current ? "라인 정보 수정" : "라인 등록"} />
      <form className="grid max-w-md gap-3" onSubmit={(event) => {
        event.preventDefault();
        try {
          saveLine({ id: current?.id, name, dailyCapacity, reason, actorId });
          show("라인 정보를 저장했습니다.");
          navigate(current ? `/lines/${current.id}` : "/lines");
        } catch (error: unknown) {
          show(error instanceof Error ? error.message : "저장하지 못했습니다.");
        }
      }}>
        <TextField label="라인 이름" value={name} onChange={(event) => setName(event.target.value)} />
        <TextField label="하루 생산량" type="number" value={dailyCapacity} onChange={(event) => setDailyCapacity(Number(event.target.value))} />
        {capacityChanged ? <TextField label="변경 사유" value={reason} onChange={(event) => setReason(event.target.value)} /> : null}
        <Button type="submit">저장</Button>
      </form>
    </div>
  );
}

function workOrderNo(item: WorkOrder, orderNo: string | undefined): string {
  const issued = localDate(item.issuedAt).replaceAll("-", "");
  const tail = orderNo?.split("-").at(-1) ?? "000";
  return `WO-${issued.slice(0, 6)}-${tail}-${item.id.slice(0, 4)}`;
}

function workStatusView(status: WorkOrderStatus): { label: string; className: string } {
  if (status === "IN_PRODUCTION") return { label: "진행중", className: "bg-primary-soft text-primary" };
  if (status === "READY") return { label: "대기", className: "bg-warning-soft text-warning" };
  if (status === "PAUSED") return { label: "일시정지", className: "bg-warning-soft text-warning" };
  if (status === "COMPLETED") return { label: "완료", className: "bg-emerald-50 text-success" };
  return { label: "취소", className: "bg-red-50 text-danger" };
}

function clockLabel(stamp: string): string {
  const date = new Date(stamp);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function jobRank(status: WorkOrderStatus): number {
  if (status === "IN_PRODUCTION") return 0;
  if (status === "PAUSED") return 1;
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
  const db = useDb();
  const user = useAuthStore((state) => state.user);
  const role = user?.role;
  const show = useToastStore((state) => state.show);
  const line = db.lines.find((item) => item.id === lineId);
  const [editingCapacity, setEditingCapacity] = useState(false);
  const [capacityInput, setCapacityInput] = useState("");

  useEffect(() => {
    if (!line) return;
    setEditingCapacity(false);
    setCapacityInput(String(line.dailyCapacity));
  }, [line?.id, line?.dailyCapacity]);

  if (!line) return <p>라인을 찾을 수 없습니다.</p>;

  const logs = db.lineCapacityLogs
    .filter((log) => log.lineId === line.id)
    .sort((left, right) => right.changedAt.localeCompare(left.changedAt));
  const today = todayISO();
  const jobs = db.workOrders
    .filter((item) => item.lineId === line.id && (item.status === "READY" || item.status === "IN_PRODUCTION" || item.status === "PAUSED"))
    .slice()
    .sort((left, right) => jobRank(left.status) - jobRank(right.status) || left.plannedStartDate.localeCompare(right.plannedStartDate));
  const running = jobs.filter((item) => item.status === "IN_PRODUCTION" || item.status === "PAUSED");
  const waiting = jobs.filter((item) => item.status === "READY");
  const current = running[0] ?? jobs[0];
  const order = db.orders.find((item) => item.id === current?.orderId);
  const client = db.clients.find((item) => item.id === order?.clientId);
  const assignee = db.users.find((item) => item.id === current?.assigneeId);
  const attendance = assignee
    ? db.attendance.find((item) => item.userId === assignee.id && !item.clockOutAt)
      ?? db.attendance.find((item) => item.userId === assignee.id && localDate(item.clockInAt) === today)
    : undefined;
  const runningQty = running.reduce((sum, item) => sum + item.quantity, 0);
  const waitingQty = waiting.reduce((sum, item) => sum + item.quantity, 0);
  const jobTotal = jobs.reduce((sum, item) => sum + item.quantity, 0);
  const currentItems = current ? workItemsText(db.products, current.items || []) : "없음";
  const lineItems = order ? orderItemsText(db.products, order.lines) : currentItems;
  const duty = attendance
    ? `${clockLabel(attendance.clockInAt)}${attendance.clockOutAt ? `-${clockLabel(attendance.clockOutAt)}` : " ~"}`
    : "-";

  function changeStatus(status: LineStatus) {
    try {
      setLineStatus(line!.id, status);
      show("라인 상태를 변경했습니다. 점검·고장 라인은 공장 생산량에서 빠집니다.");
    } catch (error: unknown) {
      show(error instanceof Error ? error.message : "변경하지 못했습니다.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <nav className="flex flex-wrap gap-1.5" aria-label="생산라인">
            {db.lines.map((item) => {
              const selected = item.id === line.id;
              return (
                <Link
                  key={item.id}
                  to={`/lines/${item.id}`}
                  aria-current={selected ? "page" : undefined}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-semibold",
                    selected ? "border-primary bg-primary-soft text-primary" : "border-line bg-white text-ink hover:bg-canvas",
                  )}
                >
                  <span className={cn("size-1.5 shrink-0 rounded-full", lineDot(item.status))} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{line.name}</h1>
            <Badge className={lineTone(line.status)}>{lineStatusLabel[line.status]}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted">
            {today} 기준 · 이 라인에 배정된 대기·진행 지시를 확인하고 가동 상태를 바꿉니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/work-orders" className="inline-flex h-10 items-center rounded-lg border border-line bg-white px-3 text-sm font-semibold">작업지시 보기</Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-xl border border-line bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-muted">일 최대 생산량</p>
            {canManageOrders(role) && !editingCapacity ? (
              <button type="button" className="text-sm font-semibold text-primary" onClick={() => { setCapacityInput(String(line.dailyCapacity)); setEditingCapacity(true); }}>수정</button>
            ) : null}
          </div>
          {editingCapacity && canManageOrders(role) && user ? (
            <form
              className="mt-3 flex flex-wrap items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                try {
                  saveLineCapacity(line.id, Number(capacityInput), user);
                  setEditingCapacity(false);
                  show("일 최대 생산량을 저장하고 공장 일정을 다시 잡았습니다.");
                } catch (error: unknown) {
                  show(error instanceof Error ? error.message : "저장하지 못했습니다.");
                }
              }}
            >
              <label className="text-sm">
                <span className="sr-only">일 최대 생산량</span>
                <span className="flex items-center gap-1">
                  <input
                    className="h-10 w-28 rounded-lg border border-line px-3 text-lg font-semibold"
                    type="number"
                    min={1}
                    step={1}
                    value={capacityInput}
                    onChange={(event) => setCapacityInput(event.target.value)}
                    autoFocus
                  />
                  <span className="text-muted">개</span>
                </span>
              </label>
              <Button type="submit">저장</Button>
              <Button type="button" tone="ghost" onClick={() => { setEditingCapacity(false); setCapacityInput(String(line.dailyCapacity)); }}>취소</Button>
            </form>
          ) : (
            <>
              <p className="mt-2 text-3xl font-semibold">{line.dailyCapacity.toLocaleString("ko-KR")}개</p>
              <p className="mt-1 text-sm text-muted">{line.name} 하루 기준 용량입니다.</p>
            </>
          )}
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
            <InfoRow label="라인명">{line.name}</InfoRow>
            <InfoRow label="가동 상태"><Badge className={lineTone(line.status)}>{lineStatusLabel[line.status]}</Badge></InfoRow>
            <InfoRow label="현재 수주">{order ? <Link className="text-primary" to={`/orders/${order.id}`}>{order.orderNo}{client ? ` · ${client.companyName}` : ""}</Link> : "없음"}</InfoRow>
            <InfoRow label="일 최대 생산량">{line.dailyCapacity.toLocaleString("ko-KR")}개</InfoRow>
            <InfoRow label="가능 품목">{lineItems}</InfoRow>
            <InfoRow label="현재 작업">
              {current ? (
                <Link className="text-primary" to={`/work-orders/${current.id}`}>
                  {workOrderNo(current, order?.orderNo)} · {current.quantity.toLocaleString("ko-KR")}개
                </Link>
              ) : "없음"}
            </InfoRow>
            <InfoRow label="시작일">{current?.plannedStartDate ?? "-"}</InfoRow>
            <InfoRow label="완료 예정">{current?.plannedEndDate ?? "-"}</InfoRow>
          </dl>
        </section>

        <section className="rounded-xl border border-line bg-white px-5 py-4">
          <h2 className="text-sm font-semibold">담당 직원</h2>
          {assignee ? (
            <div className="mt-4 flex gap-3">
              <div className="grid size-12 shrink-0 place-items-center rounded-full bg-canvas text-muted">
                <UserRound size={22} />
              </div>
              <div className="min-w-0">
                <p className="font-semibold">{assignee.name}</p>
                <p className="mt-0.5 text-sm text-muted">{roleLabel[assignee.role]}</p>
                <p className="mt-3 text-sm"><span className="text-muted">근무 </span>{assignee.clockedIn ? "근무중" : "퇴근"}</p>
                <p className="mt-1 text-sm"><span className="text-muted">출근 </span>{duty}</p>
              </div>
            </div>
          ) : (
            <p className="mt-6 text-sm text-muted">이 라인 작업에 배정된 담당자가 없습니다.</p>
          )}
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold">이 라인 작업지시</h2>
            <p className="mt-0.5 text-xs text-muted">이 라인에 배정된 대기·진행·일시정지 지시입니다. 중간 실적은 없습니다.</p>
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
              {jobs.map((item) => {
                const view = workStatusView(item.status);
                const jobOrder = db.orders.find((entry) => entry.id === item.orderId);
                const overdue = item.plannedEndDate < today;
                return (
                  <tr key={item.id} className="border-t border-line">
                    <td className="px-5 py-2.5 font-semibold">
                      <Link className="text-primary" to={`/work-orders/${item.id}`}>{workOrderNo(item, jobOrder?.orderNo)}</Link>
                    </td>
                    <td className="py-2.5">{jobOrder ? <Link className="text-primary" to={`/orders/${jobOrder.id}`}>{jobOrder.orderNo}</Link> : "-"}</td>
                    <td className="py-2.5">{workItemsText(db.products, item.items || [])}</td>
                    <td className="py-2.5">{item.quantity.toLocaleString("ko-KR")}개</td>
                    <td className="py-2.5">{item.plannedStartDate}</td>
                    <td className={cn("py-2.5", overdue && "font-semibold text-danger")}>{item.plannedEndDate}</td>
                    <td className="py-2.5 pr-5"><Badge className={view.className}>{view.label}</Badge></td>
                  </tr>
                );
              })}
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
              {line.status === "RUNNING"
                ? `생산 중 · 진행 ${running.length}건`
                : line.status === "AVAILABLE"
                  ? waiting.length > 0 ? `가동 가능 · 대기 ${waiting.length}건` : "가동 가능 · 배정된 작업 없음"
                  : `${lineStatusLabel[line.status]} · 공장 일일 용량에서 제외`}
            </p>
          </div>
          {canProduce(role) ? (
            <div className="flex flex-wrap gap-1.5">
              {(["AVAILABLE", "MAINTENANCE", "BROKEN"] as LineStatus[]).map((status) => (
                <button
                  key={status}
                  type="button"
                  className={cn("h-9 rounded-lg border px-3 text-sm font-semibold", line.status === status ? "border-primary bg-primary-soft text-primary" : "border-line bg-white text-muted")}
                  onClick={() => changeStatus(status)}
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
        {logs.length === 0 ? <p className="mt-3 text-sm text-muted">변경 이력이 없습니다.</p> : (
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
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{localDateTime(log.changedAt)}</td>
                    <td>{log.beforeCapacity.toLocaleString("ko-KR")}개</td>
                    <td>{log.afterCapacity.toLocaleString("ko-KR")}개</td>
                    <td>{log.reason}</td>
                    <td>{db.users.find((person) => person.id === log.userId)?.name ?? "알 수 없음"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
