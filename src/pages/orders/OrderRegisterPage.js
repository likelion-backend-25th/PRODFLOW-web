import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AddressPicker } from "@/components/AddressPicker.tsx";
import { Button, Card } from "@/components/ui.tsx";
import { todayISO } from "@/lib/dates.ts";
import { useDb } from "@/lib/db.ts";
import { digitsOnly, formatWon, orderTotal } from "@/lib/money.ts";
import { createOrder } from "@/lib/workflow.ts";
import { useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";
export function OrderRegisterPage() {
    const db = useDb();
    const navigate = useNavigate();
    const actor = useAuthStore((state) => state.user);
    const show = useToastStore((state) => state.show);
    const [params] = useSearchParams();
    const quote = db.quotations.find((item) => item.id === params.get("quotationId"));
    const client = db.clients.find((item) => item.id === quote?.clientId);
    const [shippingAddress, setShippingAddress] = useState("");
    const [receiverPhone, setReceiverPhone] = useState(client?.contactMobile ?? "");
    const [notifyChannel, setNotifyChannel] = useState("SMS");
    const [memo, setMemo] = useState("");
    const [depositDueDate, setDepositDueDate] = useState(todayISO());
    const [error, setError] = useState("");
    if (!quote || quote.status !== "APPROVED") {
        return (_jsxs(Card, { children: [_jsx("h1", { className: "text-xl font-semibold", children: "\uC218\uC8FC \uB4F1\uB85D" }), _jsx("p", { className: "mt-2 text-sm text-muted", children: "\uC2B9\uC778\uB41C \uACAC\uC801\uC5D0\uC11C\uB9CC \uC218\uC8FC\uB97C \uB4F1\uB85D\uD569\uB2C8\uB2E4. \uBC30\uC1A1\uC9C0\uB294 \uC774 \uD654\uBA74\uC5D0\uC11C \uC785\uB825\uD569\uB2C8\uB2E4." }), _jsx(Link, { to: "/quotations", className: "mt-4 inline-flex h-10 items-center rounded-lg bg-primary px-4 font-semibold text-white", children: "\uACAC\uC801 \uBAA9\uB85D" })] }));
    }
    const plan = quote.plans.find((item) => item.status === "ACTIVE");
    const existing = db.orders.find((order) => order.quotationId === quote.id && order.status !== "CANCELLED");
    if (existing) {
        return (_jsxs(Card, { children: [_jsxs("p", { children: ["\uC774 \uACAC\uC801\uC740 \uC774\uBBF8 \uC218\uC8FC ", existing.orderNo, "\uB85C \uB4F1\uB85D\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4."] }), _jsx(Link, { to: `/orders/${existing.id}`, className: "mt-3 inline-flex text-primary", children: "\uC218\uC8FC \uC0C1\uC138" })] }));
    }
    function register() {
        if (!actor || !quote)
            return;
        if (!shippingAddress.trim()) {
            setError("배송지를 입력하세요.");
            return;
        }
        if (digitsOnly(receiverPhone).length < 9) {
            setError("수령 연락처를 확인하세요.");
            return;
        }
        try {
            const order = createOrder({
                quotationId: quote.id,
                clientId: quote.clientId,
                lines: quote.lines.map(({ productId, quantity, unitPrice, vatIncluded }) => ({ productId, quantity, unitPrice, vatIncluded })),
                requestedDueDate: quote.requestedDueDate,
                depositDueDate,
                plannedStartDate: plan?.plannedStartDate,
                plannedEndDate: plan?.plannedEndDate,
                shippingAddress,
                receiverPhone,
                notifyChannel,
                memo,
                actor,
            });
            show(`${order.orderNo} 수주를 등록했습니다. 확정은 예정, 진행은 대기입니다.`);
            navigate(`/orders/${order.id}`);
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : "등록하지 못했습니다.");
        }
    }
    return (_jsxs("div", { className: "grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]", children: [_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "\uC218\uC8FC \uB4F1\uB85D" }), _jsxs("p", { className: "mt-1 text-sm text-muted", children: [quote.quotationNo, "\uC758 \uD488\uBAA9\uACFC \uB2E8\uAC00\uB294 \uB2E4\uC2DC \uC785\uB825\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uBC30\uC1A1 \uC815\uBCF4\uB9CC \uBC1B\uC2B5\uB2C8\uB2E4."] })] }), _jsxs(Card, { children: [_jsx("h2", { className: "font-semibold", children: client?.companyName }), _jsx("ul", { className: "mt-3 space-y-1 text-sm", children: quote.lines.map((line) => {
                                    const product = db.products.find((item) => item.id === line.productId);
                                    return _jsxs("li", { children: [product?.productName, " \u00B7 ", product?.modelName, " \u00B7 ", line.quantity.toLocaleString("ko-KR"), "\uAC1C \u00B7 \uB2E8\uAC00 ", formatWon(line.unitPrice)] }, line.id);
                                }) }), _jsxs("p", { className: "mt-3 text-sm text-muted", children: ["\uD76C\uB9DD \uB0A9\uAE30 ", quote.requestedDueDate, " \u00B7 \uC608\uC0C1 \uB0A9\uAE30 ", quote.estimatedDueDate, " \u00B7 \uCD1D\uC561 ", formatWon(orderTotal(quote.lines))] })] }), _jsxs(Card, { className: "space-y-3", children: [_jsx("h2", { className: "font-semibold", children: "\uBC30\uC1A1" }), _jsx(AddressPicker, { label: "\uBC30\uC1A1\uC9C0", value: shippingAddress, onChange: setShippingAddress }), _jsxs("label", { className: "block text-sm", children: ["\uC218\uB839 \uC5F0\uB77D\uCC98", _jsx("input", { className: "mt-1 h-10 w-full rounded-lg border border-line px-3", value: receiverPhone, onChange: (event) => setReceiverPhone(event.target.value) })] }), _jsxs("label", { className: "block text-sm", children: ["\uC54C\uB9BC \uCC44\uB110", _jsxs("select", { className: "mt-1 h-10 w-full rounded-lg border border-line px-3", value: notifyChannel, onChange: (event) => setNotifyChannel(event.target.value), children: [_jsx("option", { value: "SMS", children: "SMS" }), _jsx("option", { value: "EMAIL", children: "\uC774\uBA54\uC77C" })] })] }), _jsxs("label", { className: "block text-sm", children: ["\uC5C5\uBB34 \uBA54\uBAA8", _jsx("textarea", { className: "mt-1 min-h-20 w-full rounded-lg border border-line px-3 py-2", value: memo, maxLength: 200, onChange: (event) => setMemo(event.target.value) })] }), _jsxs("label", { className: "block text-sm", children: ["\uACC4\uC57D\uAE08 \uC785\uAE08 \uB9C8\uAC10", _jsx("input", { type: "date", className: "mt-1 h-10 w-full rounded-lg border border-line px-3", value: depositDueDate, onChange: (event) => setDepositDueDate(event.target.value) })] })] })] }), _jsxs(Card, { children: [_jsx("p", { className: "text-sm", children: "\uB4F1\uB85D \uC9C1\uD6C4 \uD655\uC815 \uC0C1\uD0DC\uB294 \uC608\uC815, \uC9C4\uD589 \uC0C1\uD0DC\uB294 \uB300\uAE30\uC785\uB2C8\uB2E4. \uC791\uC5C5\uC9C0\uC2DC\uC11C\uB294 \uACC4\uC57D\uAE08 \uD655\uC778 \uD6C4\uC5D0 \uB9CC\uB4E4\uC5B4\uC9D1\uB2C8\uB2E4." }), _jsxs("p", { className: "mt-2 text-sm text-muted", children: ["\uC0DD\uC0B0 \uC608\uC815 ", plan?.plannedStartDate ?? "-", " ~ ", plan?.plannedEndDate ?? "-"] }), error ? _jsx("p", { className: "mt-3 text-sm text-danger", children: error }) : null, _jsx(Button, { className: "mt-4 w-full", onClick: register, children: "\uC218\uC8FC \uB4F1\uB85D" })] })] }));
}
