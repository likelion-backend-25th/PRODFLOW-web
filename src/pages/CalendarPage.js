import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { Link } from "react-router";
import { ScheduleDrawer } from "@/components/ScheduleDrawer.tsx";
import { Button, Card, PageHeader } from "@/components/ui.tsx";
import { cn } from "@/lib/cn.ts";
import { addDays, todayISO } from "@/lib/dates.ts";
import { useDb } from "@/lib/db.ts";
import { orderStatusLabel } from "@/lib/labels.ts";
import { orderItems } from "@/lib/orderText.ts";
import { factoryCapacity, isWorkingDay, occupiedOn, occupiesFactory } from "@/lib/schedule.ts";
import { canManageOrders, useAuthStore } from "@/stores/useAuthStore.ts";
const barStatuses = ["WAITING", "CONFIRMED", "IN_PRODUCTION", "ON_HOLD"];
function barTone(status) {
    if (status === "WAITING")
        return "bg-teal-500 text-white";
    if (status === "CONFIRMED")
        return "bg-sky-200 text-sky-900";
    if (status === "IN_PRODUCTION")
        return "bg-emerald-500 text-white";
    return "bg-amber-100 text-amber-900";
}
function legendDot(status) {
    if (status === "WAITING")
        return "bg-teal-500";
    if (status === "CONFIRMED")
        return "bg-sky-200 ring-1 ring-sky-300";
    if (status === "IN_PRODUCTION")
        return "bg-emerald-500";
    return "bg-amber-100 ring-1 ring-amber-200";
}
function contiguousRuns(dates) {
    const sorted = [...new Set(dates)].sort();
    const runs = [];
    sorted.forEach((date) => {
        const last = runs.at(-1);
        if (last && addDays(last.end, 1) === date) {
            last.end = date;
            return;
        }
        runs.push({ start: date, end: date });
    });
    return runs;
}
function assignLanes(segments) {
    const ends = [];
    return segments.map((segment) => {
        const lane = ends.findIndex((end) => end < segment.start);
        if (lane === -1) {
            ends.push(segment.end);
            return ends.length - 1;
        }
        ends[lane] = segment.end;
        return lane;
    });
}
export function CalendarPage() {
    const db = useDb();
    const role = useAuthStore((state) => state.user?.role);
    const now = new Date();
    const today = todayISO();
    const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
    const [selected, setSelected] = useState(null);
    const [detailId, setDetailId] = useState(null);
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const days = new Date(year, month + 1, 0).getDate();
    const holidays = db.holidays.map((holiday) => holiday.date);
    const leading = first.getDay();
    const cells = [
        ...Array.from({ length: leading }, () => null),
        ...Array.from({ length: days }, (_, index) => `${year}-${String(month + 1).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`),
    ];
    while (cells.length % 7 !== 0)
        cells.push(null);
    const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
    const occupying = db.orders.filter((order) => occupiesFactory(order.status));
    const selectedOrders = selected ? occupying.filter((order) => order.allocations.some((slot) => slot.date === selected)) : [];
    const selectedWorking = selected ? isWorkingDay(selected, holidays) : false;
    const selectedCapacity = selectedWorking ? factoryCapacity(db.lines) : 0;
    const selectedUsed = selected ? occupiedOn(selected, db.orders) : 0;
    const detailOrder = detailId ? db.orders.find((order) => order.id === detailId) : undefined;
    return (_jsxs("div", { children: [_jsx(PageHeader, { title: "\uC0DD\uC0B0 \uCE98\uB9B0\uB354", action: _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { type: "button", className: "h-10 rounded-lg border border-line bg-white px-3", onClick: () => setCursor(new Date(year, month - 1, 1)), children: "\uC774\uC804\uB2EC" }), _jsxs("span", { className: "self-center font-semibold", children: [year, ".", String(month + 1).padStart(2, "0")] }), _jsx("button", { type: "button", className: "h-10 rounded-lg border border-line bg-white px-3", onClick: () => setCursor(new Date(year, month + 1, 1)), children: "\uB2E4\uC74C\uB2EC" })] }) }), _jsxs("div", { className: "mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted", children: [_jsx("ul", { className: "flex flex-wrap items-center gap-3", children: barStatuses.map((status) => (_jsxs("li", { className: "flex items-center gap-1.5", children: [_jsx("span", { className: cn("h-2.5 w-2.5 rounded-full", legendDot(status)) }), orderStatusLabel[status]] }, status))) }), _jsx("p", { children: "\uB9C9\uB300\uAC00 \uAE38\uBA74 \uADF8 \uC218\uC8FC\uAC00 \uC5EC\uB7EC \uB0A0\uC5D0 \uAC78\uCCD0 \uC0DD\uC0B0\uB429\uB2C8\uB2E4." })] }), _jsxs("div", { className: "grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]", children: [_jsxs(Card, { className: "overflow-hidden p-0", children: [_jsx("div", { className: "grid grid-cols-7 border-b border-line bg-canvas px-2 py-2 text-sm text-muted", children: ["일", "월", "화", "수", "목", "금", "토"].map((label) => _jsx("div", { children: label }, label)) }), weeks.map((week, weekIndex) => (_jsx(WeekRow, { week: week, holidays: holidays, occupying: occupying, selected: selected, today: today, onSelect: setSelected, onOpen: setDetailId }, weekIndex)))] }), _jsx(Card, { className: "sticky top-6 space-y-3", children: selected ? (_jsxs(_Fragment, { children: [_jsx("h2", { className: "font-semibold", children: selected }), _jsx("p", { className: "text-muted", children: selectedWorking ? `잔여 ${Math.max(0, selectedCapacity - selectedUsed).toLocaleString("ko-KR")}개 / ${selectedCapacity.toLocaleString("ko-KR")}개` : "휴무일입니다." }), _jsxs("ul", { className: "space-y-2", children: [selectedOrders.length === 0 ? _jsx("li", { className: "text-muted", children: "\uC774 \uB0A0\uC9DC\uC5D0 \uC7A1\uD78C \uC218\uC8FC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." }) : null, selectedOrders.map((order) => (_jsx("li", { children: _jsxs("button", { type: "button", className: "flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left hover:bg-primary-soft/40", onClick: () => setDetailId(order.id), children: [_jsx("span", { className: "font-semibold text-primary", children: order.orderNo }), _jsx("span", { className: "text-muted", children: orderStatusLabel[order.status] })] }) }, order.id)))] }), canManageOrders(role) ? _jsx(Link, { to: "/orders/new", children: _jsx(Button, { className: "w-full", children: "\uC218\uC8FC \uB4F1\uB85D" }) }) : null] })) : (_jsx("p", { className: "text-muted", children: "\uB0A0\uC9DC\uB97C \uB204\uB974\uBA74 \uADF8\uB0A0\uC758 \uC218\uC8FC\uC640 \uB0A8\uC740 \uC0DD\uC0B0\uB7C9\uC774, \uB9C9\uB300\uB97C \uB204\uB974\uBA74 \uC0DD\uC0B0 \uC77C\uC815 \uC0C1\uC138\uAC00 \uC5F4\uB9BD\uB2C8\uB2E4." })) })] }), detailOrder ? (_jsx(ScheduleDrawer, { order: detailOrder, clients: db.clients, products: db.products, users: db.users, workOrders: db.workOrders, today: today, onClose: () => setDetailId(null) })) : null] }));
}
function WeekRow({ week, holidays, occupying, selected, today, onSelect, onOpen, }) {
    const db = useDb();
    const capacity = factoryCapacity(db.lines);
    const segments = occupying.flatMap((order) => {
        const dates = order.allocations.map((slot) => slot.date).filter((date) => week.includes(date));
        return contiguousRuns(dates).map((run) => ({
            order,
            ...run,
            startCol: week.indexOf(run.start) + 1,
            endCol: week.indexOf(run.end) + 2,
        }));
    }).sort((left, right) => left.start.localeCompare(right.start) || right.end.localeCompare(left.end));
    const lanes = assignLanes(segments);
    const laneCount = new Set(lanes).size;
    const cellMin = `${4.5 + laneCount * 1.75}rem`;
    return (_jsxs("div", { className: "relative border-b border-line last:border-b-0", children: [_jsx("div", { className: "grid grid-cols-7", children: week.map((iso, index) => {
                    if (!iso)
                        return _jsx("div", { className: "px-2 py-2", style: { minHeight: cellMin } }, `empty-${index}`);
                    const working = isWorkingDay(iso, holidays);
                    const used = occupiedOn(iso, occupying);
                    return (_jsxs("button", { type: "button", className: cn("px-2 py-2 text-left align-top", selected === iso && "bg-primary-soft/40"), style: { minHeight: cellMin }, onClick: () => onSelect(iso), children: [_jsx("span", { className: cn("inline-flex h-6 w-6 items-center justify-center text-sm font-semibold", iso === today && "rounded-full bg-primary text-white"), children: Number(iso.slice(8)) }), _jsx("p", { className: "mt-0.5 text-xs text-muted", children: working ? `잔여 ${Math.max(0, capacity - used).toLocaleString("ko-KR")}` : "휴무" })] }, iso));
                }) }), laneCount > 0 ? (_jsx("div", { className: "pointer-events-none absolute inset-x-0 top-12 grid grid-cols-7 gap-x-1 gap-y-1 px-1", style: { gridTemplateRows: `repeat(${laneCount}, 1.5rem)` }, children: segments.map((segment, index) => {
                    const product = orderItems(db.products, segment.order.lines).first;
                    return (_jsxs("button", { type: "button", title: `${segment.order.orderNo} ${product}`, className: cn("pointer-events-auto flex h-6 items-center truncate rounded-full px-2 text-xs font-semibold", barTone(segment.order.status)), style: { gridColumn: `${segment.startCol} / ${segment.endCol}`, gridRow: lanes[index] + 1 }, onClick: () => onOpen(segment.order.id), children: [segment.order.orderNo, " ", product] }, `${segment.order.id}-${segment.start}`));
                }) })) : null] }));
}
