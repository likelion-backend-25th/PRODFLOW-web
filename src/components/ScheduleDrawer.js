import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AlertTriangle, ArrowUpRight, CalendarCheck, X } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui.tsx";
import { cn } from "@/lib/cn.ts";
import { localDate, parseISO } from "@/lib/dates.ts";
import { activeWorkOrder, delayOf, delayTone, workOrdersOf } from "@/lib/delay.ts";
import { orderStatusLabel, orderStatusTone } from "@/lib/labels.ts";
import { orderQuantity } from "@/lib/money.ts";
import { orderItems, orderItemsText } from "@/lib/orderText.ts";
export function ScheduleDrawer({ order, clients, products, users, workOrders, today, onClose }) {
    useEffect(() => {
        const close = (event) => {
            if (event.key === "Escape")
                onClose();
        };
        window.addEventListener("keydown", close);
        return () => window.removeEventListener("keydown", close);
    }, [onClose]);
    const client = clients.find((item) => item.id === order.clientId);
    const items = orderItems(products, order.lines);
    const quantity = orderQuantity(order.lines).toLocaleString("ko-KR");
    const orderWorks = workOrdersOf(workOrders, order.id);
    const startedStamps = orderWorks.flatMap((item) => (item.startedAt ? [item.startedAt] : [])).sort();
    const startDate = startedStamps[0] ? localDate(startedStamps[0]) : order.plannedStartDate;
    const assigneeIds = [...new Set(orderWorks.flatMap((item) => (item.assigneeId ? [item.assigneeId] : [])))];
    const assignees = assigneeIds
        .map((id) => users.find((user) => user.id === id))
        .filter((user) => user !== undefined)
        .map((user) => `${user.name} · ${user.department}`);
    const delay = delayOf(order, activeWorkOrder(workOrders, order.id), today);
    const daysLeft = Math.round((parseISO(order.dueDate).getTime() - parseISO(today).getTime()) / 86_400_000);
    return (_jsx("div", { className: "fixed inset-0 z-50 flex justify-end bg-ink/40", role: "dialog", "aria-modal": "true", "aria-labelledby": "schedule-drawer-title", onMouseDown: (event) => { if (event.target === event.currentTarget)
            onClose(); }, children: _jsxs("aside", { className: "flex h-full w-full max-w-md flex-col bg-white shadow-xl", children: [_jsxs("div", { className: "flex items-center justify-between border-b border-line px-6 py-4", children: [_jsx("h2", { id: "schedule-drawer-title", className: "text-lg font-semibold", children: "\uC0DD\uC0B0 \uC77C\uC815 \uC0C1\uC138" }), _jsx("button", { type: "button", className: "rounded-lg p-1 text-muted hover:bg-canvas", "aria-label": "\uB2EB\uAE30", onClick: onClose, children: _jsx(X, { size: 20 }) })] }), _jsxs("div", { className: "flex-1 overflow-y-auto px-6 py-5", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("span", { className: "text-xs text-muted", children: order.orderNo }), _jsx(Badge, { className: orderStatusTone(order.status), children: orderStatusLabel[order.status] })] }), _jsx("p", { className: "mt-2 text-2xl font-semibold", children: client?.companyName ?? "삭제된 거래처" }), _jsxs("p", { className: "mt-1 text-muted", children: [orderItemsText(products, order.lines), " \u00B7 ", quantity, "\uAC1C"] }), _jsxs("dl", { className: "mt-5 border-t border-line", children: [_jsx(Row, { label: "\uC218\uC8FC\uBC88\uD638", children: order.orderNo }), _jsx(Row, { label: "\uAC70\uB798\uCC98\uBA85", children: client?.companyName ?? "-" }), _jsx(Row, { label: "\uC0DD\uC0B0\uD488\uBAA9", children: items.extra ? _jsx("ul", { className: "space-y-1", children: items.names.map((name) => _jsx("li", { children: name }, name)) }) : items.first }), _jsxs(Row, { label: "\uC0DD\uC0B0\uC218\uB7C9", children: [quantity, "\uAC1C"] }), _jsx(Row, { label: startedStamps.length > 0 ? "생산 시작일" : "생산 시작 예정일", children: dateLabel(startDate) }), _jsx(Row, { label: "\uB0A9\uAE30\uC77C", children: dateLabel(order.dueDate) }), _jsx(Row, { label: "\uD604\uC7AC \uC0C1\uD0DC", children: _jsx(Badge, { className: orderStatusTone(order.status), children: orderStatusLabel[order.status] }) }), _jsx(Row, { label: "\uB2F4\uB2F9\uC790", children: assignees.length > 0 ? _jsx("ul", { className: "space-y-1", children: assignees.map((name) => _jsx("li", { children: name }, name)) }) : _jsx("span", { className: "text-muted", children: order.status === "WAITING" ? "선금 확인 후 배정" : "미배정" }) })] }), _jsx("h3", { className: "mt-6 font-semibold", children: "\uBE44\uACE0" }), _jsx("p", { className: "mt-2 rounded-lg bg-canvas p-4 text-sm whitespace-pre-wrap text-muted", children: order.memo.trim() || "등록된 비고가 없습니다." }), _jsxs("div", { className: cn("mt-5 flex items-center gap-2 rounded-lg px-4 py-3 text-sm", delay ? delayTone(delay.level) : "bg-primary-soft text-primary"), children: [delay ? _jsx(AlertTriangle, { size: 16, className: "shrink-0" }) : _jsx(CalendarCheck, { size: 16, className: "shrink-0" }), _jsx("span", { children: delay ? `${delay.level === "late" ? "지연" : "주의"} · ${delay.reason}` : normalMessage(order, daysLeft) })] }), _jsxs(Link, { to: `/orders/${order.id}`, className: "mt-5 flex h-11 w-full items-center justify-center gap-1 rounded-lg bg-primary font-semibold text-white", children: ["\uC218\uC8FC \uC0C1\uC138\uBCF4\uAE30 ", _jsx(ArrowUpRight, { size: 16 })] })] })] }) }));
}
function Row({ label, children }) {
    return (_jsxs("div", { className: "grid grid-cols-[96px_1fr] items-center gap-3 border-b border-line py-3", children: [_jsx("dt", { className: "text-sm text-muted", children: label }), _jsx("dd", { className: "font-semibold", children: children })] }));
}
function dateLabel(iso) {
    const weekday = ["일", "월", "화", "수", "목", "금", "토"][parseISO(iso).getDay()] ?? "";
    return `${iso.replaceAll("-", ".")} (${weekday})`;
}
function normalMessage(order, daysLeft) {
    if (order.status === "COMPLETED")
        return "배송까지 완료된 수주입니다.";
    if (order.status === "SHIPPING")
        return "출고되어 배송 중입니다.";
    return daysLeft === 0 ? "오늘 납기 · 정상 일정으로 진행 중입니다." : `납기까지 ${daysLeft}일 · 정상 일정으로 진행 중입니다.`;
}
