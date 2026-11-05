import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Link } from "react-router";
import { ScheduleDrawer } from "@/components/ScheduleDrawer.tsx";
import { Badge } from "@/components/ui.tsx";
import { useDb } from "@/lib/db.ts";
import { localDate, todayISO } from "@/lib/dates.ts";
import { orderStatusLabel, orderStatusTone, paymentStatusLabel, paymentTone } from "@/lib/labels.ts";
import { formatWon, orderQuantity, orderTotal } from "@/lib/money.ts";
import { activeWorkOrder, delayOf, delayTone } from "@/lib/delay.ts";
import { orderItemsText } from "@/lib/orderText.ts";
import { factoryCapacity, isWorkingDay, occupiedOn } from "@/lib/schedule.ts";
import { canManageOrders, useAuthStore } from "@/stores/useAuthStore.ts";
export function DashboardPage() {
    const db = useDb();
    const role = useAuthStore((state) => state.user?.role);
    const [detailId, setDetailId] = useState(null);
    const today = todayISO();
    const month = today.slice(0, 7);
    const active = db.orders.filter((order) => order.status !== "CANCELLED");
    const monthOrders = active.filter((order) => localDate(order.createdAt).startsWith(month));
    const produced = db.workOrders
        .filter((item) => item.status === "COMPLETED" && item.completedAt && localDate(item.completedAt).startsWith(month))
        .reduce((sum, item) => sum + item.quantity, 0);
    const completed = active.filter((order) => order.status === "COMPLETED");
    const onTime = completed.filter((order) => order.completedAt && localDate(order.completedAt) <= order.dueDate).length;
    const open = active.filter((order) => order.status !== "COMPLETED");
    const risks = open
        .map((order) => ({ order, delay: delayOf(order, activeWorkOrder(db.workOrders, order.id), today) }))
        .filter((item) => item.delay !== null)
        .sort((left, right) => (left.delay.level === right.delay.level ? left.order.dueDate.localeCompare(right.order.dueDate) : left.delay.level === "late" ? -1 : 1));
    const lateCount = risks.filter((item) => item.delay.level === "late").length;
    const lastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
    const weeks = [0, 0, 0, 0];
    active.forEach((order) => {
        order.allocations.forEach((slot) => {
            if (!slot.date.startsWith(month))
                return;
            const bucket = Math.min(3, Math.floor((Number(slot.date.slice(8)) - 1) / 7));
            weeks[bucket] += slot.quantity;
        });
    });
    const maxWeek = Math.max(1, ...weeks);
    const mix = new Map();
    monthOrders.forEach((order) => order.lines.forEach((line) => mix.set(line.productId, (mix.get(line.productId) ?? 0) + line.quantity)));
    const mixTotal = Math.max(1, [...mix.values()].reduce((sum, value) => sum + value, 0));
    const shares = db.products.map((product) => ({ product, qty: mix.get(product.id) ?? 0 }));
    const slices = shares.map((share, index) => {
        const start = shares.slice(0, index).reduce((sum, item) => sum + (item.qty / mixTotal) * 100, 0);
        return { ...share, start, end: start + (share.qty / mixTotal) * 100 };
    });
    const days = weekdays(today);
    const holidays = db.holidays.map((holiday) => holiday.date);
    const capacity = factoryCapacity(db.lines);
    const detailOrder = detailId ? db.orders.find((order) => order.id === detailId) : undefined;
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "\uC624\uB298\uC758 \uC0DD\uC0B0 \uD750\uB984" }), _jsxs("p", { className: "mt-1 text-muted", children: [labelDate(today), " ", weekdayLabel(today), "\uC694\uC77C \u00B7 \uC624\uB298\uB3C4 \uBE48\uD2C8\uC5C6\uB294 \uC0DD\uC0B0 \uC6B4\uC601\uC744 \uC2DC\uC791\uD558\uC138\uC694."] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("span", { className: "rounded-lg border border-line bg-white px-3 py-2 text-sm", children: [month.replace("-", "."), ".01 - ", month.slice(5), ".", lastDay] }), canManageOrders(role) ? _jsx(Link, { to: "/orders/new", className: "inline-flex h-10 items-center rounded-lg bg-primary px-4 font-semibold text-white", children: "+ \uC2E0\uADDC \uC218\uC8FC \uB4F1\uB85D" }) : null] })] }), risks.length > 0 ? (_jsxs("div", { className: `mt-4 flex items-center justify-between rounded-xl px-4 py-3 ${lateCount > 0 ? "bg-red-50 text-red-700" : "bg-warning-soft text-warning"}`, children: [_jsxs("span", { children: [lateCount > 0 ? `지연 ${lateCount}건` : "", lateCount > 0 && risks.length > lateCount ? " · " : "", risks.length > lateCount ? `주의 ${risks.length - lateCount}건` : "", "\uC774 \uC788\uC2B5\uB2C8\uB2E4. \uC544\uB798 \uBAA9\uB85D\uC5D0\uC11C \uC0AC\uC720\uB97C \uD655\uC778\uD558\uC138\uC694."] }), _jsx("a", { href: "#risks", className: "font-semibold", children: "\uBAA9\uB85D \uBCF4\uAE30 \u2192" })] })) : null, _jsxs("div", { className: "mt-4 grid gap-3 md:grid-cols-4", children: [_jsx(Metric, { label: "\uC774\uBC88 \uB2EC \uC218\uC8FC \uAC74\uC218", value: `${monthOrders.length}건`, hint: "\uB4F1\uB85D\uB41C \uC218\uC8FC" }), _jsx(Metric, { label: "\uC774\uBC88 \uB2EC \uC0DD\uC0B0 \uC644\uB8CC\uB7C9", value: `${produced.toLocaleString("ko-KR")}개`, hint: "\uC774\uBC88 \uB2EC \uC644\uB8CC\uB41C \uC791\uC5C5\uC9C0\uC2DC \uC218\uB7C9" }), _jsx(Metric, { label: "\uB0A9\uAE30 \uC774\uD589\uB960", value: completed.length === 0 ? "-" : `${Math.round((onTime / completed.length) * 1000) / 10}%`, hint: `${onTime}/${completed.length}건 정시 완료` }), _jsx(Metric, { label: "\uC0DD\uC0B0 \uC608\uC815 \uBC0F \uC9C4\uD589", value: `${open.length}건`, hint: "\uC644\uB8CC \uC804 \uC218\uC8FC" })] }), _jsxs("div", { className: "mt-4 grid gap-4 lg:grid-cols-[1.4fr_0.8fr]", children: [_jsxs("section", { className: "rounded-xl border border-line bg-white p-5", children: [_jsx("h2", { className: "font-semibold", children: "\uC8FC\uAC04 \uC0DD\uC0B0 \uACC4\uD68D\uB7C9" }), _jsxs("p", { className: "text-sm text-muted", children: [month.replace("-", "년 "), "\uC6D4 \uC77C\uC815 \uBC30\uBD84 \uAE30\uC900 \u00B7 1\uC8FC\uB294 1~7\uC77C \u00B7 \uB2E8\uC704: \uAC1C"] }), _jsx("div", { className: "mt-6 flex h-48 items-end gap-8 px-4", children: weeks.map((qty, index) => (_jsxs("div", { className: "flex flex-1 flex-col items-center gap-2", children: [_jsx("span", { className: "text-xs text-muted", children: qty.toLocaleString("ko-KR") }), _jsx("div", { className: "flex h-36 w-full items-end justify-center", children: _jsx("div", { className: "w-10 rounded-t bg-primary", style: { height: `${Math.max(6, (qty / maxWeek) * 100)}%` } }) }), _jsxs("span", { className: "text-xs text-muted", children: [index + 1, "\uC8FC"] })] }, index))) })] }), _jsxs("section", { className: "rounded-xl border border-line bg-white p-5", children: [_jsx("h2", { className: "font-semibold", children: "\uD488\uBAA9\uBCC4 \uC0DD\uC0B0 \uBE44\uC911" }), _jsx("p", { className: "text-sm text-muted", children: "\uC774\uBC88 \uB2EC \uB4F1\uB85D \uC218\uC8FC \uC218\uB7C9 \uAE30\uC900" }), _jsxs("div", { className: "mt-4 flex items-center gap-4", children: [_jsx("div", { className: "grid h-36 w-36 shrink-0 place-items-center rounded-full", style: { background: `conic-gradient(${slices.map((slice, index) => `${donutColor(index)} ${slice.start}% ${slice.end}%`).join(", ")})` }, children: _jsxs("div", { className: "grid h-20 w-20 place-items-center rounded-full bg-white text-center text-sm font-semibold", children: [mixTotal.toLocaleString("ko-KR"), _jsx("span", { className: "block text-xs font-normal text-muted", children: "\uAC1C" })] }) }), _jsx("ul", { className: "space-y-1 text-sm", children: slices.map((slice) => (_jsxs("li", { className: "flex justify-between gap-3", children: [_jsx("span", { className: "truncate", children: slice.product.productName }), _jsxs("span", { className: "text-muted", children: [Math.round((slice.qty / mixTotal) * 100), "%"] })] }, slice.product.id))) })] })] })] }), _jsxs("section", { className: "mt-4 rounded-xl border border-line bg-white p-5", children: [_jsxs("div", { className: "mb-3 flex items-center justify-between", children: [_jsx("h2", { className: "font-semibold", children: "\uC774\uBC88 \uC8FC \uC0DD\uC0B0 \uC77C\uC815" }), _jsx(Link, { to: "/calendar", className: "text-sm font-semibold text-primary", children: "\uC804\uCCB4 \uC77C\uC815 \u2192" })] }), _jsx("div", { className: "grid gap-3 md:grid-cols-5", children: days.map((iso) => {
                            const jobs = active.filter((order) => order.allocations.some((slot) => slot.date === iso));
                            const working = isWorkingDay(iso, holidays);
                            const left = Math.max(0, capacity - occupiedOn(iso, db.orders));
                            return (_jsxs("div", { className: "rounded-xl bg-canvas p-3", children: [_jsxs("p", { className: "text-sm font-semibold", children: [weekdayLabel(iso), " ", Number(iso.slice(8)), " ", iso === today ? "오늘" : ""] }), _jsxs("p", { className: "text-xs text-muted", children: [jobs.length, "\uAC74 \u00B7 ", working ? _jsxs("span", { className: left === 0 ? "font-semibold text-warning" : "font-semibold text-primary", children: ["\uAC00\uC6A9 \uC0DD\uC0B0\uB7C9 ", left.toLocaleString("ko-KR"), "\uAC1C"] }) : "휴무"] }), _jsx("ul", { className: "mt-2 space-y-2", children: jobs.slice(0, 2).map((order) => {
                                            const client = db.clients.find((item) => item.id === order.clientId);
                                            return (_jsx("li", { children: _jsxs("button", { type: "button", className: "w-full rounded-lg bg-white p-2 text-left hover:ring-1 hover:ring-primary", onClick: () => setDetailId(order.id), children: [_jsx("span", { className: "block font-semibold text-primary", children: client?.companyName }), _jsx("span", { className: "block truncate text-xs text-muted", children: orderItemsText(db.products, order.lines) }), _jsx(Badge, { className: orderStatusTone(order.status), children: orderStatusLabel[order.status] })] }) }, order.id));
                                        }) })] }, iso));
                        }) })] }), _jsxs("section", { id: "risks", className: "mt-4 overflow-hidden rounded-xl border border-line bg-white", children: [_jsxs("div", { className: "flex items-center justify-between px-5 pt-5", children: [_jsxs("div", { children: [_jsx("h2", { className: "font-semibold", children: "\uC9C0\uC5F0\u00B7\uC704\uD5D8 \uC218\uC8FC" }), _jsx("p", { className: "text-xs text-muted", children: "\uB0A9\uAE30 \uCD08\uACFC, \uC644\uB8CC \uC608\uC815\uC77C \uACBD\uACFC, \uCC29\uC218 \uC9C0\uC5F0, \uB2F4\uB2F9\uC790 \uBBF8\uBC30\uC815, \uC77C\uC2DC\uC815\uC9C0, \uB0A9\uAE30 3\uC77C \uC774\uB0B4 \uBBF8\uCD9C\uACE0" })] }), _jsx(Link, { to: "/orders", className: "text-sm font-semibold text-primary", children: "\uC218\uC8FC \uBAA9\uB85D\uC73C\uB85C \u2192" })] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "mt-3 w-full min-w-[760px] text-left", children: [_jsx("thead", { className: "bg-primary-soft/40 text-muted", children: _jsxs("tr", { children: [_jsx("th", { className: "px-5 py-3 font-medium", children: "\uC218\uC8FC\uBC88\uD638" }), _jsx("th", { className: "py-3 font-medium", children: "\uC0AC\uC720" }), _jsx("th", { className: "py-3 font-medium", children: "\uD074\uB77C\uC774\uC5B8\uD2B8 / \uD488\uBAA9" }), _jsx("th", { className: "py-3 font-medium", children: "\uB0A9\uAE30\uC77C" }), _jsx("th", { className: "py-3 font-medium", children: "\uC791\uC5C5 \uC0C1\uD0DC" }), _jsx("th", { className: "py-3 pr-5 font-medium", children: "\uC785\uAE08" })] }) }), _jsxs("tbody", { children: [risks.map(({ order, delay }) => {
                                            const client = db.clients.find((item) => item.id === order.clientId);
                                            return (_jsxs("tr", { className: "border-t border-line", children: [_jsx("td", { className: "px-5 py-3", children: _jsx(Link, { className: "font-semibold text-primary", to: `/orders/${order.id}`, children: order.orderNo }) }), _jsx("td", { children: _jsxs(Badge, { className: delayTone(delay.level), children: [delay.level === "late" ? "지연" : "주의", " \u00B7 ", delay.reason] }) }), _jsxs("td", { children: [client?.companyName, " \u00B7 ", orderItemsText(db.products, order.lines)] }), _jsx("td", { children: order.dueDate }), _jsx("td", { children: _jsx(Badge, { className: orderStatusTone(order.status), children: orderStatusLabel[order.status] }) }), _jsxs("td", { className: "pr-5", children: [_jsx(Badge, { className: paymentTone(order.paymentStatus), children: paymentStatusLabel[order.paymentStatus] }), " \u00B7 ", orderQuantity(order.lines).toLocaleString("ko-KR"), "\uAC1C \u00B7 ", formatWon(orderTotal(order.lines))] })] }, order.id));
                                        }), risks.length === 0 ? _jsx("tr", { children: _jsx("td", { colSpan: 6, className: "px-5 py-8 text-center text-muted", children: "\uC9C0\uC5F0\uB418\uAC70\uB098 \uC8FC\uC758\uAC00 \uD544\uC694\uD55C \uC218\uC8FC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." }) }) : null] })] }) })] }), detailOrder ? (_jsx(ScheduleDrawer, { order: detailOrder, clients: db.clients, products: db.products, users: db.users, workOrders: db.workOrders, today: today, onClose: () => setDetailId(null) })) : null] }));
}
function Metric({ label, value, hint }) {
    return (_jsxs("section", { className: "rounded-xl border border-line bg-white p-4", children: [_jsx("p", { className: "text-sm text-muted", children: label }), _jsx("p", { className: "mt-2 text-2xl font-semibold", children: value }), _jsx("p", { className: "mt-1 text-xs text-muted", children: hint })] }));
}
function donutColor(index) {
    const colors = ["var(--color-primary)", "color-mix(in srgb, var(--color-primary) 70%, white)", "color-mix(in srgb, var(--color-primary) 45%, white)", "var(--color-muted)"];
    return colors[index % colors.length] ?? "var(--color-primary)";
}
function weekdays(today) {
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
function weekdayLabel(iso) {
    const [year, month, day] = iso.split("-").map(Number);
    return ["일", "월", "화", "수", "목", "금", "토"][new Date(year, (month ?? 1) - 1, day ?? 1).getDay()] ?? "";
}
function labelDate(iso) {
    const [year, month, day] = iso.split("-");
    return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}
