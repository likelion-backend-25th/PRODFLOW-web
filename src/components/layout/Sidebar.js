import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Building2, ChevronRight, ClipboardList, Factory, FileText, LayoutGrid, LogOut, Sparkles, UsersRound } from "lucide-react";
import { NavLink, useLocation } from "react-router";
import { cn } from "@/lib/cn.ts";
import { useDb } from "@/lib/db.ts";
import { roleLabel } from "@/lib/labels.ts";
import { useAuthStore } from "@/stores/useAuthStore.ts";
export function Sidebar() {
    const user = useAuthStore((state) => state.user);
    const logout = useAuthStore((state) => state.logout);
    const db = useDb();
    const orders = db.orders.filter((order) => order.status !== "CANCELLED").length;
    const shipping = db.orders.filter((order) => order.status === "PACKING" || order.status === "PACKED" || order.status === "READY_TO_SHIP" || order.status === "SHIPPING" || (order.status === "COMPLETED" && order.paymentStatus !== "PAID")).length;
    const location = useLocation();
    return (_jsxs("aside", { className: "sticky top-0 flex h-screen w-[232px] shrink-0 flex-col border-r border-line bg-white px-3 py-4", children: [_jsxs("div", { className: "flex items-center gap-2 px-2", children: [_jsx("span", { className: "grid h-8 w-8 place-items-center rounded-lg bg-primary text-white", children: _jsx(LayoutGrid, { size: 16 }) }), _jsx("span", { className: "text-base font-semibold tracking-tight", children: "\uC0DD\uC0B0\uD50C\uB85C\uC6B0" })] }), _jsxs("button", { type: "button", className: "mt-4 flex items-center justify-between rounded-lg bg-canvas px-3 py-2 text-left text-sm", children: [_jsx("span", { children: "\uBCF8\uC0AC \u00B7 \uC0DD\uC0B0\uC6B4\uC601\uD300" }), _jsx(ChevronRight, { size: 14, className: "rotate-90 text-muted" })] }), _jsx("p", { className: "mt-5 px-3 text-[11px] font-semibold tracking-wide text-muted", children: "WORKSPACE" }), _jsxs("nav", { className: "mt-2 flex flex-1 flex-col gap-1", children: [_jsx(Item, { to: "/", end: true, icon: LayoutGrid, label: "\uB300\uC2DC\uBCF4\uB4DC" }), _jsx(Item, { to: "/quotations", icon: FileText, label: "\uACAC\uC801 \uAD00\uB9AC", active: location.pathname.startsWith("/quotations") }), _jsx(Item, { to: "/orders", icon: ClipboardList, label: "\uC218\uC8FC \uBC0F \uC0DD\uC0B0\uAE30\uB85D", badge: orders, active: location.pathname.startsWith("/work-orders") || location.pathname.startsWith("/shipping") || location.pathname.startsWith("/calendar") }), _jsx(Item, { to: "/calendar", icon: Factory, label: "\uC218\uC8FC \uC77C\uC815 \uAD00\uB9AC", nested: true }), _jsx(Item, { to: "/work-orders", icon: Factory, label: "\uC791\uC5C5\uC9C0\uC2DC \uAD00\uB9AC", nested: true }), _jsx(Item, { to: "/shipping", icon: Factory, label: "\uBC30\uC1A1 \uAD00\uB9AC", nested: true, badge: shipping }), _jsx(Item, { to: "/clients", icon: Building2, label: "\uAC70\uB798\uCC98 \uAD00\uB9AC" }), _jsx(Item, { to: "/products", icon: Box, label: "\uC0DD\uC0B0\uD488\uBAA9 \uAD00\uB9AC" }), _jsx(Item, { to: "/lines", icon: Factory, label: "\uC0DD\uC0B0\uB77C\uC778" }), user?.role === "SUPER_ADMIN" ? _jsx(Item, { to: "/admin", icon: UsersRound, label: "\uACC4\uC815 \uAD00\uB9AC" }) : null, _jsx(Item, { to: "/assistant", icon: Sparkles, label: "AI \uCC57\uBD07" })] }), _jsxs("div", { className: "space-y-2 px-1 pb-3 text-xs text-muted", children: [_jsxs("div", { className: "rounded-xl bg-canvas p-3", children: [_jsx("p", { className: "font-semibold text-ink", children: "\uC548\uC804\uD55C \uB0B4\uBD80 \uC5C5\uBB34 \uACF5\uAC04" }), _jsx("p", { className: "mt-1", children: "\uC2B9\uC778\uB41C \uC784\uC9C1\uC6D0\uB9CC \uC811\uADFC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." })] }), _jsx("p", { children: "\uC774\uC6A9 \uAC00\uC774\uB4DC \uBC0F \uBB38\uC758" })] }), user ? (_jsxs("div", { className: "flex items-center gap-2 border-t border-line px-2 pt-3", children: [_jsx("span", { className: "grid h-8 w-8 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary", children: user.name.slice(0, 1) }), _jsxs("span", { className: "min-w-0 flex-1", children: [_jsx("span", { className: "block truncate text-sm font-semibold", children: user.name }), _jsx("span", { className: "block truncate text-xs text-muted", children: roleLabel[user.role] })] }), _jsx("button", { type: "button", className: "text-muted", onClick: logout, "aria-label": "\uB85C\uADF8\uC544\uC6C3", children: _jsx(LogOut, { size: 16 }) })] })) : null] }));
}
function Item({ to, icon: Icon, label, end = false, badge, nested = false, active, }) {
    return (_jsxs(NavLink, { to: to, end: end, className: ({ isActive }) => cn("flex items-center gap-2 rounded-lg px-3 py-2 text-muted", nested && "ml-4 py-1.5 text-sm", (active || isActive) && "bg-primary-soft font-semibold text-primary"), children: [nested ? _jsx("span", { className: "h-1.5 w-1.5 rounded-full bg-primary" }) : _jsx(Icon, { size: 16 }), _jsx("span", { className: "flex-1", children: label }), badge ? _jsx("span", { className: "text-xs text-muted", children: badge }) : null] }));
}
export function crumbs(pathname) {
    if (pathname.startsWith("/work-orders"))
        return ["워크스페이스", "수주 및 생산기록", "작업지시 관리"];
    if (pathname.startsWith("/shipping"))
        return ["워크스페이스", "수주 및 생산기록", "배송 관리"];
    if (pathname === "/quotations/new")
        return ["워크스페이스", "견적 관리", "견적 작성"];
    if (pathname.startsWith("/quotations"))
        return ["워크스페이스", "견적 관리"];
    if (pathname === "/orders/new")
        return ["워크스페이스", "수주 및 생산기록", "수주 등록"];
    if (pathname.startsWith("/orders"))
        return ["워크스페이스", "수주 및 생산기록"];
    if (pathname.startsWith("/clients"))
        return ["워크스페이스", "거래처 관리"];
    if (pathname === "/products/new")
        return ["워크스페이스", "생산품목 관리", "생산품목 등록"];
    if (pathname.endsWith("/edit") && pathname.startsWith("/products/"))
        return ["워크스페이스", "생산품목 관리", "생산품목 수정"];
    if (/^\/products\/[^/]+$/.test(pathname))
        return ["워크스페이스", "생산품목 관리", "생산품목 상세"];
    if (pathname.startsWith("/products"))
        return ["워크스페이스", "생산품목 관리"];
    if (pathname.startsWith("/lines"))
        return ["워크스페이스", "생산라인"];
    if (pathname.startsWith("/admin"))
        return ["워크스페이스", "계정 관리"];
    if (pathname.startsWith("/assistant"))
        return ["워크스페이스", "AI 챗봇"];
    if (pathname.startsWith("/calendar"))
        return ["워크스페이스", "수주 및 생산기록", "수주 일정 관리"];
    return ["워크스페이스", "대시보드"];
}
