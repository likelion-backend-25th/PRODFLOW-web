import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { Link } from "react-router";
import { Badge, Button } from "@/components/ui.tsx";
import { cn } from "@/lib/cn.ts";
import { localDate, localDateTime, todayISO } from "@/lib/dates.ts";
import { useDb } from "@/lib/db.ts";
import { activeWorkOrder, delayOf, delayTone } from "@/lib/delay.ts";
import { orderStatusLabel, orderStatusTone, paymentStatusLabel, paymentTone } from "@/lib/labels.ts";
import { formatWon, orderQuantity, orderTotal } from "@/lib/money.ts";
import { orderItems, orderItemsText } from "@/lib/orderText.ts";
import { completeDelivery, completePacking, markReadyToShip, recordPayment, shipOrder } from "@/lib/workflow.ts";
import { canManageOrders, canProduce, useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";
const tabs = [
    { id: "PACKING", label: "포장중", hint: "생산이 끝나 포장 중인 수주" },
    { id: "PACKED", label: "포장완료", hint: "포장 끝 · 출고 대기로 넘김" },
    { id: "READY_TO_SHIP", label: "출고대기", hint: "운송장 입력 후 출고" },
    { id: "SHIPPING", label: "배송중", hint: "출고 후 거래처 도착 전" },
    { id: "BALANCE", label: "잔금 대기", hint: "배송 완료 · 거래처 확인 후 잔금 입금 대기" },
];
const CARRIERS = ["CJ대한통운", "한진택배", "롯데택배", "우체국택배", "로젠택배"];
function inTab(order, tab) {
    if (tab === "BALANCE")
        return order.status === "COMPLETED" && order.paymentStatus !== "PAID";
    return order.status === tab;
}
export function ShippingPage() {
    const db = useDb();
    const user = useAuthStore((state) => state.user);
    const show = useToastStore((state) => state.show);
    const [tab, setTab] = useState("READY_TO_SHIP");
    const [carriers, setCarriers] = useState({});
    const [tracking, setTracking] = useState({});
    const [payments, setPayments] = useState({});
    if (!user)
        return null;
    const today = todayISO();
    const rows = db.orders.filter((order) => inTab(order, tab)).sort((left, right) => left.dueDate.localeCompare(right.dueDate));
    function act(action, success) {
        try {
            action();
            show(success);
        }
        catch (error) {
            show(error instanceof Error ? error.message : "처리하지 못했습니다.");
        }
    }
    return (_jsxs("div", { children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "\uBC30\uC1A1 \uAD00\uB9AC" }), _jsx("p", { className: "mt-1 text-sm text-muted", children: "\uD3EC\uC7A5 \uC644\uB8CC \uD6C4 \uCD9C\uACE0\uB300\uAE30\u00B7\uCD9C\uACE0\u00B7\uBC30\uC1A1 \uC644\uB8CC\u00B7\uC794\uAE08 \uC785\uAE08\uAE4C\uC9C0 \uD55C \uD654\uBA74\uC5D0\uC11C \uCC98\uB9AC\uD569\uB2C8\uB2E4. \uC794\uAE08\uC740 \uAC70\uB798\uCC98\uAC00 \uBB3C\uAC74\uC744 \uD655\uC778\uD55C \uB4A4 \uC785\uAE08\uD569\uB2C8\uB2E4." })] }), _jsx("div", { className: "mt-4 grid gap-3 md:grid-cols-5", children: tabs.map((item) => {
                    const count = db.orders.filter((order) => inTab(order, item.id)).length;
                    return (_jsxs("button", { type: "button", className: cn("rounded-xl border bg-white p-4 text-left", tab === item.id ? "border-primary ring-1 ring-primary" : "border-line"), onClick: () => setTab(item.id), children: [_jsx("p", { className: "text-sm text-muted", children: item.label }), _jsxs("p", { className: "mt-2 text-2xl font-semibold", children: [count, "\uAC74"] }), _jsx("p", { className: "mt-1 text-xs text-muted", children: item.hint })] }, item.id));
                }) }), _jsxs("section", { className: "mt-4 overflow-hidden rounded-xl border border-line bg-white", children: [_jsxs("div", { className: "flex items-center justify-between px-5 py-3", children: [_jsxs("h2", { className: "font-semibold", children: [tabs.find((item) => item.id === tab)?.label, " \uBAA9\uB85D"] }), _jsxs("span", { className: "text-sm text-muted", children: ["\uB0A9\uAE30 \uBE60\uB978 \uC21C \u00B7 ", rows.length, "\uAC74"] })] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full min-w-[980px] text-left text-sm", children: [_jsx("thead", { className: "bg-primary-soft/40 text-muted", children: _jsxs("tr", { children: [_jsx("th", { className: "px-5 py-3 font-medium", children: "\uC218\uC8FC\uBC88\uD638" }), _jsx("th", { className: "py-3 font-medium", children: "\uAC70\uB798\uCC98 / \uD488\uBAA9" }), _jsx("th", { className: "py-3 font-medium", children: "\uBC30\uC1A1\uC9C0" }), _jsx("th", { className: "py-3 font-medium", children: "\uB0A9\uAE30" }), _jsx("th", { className: "py-3 font-medium", children: "\uC0C1\uD0DC" }), _jsx("th", { className: "py-3 font-medium", children: tab === "BALANCE" ? "잔금" : tab === "SHIPPING" ? "운송장" : "입금" }), _jsx("th", { className: "py-3 pr-5 font-medium", children: "\uCC98\uB9AC" })] }) }), _jsxs("tbody", { children: [rows.map((order) => {
                                            const client = db.clients.find((item) => item.id === order.clientId);
                                            const delay = delayOf(order, activeWorkOrder(db.workOrders, order.id), today);
                                            const total = orderTotal(order.lines);
                                            const balance = total - order.paidAmount;
                                            const shippedAt = db.histories.find((item) => item.entityId === order.id && item.toStatus === "SHIPPING" && item.fromStatus !== "SHIPPING")?.at;
                                            return (_jsxs("tr", { className: "border-t border-line align-top", children: [_jsx("td", { className: "px-5 py-3", children: _jsx(Link, { className: "font-semibold text-primary", to: `/orders/${order.id}`, children: order.orderNo }) }), _jsxs("td", { className: "py-3", children: [_jsx("p", { className: "font-medium", children: client?.companyName }), _jsxs("p", { className: "text-xs text-muted", title: orderItems(db.products, order.lines).names.join("\n"), children: [orderItemsText(db.products, order.lines), " \u00B7 \uCD1D ", orderQuantity(order.lines).toLocaleString("ko-KR"), "\uAC1C"] })] }), _jsx("td", { className: "max-w-48 py-3 text-xs", children: order.shippingAddress }), _jsxs("td", { className: "py-3", children: [_jsx("p", { children: order.dueDate }), delay ? _jsx(Badge, { className: cn("mt-1", delayTone(delay.level)), children: delay.reason }) : null] }), _jsx("td", { className: "py-3", children: _jsx(Badge, { className: orderStatusTone(order.status), children: orderStatusLabel[order.status] }) }), _jsx("td", { className: "py-3 text-xs", children: tab === "SHIPPING" ? (_jsxs(_Fragment, { children: [_jsxs("p", { children: [order.carrier, " ", order.trackingNo] }), shippedAt ? _jsxs("p", { className: "text-muted", children: ["\uCD9C\uACE0 ", localDateTime(shippedAt)] }) : null] })) : tab === "BALANCE" ? (_jsxs(_Fragment, { children: [_jsx("p", { className: "font-semibold text-warning", children: formatWon(balance) }), _jsxs("p", { className: "text-muted", children: ["\uBC30\uC1A1 \uC644\uB8CC ", order.completedAt ? localDate(order.completedAt) : "-"] })] })) : (_jsx(Badge, { className: paymentTone(order.paymentStatus), children: paymentStatusLabel[order.paymentStatus] })) }), _jsxs("td", { className: "py-3 pr-5", children: [tab === "PACKING" ? (canProduce(user.role) ? _jsx(Button, { onClick: () => act(() => completePacking(order.id, user), "포장 완료로 변경했습니다."), children: "\uD3EC\uC7A5 \uC644\uB8CC" }) : _jsx("span", { className: "text-xs text-muted", children: "\uD604\uC7A5 \uAD00\uB9AC\uC790\uAC00 \uCC98\uB9AC" })) : null, tab === "PACKED" ? (canManageOrders(user.role) ? _jsx(Button, { onClick: () => act(() => markReadyToShip(order.id, user), "출고대기로 변경했습니다."), children: "\uCD9C\uACE0 \uB300\uAE30\uB85C" }) : _jsx("span", { className: "text-xs text-muted", children: "\uC218\uC8FC \uAD00\uB9AC\uC790\uAC00 \uCC98\uB9AC" })) : null, tab === "READY_TO_SHIP" ? (canManageOrders(user.role) ? (_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("select", { className: "h-10 rounded-lg border border-line bg-white px-2", value: carriers[order.id] ?? CARRIERS[0], onChange: (event) => setCarriers({ ...carriers, [order.id]: event.target.value }), "aria-label": "\uD0DD\uBC30\uC0AC", children: CARRIERS.map((name) => _jsx("option", { children: name }, name)) }), _jsx("input", { className: "h-10 w-36 rounded-lg border border-line px-3", value: tracking[order.id] ?? "", placeholder: "\uC6B4\uC1A1\uC7A5 \uBC88\uD638", "aria-label": "\uC6B4\uC1A1\uC7A5 \uBC88\uD638", onChange: (event) => setTracking({ ...tracking, [order.id]: event.target.value.replace(/[^0-9-]/g, "") }) }), _jsx(Button, { onClick: () => act(() => shipOrder(order.id, carriers[order.id] ?? CARRIERS[0], tracking[order.id] ?? "", user), "출고했습니다. 거래처에 출고 알림을 보냈습니다."), children: "\uCD9C\uACE0" })] })) : _jsx("span", { className: "text-xs text-muted", children: "\uC218\uC8FC \uAD00\uB9AC\uC790\uAC00 \uCC98\uB9AC" })) : null, tab === "SHIPPING" ? (canManageOrders(user.role) ? _jsx(Button, { onClick: () => act(() => completeDelivery(order.id, user), "배송 완료로 변경했습니다. 잔금 대기로 넘어갑니다."), children: "\uBC30\uC1A1 \uC644\uB8CC" }) : _jsx("span", { className: "text-xs text-muted", children: "\uC218\uC8FC \uAD00\uB9AC\uC790\uAC00 \uCC98\uB9AC" })) : null, tab === "BALANCE" ? (canManageOrders(user.role) ? (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("input", { className: "h-10 w-32 rounded-lg border border-line px-3", type: "number", min: 1, max: balance, value: payments[order.id] ?? String(balance), "aria-label": "\uC785\uAE08 \uAE08\uC561", onChange: (event) => setPayments({ ...payments, [order.id]: event.target.value }) }), _jsx(Button, { onClick: () => act(() => recordPayment(order.id, Number(payments[order.id] ?? balance), user), "잔금 입금을 반영했습니다."), children: "\uC785\uAE08 \uD655\uC778" })] })) : _jsx("span", { className: "text-xs text-muted", children: "\uC218\uC8FC \uAD00\uB9AC\uC790\uAC00 \uCC98\uB9AC" })) : null] })] }, order.id));
                                        }), rows.length === 0 ? _jsx("tr", { children: _jsx("td", { colSpan: 7, className: "px-5 py-10 text-center text-muted", children: "\uCC98\uB9AC\uD560 \uC218\uC8FC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." }) }) : null] })] }) })] })] }));
}
