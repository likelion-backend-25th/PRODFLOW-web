import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { Check, ChevronLeft, ChevronRight, Download, Pause, Play, RotateCcw, Save, Search } from "lucide-react";
import { Button } from "@/components/ui.tsx";
import { cn } from "@/lib/cn.ts";
import { localDate, localDateTime, todayISO, toISO } from "@/lib/dates.ts";
import { useDb } from "@/lib/db.ts";
import { orderItems, orderItemsText, productTitle, workItems, workItemsText } from "@/lib/orderText.ts";
import { availableLineIds, changeLine, clockIn, clockOut, completePacking, completeProduction, holdProduction, reassign, resumeProduction, startProduction, stopProduction } from "@/lib/workflow.ts";
import { canManageOrders, canProduce, useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";
import { workOrderStatusLabel } from "@/lib/labels.ts";
import type { OrderStatus, WorkOrder, WorkOrderStatus } from "@/types/domain.ts";

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

function workOrderNo(item: WorkOrder, orderNo: string | undefined): string {
  const issued = localDate(item.issuedAt).replaceAll("-", "");
  const tail = orderNo?.split("-").at(-1) ?? "000";
  return `WO-${issued.slice(0, 6)}-${tail}-${item.id.slice(0, 4)}`;
}

function statusView(status: WorkOrderStatus, overdue: boolean): { label: string; className: string } {
  if (overdue && status !== "COMPLETED" && status !== "CANCELLED") return { label: "지연", className: "bg-red-50 text-danger" };
  if (status === "IN_PRODUCTION") return { label: "진행중", className: "bg-primary-soft text-primary" };
  if (status === "READY") return { label: "대기", className: "bg-warning-soft text-warning" };
  if (status === "PAUSED") return { label: "일시정지", className: "bg-warning-soft text-warning" };
  if (status === "COMPLETED") return { label: "완료", className: "bg-emerald-50 text-success" };
  return { label: "취소", className: "bg-red-50 text-danger" };
}

function stepsOf(status: WorkOrderStatus, orderStatus: OrderStatus | undefined): Array<{ label: string; state: "done" | "current" | "todo" }> {
  const labels = ["준비", status === "PAUSED" ? "일시정지" : "생산", "포장", "포장완료"];
  const packedOrLater = orderStatus === "PACKED" || orderStatus === "READY_TO_SHIP" || orderStatus === "SHIPPING" || orderStatus === "COMPLETED";
  const current = status === "CANCELLED" ? -1
    : status === "READY" ? 0
    : status === "IN_PRODUCTION" || status === "PAUSED" ? 1
    : packedOrLater ? 4 : 2;
  return labels.map((label, index) => ({ label, state: index < current ? "done" : index === current ? "current" : "todo" }));
}

function WorkStatusStepper({ status, orderStatus, overdue }: { status: WorkOrderStatus; orderStatus: OrderStatus | undefined; overdue: boolean }) {
  const steps = stepsOf(status, orderStatus);
  const warnCurrent = status === "PAUSED" || overdue;
  return (
    <div>
      {status === "CANCELLED" ? <p className="mb-2 text-xs font-semibold text-danger">이 작업지시는 취소되었습니다.</p> : null}
      {overdue && status !== "CANCELLED" ? <p className="mb-2 text-xs font-semibold text-danger">완료 예정일을 지났습니다.</p> : null}
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

function historyTitle(from: string, to: string): string {
  const label = (value: string) => workOrderStatusLabel[value as WorkOrderStatus] ?? value;
  return from === to ? "정보 변경" : `${label(from)} → ${label(to)}`;
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

export function WorkOrderListPage() {
  const db = useDb();
  const user = useAuthStore((state) => state.user);
  const show = useToastStore((state) => state.show);
  const initial = monthRange();
  const [draft, setDraft] = useState<Filters>({ ...initial, line: "all", status: "all", keyword: "" });
  const [applied, setApplied] = useState<Filters>({ ...initial, line: "all", status: "all", keyword: "" });
  const [selectedId, setSelectedId] = useState("");
  const [page, setPage] = useState(1);
  const today = todayISO();
  const account = db.users.find((item) => item.id === user?.id);
  const shift = db.attendance.find((item) => item.userId === user?.id && !item.clockOutAt);
  const mine = db.workOrders.filter((item) => user?.role !== "PRODUCTION_MANAGER" || item.assigneeId === user.id);

  const matched = mine.filter((item) => {
    const order = db.orders.find((order) => order.id === item.orderId);
    const client = db.clients.find((client) => client.id === order?.clientId);
    const productNames = order?.lines.map((line) => db.products.find((product) => product.id === line.productId)?.productName ?? "").join(" ") ?? "";
    const assignee = db.users.find((person) => person.id === item.assigneeId);
    const issued = localDate(item.issuedAt);
    const overdue = item.plannedEndDate < today && item.status !== "COMPLETED" && item.status !== "CANCELLED";
    const keyword = applied.keyword.trim();
    const text = `${order?.orderNo ?? ""} ${client?.companyName ?? ""} ${productNames} ${assignee?.name ?? ""}`;
    if (applied.from && issued < applied.from) return false;
    if (applied.to && issued > applied.to) return false;
    if (applied.line === "none" && item.lineId) return false;
    if (applied.line !== "all" && applied.line !== "none" && item.lineId !== applied.line) return false;
    if (applied.status === "DELAYED" && !overdue) return false;
    if (applied.status !== "all" && applied.status !== "DELAYED" && item.status !== applied.status) return false;
    return text.includes(keyword);
  });
  const counts = {
    running: matched.filter((item) => item.status === "IN_PRODUCTION").length,
    ready: matched.filter((item) => item.status === "READY" && item.plannedEndDate >= today).length,
    done: matched.filter((item) => item.status === "COMPLETED").length,
    late: matched.filter((item) => item.plannedEndDate < today && item.status !== "COMPLETED" && item.status !== "CANCELLED").length,
  };
  const pageCount = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = matched.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const selected = matched.find((item) => item.id === selectedId) ?? matched[0];

  function act(action: () => void, success: string) {
    try {
      action();
      show(success);
    } catch (error: unknown) {
      show(error instanceof Error ? error.message : "처리하지 못했습니다.");
    }
  }

  function exportRows() {
    const header = ["작업지시번호", "수주번호", "거래처명", "제품명", "수량", "생산라인", "담당자", "지시일", "완료예정일", "상태"];
    const body = matched.map((item) => {
      const order = db.orders.find((order) => order.id === item.orderId);
      const client = db.clients.find((client) => client.id === order?.clientId);
      const assignee = db.users.find((person) => person.id === item.assigneeId);
      const line = db.lines.find((line) => line.id === item.lineId);
      const overdue = item.plannedEndDate < today && item.status !== "COMPLETED" && item.status !== "CANCELLED";
      return [
        workOrderNo(item, order?.orderNo),
        order?.orderNo ?? "",
        client?.companyName ?? "",
        item.items?.length ? workItems(db.products, item.items).names.join(" / ") : order ? orderItems(db.products, order.lines).names.join(" / ") : "",
        String(item.quantity),
        line?.name ?? "",
        assignee?.name ?? "",
        localDate(item.issuedAt),
        item.plannedEndDate,
        statusView(item.status, overdue).label,
      ];
    });
    downloadCsv([header, ...body]);
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">작업지시 관리</h1>
          <p className="mt-1 text-sm text-muted">작업지시는 선금이 확인된 수주에서 자동으로 만들어집니다. 라인 배정과 생산 진행을 여기서 관리합니다.</p>
        </div>
        <div className="flex gap-2">
          {user?.role === "PRODUCTION_MANAGER" && account ? (
            account.clockedIn ? (
              <span className="flex items-center gap-2">
                <span className="text-sm text-muted">출근 {shift ? localDateTime(shift.clockInAt).slice(11) : ""}</span>
                <Button tone="ghost" onClick={() => act(() => clockOut(account.id), "퇴근을 기록했습니다.")}>퇴근</Button>
              </span>
            ) : (
              <Button tone="ghost" onClick={() => act(() => clockIn(account.id), "출근을 기록했습니다. 대기 작업이 있으면 자동 배정됩니다.")}>출근</Button>
            )
          ) : null}
          <Button tone="ghost" onClick={exportRows}><Download size={16} className="mr-1" />엑셀 다운로드</Button>        </div>
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
              <option value="none">라인 미배정</option>
              {db.lines.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted">진행상태
            <select className="mt-1 h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
              <option value="all">전체 상태</option>
              <option value="READY">대기</option>
              <option value="IN_PRODUCTION">진행중</option>
              <option value="PAUSED">일시정지</option>
              <option value="COMPLETED">완료</option>
              <option value="DELAYED">지연</option>
              <option value="CANCELLED">취소</option>
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
          <p className="font-semibold">작업지시 목록 <span className="font-normal text-muted">전체 {matched.length}건</span></p>
          <p className="text-muted">진행중 {counts.running} · 대기 {counts.ready} · 완료 {counts.done} · 지연 {counts.late}</p>
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
              {pageRows.map((item) => {
                const order = db.orders.find((order) => order.id === item.orderId);
                const client = db.clients.find((client) => client.id === order?.clientId);
                const assignee = db.users.find((person) => person.id === item.assigneeId);
                const line = db.lines.find((line) => line.id === item.lineId);
                const overdue = item.plannedEndDate < today && item.status !== "COMPLETED" && item.status !== "CANCELLED";
                const view = statusView(item.status, overdue);
                const active = selected?.id === item.id;
                return (
                  <tr key={item.id} className={`cursor-pointer border-t border-line ${active ? "bg-primary-soft" : "hover:bg-canvas"}`} onClick={() => setSelectedId(item.id)}>
                    <td className="px-4 py-3"><input type="checkbox" checked={active} readOnly aria-label={`${workOrderNo(item, order?.orderNo)} 선택`} /></td>
                    <td className="py-3 font-semibold">{workOrderNo(item, order?.orderNo)}</td>
                    <td>{order?.orderNo}</td>
                    <td>{client?.companyName}</td>
                    <td title={item.items?.length ? workItems(db.products, item.items).names.join("\n") : order ? orderItems(db.products, order.lines).names.join("\n") : ""}>{item.items?.length ? workItemsText(db.products, item.items) : order ? orderItemsText(db.products, order.lines) : ""}</td>
                    <td>{item.quantity.toLocaleString("ko-KR")}</td>
                    <td>{line?.name ?? "-"}</td>
                    <td>{assignee?.name ?? "미배정"}</td>
                    <td>{localDate(item.issuedAt)}</td>
                    <td>{item.plannedEndDate}</td>
                    <td><span className={`rounded-full px-2 py-1 text-xs font-semibold ${view.className}`}>{view.label}</span></td>
                    <td className="pr-4 text-muted"><ChevronRight size={16} /></td>
                  </tr>
                );
              })}
              {pageRows.length === 0 ? <tr><td className="px-5 py-8 text-muted" colSpan={12}>조건에 맞는 작업지시가 없습니다.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm text-muted">
          <p>총 {matched.length}건 중 {matched.length === 0 ? "0-0" : `${(safePage - 1) * PAGE_SIZE + 1}-${Math.min(safePage * PAGE_SIZE, matched.length)}`}건 표시 · 작업지시를 선택하면 아래에서 상세 정보를 확인할 수 있습니다.</p>
          <div className="flex items-center gap-1">
            <button type="button" className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-white" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} aria-label="이전 페이지"><ChevronLeft size={16} /></button>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-white">{safePage}</span>
            <button type="button" className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-white" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} aria-label="다음 페이지"><ChevronRight size={16} /></button>
          </div>
        </div>
      </section>

      {selected && user ? <WorkOrderEditor key={selected.id} workOrderId={selected.id} /> : null}
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

function WorkOrderEditor({ workOrderId }: { workOrderId: string }) {
  const db = useDb();
  const user = useAuthStore((state) => state.user);
  const show = useToastStore((state) => state.show);
  const workOrder = db.workOrders.find((item) => item.id === workOrderId);
  const candidates = availableLineIds();
  const [lineId, setLineId] = useState(workOrder?.lineId ?? candidates[0] ?? "");
  const [assigneeId, setAssigneeId] = useState(workOrder?.assigneeId ?? "");
  const [reasonFor, setReasonFor] = useState<"hold" | "stop" | null>(null);
  const [reason, setReason] = useState("");
  if (!workOrder || !user) return <p className="mt-4 text-muted">작업지시를 찾을 수 없습니다.</p>;
  if (user.role === "PRODUCTION_MANAGER" && workOrder.assigneeId !== user.id) return <p className="mt-4 text-muted">나에게 배정된 작업만 볼 수 있습니다.</p>;

  const order = db.orders.find((item) => item.id === workOrder.orderId);
  const client = db.clients.find((item) => item.id === order?.clientId);
  const assignee = db.users.find((item) => item.id === workOrder.assigneeId);
  const orderProducts = (workOrder.items?.length ? workOrder.items : []).map((item, index) => ({
    key: `${item.productId}-${index}`,
    product: db.products.find((product) => product.id === item.productId),
    quantity: item.quantity,
  }));
  const overdue = workOrder.plannedEndDate < todayISO() && workOrder.status !== "COMPLETED" && workOrder.status !== "CANCELLED";
  const view = statusView(workOrder.status, overdue);
  const line = db.lines.find((item) => item.id === workOrder.lineId);
  const timeline = db.histories.filter((item) => item.entity === "WORK_ORDER" && item.entityId === workOrder.id);
  const lineOptions = db.lines.filter((line) => line.id === workOrder.lineId || line.id === lineId || candidates.includes(line.id));
  const managers = db.users.filter((item) => item.role === "PRODUCTION_MANAGER" && item.status === "ACTIVE");
  const mine = workOrder.assigneeId === user.id;
  const canRun = canProduce(user.role) && (mine || user.role === "SUPER_ADMIN");
  const canStart = canProduce(user.role) && mine && workOrder.status === "READY";
  const canFinish = canRun && workOrder.status === "IN_PRODUCTION";
  const canHold = canFinish;
  const canResume = canRun && workOrder.status === "PAUSED";
  const canPack = canRun && order?.status === "PACKING";
  // 수주는 모든 작업지시가 생산 완료돼야 포장중이 되므로, 그 전에는 포장 단계 완료를 막는다.
  const waitingOthers = canRun && workOrder.status === "COMPLETED" && order !== undefined && ["CONFIRMED", "IN_PRODUCTION", "ON_HOLD"].includes(order.status);
  const canAssignLine = (mine && canProduce(user.role) && ["READY", "IN_PRODUCTION", "PAUSED"].includes(workOrder.status))
    || (canManageOrders(user.role) && ["IN_PRODUCTION", "PAUSED"].includes(workOrder.status));
  const number = workOrderNo(workOrder, order?.orderNo);
  const conditions = [
    order ? `납기 ${order.dueDate}` : "",
    order ? `수주번호 ${order.orderNo}` : "",
    `이번 지시 ${workOrder.quantity.toLocaleString("ko-KR")}개`,
    `생산 예정 ${workOrder.plannedStartDate} ~ ${workOrder.plannedEndDate}`,
    ...orderProducts.flatMap(({ product }) => (
      product?.description ? [`품목 설명(${product.productName}): ${product.description}`] : []
    )),
  ].filter(Boolean);

  function act(action: () => void, success: string) {
    try {
      action();
      show(success);
    } catch (error: unknown) {
      show(error instanceof Error ? error.message : "처리하지 못했습니다.");
    }
  }

  function save() {
    const current = workOrder;
    const actor = user;
    if (!current || !actor) return;
    act(() => {
      if (canManageOrders(actor.role) && assigneeId && assigneeId !== current.assigneeId) reassign(current.id, assigneeId, actor);
      if ((current.status === "READY" || current.status === "IN_PRODUCTION" || current.status === "PAUSED") && lineId && lineId !== current.lineId) {
        changeLine(current.id, lineId, actor);
      }
    }, current.status === "READY" ? "생산 라인을 배정했습니다. 작업 시작을 누르면 생산이 시작됩니다." : "저장했습니다.");
  }

  function start() {
    const current = workOrder;
    const actor = user;
    if (!current || !actor) return;
    if (!lineId) {
      show("생산 라인을 선택하세요.");
      return;
    }
    act(() => startProduction(current.id, lineId, actor), "생산을 시작했습니다.");
  }

  function finish() {
    const current = workOrder;
    const actor = user;
    if (!current || !actor) return;
    if (canFinish) {
      act(() => completeProduction(current.id, actor), "생산을 완료하고 라인을 비웠습니다.");
      return;
    }
    if (canPack && order) act(() => completePacking(order.id, actor), "포장 완료로 변경했습니다. 배송 관리에서 출고할 수 있습니다.");
  }

  return (
    <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.8fr)]">
      <section className="rounded-xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">기본정보</h3>
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted"><span className="text-danger">*</span> 필수 입력</p>
            <Button onClick={save}><Save size={15} className="mr-1" />저장</Button>
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="작업지시번호"><input className={readOnlyClass} value={number} disabled /></Field>
          <Field label="생산라인" required>
            <select className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm disabled:bg-canvas" value={lineId} disabled={!canAssignLine} onChange={(event) => setLineId(event.target.value)}>
              <option value="">라인을 선택하세요</option>
              {lineOptions.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)}
            </select>
          </Field>
          <Field label="지시일"><input className={readOnlyClass} type="date" value={localDate(workOrder.issuedAt)} disabled /></Field>
          <Field label="담당자" required>
            <select className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm disabled:bg-canvas" value={assigneeId} disabled={!canManageOrders(user.role)} onChange={(event) => setAssigneeId(event.target.value)}>
              <option value="">미배정</option>
              {managers.map((item) => <option key={item.id} value={item.id}>{item.name}{item.clockedIn ? "" : " · 미출근"}</option>)}
            </select>
          </Field>
          <Field label="생산 시작 예정일"><input className={readOnlyClass} type="date" value={workOrder.plannedStartDate} disabled /></Field>
          <Field label="생산 완료 예정일"><input className={readOnlyClass} type="date" value={workOrder.plannedEndDate} disabled /></Field>
          <Field label="수주번호" required>
            <span className="relative block">
              <input className={`${readOnlyClass} pr-10`} value={order?.orderNo ?? ""} disabled />
              {order ? <Link className="absolute top-1/2 right-3 -translate-y-1/2 text-muted" to={`/orders/${order.id}`} aria-label="수주 상세"><Search size={15} /></Link> : null}
            </span>
          </Field>
          <Field label="거래처명"><input className={readOnlyClass} value={client?.companyName ?? ""} disabled /></Field>
          <Field label="상태">
            <input className={readOnlyClass} value={view.label} disabled />
          </Field>
        </div>

        <h3 className="mt-6 text-sm font-semibold">작업지시 세부내용</h3>
        <div className="mt-3 space-y-3 text-sm">
          <div className="grid gap-3 md:grid-cols-[88px_minmax(0,1fr)]">
            <p className="pt-3 text-muted">작업내용</p>
            {orderProducts.length === 0 ? (
              <p className="min-h-16 rounded-lg bg-canvas px-3 py-3 text-muted">등록된 작업내용이 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {orderProducts.map(({ key, product, quantity }) => (
                  <li key={key} className="relative">
                    <input
                      className={`${readOnlyClass} pr-10`}
                      value={product ? `${productTitle(product)} · ${quantity.toLocaleString("ko-KR")}개` : "삭제된 품목"}
                      disabled
                    />
                    {product ? <Link className="absolute top-1/2 right-3 -translate-y-1/2 text-muted" to={`/products/${product.id}`} aria-label={`${product.productName} 상세`}><Search size={15} /></Link> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-[88px_minmax(0,1fr)]">
            <p className="pt-3 text-muted">작업 조건</p>
            <ul className="list-disc space-y-1 rounded-lg px-8 py-2 text-ink">
              {conditions.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
            </ul>
          </div>
        </div>
        <div className="mt-4 flex justify-between text-xs text-muted">
          <span>작업지시번호 {number}</span>
          <span>수주 {order?.orderNo} · 담당 {assignee?.name ?? "미배정"}</span>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-white p-5">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">작업지시 상세</h2>
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${view.className}`}>{view.label}</span>
          </div>
          <WorkStatusStepper status={workOrder.status} orderStatus={order?.status} overdue={overdue} />
        </div>
        <h2 className="mt-5 font-semibold">생산 진행현황</h2>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs text-muted">지시수량</dt><dd className="mt-1 text-lg font-semibold">{workOrder.quantity.toLocaleString("ko-KR")}개</dd></div>
          <div><dt className="text-xs text-muted">생산라인</dt><dd className="mt-1 text-lg font-semibold">{line?.name ?? "미배정"}</dd></div>
          <div><dt className="text-xs text-muted">작업 시작</dt><dd className="mt-1">{workOrder.startedAt ? localDateTime(workOrder.startedAt) : `예정 ${workOrder.plannedStartDate}`}</dd></div>
          <div><dt className="text-xs text-muted">{workOrder.completedAt ? "작업 완료" : "완료 예정"}</dt><dd className={`mt-1 ${overdue ? "font-semibold text-danger" : ""}`}>{workOrder.completedAt ? localDateTime(workOrder.completedAt) : workOrder.plannedEndDate}{overdue ? " · 지연" : ""}</dd></div>
        </dl>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <button type="button" className="inline-flex h-10 items-center justify-center gap-1 rounded-lg border border-line bg-white text-sm font-semibold disabled:opacity-40" disabled={!canStart} onClick={start}>
            <Play size={14} /> 작업 시작
          </button>
          <button type="button" className="inline-flex h-10 items-center justify-center gap-1 rounded-lg bg-primary text-sm font-semibold text-white disabled:opacity-40" disabled={!canFinish && !canPack} onClick={finish}>
            <Check size={14} /> 작업 완료
          </button>
          {canResume ? (
            <button type="button" className="inline-flex h-10 items-center justify-center gap-1 rounded-lg border border-line bg-white text-sm font-semibold" onClick={() => act(() => resumeProduction(workOrder.id, user), "생산을 다시 시작했습니다.")}>
              <Play size={14} /> 다시 시작
            </button>
          ) : (
            <button type="button" className="inline-flex h-10 items-center justify-center gap-1 rounded-lg border border-line bg-white text-sm font-semibold disabled:opacity-40" disabled={!canHold} onClick={() => { setReasonFor("hold"); setReason(""); }}>
              <Pause size={14} /> 일시정지
            </button>
          )}
        </div>
        {waitingOthers ? <p className="mt-2 text-xs text-muted">이 수주의 다른 작업지시가 모두 생산 완료되면 포장 단계에서 작업 완료를 누를 수 있습니다.</p> : null}
        {canFinish ? (
          <button type="button" className="mt-2 text-xs text-muted underline" onClick={() => { setReasonFor("stop"); setReason(""); }}>생산 중지</button>
        ) : null}
        {reasonFor ? (
          <form className="mt-3 space-y-2 rounded-lg border border-line bg-canvas p-3" onSubmit={(event) => {
            event.preventDefault();
            const run = reasonFor === "hold"
              ? () => holdProduction(workOrder.id, reason, user)
              : () => stopProduction(workOrder.id, reason, user);
            try {
              run();
              show(reasonFor === "hold" ? "생산을 일시정지했습니다." : "생산을 중지하고 라인을 비웠습니다. 다시 시작하려면 라인을 골라 작업 시작을 누르세요.");
              setReasonFor(null);
            } catch (error: unknown) {
              show(error instanceof Error ? error.message : "처리하지 못했습니다.");
            }
          }}>
            <label className="block text-xs text-muted">{reasonFor === "hold" ? "일시정지 사유" : "생산 중지 사유"} <span className="text-danger">*</span>
              <input className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink" value={reason} autoFocus placeholder={reasonFor === "hold" ? "예: 금형 교체, 원자재 대기" : "예: 설비 고장, 거래처 요청"} onChange={(event) => setReason(event.target.value)} />
            </label>
            <div className="flex justify-end gap-2">
              <Button tone="ghost" onClick={() => setReasonFor(null)}>취소</Button>
              <Button type="submit" tone={reasonFor === "stop" ? "danger" : "primary"}>{reasonFor === "hold" ? "일시정지" : "생산 중지"}</Button>
            </div>
          </form>
        ) : null}
        {!mine && workOrder.status === "READY" ? <p className="mt-2 text-xs text-muted">배정된 담당자만 라인을 정해 작업을 시작할 수 있습니다.</p> : null}

        <h3 className="mt-5 text-sm font-semibold">작업 이력</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {timeline.map((item) => (
            <li key={item.id} className="border-t border-line pt-2">
              <p className="flex justify-between gap-2"><span className="font-medium">{historyTitle(item.fromStatus, item.toStatus)}</span><span className="text-xs text-muted">{localDateTime(item.at)}</span></p>
              <p className="text-xs text-muted">{item.actorName}{item.note ? ` · ${item.note}` : ""}</p>
            </li>
          ))}
          {timeline.length === 0 ? <li className="text-muted">아직 작업 이력이 없습니다.</li> : null}
        </ul>
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
