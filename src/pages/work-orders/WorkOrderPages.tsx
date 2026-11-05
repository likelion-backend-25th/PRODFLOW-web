import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { Check, ChevronLeft, ChevronRight, Download, Pause, Play, RotateCcw, Save, Search } from "lucide-react";
import { Button } from "@/components/ui.tsx";
import { cn } from "@/lib/cn.ts";
import { readApiErrorMessage } from "@/lib/apiClient.ts";
import { todayISO, toISO } from "@/lib/dates.ts";
import { fetchLines, fetchStaff, type LineListItem, type StaffUser } from "@/lib/linesApi.ts";
import { workOrderStatusLabel, workOrderTone, workProductionDone } from "@/lib/labels.ts";
import {
  changeWorkOrderStatus,
  fetchWorkOrder,
  fetchWorkOrders,
  updateWorkOrder,
  type WorkOrderDetail,
  type WorkOrderRow,
} from "@/lib/workOrdersApi.ts";
import { canManageOrders, canProduce, useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";
import type { WorkOrderStatus } from "@/types/domain.ts";

const PAGE_SIZE = 5;

interface Filters {
  from: string;
  to: string;
  line: string;
  status: string;
  keyword: string;
}

function monthRange(): Pick<Filters, "from" | "to"> {
  const today = todayISO();
  const [year, month] = today.split("-").map(Number);
  return { from: `${today.slice(0, 8)}01`, to: toISO(new Date(year, month, 0)) };
}

function statusView(status: WorkOrderStatus, overdue: boolean): { label: string; className: string } {
  if (overdue && !workProductionDone(status)) return { label: "지연", className: "bg-red-50 text-danger" };
  return { label: workOrderStatusLabel[status], className: workOrderTone(status) };
}

function stepsOf(status: WorkOrderStatus): Array<{ label: string; state: "done" | "current" | "todo" }> {
  const labels = ["준비", status === "SUSPEND" ? "일시정지" : status === "HALT" ? "생산 중지" : "생산", "포장", "포장완료"];
  const current = status === "PREPARE" || status === "HALT" ? 0
    : status === "PRODUCE" || status === "SUSPEND" ? 1
    : status === "PACK" ? 2
    : 3;
  return labels.map((label, index) => ({ label, state: index < current ? "done" : index === current ? "current" : "todo" }));
}

function WorkStatusStepper({ status, overdue }: { status: WorkOrderStatus; overdue: boolean }) {
  const steps = stepsOf(status);
  const warnCurrent = status === "SUSPEND" || status === "HALT" || overdue;
  return (
    <div>
      {status === "HALT" ? <p className="mb-2 text-xs font-semibold text-danger">생산이 중지되었습니다. 준비로 되돌린 뒤 다시 시작할 수 있습니다.</p> : null}
      {overdue ? <p className="mb-2 text-xs font-semibold text-danger">완료 예정일을 지났습니다.</p> : null}
      <ol className="flex w-full items-start">
        {steps.map((step, index) => (
          <li key={`${step.label}-${index}`} className="relative flex flex-1 flex-col items-center text-center">
            {index < steps.length - 1 ? (
              <span className={cn("absolute top-3.5 left-[calc(50%+14px)] right-[calc(-50%+14px)] h-0.5", step.state === "done" ? "bg-primary" : "bg-line")} aria-hidden />
            ) : null}
            <span
              className={cn(
                "relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                step.state === "done" && "bg-primary text-white",
                step.state === "current" && (warnCurrent ? "bg-warning-soft text-warning ring-2 ring-warning" : "bg-primary-soft text-primary ring-2 ring-primary"),
                step.state === "todo" && "bg-canvas text-muted ring-1 ring-line",
              )}
            >
              {step.state === "done" ? <Check size={14} /> : index + 1}
            </span>
            <span className={cn(
              "mt-1.5 whitespace-nowrap text-[11px] font-semibold",
              step.state === "done" && "text-primary",
              step.state === "current" && (warnCurrent ? "text-warning" : "text-primary"),
              step.state === "todo" && "text-muted",
            )}>
              {step.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function downloadCsv(rows: string[][]) {
  const content = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "작업지시.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function queryOf(filters: Filters, page: number, size: number) {
  return {
    from: filters.from || undefined,
    to: filters.to || undefined,
    status: filters.status === "all" ? undefined : filters.status,
    lineId: filters.line === "all" ? undefined : Number(filters.line),
    keyword: filters.keyword.trim() || undefined,
    page,
    size,
  };
}

export function WorkOrderListPage() {
  const user = useAuthStore((state) => state.user);
  const show = useToastStore((state) => state.show);
  const initial = monthRange();
  const [draft, setDraft] = useState<Filters>({ ...initial, line: "all", status: "all", keyword: "" });
  const [applied, setApplied] = useState<Filters>({ ...initial, line: "all", status: "all", keyword: "" });
  const [lines, setLines] = useState<LineListItem[]>([]);
  const [rows, setRows] = useState<WorkOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const today = todayISO();

  useEffect(() => {
    let ignore = false;
    void fetchLines().then((data) => {
      if (!ignore) setLines(data.lines);
    }).catch(() => {
      if (!ignore) setLines([]);
    });
    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    void fetchWorkOrders(queryOf(applied, page - 1, PAGE_SIZE)).then((data) => {
      if (ignore) return;
      const next = user?.role === "PRODUCTION_MANAGER"
        ? data.content.filter((row) => row.assignedName === user.name)
        : data.content;
      setRows(next);
      setTotal(data.totalElements);
      setPageCount(Math.max(1, data.totalPages));
      setLoading(false);
    }).catch((error: unknown) => {
      if (ignore) return;
      setRows([]);
      setLoading(false);
      show(readApiErrorMessage(error));
    });
    return () => {
      ignore = true;
    };
  }, [applied, page, reloadKey, show, user?.name, user?.role]);

  useEffect(() => {
    if (rows.length === 0) {
      setSelectedId(null);
      return;
    }
    if (selectedId == null || !rows.some((row) => row.id === selectedId)) setSelectedId(rows[0].id);
  }, [rows, selectedId]);

  const safePage = Math.min(page, pageCount);

  async function exportRows() {
    try {
      const data = await fetchWorkOrders(queryOf(applied, 0, 100));
      const header = ["작업지시번호", "수주번호", "거래처명", "제품명", "수량", "생산라인", "담당자", "지시일", "완료예정일", "상태"];
      const body = data.content.map((item) => {
        const overdue = item.plannedEndDate < today && !workProductionDone(item.status);
        return [
          item.workNo,
          item.orderNo,
          item.clientName,
          item.productName,
          String(item.quantity),
          item.lineName,
          item.assignedName,
          item.workOrderDate,
          item.plannedEndDate,
          statusView(item.status, overdue).label,
        ];
      });
      downloadCsv([header, ...body]);
    } catch (error: unknown) {
      show(readApiErrorMessage(error));
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">작업지시 관리</h1>
          <p className="mt-1 text-sm text-muted">작업지시 목록과 상세는 서버에서 가져옵니다. 한 장은 품목 하나와 라인 하나입니다.</p>
        </div>
        <Button tone="ghost" onClick={() => void exportRows()}><Download size={16} className="mr-1" />엑셀 다운로드</Button>
      </div>

      <section className="mt-4 rounded-xl border border-line bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted">지시일
            <span className="mt-1 flex items-center gap-2">
              <input className="h-10 rounded-lg border border-line px-3 text-sm text-ink" type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} />
              <span>~</span>
              <input className="h-10 rounded-lg border border-line px-3 text-sm text-ink" type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} />
            </span>
          </label>
          <label className="text-xs text-muted">작업
            <select className="mt-1 h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink" value={draft.line} onChange={(event) => setDraft({ ...draft, line: event.target.value })}>
              <option value="all">전체 작업</option>
              {lines.map((line) => <option key={line.lineId} value={line.lineId}>{line.lineName}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted">진행상태
            <select className="mt-1 h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
              <option value="all">전체 상태</option>
              <option value="PREPARE">준비</option>
              <option value="PRODUCE">생산</option>
              <option value="SUSPEND">일시정지</option>
              <option value="HALT">생산 중지</option>
              <option value="PACK">포장</option>
              <option value="PACK_DONE">포장완료</option>
            </select>
          </label>
          <label className="min-w-56 flex-1 text-xs text-muted">검색어
            <input className="mt-1 h-10 w-full rounded-lg border border-line px-3 text-sm text-ink" value={draft.keyword} placeholder="수주번호, 제품명, 거래처명 검색" onChange={(event) => setDraft({ ...draft, keyword: event.target.value })} />
          </label>
          <Button onClick={() => { setApplied(draft); setPage(1); }}><Search size={15} className="mr-1" />조회</Button>
          <Button tone="ghost" onClick={() => {
            const next = { ...monthRange(), line: "all", status: "all", keyword: "" };
            setDraft(next);
            setApplied(next);
            setPage(1);
          }}><RotateCcw size={15} className="mr-1" />초기화</Button>
        </div>
      </section>

      <section className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
          <p className="font-semibold">작업지시 목록 <span className="font-normal text-muted">전체 {total}건</span></p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-primary-soft/50 text-muted">
              <tr>
                <th className="w-10 px-4 py-3" />
                <th className="py-3 font-medium">작업지시번호</th>
                <th className="py-3 font-medium">수주번호</th>
                <th className="py-3 font-medium">거래처명</th>
                <th className="py-3 font-medium">제품명</th>
                <th className="py-3 font-medium">수량</th>
                <th className="py-3 font-medium">생산라인</th>
                <th className="py-3 font-medium">담당자</th>
                <th className="py-3 font-medium">지시일</th>
                <th className="py-3 font-medium">완료예정일</th>
                <th className="py-3 font-medium">상태</th>
                <th className="w-10 pr-4" />
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const overdue = item.plannedEndDate < today && !workProductionDone(item.status);
                const view = statusView(item.status, overdue);
                const active = selectedId === item.id;
                return (
                  <tr key={item.id} className={`cursor-pointer border-t border-line ${active ? "bg-primary-soft" : "hover:bg-canvas"}`} onClick={() => setSelectedId(item.id)}>
                    <td className="px-4 py-3"><input type="checkbox" checked={active} readOnly aria-label={`${item.workNo} 선택`} /></td>
                    <td className="py-3 font-semibold">{item.workNo}</td>
                    <td>{item.orderNo}</td>
                    <td>{item.clientName}</td>
                    <td>{item.productName}</td>
                    <td>{item.quantity.toLocaleString("ko-KR")}</td>
                    <td>{item.lineName}</td>
                    <td>{item.assignedName}</td>
                    <td>{item.workOrderDate}</td>
                    <td>{item.plannedEndDate}</td>
                    <td><span className={`rounded-full px-2 py-1 text-xs font-semibold ${view.className}`}>{view.label}</span></td>
                    <td className="pr-4 text-muted"><ChevronRight size={16} /></td>
                  </tr>
                );
              })}
              {loading ? <tr><td className="px-5 py-8 text-muted" colSpan={12}>작업지시를 불러오는 중입니다.</td></tr> : null}
              {!loading && rows.length === 0 ? <tr><td className="px-5 py-8 text-muted" colSpan={12}>조건에 맞는 작업지시가 없습니다.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm text-muted">
          <p>총 {total}건 중 {total === 0 ? "0-0" : `${(safePage - 1) * PAGE_SIZE + 1}-${Math.min(safePage * PAGE_SIZE, total)}`}건 표시 · 작업지시를 선택하면 아래에서 상세 정보를 확인할 수 있습니다.</p>
          <div className="flex items-center gap-1">
            <button type="button" className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-white" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} aria-label="이전 페이지"><ChevronLeft size={16} /></button>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-white">{safePage}</span>
            <button type="button" className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-white" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} aria-label="다음 페이지"><ChevronRight size={16} /></button>
          </div>
        </div>
      </section>

      {selectedId != null && user ? (
        <WorkOrderEditor key={selectedId} workOrderId={String(selectedId)} onChanged={() => setReloadKey((value) => value + 1)} />
      ) : null}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-muted">{label}{required ? <span className="text-danger"> *</span> : null}</span>
      {children}
    </label>
  );
}

const readOnlyClass = "h-10 w-full rounded-lg border border-line bg-canvas px-3 text-sm text-ink";

function WorkOrderEditor({ workOrderId, onChanged }: { workOrderId: string; onChanged?: () => void }) {
  const user = useAuthStore((state) => state.user);
  const show = useToastStore((state) => state.show);
  const [workOrder, setWorkOrder] = useState<WorkOrderDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [lines, setLines] = useState<LineListItem[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [lineId, setLineId] = useState<number | "">("");
  const [assigneeId, setAssigneeId] = useState<number | "">("");
  const [pending, setPending] = useState(false);
  const [haltReasonOpen, setHaltReasonOpen] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    const id = Number(workOrderId);
    if (!Number.isInteger(id)) {
      setMissing(true);
      return;
    }
    let ignore = false;
    setMissing(false);
    void fetchWorkOrder(id).then((detail) => {
      if (ignore) return;
      setWorkOrder(detail);
      setLineId(detail.lineId);
      setAssigneeId(detail.assignedId);
    }).catch((error: unknown) => {
      if (ignore) return;
      setMissing(true);
      show(readApiErrorMessage(error));
    });
    void fetchLines().then((data) => {
      if (!ignore) setLines(data.lines);
    }).catch(() => {
      if (!ignore) setLines([]);
    });
    if (user?.role === "SUPER_ADMIN") {
      void fetchStaff().then((data) => {
        if (!ignore) setStaff(data.filter((item) => item.role === "PRODUCTION_MANAGER" && item.status === "ACTIVE"));
      }).catch(() => {
        if (!ignore) setStaff([]);
      });
    }
    return () => {
      ignore = true;
    };
  }, [workOrderId, show, user?.role]);

  if (missing) return <p className="mt-4 text-muted">작업지시를 찾을 수 없습니다.</p>;
  if (!workOrder || !user) return <p className="mt-4 text-muted">작업지시를 불러오는 중입니다.</p>;
  if (user.role === "PRODUCTION_MANAGER" && String(workOrder.assignedId) !== user.id) {
    return <p className="mt-4 text-muted">나에게 배정된 작업만 볼 수 있습니다.</p>;
  }

  const today = todayISO();
  const overdue = workOrder.plannedEndDate < today && !workProductionDone(workOrder.status);
  const view = statusView(workOrder.status, overdue);
  const mine = String(workOrder.assignedId) === user.id;
  const canChangeStatus = user.role === "SUPER_ADMIN" || (user.role === "PRODUCTION_MANAGER" && mine);
  const startReady = workOrder.plannedStartDate <= today;
  const canStart = canChangeStatus && workOrder.status === "PREPARE" && startReady;
  const canFinish = canChangeStatus && workOrder.status === "PRODUCE";
  const canPack = canChangeStatus && workOrder.status === "PACK";
  const canHold = canFinish;
  const canResume = canChangeStatus && workOrder.status === "SUSPEND";
  const canReturn = canChangeStatus && workOrder.status === "HALT";
  const canStop = canChangeStatus && (workOrder.status === "PRODUCE" || workOrder.status === "SUSPEND");
  const lineEditable = canProduce(user.role) && ["PREPARE", "PRODUCE", "SUSPEND", "HALT"].includes(workOrder.status);
  const lineOptions = lines.filter((line) => line.lineId === workOrder.lineId || line.status === "AVAILABLE");
  const managers = staff.some((item) => item.id === workOrder.assignedId) || staff.length === 0
    ? staff
    : [{ id: workOrder.assignedId, name: workOrder.assignedName, role: "PRODUCTION_MANAGER", status: "ACTIVE" }, ...staff];

  async function run(task: () => Promise<WorkOrderDetail>, success: string): Promise<boolean> {
    if (pending) return false;
    setPending(true);
    try {
      const next = await task();
      setWorkOrder(next);
      setLineId(next.lineId);
      setAssigneeId(next.assignedId);
      show(success);
      onChanged?.();
      return true;
    } catch (error: unknown) {
      show(readApiErrorMessage(error));
      return false;
    } finally {
      setPending(false);
    }
  }

  function askHaltReason() {
    setHaltReasonOpen(true);
    setReason("");
  }

  async function submitHalt(event: FormEvent) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < 2) {
      show("사유는 2자 이상 입력하세요.");
      return;
    }
    if (!workOrder) return;
    const saved = await run(() => changeWorkOrderStatus(workOrder.id, "HALT", trimmed), "생산을 중지했습니다.");
    if (saved) {
      setHaltReasonOpen(false);
      setReason("");
    }
  }

  function save() {
    const body: { lineId?: number; assignedId?: number } = {};
    if (lineEditable && lineId !== "" && lineId !== workOrder?.lineId) body.lineId = lineId;
    if (canManageOrders(user?.role) && assigneeId !== "" && assigneeId !== workOrder?.assignedId) body.assignedId = assigneeId;
    if (body.lineId == null && body.assignedId == null) {
      show("변경된 라인 또는 담당자가 없습니다.");
      return;
    }
    void run(() => updateWorkOrder(workOrder!.id, body), "저장했습니다.");
  }

  return (
    <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.8fr)]">
      <section className="rounded-xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">기본정보</h3>
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted"><span className="text-danger">*</span> 필수 입력</p>
            <Button onClick={save} disabled={pending}><Save size={15} className="mr-1" />저장</Button>
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="작업지시번호"><input className={readOnlyClass} value={workOrder.workNo} disabled /></Field>
          <Field label="생산라인" required>
            <select className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm disabled:bg-canvas" value={lineId} disabled={!lineEditable} onChange={(event) => setLineId(Number(event.target.value))}>
              {lineOptions.map((line) => <option key={line.lineId} value={line.lineId}>{line.lineName}</option>)}
            </select>
          </Field>
          <Field label="지시일"><input className={readOnlyClass} type="date" value={workOrder.workOrderDate} disabled /></Field>
          <Field label="담당자" required>
            <select className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm disabled:bg-canvas" value={assigneeId} disabled={!canManageOrders(user.role) || staff.length === 0} onChange={(event) => setAssigneeId(Number(event.target.value))}>
              {managers.length === 0 ? <option value={workOrder.assignedId}>{workOrder.assignedName}</option> : null}
              {managers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>
          <Field label="생산 시작 예정일"><input className={readOnlyClass} type="date" value={workOrder.plannedStartDate} disabled /></Field>
          <Field label="생산 완료 예정일"><input className={readOnlyClass} type="date" value={workOrder.plannedEndDate} disabled /></Field>
          <Field label="수주번호" required>
            <input className={readOnlyClass} value={workOrder.orderNo} disabled />
          </Field>
          <Field label="거래처명"><input className={readOnlyClass} value={workOrder.clientName} disabled /></Field>
          <Field label="상태">
            <input className={readOnlyClass} value={view.label} disabled />
          </Field>
        </div>

        <h3 className="mt-6 text-sm font-semibold">작업지시 세부내용</h3>
        <div className="mt-3 space-y-3 text-sm">
          <div className="grid gap-3 md:grid-cols-[88px_minmax(0,1fr)]">
            <p className="pt-3 text-muted">작업내용</p>
            <input className={readOnlyClass} value={`${workOrder.productName} · ${workOrder.quantity.toLocaleString("ko-KR")}개`} disabled />
          </div>
          {workOrder.note ? <p className="text-muted">{workOrder.note}</p> : null}
        </div>
        <div className="mt-4 flex justify-between text-xs text-muted">
          <span>작업지시번호 {workOrder.workNo}</span>
          <span>수주 {workOrder.orderNo} · 담당 {workOrder.assignedName}</span>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-white p-5">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">작업지시 상세</h2>
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${view.className}`}>{view.label}</span>
          </div>
          <WorkStatusStepper status={workOrder.status} overdue={overdue} />
        </div>
        <h2 className="mt-5 font-semibold">생산 진행현황</h2>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs text-muted">지시수량</dt><dd className="mt-1 text-lg font-semibold">{workOrder.quantity.toLocaleString("ko-KR")}개</dd></div>
          <div><dt className="text-xs text-muted">생산라인</dt><dd className="mt-1 text-lg font-semibold">{workOrder.lineName}</dd></div>
          <div><dt className="text-xs text-muted">작업 시작</dt><dd className="mt-1">예정 {workOrder.plannedStartDate}</dd></div>
          <div><dt className="text-xs text-muted">{workOrder.completedAt ? "작업 완료" : "완료 예정"}</dt><dd className={`mt-1 ${overdue ? "font-semibold text-danger" : ""}`}>{workOrder.completedAt ?? workOrder.plannedEndDate}{overdue ? " · 지연" : ""}</dd></div>
        </dl>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <button type="button" className="inline-flex h-10 items-center justify-center gap-1 rounded-lg border border-line bg-white text-sm font-semibold disabled:opacity-40" disabled={!canStart || pending} onClick={() => void run(() => changeWorkOrderStatus(workOrder.id, "PRODUCE"), "생산을 시작했습니다.")}>
            <Play size={14} /> 작업 시작
          </button>
          <button type="button" className="inline-flex h-10 items-center justify-center gap-1 rounded-lg bg-primary text-sm font-semibold text-white disabled:opacity-40" disabled={(!canFinish && !canPack) || pending} onClick={() => void run(() => changeWorkOrderStatus(workOrder.id, canPack ? "PACK_DONE" : "PACK"), canPack ? "포장 완료로 변경했습니다." : "생산을 완료했습니다.")}>
            <Check size={14} /> {canPack ? "포장완료" : "작업 완료"}
          </button>
          {canReturn ? (
            <button type="button" className="inline-flex h-10 items-center justify-center gap-1 rounded-lg border border-line bg-white text-sm font-semibold" disabled={pending} onClick={() => void run(() => changeWorkOrderStatus(workOrder.id, "PREPARE"), "준비로 되돌렸습니다.")}>
              <RotateCcw size={14} /> 준비로 복귀
            </button>
          ) : canResume ? (
            <button type="button" className="inline-flex h-10 items-center justify-center gap-1 rounded-lg border border-line bg-white text-sm font-semibold" disabled={pending} onClick={() => void run(() => changeWorkOrderStatus(workOrder.id, "PRODUCE"), "생산을 다시 시작했습니다.")}>
              <Play size={14} /> 다시 시작
            </button>
          ) : (
            <button type="button" className="inline-flex h-10 items-center justify-center gap-1 rounded-lg border border-line bg-white text-sm font-semibold disabled:opacity-40" disabled={!canHold || pending} onClick={() => void run(() => changeWorkOrderStatus(workOrder.id, "SUSPEND"), "생산을 일시정지했습니다.")}>
              <Pause size={14} /> 일시정지
            </button>
          )}
        </div>
        {canStop ? (
          <button type="button" className="mt-2 text-xs text-muted underline" disabled={pending} onClick={askHaltReason}>생산 중지</button>
        ) : null}
        {haltReasonOpen ? (
          <form className="mt-3 space-y-2 rounded-lg border border-line bg-canvas p-3" onSubmit={(event) => void submitHalt(event)}>
            <label className="block text-xs text-muted">생산 중지 사유 <span className="text-danger">*</span>
              <input className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink" value={reason} autoFocus placeholder="예: 설비 고장, 거래처 요청" onChange={(event) => setReason(event.target.value)} />
            </label>
            <div className="flex justify-end gap-2">
              <Button tone="ghost" onClick={() => setHaltReasonOpen(false)}>취소</Button>
              <Button type="submit" tone="danger" disabled={pending}>생산 중지</Button>
            </div>
          </form>
        ) : null}
        {!mine && workOrder.status === "PREPARE" && user.role !== "SUPER_ADMIN" ? <p className="mt-2 text-xs text-muted">배정된 담당자만 작업을 시작할 수 있습니다.</p> : null}
        {canChangeStatus && workOrder.status === "PREPARE" && !startReady ? <p className="mt-2 text-xs text-muted">생산 시작 예정일 {workOrder.plannedStartDate}부터 작업을 시작할 수 있습니다.</p> : null}
      </section>
    </div>
  );
}

export function WorkOrderDetailPage() {
  const { workOrderId = "" } = useParams();
  return (
    <div>
      <Link className="text-sm font-semibold text-primary" to="/work-orders">작업지시 목록</Link>
      <WorkOrderEditor key={workOrderId} workOrderId={workOrderId} />
    </div>
  );
}
