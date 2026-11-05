import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Badge, Button, PageHeader, TextField } from "@/components/ui.tsx";
import { cn } from "@/lib/cn.ts";
import { localDate, todayISO } from "@/lib/dates.ts";
import { useDb } from "@/lib/db.ts";
import { lineStatusLabel, lineTone, roleLabel } from "@/lib/labels.ts";
import { orderItemsText, workItemsText } from "@/lib/orderText.ts";
import { saveLine, saveLineCapacity, setLineStatus } from "@/lib/workflow.ts";
import { canManageOrders, canProduce, useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";
function lineDot(status) {
    if (status === "AVAILABLE")
        return "bg-slate-400";
    if (status === "MAINTENANCE")
        return "bg-warning";
    if (status === "BROKEN")
        return "bg-danger";
    return "bg-primary";
}
export function LineListPage() {
    const db = useDb();
    const role = useAuthStore((state) => state.user?.role);
    const running = db.lines.filter((line) => line.status === "RUNNING").length;
    const available = db.lines.filter((line) => line.status === "AVAILABLE").length;
    const stopped = db.lines.filter((line) => line.status === "MAINTENANCE" || line.status === "BROKEN").length;
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "\uC0DD\uC0B0\uB77C\uC778" }), _jsx("p", { className: "mt-1 text-muted", children: "\uB77C\uC778\uBCC4 \uAC00\uB3D9 \uC0C1\uD0DC\uC640 \uC9C4\uD589 \uC218\uC8FC, \uB2F4\uB2F9 \uC9C1\uC6D0\uC744 \uD655\uC778\uD558\uC138\uC694." })] }), canManageOrders(role) ? _jsx(Link, { to: "/lines/new", className: "inline-flex h-10 items-center rounded-lg bg-primary px-4 font-semibold text-white", children: "+ \uB77C\uC778 \uB4F1\uB85D" }) : null] }), _jsxs("div", { className: "mt-4 grid gap-3 md:grid-cols-4", children: [_jsxs("section", { className: "rounded-xl border border-line bg-white p-4", children: [_jsx("p", { className: "text-sm text-muted", children: "\uC804\uCCB4 \uB77C\uC778" }), _jsxs("p", { className: "mt-2 text-2xl font-semibold", children: [db.lines.length, "\uAC1C"] })] }), _jsxs("section", { className: "rounded-xl border border-line bg-white p-4", children: [_jsx("p", { className: "text-sm text-muted", children: "\uAC00\uB3D9\uC911" }), _jsxs("p", { className: "mt-2 text-2xl font-semibold", children: [running, "\uAC1C"] })] }), _jsxs("section", { className: "rounded-xl border border-line bg-white p-4", children: [_jsx("p", { className: "text-sm text-muted", children: "\uAC00\uB3D9\uAC00\uB2A5" }), _jsxs("p", { className: "mt-2 text-2xl font-semibold", children: [available, "\uAC1C"] })] }), _jsxs("section", { className: "rounded-xl border border-line bg-white p-4", children: [_jsx("p", { className: "text-sm text-muted", children: "\uC810\uAC80\u00B7\uACE0\uC7A5" }), _jsxs("p", { className: "mt-2 text-2xl font-semibold", children: [stopped, "\uAC1C"] })] })] }), _jsx("div", { className: "mt-4 grid gap-4 md:grid-cols-3", children: db.lines.map((line) => {
                    const current = db.workOrders.find((item) => item.lineId === line.id && (item.status === "IN_PRODUCTION" || item.status === "PAUSED"));
                    const order = db.orders.find((item) => item.id === current?.orderId);
                    const assignee = db.users.find((item) => item.id === current?.assigneeId);
                    return (_jsxs("section", { className: "rounded-xl border border-line bg-white p-5", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h2", { className: "font-semibold", children: line.name }), _jsx(Badge, { className: lineTone(line.status), children: lineStatusLabel[line.status] })] }), _jsxs("dl", { className: "mt-4 space-y-1 text-sm", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("dt", { className: "text-muted", children: "\uAC00\uB2A5 \uCF00\uC774\uC2A4" }), _jsx("dd", { className: "text-right", children: order ? orderItemsText(db.products, order.lines) : "없음" })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("dt", { className: "text-muted", children: "\uC9C4\uD589 \uC218\uC8FC" }), _jsx("dd", { children: order?.orderNo ?? "없음" })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("dt", { className: "text-muted", children: "\uB2F4\uB2F9 \uC9C1\uC6D0" }), _jsx("dd", { children: assignee?.name ?? "미지정" })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("dt", { className: "text-muted", children: "\uD558\uB8E8 \uC0DD\uC0B0\uB7C9" }), _jsxs("dd", { children: [line.dailyCapacity.toLocaleString("ko-KR"), "\uAC1C"] })] })] }), _jsx("p", { className: "mt-4 text-sm font-semibold text-primary", children: current ? `${current.status === "PAUSED" ? "일시정지 · " : ""}${current.quantity.toLocaleString("ko-KR")}개 · 완료 예정 ${current.plannedEndDate}` : "진행 중인 작업 없음" }), _jsx(Link, { to: `/lines/${line.id}`, className: "mt-4 inline-flex h-10 items-center rounded-lg border border-line px-3 text-sm", children: "\uB77C\uC778 \uC0C1\uC138 \u2192" })] }, line.id));
                }) })] }));
}
export function LineFormPage() {
    const { lineId } = useParams();
    const db = useDb();
    const navigate = useNavigate();
    const show = useToastStore((state) => state.show);
    const current = db.lines.find((line) => line.id === lineId);
    const [name, setName] = useState(current?.name ?? "");
    const [dailyCapacity, setDailyCapacity] = useState(current?.dailyCapacity ?? 500);
    return (_jsxs("div", { children: [_jsx(PageHeader, { title: current ? "라인 정보 수정" : "라인 등록" }), _jsxs("form", { className: "grid max-w-md gap-3", onSubmit: (event) => {
                    event.preventDefault();
                    try {
                        saveLine({ id: current?.id, name, dailyCapacity });
                        show("라인 정보를 저장했습니다.");
                        navigate("/lines");
                    }
                    catch (error) {
                        show(error instanceof Error ? error.message : "저장하지 못했습니다.");
                    }
                }, children: [_jsx(TextField, { label: "\uB77C\uC778 \uC774\uB984", value: name, onChange: (event) => setName(event.target.value) }), _jsx(TextField, { label: "\uD558\uB8E8 \uC0DD\uC0B0\uB7C9", type: "number", value: dailyCapacity, onChange: (event) => setDailyCapacity(Number(event.target.value)) }), _jsx(Button, { type: "submit", children: "\uC800\uC7A5" })] })] }));
}
function workOrderNo(item, orderNo) {
    const issued = localDate(item.issuedAt).replaceAll("-", "");
    const tail = orderNo?.split("-").at(-1) ?? "000";
    return `WO-${issued.slice(0, 6)}-${tail}-${item.id.slice(0, 4)}`;
}
function workStatusView(status) {
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
function clockLabel(stamp) {
    const date = new Date(stamp);
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
function jobRank(status) {
    if (status === "IN_PRODUCTION")
        return 0;
    if (status === "PAUSED")
        return 1;
    return 2;
}
function InfoRow({ label, children }) {
    return (_jsxs("div", { className: "grid grid-cols-[7.5rem_1fr] items-start gap-3 py-2 text-sm", children: [_jsx("dt", { className: "text-muted", children: label }), _jsx("dd", { className: "min-w-0 font-medium text-ink", children: children })] }));
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
        if (!line)
            return;
        setEditingCapacity(false);
        setCapacityInput(String(line.dailyCapacity));
    }, [line?.id, line?.dailyCapacity]);
    if (!line)
        return _jsx("p", { children: "\uB77C\uC778\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
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
    function changeStatus(status) {
        try {
            setLineStatus(line.id, status);
            show("라인 상태를 변경했습니다. 점검·고장 라인은 공장 생산량에서 빠집니다.");
        }
        catch (error) {
            show(error instanceof Error ? error.message : "변경하지 못했습니다.");
        }
    }
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("nav", { className: "flex flex-wrap gap-1.5", "aria-label": "\uC0DD\uC0B0\uB77C\uC778", children: db.lines.map((item) => {
                                    const selected = item.id === line.id;
                                    return (_jsxs(Link, { to: `/lines/${item.id}`, "aria-current": selected ? "page" : undefined, className: cn("inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-semibold", selected ? "border-primary bg-primary-soft text-primary" : "border-line bg-white text-ink hover:bg-canvas"), children: [_jsx("span", { className: cn("size-1.5 shrink-0 rounded-full", lineDot(item.status)) }), item.name] }, item.id));
                                }) }), _jsxs("div", { className: "mt-3 flex flex-wrap items-center gap-2", children: [_jsx("h1", { className: "text-2xl font-semibold", children: line.name }), _jsx(Badge, { className: lineTone(line.status), children: lineStatusLabel[line.status] })] }), _jsxs("p", { className: "mt-1 text-sm text-muted", children: [today, " \uAE30\uC900 \u00B7 \uC774 \uB77C\uC778\uC5D0 \uBC30\uC815\uB41C \uB300\uAE30\u00B7\uC9C4\uD589 \uC9C0\uC2DC\uB97C \uD655\uC778\uD558\uACE0 \uAC00\uB3D9 \uC0C1\uD0DC\uB97C \uBC14\uAFC9\uB2C8\uB2E4."] })] }), _jsx("div", { className: "flex flex-wrap items-center gap-2", children: _jsx(Link, { to: "/work-orders", className: "inline-flex h-10 items-center rounded-lg border border-line bg-white px-3 text-sm font-semibold", children: "\uC791\uC5C5\uC9C0\uC2DC \uBCF4\uAE30" }) })] }), _jsxs("div", { className: "grid gap-3 md:grid-cols-2", children: [_jsxs("section", { className: "rounded-xl border border-line bg-white px-5 py-4", children: [_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsx("p", { className: "text-sm text-muted", children: "\uC77C \uCD5C\uB300 \uC0DD\uC0B0\uB7C9" }), canManageOrders(role) && !editingCapacity ? (_jsx("button", { type: "button", className: "text-sm font-semibold text-primary", onClick: () => { setCapacityInput(String(line.dailyCapacity)); setEditingCapacity(true); }, children: "\uC218\uC815" })) : null] }), editingCapacity && canManageOrders(role) && user ? (_jsxs("form", { className: "mt-3 flex flex-wrap items-end gap-2", onSubmit: (event) => {
                                    event.preventDefault();
                                    try {
                                        saveLineCapacity(line.id, Number(capacityInput), user);
                                        setEditingCapacity(false);
                                        show("일 최대 생산량을 저장하고 공장 일정을 다시 잡았습니다.");
                                    }
                                    catch (error) {
                                        show(error instanceof Error ? error.message : "저장하지 못했습니다.");
                                    }
                                }, children: [_jsxs("label", { className: "text-sm", children: [_jsx("span", { className: "sr-only", children: "\uC77C \uCD5C\uB300 \uC0DD\uC0B0\uB7C9" }), _jsxs("span", { className: "flex items-center gap-1", children: [_jsx("input", { className: "h-10 w-28 rounded-lg border border-line px-3 text-lg font-semibold", type: "number", min: 1, step: 1, value: capacityInput, onChange: (event) => setCapacityInput(event.target.value), autoFocus: true }), _jsx("span", { className: "text-muted", children: "\uAC1C" })] })] }), _jsx(Button, { type: "submit", children: "\uC800\uC7A5" }), _jsx(Button, { type: "button", tone: "ghost", onClick: () => { setEditingCapacity(false); setCapacityInput(String(line.dailyCapacity)); }, children: "\uCDE8\uC18C" })] })) : (_jsxs(_Fragment, { children: [_jsxs("p", { className: "mt-2 text-3xl font-semibold", children: [line.dailyCapacity.toLocaleString("ko-KR"), "\uAC1C"] }), _jsxs("p", { className: "mt-1 text-sm text-muted", children: [line.name, " \uD558\uB8E8 \uAE30\uC900 \uC6A9\uB7C9\uC785\uB2C8\uB2E4."] })] }))] }), _jsxs("section", { className: "rounded-xl border border-line bg-white px-5 py-4", children: [_jsx("p", { className: "text-sm text-muted", children: "\uC774 \uB77C\uC778 \uC9C0\uC2DC" }), _jsxs("p", { className: "mt-2 text-3xl font-semibold", children: [jobTotal.toLocaleString("ko-KR"), "\uAC1C"] }), _jsxs("p", { className: "mt-1 text-sm text-muted", children: ["\uC9C4\uD589 ", runningQty.toLocaleString("ko-KR"), "\uAC1C \u00B7 \uB300\uAE30 ", waitingQty.toLocaleString("ko-KR"), "\uAC1C \u00B7 ", jobs.length, "\uAC74"] })] })] }), _jsxs("div", { className: "grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]", children: [_jsxs("section", { className: "rounded-xl border border-line bg-white px-5 py-4", children: [_jsx("h2", { className: "text-sm font-semibold", children: "\uB77C\uC778 \uD604\uD669" }), _jsxs("dl", { className: "mt-2 grid gap-x-8 sm:grid-cols-2", children: [_jsx(InfoRow, { label: "\uB77C\uC778\uBA85", children: line.name }), _jsx(InfoRow, { label: "\uAC00\uB3D9 \uC0C1\uD0DC", children: _jsx(Badge, { className: lineTone(line.status), children: lineStatusLabel[line.status] }) }), _jsx(InfoRow, { label: "\uD604\uC7AC \uC218\uC8FC", children: order ? _jsxs(Link, { className: "text-primary", to: `/orders/${order.id}`, children: [order.orderNo, client ? ` · ${client.companyName}` : ""] }) : "없음" }), _jsxs(InfoRow, { label: "\uC77C \uCD5C\uB300 \uC0DD\uC0B0\uB7C9", children: [line.dailyCapacity.toLocaleString("ko-KR"), "\uAC1C"] }), _jsx(InfoRow, { label: "\uAC00\uB2A5 \uD488\uBAA9", children: lineItems }), _jsx(InfoRow, { label: "\uD604\uC7AC \uC791\uC5C5", children: current ? (_jsxs(Link, { className: "text-primary", to: `/work-orders/${current.id}`, children: [workOrderNo(current, order?.orderNo), " \u00B7 ", current.quantity.toLocaleString("ko-KR"), "\uAC1C"] })) : "없음" }), _jsx(InfoRow, { label: "\uC2DC\uC791\uC77C", children: current?.plannedStartDate ?? "-" }), _jsx(InfoRow, { label: "\uC644\uB8CC \uC608\uC815", children: current?.plannedEndDate ?? "-" })] })] }), _jsxs("section", { className: "rounded-xl border border-line bg-white px-5 py-4", children: [_jsx("h2", { className: "text-sm font-semibold", children: "\uB2F4\uB2F9 \uC9C1\uC6D0" }), assignee ? (_jsxs("div", { className: "mt-4 flex gap-3", children: [_jsx("div", { className: "grid size-12 shrink-0 place-items-center rounded-full bg-canvas text-muted", children: _jsx(UserRound, { size: 22 }) }), _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "font-semibold", children: assignee.name }), _jsx("p", { className: "mt-0.5 text-sm text-muted", children: roleLabel[assignee.role] }), _jsxs("p", { className: "mt-3 text-sm", children: [_jsx("span", { className: "text-muted", children: "\uADFC\uBB34 " }), assignee.clockedIn ? "근무중" : "퇴근"] }), _jsxs("p", { className: "mt-1 text-sm", children: [_jsx("span", { className: "text-muted", children: "\uCD9C\uADFC " }), duty] })] })] })) : (_jsx("p", { className: "mt-6 text-sm text-muted", children: "\uC774 \uB77C\uC778 \uC791\uC5C5\uC5D0 \uBC30\uC815\uB41C \uB2F4\uB2F9\uC790\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." }))] })] }), _jsxs("section", { className: "overflow-hidden rounded-xl border border-line bg-white", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 px-5 py-3", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-sm font-semibold", children: "\uC774 \uB77C\uC778 \uC791\uC5C5\uC9C0\uC2DC" }), _jsx("p", { className: "mt-0.5 text-xs text-muted", children: "\uC774 \uB77C\uC778\uC5D0 \uBC30\uC815\uB41C \uB300\uAE30\u00B7\uC9C4\uD589\u00B7\uC77C\uC2DC\uC815\uC9C0 \uC9C0\uC2DC\uC785\uB2C8\uB2E4. \uC911\uAC04 \uC2E4\uC801\uC740 \uC5C6\uC2B5\uB2C8\uB2E4." })] }), _jsxs("p", { className: "text-sm text-muted", children: ["\uD569\uACC4 ", jobTotal.toLocaleString("ko-KR"), "\uAC1C"] })] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full min-w-[760px] text-left text-sm", children: [_jsx("thead", { className: "bg-canvas text-xs text-muted", children: _jsxs("tr", { children: [_jsx("th", { className: "px-5 py-2.5 font-medium", children: "\uC791\uC5C5\uC9C0\uC2DC" }), _jsx("th", { className: "py-2.5 font-medium", children: "\uC218\uC8FC\uBC88\uD638" }), _jsx("th", { className: "py-2.5 font-medium", children: "\uC0DD\uC0B0\uD488\uBAA9" }), _jsx("th", { className: "py-2.5 font-medium", children: "\uC791\uC5C5\uC218\uB7C9" }), _jsx("th", { className: "py-2.5 font-medium", children: "\uC2DC\uC791\uC77C" }), _jsx("th", { className: "py-2.5 font-medium", children: "\uC644\uB8CC \uC608\uC815" }), _jsx("th", { className: "py-2.5 pr-5 font-medium", children: "\uC0C1\uD0DC" })] }) }), _jsxs("tbody", { children: [jobs.map((item) => {
                                            const view = workStatusView(item.status);
                                            const jobOrder = db.orders.find((entry) => entry.id === item.orderId);
                                            const overdue = item.plannedEndDate < today;
                                            return (_jsxs("tr", { className: "border-t border-line", children: [_jsx("td", { className: "px-5 py-2.5 font-semibold", children: _jsx(Link, { className: "text-primary", to: `/work-orders/${item.id}`, children: workOrderNo(item, jobOrder?.orderNo) }) }), _jsx("td", { className: "py-2.5", children: jobOrder ? _jsx(Link, { className: "text-primary", to: `/orders/${jobOrder.id}`, children: jobOrder.orderNo }) : "-" }), _jsx("td", { className: "py-2.5", children: workItemsText(db.products, item.items || []) }), _jsxs("td", { className: "py-2.5", children: [item.quantity.toLocaleString("ko-KR"), "\uAC1C"] }), _jsx("td", { className: "py-2.5", children: item.plannedStartDate }), _jsx("td", { className: cn("py-2.5", overdue && "font-semibold text-danger"), children: item.plannedEndDate }), _jsx("td", { className: "py-2.5 pr-5", children: _jsx(Badge, { className: view.className, children: view.label }) })] }, item.id));
                                        }), jobs.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "px-5 py-8 text-center text-muted", children: "\uC774 \uB77C\uC778\uC5D0 \uBC30\uC815\uB41C \uC791\uC5C5\uC9C0\uC2DC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." }) })) : null] })] }) })] }), _jsx("section", { className: "rounded-xl border border-line bg-white px-5 py-4", children: _jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-sm font-semibold", children: "\uC6B4\uC601" }), _jsx("p", { className: "mt-1 text-sm text-muted", children: line.status === "RUNNING"
                                        ? `생산 중 · 진행 ${running.length}건`
                                        : line.status === "AVAILABLE"
                                            ? waiting.length > 0 ? `가동 가능 · 대기 ${waiting.length}건` : "가동 가능 · 배정된 작업 없음"
                                            : `${lineStatusLabel[line.status]} · 공장 일일 용량에서 제외` })] }), canProduce(role) ? (_jsx("div", { className: "flex flex-wrap gap-1.5", children: ["AVAILABLE", "MAINTENANCE", "BROKEN"].map((status) => (_jsx("button", { type: "button", className: cn("h-9 rounded-lg border px-3 text-sm font-semibold", line.status === status ? "border-primary bg-primary-soft text-primary" : "border-line bg-white text-muted"), onClick: () => changeStatus(status), children: lineStatusLabel[status] }, status))) })) : null] }) })] }));
}
