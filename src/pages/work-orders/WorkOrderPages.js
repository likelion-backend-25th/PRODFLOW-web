import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
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
const PAGE_SIZE = 5;
function monthRange() {
    const today = todayISO();
    const [year, month] = today.split("-").map(Number);
    return { from: `${today.slice(0, 8)}01`, to: toISO(new Date(year, month, 0)) };
}
function workOrderNo(item, orderNo) {
    const issued = localDate(item.issuedAt).replaceAll("-", "");
    const tail = orderNo?.split("-").at(-1) ?? "000";
    return `WO-${issued.slice(0, 6)}-${tail}-${item.id.slice(0, 4)}`;
}
function statusView(status, overdue) {
    if (overdue && status !== "COMPLETED" && status !== "CANCELLED")
        return { label: "지연", className: "bg-red-50 text-danger" };
    if (status === "IN_PRODUCTION")
        return { label: "진행중", className: "bg-primary-soft text-primary" };
    if (status === "READY")
        return { label: "대기", className: "bg-warning-soft text-warning" };
    if (status === "PAUSED")
        return { label: "일시정지", className: "bg-warning-soft text-warning" };
    if (status === "COMPLETED")
        return { label: "완료", className: "bg-emerald-50 text-success" };
    return { label: "취소", className: "bg-red-50 text-danger" };
}
function stepsOf(status, orderStatus) {
    const labels = ["준비", status === "PAUSED" ? "일시정지" : "생산", "포장", "포장완료"];
    const packedOrLater = orderStatus === "PACKED" || orderStatus === "READY_TO_SHIP" || orderStatus === "SHIPPING" || orderStatus === "COMPLETED";
    const current = status === "CANCELLED" ? -1
        : status === "READY" ? 0
            : status === "IN_PRODUCTION" || status === "PAUSED" ? 1
                : packedOrLater ? 4 : 2;
    return labels.map((label, index) => ({ label, state: index < current ? "done" : index === current ? "current" : "todo" }));
}
function WorkStatusStepper({ status, orderStatus, overdue }) {
    const steps = stepsOf(status, orderStatus);
    const warnCurrent = status === "PAUSED" || overdue;
    return (_jsxs("div", { children: [status === "CANCELLED" ? _jsx("p", { className: "mb-2 text-xs font-semibold text-danger", children: "\uC774 \uC791\uC5C5\uC9C0\uC2DC\uB294 \uCDE8\uC18C\uB418\uC5C8\uC2B5\uB2C8\uB2E4." }) : null, overdue && status !== "CANCELLED" ? _jsx("p", { className: "mb-2 text-xs font-semibold text-danger", children: "\uC644\uB8CC \uC608\uC815\uC77C\uC744 \uC9C0\uB0AC\uC2B5\uB2C8\uB2E4." }) : null, _jsx("ol", { className: "flex w-full items-start", children: steps.map((step, index) => (_jsxs("li", { className: "relative flex flex-1 flex-col items-center text-center", children: [index < steps.length - 1 ? (_jsx("span", { className: cn("absolute top-3.5 left-[calc(50%+14px)] right-[calc(-50%+14px)] h-0.5", step.state === "done" ? "bg-primary" : "bg-line"), "aria-hidden": true })) : null, _jsx("span", { className: cn("relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold", step.state === "done" && "bg-primary text-white", step.state === "current" && (warnCurrent ? "bg-warning-soft text-warning ring-2 ring-warning" : "bg-primary-soft text-primary ring-2 ring-primary"), step.state === "todo" && "bg-canvas text-muted ring-1 ring-line"), children: step.state === "done" ? _jsx(Check, { size: 14 }) : index + 1 }), _jsx("span", { className: cn("mt-1.5 whitespace-nowrap text-[11px] font-semibold", step.state === "done" && "text-primary", step.state === "current" && (warnCurrent ? "text-warning" : "text-primary"), step.state === "todo" && "text-muted"), children: step.label })] }, `${step.label}-${index}`))) })] }));
}
function historyTitle(from, to) {
    const label = (value) => workOrderStatusLabel[value] ?? value;
    return from === to ? "정보 변경" : `${label(from)} → ${label(to)}`;
}
function downloadCsv(rows) {
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
    const [draft, setDraft] = useState({ ...initial, line: "all", status: "all", keyword: "" });
    const [applied, setApplied] = useState({ ...initial, line: "all", status: "all", keyword: "" });
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
        if (applied.from && issued < applied.from)
            return false;
        if (applied.to && issued > applied.to)
            return false;
        if (applied.line === "none" && item.lineId)
            return false;
        if (applied.line !== "all" && applied.line !== "none" && item.lineId !== applied.line)
            return false;
        if (applied.status === "DELAYED" && !overdue)
            return false;
        if (applied.status !== "all" && applied.status !== "DELAYED" && item.status !== applied.status)
            return false;
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
    function act(action, success) {
        try {
            action();
            show(success);
        }
        catch (error) {
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
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "\uC791\uC5C5\uC9C0\uC2DC \uAD00\uB9AC" }), _jsx("p", { className: "mt-1 text-sm text-muted", children: "\uC791\uC5C5\uC9C0\uC2DC\uB294 \uC120\uAE08\uC774 \uD655\uC778\uB41C \uC218\uC8FC\uC5D0\uC11C \uC790\uB3D9\uC73C\uB85C \uB9CC\uB4E4\uC5B4\uC9D1\uB2C8\uB2E4. \uB77C\uC778 \uBC30\uC815\uACFC \uC0DD\uC0B0 \uC9C4\uD589\uC744 \uC5EC\uAE30\uC11C \uAD00\uB9AC\uD569\uB2C8\uB2E4." })] }), _jsxs("div", { className: "flex gap-2", children: [user?.role === "PRODUCTION_MANAGER" && account ? (account.clockedIn ? (_jsxs("span", { className: "flex items-center gap-2", children: [_jsxs("span", { className: "text-sm text-muted", children: ["\uCD9C\uADFC ", shift ? localDateTime(shift.clockInAt).slice(11) : ""] }), _jsx(Button, { tone: "ghost", onClick: () => act(() => clockOut(account.id), "퇴근을 기록했습니다."), children: "\uD1F4\uADFC" })] })) : (_jsx(Button, { tone: "ghost", onClick: () => act(() => clockIn(account.id), "출근을 기록했습니다. 대기 작업이 있으면 자동 배정됩니다."), children: "\uCD9C\uADFC" }))) : null, _jsxs(Button, { tone: "ghost", onClick: exportRows, children: [_jsx(Download, { size: 16, className: "mr-1" }), "\uC5D1\uC140 \uB2E4\uC6B4\uB85C\uB4DC"] }), "        "] })] }), _jsx("section", { className: "mt-4 rounded-xl border border-line bg-white p-4", children: _jsxs("div", { className: "flex flex-wrap items-end gap-3", children: [_jsxs("label", { className: "text-xs text-muted", children: ["\uC9C0\uC2DC\uC77C", _jsxs("span", { className: "mt-1 flex items-center gap-2", children: [_jsx("input", { className: "h-10 rounded-lg border border-line px-3 text-sm text-ink", type: "date", value: draft.from, onChange: (event) => setDraft({ ...draft, from: event.target.value }) }), _jsx("span", { children: "~" }), _jsx("input", { className: "h-10 rounded-lg border border-line px-3 text-sm text-ink", type: "date", value: draft.to, onChange: (event) => setDraft({ ...draft, to: event.target.value }) })] })] }), _jsxs("label", { className: "text-xs text-muted", children: ["\uC791\uC5C5", _jsxs("select", { className: "mt-1 h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink", value: draft.line, onChange: (event) => setDraft({ ...draft, line: event.target.value }), children: [_jsx("option", { value: "all", children: "\uC804\uCCB4 \uC791\uC5C5" }), _jsx("option", { value: "none", children: "\uB77C\uC778 \uBBF8\uBC30\uC815" }), db.lines.map((line) => _jsx("option", { value: line.id, children: line.name }, line.id))] })] }), _jsxs("label", { className: "text-xs text-muted", children: ["\uC9C4\uD589\uC0C1\uD0DC", _jsxs("select", { className: "mt-1 h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink", value: draft.status, onChange: (event) => setDraft({ ...draft, status: event.target.value }), children: [_jsx("option", { value: "all", children: "\uC804\uCCB4 \uC0C1\uD0DC" }), _jsx("option", { value: "READY", children: "\uB300\uAE30" }), _jsx("option", { value: "IN_PRODUCTION", children: "\uC9C4\uD589\uC911" }), _jsx("option", { value: "PAUSED", children: "\uC77C\uC2DC\uC815\uC9C0" }), _jsx("option", { value: "COMPLETED", children: "\uC644\uB8CC" }), _jsx("option", { value: "DELAYED", children: "\uC9C0\uC5F0" }), _jsx("option", { value: "CANCELLED", children: "\uCDE8\uC18C" })] })] }), _jsxs("label", { className: "min-w-56 flex-1 text-xs text-muted", children: ["\uAC80\uC0C9\uC5B4", _jsx("input", { className: "mt-1 h-10 w-full rounded-lg border border-line px-3 text-sm text-ink", value: draft.keyword, placeholder: "\uC218\uC8FC\uBC88\uD638, \uC81C\uD488\uBA85, \uAC70\uB798\uCC98\uBA85 \uAC80\uC0C9", onChange: (event) => setDraft({ ...draft, keyword: event.target.value }) })] }), _jsxs(Button, { onClick: () => { setApplied(draft); setPage(1); }, children: [_jsx(Search, { size: 15, className: "mr-1" }), "\uC870\uD68C"] }), _jsxs(Button, { tone: "ghost", onClick: () => {
                                const next = { ...monthRange(), line: "all", status: "all", keyword: "" };
                                setDraft(next);
                                setApplied(next);
                                setPage(1);
                            }, children: [_jsx(RotateCcw, { size: 15, className: "mr-1" }), "\uCD08\uAE30\uD654"] })] }) }), _jsxs("section", { className: "mt-4 overflow-hidden rounded-xl border border-line bg-white", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm", children: [_jsxs("p", { className: "font-semibold", children: ["\uC791\uC5C5\uC9C0\uC2DC \uBAA9\uB85D ", _jsxs("span", { className: "font-normal text-muted", children: ["\uC804\uCCB4 ", matched.length, "\uAC74"] })] }), _jsxs("p", { className: "text-muted", children: ["\uC9C4\uD589\uC911 ", counts.running, " \u00B7 \uB300\uAE30 ", counts.ready, " \u00B7 \uC644\uB8CC ", counts.done, " \u00B7 \uC9C0\uC5F0 ", counts.late] })] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full min-w-[920px] text-left text-sm", children: [_jsx("thead", { className: "bg-primary-soft/50 text-muted", children: _jsxs("tr", { children: [_jsx("th", { className: "w-10 px-4 py-3" }), _jsx("th", { className: "py-3 font-medium", children: "\uC791\uC5C5\uC9C0\uC2DC\uBC88\uD638" }), _jsx("th", { className: "py-3 font-medium", children: "\uC218\uC8FC\uBC88\uD638" }), _jsx("th", { className: "py-3 font-medium", children: "\uAC70\uB798\uCC98\uBA85" }), _jsx("th", { className: "py-3 font-medium", children: "\uC81C\uD488\uBA85" }), _jsx("th", { className: "py-3 font-medium", children: "\uC218\uB7C9" }), _jsx("th", { className: "py-3 font-medium", children: "\uC0DD\uC0B0\uB77C\uC778" }), _jsx("th", { className: "py-3 font-medium", children: "\uB2F4\uB2F9\uC790" }), _jsx("th", { className: "py-3 font-medium", children: "\uC9C0\uC2DC\uC77C" }), _jsx("th", { className: "py-3 font-medium", children: "\uC644\uB8CC\uC608\uC815\uC77C" }), _jsx("th", { className: "py-3 font-medium", children: "\uC0C1\uD0DC" }), _jsx("th", { className: "w-10 pr-4" })] }) }), _jsxs("tbody", { children: [pageRows.map((item) => {
                                            const order = db.orders.find((order) => order.id === item.orderId);
                                            const client = db.clients.find((client) => client.id === order?.clientId);
                                            const assignee = db.users.find((person) => person.id === item.assigneeId);
                                            const line = db.lines.find((line) => line.id === item.lineId);
                                            const overdue = item.plannedEndDate < today && item.status !== "COMPLETED" && item.status !== "CANCELLED";
                                            const view = statusView(item.status, overdue);
                                            const active = selected?.id === item.id;
                                            return (_jsxs("tr", { className: `cursor-pointer border-t border-line ${active ? "bg-primary-soft" : "hover:bg-canvas"}`, onClick: () => setSelectedId(item.id), children: [_jsx("td", { className: "px-4 py-3", children: _jsx("input", { type: "checkbox", checked: active, readOnly: true, "aria-label": `${workOrderNo(item, order?.orderNo)} 선택` }) }), _jsx("td", { className: "py-3 font-semibold", children: workOrderNo(item, order?.orderNo) }), _jsx("td", { children: order?.orderNo }), _jsx("td", { children: client?.companyName }), _jsx("td", { title: item.items?.length ? workItems(db.products, item.items).names.join("\n") : order ? orderItems(db.products, order.lines).names.join("\n") : "", children: item.items?.length ? workItemsText(db.products, item.items) : order ? orderItemsText(db.products, order.lines) : "" }), _jsx("td", { children: item.quantity.toLocaleString("ko-KR") }), _jsx("td", { children: line?.name ?? "-" }), _jsx("td", { children: assignee?.name ?? "미배정" }), _jsx("td", { children: localDate(item.issuedAt) }), _jsx("td", { children: item.plannedEndDate }), _jsx("td", { children: _jsx("span", { className: `rounded-full px-2 py-1 text-xs font-semibold ${view.className}`, children: view.label }) }), _jsx("td", { className: "pr-4 text-muted", children: _jsx(ChevronRight, { size: 16 }) })] }, item.id));
                                        }), pageRows.length === 0 ? _jsx("tr", { children: _jsx("td", { className: "px-5 py-8 text-muted", colSpan: 12, children: "\uC870\uAC74\uC5D0 \uB9DE\uB294 \uC791\uC5C5\uC9C0\uC2DC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." }) }) : null] })] }) }), _jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm text-muted", children: [_jsxs("p", { children: ["\uCD1D ", matched.length, "\uAC74 \uC911 ", matched.length === 0 ? "0-0" : `${(safePage - 1) * PAGE_SIZE + 1}-${Math.min(safePage * PAGE_SIZE, matched.length)}`, "\uAC74 \uD45C\uC2DC \u00B7 \uC791\uC5C5\uC9C0\uC2DC\uB97C \uC120\uD0DD\uD558\uBA74 \uC544\uB798\uC5D0\uC11C \uC0C1\uC138 \uC815\uBCF4\uB97C \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."] }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("button", { type: "button", className: "grid h-8 w-8 place-items-center rounded-lg border border-line bg-white", disabled: safePage <= 1, onClick: () => setPage(safePage - 1), "aria-label": "\uC774\uC804 \uD398\uC774\uC9C0", children: _jsx(ChevronLeft, { size: 16 }) }), _jsx("span", { className: "grid h-8 w-8 place-items-center rounded-lg bg-primary text-white", children: safePage }), _jsx("button", { type: "button", className: "grid h-8 w-8 place-items-center rounded-lg border border-line bg-white", disabled: safePage >= pageCount, onClick: () => setPage(safePage + 1), "aria-label": "\uB2E4\uC74C \uD398\uC774\uC9C0", children: _jsx(ChevronRight, { size: 16 }) })] })] })] }), selected && user ? _jsx(WorkOrderEditor, { workOrderId: selected.id }, selected.id) : null] }));
}
function Field({ label, required, children }) {
    return (_jsxs("label", { className: "block text-sm", children: [_jsxs("span", { className: "mb-1 block text-xs text-muted", children: [label, required ? _jsx("span", { className: "text-danger", children: " *" }) : null] }), children] }));
}
const readOnlyClass = "h-10 w-full rounded-lg border border-line bg-canvas px-3 text-sm text-ink";
function WorkOrderEditor({ workOrderId }) {
    const db = useDb();
    const user = useAuthStore((state) => state.user);
    const show = useToastStore((state) => state.show);
    const workOrder = db.workOrders.find((item) => item.id === workOrderId);
    const candidates = availableLineIds();
    const [lineId, setLineId] = useState(workOrder?.lineId ?? candidates[0] ?? "");
    const [assigneeId, setAssigneeId] = useState(workOrder?.assigneeId ?? "");
    const [reasonFor, setReasonFor] = useState(null);
    const [reason, setReason] = useState("");
    if (!workOrder || !user)
        return _jsx("p", { className: "mt-4 text-muted", children: "\uC791\uC5C5\uC9C0\uC2DC\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    if (user.role === "PRODUCTION_MANAGER" && workOrder.assigneeId !== user.id)
        return _jsx("p", { className: "mt-4 text-muted", children: "\uB098\uC5D0\uAC8C \uBC30\uC815\uB41C \uC791\uC5C5\uB9CC \uBCFC \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
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
        ...orderProducts.flatMap(({ product }) => (product?.description ? [`품목 설명(${product.productName}): ${product.description}`] : [])),
    ].filter(Boolean);
    function act(action, success) {
        try {
            action();
            show(success);
        }
        catch (error) {
            show(error instanceof Error ? error.message : "처리하지 못했습니다.");
        }
    }
    function save() {
        const current = workOrder;
        const actor = user;
        if (!current || !actor)
            return;
        act(() => {
            if (canManageOrders(actor.role) && assigneeId && assigneeId !== current.assigneeId)
                reassign(current.id, assigneeId, actor);
            if ((current.status === "READY" || current.status === "IN_PRODUCTION" || current.status === "PAUSED") && lineId && lineId !== current.lineId) {
                changeLine(current.id, lineId, actor);
            }
        }, current.status === "READY" ? "생산 라인을 배정했습니다. 작업 시작을 누르면 생산이 시작됩니다." : "저장했습니다.");
    }
    function start() {
        const current = workOrder;
        const actor = user;
        if (!current || !actor)
            return;
        if (!lineId) {
            show("생산 라인을 선택하세요.");
            return;
        }
        act(() => startProduction(current.id, lineId, actor), "생산을 시작했습니다.");
    }
    function finish() {
        const current = workOrder;
        const actor = user;
        if (!current || !actor)
            return;
        if (canFinish) {
            act(() => completeProduction(current.id, actor), "생산을 완료하고 라인을 비웠습니다.");
            return;
        }
        if (canPack && order)
            act(() => completePacking(order.id, actor), "포장 완료로 변경했습니다. 배송 관리에서 출고할 수 있습니다.");
    }
    return (_jsxs("div", { className: "mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.8fr)]", children: [_jsxs("section", { className: "rounded-xl border border-line bg-white p-5", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [_jsx("h3", { className: "text-sm font-semibold", children: "\uAE30\uBCF8\uC815\uBCF4" }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("p", { className: "text-xs text-muted", children: [_jsx("span", { className: "text-danger", children: "*" }), " \uD544\uC218 \uC785\uB825"] }), _jsxs(Button, { onClick: save, children: [_jsx(Save, { size: 15, className: "mr-1" }), "\uC800\uC7A5"] })] })] }), _jsxs("div", { className: "mt-3 grid gap-3 md:grid-cols-2", children: [_jsx(Field, { label: "\uC791\uC5C5\uC9C0\uC2DC\uBC88\uD638", children: _jsx("input", { className: readOnlyClass, value: number, disabled: true }) }), _jsx(Field, { label: "\uC0DD\uC0B0\uB77C\uC778", required: true, children: _jsxs("select", { className: "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm disabled:bg-canvas", value: lineId, disabled: !canAssignLine, onChange: (event) => setLineId(event.target.value), children: [_jsx("option", { value: "", children: "\uB77C\uC778\uC744 \uC120\uD0DD\uD558\uC138\uC694" }), lineOptions.map((line) => _jsx("option", { value: line.id, children: line.name }, line.id))] }) }), _jsx(Field, { label: "\uC9C0\uC2DC\uC77C", children: _jsx("input", { className: readOnlyClass, type: "date", value: localDate(workOrder.issuedAt), disabled: true }) }), _jsx(Field, { label: "\uB2F4\uB2F9\uC790", required: true, children: _jsxs("select", { className: "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm disabled:bg-canvas", value: assigneeId, disabled: !canManageOrders(user.role), onChange: (event) => setAssigneeId(event.target.value), children: [_jsx("option", { value: "", children: "\uBBF8\uBC30\uC815" }), managers.map((item) => _jsxs("option", { value: item.id, children: [item.name, item.clockedIn ? "" : " · 미출근"] }, item.id))] }) }), _jsx(Field, { label: "\uC0DD\uC0B0 \uC2DC\uC791 \uC608\uC815\uC77C", children: _jsx("input", { className: readOnlyClass, type: "date", value: workOrder.plannedStartDate, disabled: true }) }), _jsx(Field, { label: "\uC0DD\uC0B0 \uC644\uB8CC \uC608\uC815\uC77C", children: _jsx("input", { className: readOnlyClass, type: "date", value: workOrder.plannedEndDate, disabled: true }) }), _jsx(Field, { label: "\uC218\uC8FC\uBC88\uD638", required: true, children: _jsxs("span", { className: "relative block", children: [_jsx("input", { className: `${readOnlyClass} pr-10`, value: order?.orderNo ?? "", disabled: true }), order ? _jsx(Link, { className: "absolute top-1/2 right-3 -translate-y-1/2 text-muted", to: `/orders/${order.id}`, "aria-label": "\uC218\uC8FC \uC0C1\uC138", children: _jsx(Search, { size: 15 }) }) : null] }) }), _jsx(Field, { label: "\uAC70\uB798\uCC98\uBA85", children: _jsx("input", { className: readOnlyClass, value: client?.companyName ?? "", disabled: true }) }), _jsx(Field, { label: "\uC0C1\uD0DC", children: _jsx("input", { className: readOnlyClass, value: view.label, disabled: true }) })] }), _jsx("h3", { className: "mt-6 text-sm font-semibold", children: "\uC791\uC5C5\uC9C0\uC2DC \uC138\uBD80\uB0B4\uC6A9" }), _jsxs("div", { className: "mt-3 space-y-3 text-sm", children: [_jsxs("div", { className: "grid gap-3 md:grid-cols-[88px_minmax(0,1fr)]", children: [_jsx("p", { className: "pt-3 text-muted", children: "\uC791\uC5C5\uB0B4\uC6A9" }), orderProducts.length === 0 ? (_jsx("p", { className: "min-h-16 rounded-lg bg-canvas px-3 py-3 text-muted", children: "\uB4F1\uB85D\uB41C \uC791\uC5C5\uB0B4\uC6A9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." })) : (_jsx("ul", { className: "space-y-2", children: orderProducts.map(({ key, product, quantity }) => (_jsxs("li", { className: "relative", children: [_jsx("input", { className: `${readOnlyClass} pr-10`, value: product ? `${productTitle(product)} · ${quantity.toLocaleString("ko-KR")}개` : "삭제된 품목", disabled: true }), product ? _jsx(Link, { className: "absolute top-1/2 right-3 -translate-y-1/2 text-muted", to: `/products/${product.id}`, "aria-label": `${product.productName} 상세`, children: _jsx(Search, { size: 15 }) }) : null] }, key))) }))] }), _jsxs("div", { className: "grid gap-3 md:grid-cols-[88px_minmax(0,1fr)]", children: [_jsx("p", { className: "pt-3 text-muted", children: "\uC791\uC5C5 \uC870\uAC74" }), _jsx("ul", { className: "list-disc space-y-1 rounded-lg px-8 py-2 text-ink", children: conditions.map((item, index) => _jsx("li", { children: item }, `${index}-${item}`)) })] })] }), _jsxs("div", { className: "mt-4 flex justify-between text-xs text-muted", children: [_jsxs("span", { children: ["\uC791\uC5C5\uC9C0\uC2DC\uBC88\uD638 ", number] }), _jsxs("span", { children: ["\uC218\uC8FC ", order?.orderNo, " \u00B7 \uB2F4\uB2F9 ", assignee?.name ?? "미배정"] })] })] }), _jsxs("section", { className: "rounded-xl border border-line bg-white p-5", children: [_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("h2", { className: "font-semibold", children: "\uC791\uC5C5\uC9C0\uC2DC \uC0C1\uC138" }), _jsx("span", { className: `rounded-full px-2 py-1 text-xs font-semibold ${view.className}`, children: view.label })] }), _jsx(WorkStatusStepper, { status: workOrder.status, orderStatus: order?.status, overdue: overdue })] }), _jsx("h2", { className: "mt-5 font-semibold", children: "\uC0DD\uC0B0 \uC9C4\uD589\uD604\uD669" }), _jsxs("dl", { className: "mt-4 grid grid-cols-2 gap-3 text-sm", children: [_jsxs("div", { children: [_jsx("dt", { className: "text-xs text-muted", children: "\uC9C0\uC2DC\uC218\uB7C9" }), _jsxs("dd", { className: "mt-1 text-lg font-semibold", children: [workOrder.quantity.toLocaleString("ko-KR"), "\uAC1C"] })] }), _jsxs("div", { children: [_jsx("dt", { className: "text-xs text-muted", children: "\uC0DD\uC0B0\uB77C\uC778" }), _jsx("dd", { className: "mt-1 text-lg font-semibold", children: line?.name ?? "미배정" })] }), _jsxs("div", { children: [_jsx("dt", { className: "text-xs text-muted", children: "\uC791\uC5C5 \uC2DC\uC791" }), _jsx("dd", { className: "mt-1", children: workOrder.startedAt ? localDateTime(workOrder.startedAt) : `예정 ${workOrder.plannedStartDate}` })] }), _jsxs("div", { children: [_jsx("dt", { className: "text-xs text-muted", children: workOrder.completedAt ? "작업 완료" : "완료 예정" }), _jsxs("dd", { className: `mt-1 ${overdue ? "font-semibold text-danger" : ""}`, children: [workOrder.completedAt ? localDateTime(workOrder.completedAt) : workOrder.plannedEndDate, overdue ? " · 지연" : ""] })] })] }), _jsxs("div", { className: "mt-4 grid grid-cols-3 gap-2", children: [_jsxs("button", { type: "button", className: "inline-flex h-10 items-center justify-center gap-1 rounded-lg border border-line bg-white text-sm font-semibold disabled:opacity-40", disabled: !canStart, onClick: start, children: [_jsx(Play, { size: 14 }), " \uC791\uC5C5 \uC2DC\uC791"] }), _jsxs("button", { type: "button", className: "inline-flex h-10 items-center justify-center gap-1 rounded-lg bg-primary text-sm font-semibold text-white disabled:opacity-40", disabled: !canFinish && !canPack, onClick: finish, children: [_jsx(Check, { size: 14 }), " \uC791\uC5C5 \uC644\uB8CC"] }), canResume ? (_jsxs("button", { type: "button", className: "inline-flex h-10 items-center justify-center gap-1 rounded-lg border border-line bg-white text-sm font-semibold", onClick: () => act(() => resumeProduction(workOrder.id, user), "생산을 다시 시작했습니다."), children: [_jsx(Play, { size: 14 }), " \uB2E4\uC2DC \uC2DC\uC791"] })) : (_jsxs("button", { type: "button", className: "inline-flex h-10 items-center justify-center gap-1 rounded-lg border border-line bg-white text-sm font-semibold disabled:opacity-40", disabled: !canHold, onClick: () => { setReasonFor("hold"); setReason(""); }, children: [_jsx(Pause, { size: 14 }), " \uC77C\uC2DC\uC815\uC9C0"] }))] }), waitingOthers ? _jsx("p", { className: "mt-2 text-xs text-muted", children: "\uC774 \uC218\uC8FC\uC758 \uB2E4\uB978 \uC791\uC5C5\uC9C0\uC2DC\uAC00 \uBAA8\uB450 \uC0DD\uC0B0 \uC644\uB8CC\uB418\uBA74 \uD3EC\uC7A5 \uB2E8\uACC4\uC5D0\uC11C \uC791\uC5C5 \uC644\uB8CC\uB97C \uB204\uB97C \uC218 \uC788\uC2B5\uB2C8\uB2E4." }) : null, canFinish ? (_jsx("button", { type: "button", className: "mt-2 text-xs text-muted underline", onClick: () => { setReasonFor("stop"); setReason(""); }, children: "\uC0DD\uC0B0 \uC911\uC9C0" })) : null, reasonFor ? (_jsxs("form", { className: "mt-3 space-y-2 rounded-lg border border-line bg-canvas p-3", onSubmit: (event) => {
                            event.preventDefault();
                            const run = reasonFor === "hold"
                                ? () => holdProduction(workOrder.id, reason, user)
                                : () => stopProduction(workOrder.id, reason, user);
                            try {
                                run();
                                show(reasonFor === "hold" ? "생산을 일시정지했습니다." : "생산을 중지하고 라인을 비웠습니다. 다시 시작하려면 라인을 골라 작업 시작을 누르세요.");
                                setReasonFor(null);
                            }
                            catch (error) {
                                show(error instanceof Error ? error.message : "처리하지 못했습니다.");
                            }
                        }, children: [_jsxs("label", { className: "block text-xs text-muted", children: [reasonFor === "hold" ? "일시정지 사유" : "생산 중지 사유", " ", _jsx("span", { className: "text-danger", children: "*" }), _jsx("input", { className: "mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink", value: reason, autoFocus: true, placeholder: reasonFor === "hold" ? "예: 금형 교체, 원자재 대기" : "예: 설비 고장, 거래처 요청", onChange: (event) => setReason(event.target.value) })] }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx(Button, { tone: "ghost", onClick: () => setReasonFor(null), children: "\uCDE8\uC18C" }), _jsx(Button, { type: "submit", tone: reasonFor === "stop" ? "danger" : "primary", children: reasonFor === "hold" ? "일시정지" : "생산 중지" })] })] })) : null, !mine && workOrder.status === "READY" ? _jsx("p", { className: "mt-2 text-xs text-muted", children: "\uBC30\uC815\uB41C \uB2F4\uB2F9\uC790\uB9CC \uB77C\uC778\uC744 \uC815\uD574 \uC791\uC5C5\uC744 \uC2DC\uC791\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." }) : null, _jsx("h3", { className: "mt-5 text-sm font-semibold", children: "\uC791\uC5C5 \uC774\uB825" }), _jsxs("ul", { className: "mt-2 space-y-2 text-sm", children: [timeline.map((item) => (_jsxs("li", { className: "border-t border-line pt-2", children: [_jsxs("p", { className: "flex justify-between gap-2", children: [_jsx("span", { className: "font-medium", children: historyTitle(item.fromStatus, item.toStatus) }), _jsx("span", { className: "text-xs text-muted", children: localDateTime(item.at) })] }), _jsxs("p", { className: "text-xs text-muted", children: [item.actorName, item.note ? ` · ${item.note}` : ""] })] }, item.id))), timeline.length === 0 ? _jsx("li", { className: "text-muted", children: "\uC544\uC9C1 \uC791\uC5C5 \uC774\uB825\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }) : null] })] })] }));
}
export function WorkOrderDetailPage() {
    const { workOrderId = "" } = useParams();
    return (_jsxs("div", { children: [_jsx(Link, { className: "text-sm font-semibold text-primary", to: "/work-orders", children: "\uC791\uC5C5\uC9C0\uC2DC \uBAA9\uB85D" }), _jsx(WorkOrderEditor, { workOrderId: workOrderId }, workOrderId)] }));
}
