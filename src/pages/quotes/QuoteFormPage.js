import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui.tsx";
import { addDays, todayISO } from "@/lib/dates.ts";
import { useDb } from "@/lib/db.ts";
import { depositTarget, formatWon, lineAmount } from "@/lib/money.ts";
import { createQuotation, previewSchedule } from "@/lib/workflow.ts";
import { useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";
export function QuoteFormPage() {
    const db = useDb();
    const navigate = useNavigate();
    const actor = useAuthStore((state) => state.user);
    const show = useToastStore((state) => state.show);
    const [clientId, setClientId] = useState(db.clients[0]?.id ?? "");
    const [lines, setLines] = useState([{ productId: db.products[0]?.id ?? "", quantity: 1000, unitPrice: db.products[0]?.unitPrice ?? 0 }]);
    const [vatIncluded, setVatIncluded] = useState(false);
    const [requestedDueDate, setRequestedDueDate] = useState("");
    const [validUntil, setValidUntil] = useState(addDays(todayISO(), 14));
    const [error, setError] = useState("");
    const priced = lines.map((line) => {
        const total = lineAmount({ quantity: line.quantity || 0, unitPrice: line.unitPrice || 0, vatIncluded });
        const supply = vatIncluded ? Math.round(total / 1.1) : (line.quantity || 0) * (line.unitPrice || 0);
        return { supply, vat: total - supply, total };
    });
    const supply = priced.reduce((sum, item) => sum + item.supply, 0);
    const vat = priced.reduce((sum, item) => sum + item.vat, 0);
    const total = priced.reduce((sum, item) => sum + item.total, 0);
    const quantity = lines.reduce((sum, line) => sum + (line.quantity || 0), 0);
    const preview = useMemo(() => {
        if (quantity <= 0)
            return null;
        try {
            return previewSchedule(quantity);
        }
        catch (reason) {
            return reason instanceof Error ? reason.message : null;
        }
    }, [quantity, db]);
    const schedule = preview && typeof preview !== "string" ? preview : null;
    const estimated = schedule && requestedDueDate
        ? (requestedDueDate >= schedule.earliestDueDate ? requestedDueDate : schedule.earliestDueDate)
        : schedule?.earliestDueDate;
    function send() {
        if (!actor)
            return;
        setError("");
        try {
            const quote = createQuotation({
                clientId,
                lines: lines.filter((line) => line.productId).map((line) => ({ ...line, vatIncluded })),
                requestedDueDate,
                validUntil,
                vatIncluded,
                actor,
            });
            show(`${quote.quotationNo} 견적을 발송했습니다.`);
            navigate(`/quotes/${quote.id}`);
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : "발송하지 못했습니다.");
        }
    }
    return (_jsxs("div", { children: [_jsxs("div", { className: "mb-4 flex flex-wrap items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "\uACAC\uC801 \uC791\uC131" }), _jsx("p", { className: "mt-1 text-sm text-muted", children: "\uAC70\uB798\uCC98\uC640 \uD488\uBAA9, \uD76C\uB9DD \uB0A9\uAE30\uB9CC \uC785\uB825\uD569\uB2C8\uB2E4. \uBC30\uC1A1\uC9C0\uB294 \uB123\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." })] }), _jsx(Link, { to: "/quotes", className: "inline-flex h-10 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold", children: "\uACAC\uC801 \uBAA9\uB85D" })] }), _jsxs("div", { className: "grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]", children: [_jsxs("div", { className: "space-y-4", children: [_jsxs("section", { className: "rounded-xl border border-line bg-white p-5", children: [_jsx("h2", { className: "font-semibold", children: "\uAC70\uB798\uCC98" }), _jsx("select", { className: "mt-3 h-10 w-full rounded-lg border border-line px-3", value: clientId, onChange: (event) => setClientId(event.target.value), children: db.clients.map((client) => _jsx("option", { value: client.id, children: client.companyName }, client.id)) }), _jsx("p", { className: "mt-2 text-xs text-muted", children: "\uB2F4\uB2F9\uC790, \uC5F0\uB77D\uCC98, \uD68C\uC0AC \uC8FC\uC18C\uB294 \uC120\uD0DD\uD55C \uAC70\uB798\uCC98 \uC815\uBCF4\uB97C \uC0AC\uC6A9\uD569\uB2C8\uB2E4." })] }), _jsxs("section", { className: "rounded-xl border border-line bg-white p-5", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h2", { className: "font-semibold", children: "\uD488\uBAA9" }), _jsx(Button, { tone: "ghost", className: "h-9", onClick: () => setLines([...lines, { productId: "", quantity: 100, unitPrice: 0 }]), children: "\uD488\uBAA9 \uCD94\uAC00" })] }), _jsxs("label", { className: "mt-3 flex items-center gap-2 text-sm", children: [_jsx("input", { type: "checkbox", checked: !vatIncluded, onChange: (event) => setVatIncluded(!event.target.checked) }), "\uB2E8\uAC00\uB294 \uBD80\uAC00\uC138 \uBCC4\uB3C4"] }), _jsx("div", { className: "mt-3 space-y-2", children: lines.map((line, index) => (_jsxs("div", { className: "grid gap-2 md:grid-cols-[1fr_100px_120px_auto]", children: [_jsxs("select", { className: "h-10 rounded-lg border border-line px-3", value: line.productId, onChange: (event) => {
                                                        const product = db.products.find((item) => item.id === event.target.value);
                                                        const next = [...lines];
                                                        next[index] = { ...line, productId: event.target.value, unitPrice: product?.unitPrice ?? line.unitPrice };
                                                        setLines(next);
                                                    }, children: [_jsx("option", { value: "", children: "\uD488\uBAA9 \uC120\uD0DD" }), db.products.map((product) => _jsxs("option", { value: product.id, children: [product.productName, " \u00B7 ", product.modelName] }, product.id))] }), _jsx("input", { type: "number", className: "h-10 rounded-lg border border-line px-3", value: line.quantity, onChange: (event) => {
                                                        const next = [...lines];
                                                        next[index] = { ...line, quantity: Number(event.target.value) };
                                                        setLines(next);
                                                    } }), _jsx("input", { type: "number", className: "h-10 rounded-lg border border-line px-3", value: line.unitPrice, onChange: (event) => {
                                                        const next = [...lines];
                                                        next[index] = { ...line, unitPrice: Number(event.target.value) };
                                                        setLines(next);
                                                    } }), _jsx(Button, { tone: "ghost", onClick: () => setLines(lines.filter((_, item) => item !== index)), children: "\uC0AD\uC81C" })] }, index))) })] }), _jsxs("section", { className: "rounded-xl border border-line bg-white p-5", children: [_jsx("h2", { className: "font-semibold", children: "\uB0A9\uAE30" }), _jsxs("div", { className: "mt-3 grid gap-3 sm:grid-cols-2", children: [_jsxs("label", { className: "text-sm", children: ["\uD76C\uB9DD \uB0A9\uAE30", _jsx("input", { type: "date", className: "mt-1 h-10 w-full rounded-lg border border-line px-3", value: requestedDueDate, onChange: (event) => setRequestedDueDate(event.target.value) })] }), _jsxs("label", { className: "text-sm", children: ["\uC720\uD6A8\uAE30\uAC04", _jsx("input", { type: "date", className: "mt-1 h-10 w-full rounded-lg border border-line px-3", value: validUntil, onChange: (event) => setValidUntil(event.target.value) })] })] }), _jsx("p", { className: "mt-3 rounded-lg bg-canvas px-3 py-2 text-sm text-muted", children: "\uC784\uC2DC \uACC4\uD68D\uC740 \uD655\uC815 \uC608\uC57D\uC774 \uC544\uB2D9\uB2C8\uB2E4. \uACC4\uC57D\uAE08 \uC785\uAE08 \uC804\uC5D0\uB294 \uC791\uC5C5\uC9C0\uC2DC\uC11C\uB97C \uB9CC\uB4E4\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." }), schedule ? (_jsx("p", { className: "mt-2 text-sm", children: requestedDueDate && requestedDueDate < schedule.earliestDueDate ? `희망 납기 불가. 예상 납기 ${estimated}` : `예상 납기 ${estimated}` })) : null] })] }), _jsxs("aside", { className: "rounded-xl border border-line bg-white p-5", children: [_jsx("h2", { className: "font-semibold", children: "\uAE08\uC561 \uC694\uC57D" }), _jsxs("dl", { className: "mt-3 space-y-2 text-sm", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("dt", { className: "text-muted", children: "\uACF5\uAE09\uAC00\uC561" }), _jsx("dd", { children: formatWon(supply) })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("dt", { className: "text-muted", children: "\uBD80\uAC00\uC138" }), _jsx("dd", { children: formatWon(vat) })] }), _jsxs("div", { className: "flex justify-between text-base font-semibold", children: [_jsx("dt", { children: "\uCD1D\uC561" }), _jsx("dd", { children: formatWon(total) })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("dt", { className: "text-muted", children: "\uACC4\uC57D\uAE08 50%" }), _jsx("dd", { children: formatWon(depositTarget(total)) })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("dt", { className: "text-muted", children: "\uC794\uAE08 50%" }), _jsx("dd", { children: formatWon(total - depositTarget(total)) })] })] }), error ? _jsx("p", { className: "mt-3 text-sm text-danger", children: error }) : null, _jsx(Button, { className: "mt-4 w-full", onClick: send, children: "\uACAC\uC801 \uBC1C\uC1A1" })] })] })] }));
}
