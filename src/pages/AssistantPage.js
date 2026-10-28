import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Bot, ChevronRight, Plus, Search, Send, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui.tsx";
import { answerQuestion, suggestedQuestions } from "@/lib/assistant.ts";
import { cn } from "@/lib/cn.ts";
import { useDb } from "@/lib/db.ts";
export function AssistantPage() {
    const db = useDb();
    const [openedAt] = useState(timestamp);
    const [chats, setChats] = useState(() => [blankChat()]);
    const [activeId, setActiveId] = useState(null);
    const [keyword, setKeyword] = useState("");
    const [draft, setDraft] = useState("");
    const active = chats.find((chat) => chat.id === activeId) ?? chats[0];
    const visible = chats.filter((chat) => chat.title.includes(keyword.trim()));
    const stats = useMemo(() => todayStats(db), [db]);
    function send(raw) {
        const text = raw.trim();
        const current = active;
        if (!text || !current)
            return;
        const answer = answerQuestion(db, text, current.context);
        const now = timestamp();
        const next = {
            ...current,
            title: current.messages.length === 0 ? text : current.title,
            context: answer.context,
            updatedAt: now,
            messages: [
                ...current.messages,
                { id: crypto.randomUUID(), role: "user", text, at: now },
                { id: crypto.randomUUID(), role: "assistant", text: answer.text, table: answer.table, at: now },
            ],
        };
        setActiveId(current.id);
        setChats((list) => list.map((chat) => (chat.id === current.id ? next : chat)));
        setDraft("");
    }
    function createChat() {
        const chat = blankChat();
        setChats((list) => [chat, ...list]);
        setActiveId(chat.id);
        setDraft("");
    }
    function removeChat(id) {
        const next = chats.filter((chat) => chat.id !== id);
        if (next.length === 0) {
            const chat = blankChat();
            setChats([chat]);
            setActiveId(chat.id);
            return;
        }
        setChats(next);
        if (active?.id === id)
            setActiveId(next[0]?.id ?? null);
    }
    return (_jsxs("div", { className: "-mx-6 -my-6 flex h-[calc(100dvh-6.5rem)] min-h-[560px] overflow-hidden bg-canvas", children: [_jsxs("aside", { className: "hidden w-60 shrink-0 flex-col border-r border-line bg-white md:flex", children: [_jsxs("div", { className: "space-y-3 p-4", children: [_jsxs("button", { type: "button", className: "flex h-10 w-full items-center justify-center gap-1 rounded-lg bg-primary font-semibold text-white", onClick: createChat, children: [_jsx(Plus, { size: 16 }), " \uC0C8 \uB300\uD654"] }), _jsxs("label", { className: "relative block", children: [_jsx(Search, { size: 14, className: "absolute top-1/2 left-3 -translate-y-1/2 text-muted" }), _jsx("input", { className: "h-10 w-full rounded-lg border border-line bg-white pr-3 pl-8 text-sm", value: keyword, placeholder: "\uB300\uD654 \uAC80\uC0C9", onChange: (event) => setKeyword(event.target.value) })] })] }), _jsxs("div", { className: "flex-1 space-y-4 overflow-y-auto px-3 pb-4", children: [_jsx(ChatGroup, { label: "\uC624\uB298", chats: visible.filter((chat) => sameDay(chat.updatedAt, openedAt)), activeId: active?.id, onSelect: setActiveId }), _jsx(ChatGroup, { label: "\uC9C0\uB09C 7\uC77C", chats: visible.filter((chat) => !sameDay(chat.updatedAt, openedAt) && openedAt - chat.updatedAt < 7 * 86_400_000), activeId: active?.id, onSelect: setActiveId })] })] }), _jsxs("section", { className: "flex min-w-0 flex-1 flex-col", children: [_jsxs("div", { className: "flex items-center justify-between border-b border-line bg-white px-5 py-3", children: [_jsx("h1", { className: "truncate font-semibold", children: active?.title || "새 대화" }), active ? _jsx("button", { type: "button", className: "text-muted", "aria-label": "\uB300\uD654 \uC0AD\uC81C", onClick: () => removeChat(active.id), children: _jsx(Trash2, { size: 16 }) }) : null] }), _jsxs("div", { className: "flex-1 space-y-4 overflow-y-auto px-5 py-5", children: [active && active.messages.length === 0 ? (_jsx("p", { className: "text-sm text-muted", children: "\uCD94\uCC9C \uC9C8\uBB38\uC744 \uB204\uB974\uAC70\uB098, \uB0A9\uAE30\u00B7\uC791\uC5C5\uC9C0\uC2DC\u00B7\uC0DD\uC0B0\uB77C\uC778\u00B7\uBBF8\uC785\uAE08\uCC98\uB7FC \uC785\uB825\uD574 \uC8FC\uC138\uC694." })) : null, active?.messages.map((message) => (message.role === "user" ? (_jsx("div", { className: "flex justify-end", children: _jsxs("p", { className: "max-w-[80%] rounded-2xl bg-primary-soft px-4 py-2 text-sm", children: [message.text, _jsx("span", { className: "ml-2 text-xs text-muted", children: clock(message.at) })] }) }, message.id)) : (_jsxs("div", { id: message.id, className: "flex items-start gap-2", children: [_jsx("span", { className: "grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-white", children: _jsx(Bot, { size: 16 }) }), _jsxs("div", { className: "min-w-0 flex-1 rounded-xl border border-line bg-white p-4", children: [_jsx("p", { className: "text-sm", children: message.text }), message.table ? _jsx(AnswerGrid, { table: message.table }) : null, _jsx("p", { className: "mt-2 text-xs text-muted", children: clock(message.at) })] })] }, message.id))))] }), _jsxs("form", { className: "border-t border-line bg-white px-5 py-3", onSubmit: (event) => { event.preventDefault(); send(draft); }, children: [_jsx("div", { className: "mb-2 flex gap-2 overflow-x-auto lg:hidden", children: suggestedQuestions.map((question) => (_jsx("button", { type: "button", className: "shrink-0 rounded-full border border-line px-3 py-1 text-xs", onClick: () => send(question), children: question }, question))) }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("input", { className: "h-11 min-w-0 flex-1 rounded-lg border border-line px-3 text-sm", value: draft, placeholder: "\uC774\uBC88 \uC8FC \uB0A9\uAE30, \uC9C4\uD589 \uC911\uC778 \uC791\uC5C5\uC9C0\uC2DC, \uC0DD\uC0B0\uB77C\uC778, \uBBF8\uC785\uAE08 \uAC70\uB798\uB97C \uBB3C\uC5B4\uBCF4\uC138\uC694.", onChange: (event) => setDraft(event.target.value) }), _jsx("button", { type: "submit", className: "grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary text-white disabled:opacity-40", disabled: !draft.trim(), "aria-label": "\uBCF4\uB0B4\uAE30", children: _jsx(Send, { size: 16 }) })] }), _jsx("p", { className: "mt-2 text-xs text-muted", children: "\uC800\uC7A5\uB41C \uC218\uC8FC\u00B7\uC791\uC5C5\uC9C0\uC2DC\u00B7\uC0DD\uC0B0\uB77C\uC778 \uB370\uC774\uD130\uB85C \uB2F5\uD569\uB2C8\uB2E4. \uC678\uBD80 AI\uB294 \uD638\uCD9C\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." })] })] }), _jsxs("aside", { className: "hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-line bg-canvas p-4 lg:flex", children: [_jsxs("section", { className: "rounded-xl border border-line bg-white p-4", children: [_jsx("h2", { className: "text-sm font-semibold", children: "\uCD94\uCC9C \uC9C8\uBB38" }), _jsx("ul", { className: "mt-2", children: suggestedQuestions.map((question) => (_jsx("li", { className: "border-t border-line first:border-t-0", children: _jsxs("button", { type: "button", className: "flex w-full items-center justify-between gap-2 py-2 text-left text-sm hover:text-primary", onClick: () => send(question), children: [_jsx("span", { children: question }), _jsx(ChevronRight, { size: 14, className: "shrink-0 text-muted" })] }) }, question))) })] }), _jsxs("section", { className: "rounded-xl border border-line bg-white p-4", children: [_jsx("h2", { className: "text-sm font-semibold", children: "\uCD5C\uADFC \uC870\uD68C\uD55C \uACB0\uACFC" }), _jsxs("ul", { className: "mt-2 space-y-2", children: [(active?.messages.filter((message) => message.role === "assistant" && message.table) ?? []).slice(-5).reverse().map((message) => (_jsx("li", { children: _jsxs("a", { href: `#${message.id}`, className: "block rounded-lg px-2 py-1 text-sm hover:bg-canvas", children: [_jsx("span", { className: "line-clamp-2", children: message.text }), _jsxs("span", { className: "text-xs text-muted", children: [message.table?.rows.length ?? 0, "\uAC74 \u00B7 ", clock(message.at)] })] }) }, message.id))), active?.messages.some((message) => message.table) ? null : _jsx("li", { className: "text-sm text-muted", children: "\uC544\uC9C1 \uC870\uD68C\uD55C \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." })] })] }), _jsxs("section", { className: "rounded-xl border border-line bg-white p-4", children: [_jsx("h2", { className: "text-sm font-semibold", children: "\uC624\uB298\uC758 \uC8FC\uC694 \uD604\uD669" }), _jsx("ul", { className: "mt-2 space-y-2", children: stats.map((item) => (_jsx("li", { children: _jsxs("button", { type: "button", className: "flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-canvas", onClick: () => send(item.question), children: [_jsx("span", { className: "text-sm", children: item.label }), _jsx("span", { className: "font-semibold text-primary", children: item.value })] }) }, item.label))) })] })] })] }));
}
function ChatGroup({ label, chats, activeId, onSelect }) {
    if (chats.length === 0)
        return null;
    return (_jsxs("div", { children: [_jsx("p", { className: "px-2 text-xs font-semibold text-muted", children: label }), _jsx("ul", { className: "mt-1 space-y-1", children: chats.map((chat) => (_jsx("li", { children: _jsxs("button", { type: "button", className: cn("w-full rounded-lg px-2 py-2 text-left", chat.id === activeId ? "bg-primary-soft" : "hover:bg-canvas"), onClick: () => onSelect(chat.id), children: [_jsx("span", { className: "block truncate text-sm font-semibold", children: chat.title }), _jsx("span", { className: "text-xs text-muted", children: clock(chat.updatedAt) })] }) }, chat.id))) })] }));
}
function AnswerGrid({ table }) {
    return (_jsx("div", { className: "mt-3 overflow-x-auto", children: _jsxs("table", { className: "w-full min-w-[520px] text-left text-sm", children: [_jsx("thead", { className: "bg-primary-soft/40 text-muted", children: _jsx("tr", { children: table.columns.map((column) => _jsx("th", { className: "px-3 py-2 font-medium", children: column }, column)) }) }), _jsx("tbody", { children: table.rows.map((row, rowIndex) => (_jsx("tr", { className: "border-t border-line", children: row.cells.map((cell, index) => (_jsx("td", { className: "px-3 py-2", children: index === 0 && row.href ? _jsx(Link, { className: "font-semibold text-primary", to: row.href, children: cell.text }) : cell.className ? _jsx(Badge, { className: cell.className, children: cell.text }) : cell.text }, `${cell.text}-${index}`))) }, row.href ?? rowIndex))) })] }) }));
}
function blankChat() {
    return { id: crypto.randomUUID(), title: "새 대화", messages: [], context: { orderIds: [] }, updatedAt: timestamp() };
}
function timestamp() {
    return Date.now();
}
function todayStats(db) {
    const running = db.workOrders.filter((item) => item.status === "IN_PRODUCTION").length;
    const available = db.lines.filter((line) => line.status === "AVAILABLE").length;
    const unpaidClients = new Set(db.orders.filter((order) => order.status !== "CANCELLED" && order.paymentStatus !== "PAID").map((order) => order.clientId)).size;
    return [
        { label: "진행 중 작업지시서", value: `${running}건`, question: suggestedQuestions[1] },
        { label: "가동 가능 생산라인", value: `${available}개`, question: suggestedQuestions[3] },
        { label: "미입금 거래처", value: `${unpaidClients}곳`, question: suggestedQuestions[4] },
    ];
}
function sameDay(left, right) {
    const a = new Date(left);
    const b = new Date(right);
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function clock(stamp) {
    const date = new Date(stamp);
    const hour = date.getHours();
    const mark = hour < 12 ? "오전" : "오후";
    const shown = hour % 12 === 0 ? 12 : hour % 12;
    return `${mark} ${String(shown).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
