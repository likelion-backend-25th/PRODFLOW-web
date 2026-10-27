import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Badge, Button } from "@/components/ui.tsx";
import { useDb } from "@/lib/db.ts";
import { quotationStatusLabel, quotationStatusTone } from "@/lib/labels.ts";
import { formatWon, orderTotal } from "@/lib/money.ts";
import { canManageOrders, useAuthStore } from "@/stores/useAuthStore.ts";
const filters = ["SENT", "APPROVED", "REJECTED", "CANCELLED", "EXPIRED"];
export function QuoteListPage() {
    const db = useDb();
    const role = useAuthStore((state) => state.user?.role);
    const [status, setStatus] = useState("");
    const [keyword, setKeyword] = useState("");
    const rows = useMemo(() => db.quotations.filter((quote) => {
        const client = db.clients.find((item) => item.id === quote.clientId);
        const author = db.users.find((item) => item.id === quote.userId);
        const text = `${quote.quotationNo} ${client?.companyName ?? ""} ${author?.name ?? ""}`.includes(keyword.trim());
        return text && (!status || quote.status === status);
    }), [db, keyword, status]);
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "\uACAC\uC801" }), _jsx("p", { className: "mt-1 text-muted", children: "\uAC00\uACA9\uACFC \uB0A9\uAE30\uB97C \uC81C\uC548\uD569\uB2C8\uB2E4. \uBC30\uC1A1\uC9C0\uB294 \uC218\uC8FC \uB4F1\uB85D\uC5D0\uC11C \uBC1B\uC2B5\uB2C8\uB2E4." })] }), canManageOrders(role) ? _jsx(Link, { to: "/quotes/new", className: "inline-flex h-10 items-center rounded-lg bg-primary px-4 font-semibold text-white", children: "\uACAC\uC801 \uC791\uC131" }) : null] }), _jsxs("section", { className: "mt-4 overflow-hidden rounded-xl border border-line bg-white", children: [_jsxs("div", { className: "flex flex-wrap gap-2 p-4", children: [_jsx("input", { className: "h-10 min-w-56 flex-1 rounded-lg border border-line px-3", value: keyword, placeholder: "\uACAC\uC801\uBC88\uD638, \uAC70\uB798\uCC98, \uC791\uC131\uC790 \uAC80\uC0C9", onChange: (event) => setKeyword(event.target.value) }), _jsxs("select", { className: "h-10 rounded-lg border border-line bg-white px-3", value: status, onChange: (event) => setStatus(event.target.value), children: [_jsx("option", { value: "", children: "\uC0C1\uD0DC \uC804\uCCB4" }), filters.map((key) => _jsx("option", { value: key, children: quotationStatusLabel[key] }, key))] }), _jsx(Button, { tone: "ghost", onClick: () => { setKeyword(""); setStatus(""); }, children: "\uCD08\uAE30\uD654" })] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full min-w-[860px] text-left text-sm", children: [_jsx("thead", { className: "bg-canvas text-xs text-muted", children: _jsx("tr", { children: ["견적번호", "거래처", "희망 납기", "예상 납기", "총액", "상태", "유효기간", "작성자"].map((label) => _jsx("th", { className: "px-4 py-3 font-medium", children: label }, label)) }) }), _jsxs("tbody", { children: [rows.map((quote) => {
                                            const client = db.clients.find((item) => item.id === quote.clientId);
                                            const author = db.users.find((item) => item.id === quote.userId);
                                            return (_jsxs("tr", { className: "border-t border-line", children: [_jsx("td", { className: "px-4 py-3 font-semibold", children: _jsx(Link, { to: `/quotes/${quote.id}`, className: "text-primary", children: quote.quotationNo }) }), _jsx("td", { className: "px-4 py-3", children: client?.companyName ?? "-" }), _jsx("td", { className: "px-4 py-3", children: quote.requestedDueDate }), _jsx("td", { className: "px-4 py-3", children: quote.estimatedDueDate }), _jsx("td", { className: "px-4 py-3", children: formatWon(orderTotal(quote.lines)) }), _jsx("td", { className: "px-4 py-3", children: _jsx(Badge, { className: quotationStatusTone(quote.status), children: quotationStatusLabel[quote.status] }) }), _jsx("td", { className: "px-4 py-3", children: quote.validUntil }), _jsx("td", { className: "px-4 py-3", children: author?.name ?? "-" })] }, quote.id));
                                        }), rows.length === 0 ? _jsx("tr", { children: _jsx("td", { className: "px-4 py-8 text-center text-muted", colSpan: 8, children: "\uACAC\uC801\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }) }) : null] })] }) })] })] }));
}
