import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { Badge, Button, Card } from "@/components/ui.tsx";
import { useDb } from "@/lib/db.ts";
import { quotationStatusLabel, quotationStatusTone } from "@/lib/labels.ts";
import { depositTarget, formatWon, lineAmount, orderTotal } from "@/lib/money.ts";
import { recalculateQuotation, setQuotationStatus } from "@/lib/workflow.ts";
import { canManageOrders, useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";
export function QuoteDetailPage() {
    const { quotationId = "" } = useParams();
    const db = useDb();
    const user = useAuthStore((state) => state.user);
    const role = user?.role;
    const show = useToastStore((state) => state.show);
    const quote = db.quotations.find((item) => item.id === quotationId);
    const [open, setOpen] = useState(false);
    const [due, setDue] = useState(quote?.requestedDueDate ?? "");
    if (!quote)
        return _jsx("p", { children: "\uACAC\uC801\uC11C\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const client = db.clients.find((item) => item.id === quote.clientId);
    const author = db.users.find((item) => item.id === quote.userId);
    const order = db.orders.find((item) => item.quotationId === quote.id && item.status !== "CANCELLED");
    const total = orderTotal(quote.lines);
    const active = quote.plans.find((plan) => plan.status === "ACTIVE");
    const history = quote.plans.filter((plan) => plan.status === "RECALCULATED");
    const canChange = quote.status === "SENT" && canManageOrders(role);
    function act(action, message) {
        try {
            action();
            show(message);
            setOpen(false);
        }
        catch (error) {
            show(error instanceof Error ? error.message : "처리하지 못했습니다.");
        }
    }
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: quote.quotationNo }), _jsxs("p", { className: "mt-1 text-sm text-muted", children: [client?.companyName, " \u00B7 \uC791\uC131\uC790 ", author?.name ?? "-"] })] }), _jsx(Badge, { className: quotationStatusTone(quote.status), children: quotationStatusLabel[quote.status] })] }), _jsxs("div", { className: "grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px]", children: [_jsxs("div", { className: "space-y-4", children: [_jsxs(Card, { children: [_jsx("h2", { className: "mb-3 font-semibold", children: "\uD488\uBAA9" }), quote.lines.map((line) => {
                                        const product = db.products.find((item) => item.id === line.productId);
                                        return (_jsxs("div", { className: "flex justify-between border-t border-line py-2 text-sm first:border-0", children: [_jsxs("span", { children: [product?.productName, " \u00B7 ", product?.modelName, " \u00B7 ", line.quantity.toLocaleString("ko-KR"), "\uAC1C"] }), _jsx("span", { children: formatWon(lineAmount(line)) })] }, line.id));
                                    }), _jsxs("p", { className: "mt-3 text-sm text-muted", children: ["\uACF5\uAE09\uAC00\uC561\uACFC \uBD80\uAC00\uC138\uB97C \uD3EC\uD568\uD55C \uCD1D\uC561 ", formatWon(total), ". \uACC4\uC57D\uAE08 ", formatWon(depositTarget(total)), ", \uC794\uAE08 ", formatWon(total - depositTarget(total)), "."] })] }), _jsxs(Card, { children: [_jsx("h2", { className: "font-semibold", children: "\uB0A9\uAE30" }), _jsxs("p", { className: "mt-2 text-sm", children: ["\uD76C\uB9DD \uB0A9\uAE30 ", quote.requestedDueDate] }), _jsxs("p", { className: "text-sm", children: ["\uC608\uC0C1 \uB0A9\uAE30 ", quote.estimatedDueDate] }), _jsxs("p", { className: "text-sm", children: ["\uC720\uD6A8\uAE30\uAC04 ", quote.validUntil] }), active ? _jsxs("p", { className: "mt-2 text-sm text-muted", children: ["\uC784\uC2DC \uACC4\uD68D ", active.plannedStartDate, " ~ ", active.plannedEndDate, ", ", active.quantity.toLocaleString("ko-KR"), "\uAC1C. \uD655\uC815 \uC608\uC57D\uC774 \uC544\uB2D9\uB2C8\uB2E4."] }) : null, history.length > 0 ? (_jsxs("details", { className: "mt-3 text-sm", children: [_jsx("summary", { className: "cursor-pointer font-semibold", children: "RECALCULATED \uC774\uB825" }), _jsx("ul", { className: "mt-2 space-y-1 text-muted", children: history.map((plan) => _jsxs("li", { children: [plan.estimatedDueDate, " \u00B7 ", plan.plannedStartDate, " ~ ", plan.plannedEndDate] }, plan.id)) })] })) : null] })] }), _jsxs(Card, { className: "space-y-2", children: [_jsx("p", { className: "text-sm text-muted", children: "\uC2B9\uC778\uC740 \uACC4\uC57D\uAE08 \uC785\uAE08\uC774\uB098 \uC0DD\uC0B0 \uC2DC\uC791\uC774 \uC544\uB2D9\uB2C8\uB2E4." }), canChange && user ? _jsx(Button, { className: "w-full", onClick: () => act(() => setQuotationStatus(quote.id, "APPROVED", user), "견적을 승인했습니다."), children: "\uC2B9\uC778" }) : null, canChange ? _jsx(Button, { tone: "ghost", className: "w-full", onClick: () => { setDue(quote.requestedDueDate); setOpen(true); }, children: "\uC7AC\uC0B0\uC815" }) : null, canChange && user ? _jsx(Button, { tone: "ghost", className: "w-full", onClick: () => act(() => setQuotationStatus(quote.id, "REJECTED", user), "견적을 거절했습니다."), children: "\uAC70\uC808" }) : null, canChange && user ? _jsx(Button, { tone: "danger", className: "w-full", onClick: () => act(() => setQuotationStatus(quote.id, "CANCELLED", user), "견적을 취소했습니다."), children: "\uCDE8\uC18C" }) : null, quote.status === "APPROVED" && !order && canManageOrders(role) ? _jsx(Link, { to: `/orders/new?quotationId=${quote.id}`, className: "inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary font-semibold text-white", children: "\uC218\uC8FC \uB4F1\uB85D" }) : null, order ? _jsxs(Link, { to: `/orders/${order.id}`, className: "inline-flex h-10 w-full items-center justify-center rounded-lg border border-line font-semibold", children: ["\uC218\uC8FC ", order.orderNo] }) : null, quote.status !== "APPROVED" && quote.status !== "SENT" ? _jsx("p", { className: "text-sm text-muted", children: "\uAC70\uC808, \uCDE8\uC18C, \uB9CC\uB8CC\uB41C \uACAC\uC801\uC740 \uC218\uC8FC\uB97C \uB9CC\uB4E4 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." }) : null, quote.status === "SENT" ? _jsx("p", { className: "text-sm text-muted", children: "\uC2B9\uC778 \uC804\uC5D0\uB294 \uC218\uC8FC \uB4F1\uB85D\uC744 \uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." }) : null] })] }), open ? (_jsx("div", { className: "fixed inset-0 z-30 grid place-items-center bg-black/30 p-4", children: _jsxs("div", { className: "w-full max-w-md rounded-xl bg-white p-5", children: [_jsx("h2", { className: "text-lg font-semibold", children: "\uB0A9\uAE30 \uC7AC\uC0B0\uC815" }), _jsx("p", { className: "mt-1 text-sm text-muted", children: "\uC608\uC0C1 \uB0A9\uAE30\uC640 \uC784\uC2DC \uACC4\uD68D\uB9CC \uBC14\uAFC9\uB2C8\uB2E4. \uC774\uC804 \uACC4\uD68D\uC740 RECALCULATED\uB85C \uB0A8\uC2B5\uB2C8\uB2E4. \uD488\uBAA9\uACFC \uB2E8\uAC00\uB294 \uBC14\uAFB8\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." }), _jsxs("label", { className: "mt-4 block text-sm", children: ["\uD76C\uB9DD \uB0A9\uAE30", _jsx("input", { type: "date", className: "mt-1 h-10 w-full rounded-lg border border-line px-3", value: due, onChange: (event) => setDue(event.target.value) })] }), _jsxs("div", { className: "mt-4 flex justify-end gap-2", children: [_jsx(Button, { tone: "ghost", onClick: () => setOpen(false), children: "\uB2EB\uAE30" }), _jsx(Button, { onClick: () => act(() => recalculateQuotation(quote.id, due), "임시 계획을 재산정했습니다."), children: "\uC7AC\uC0B0\uC815" })] })] }) })) : null] }));
}
