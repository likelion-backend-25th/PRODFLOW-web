import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from "react";
import { Bell } from "lucide-react";
import { Link, Navigate, Outlet, useLocation } from "react-router";
import { crumbs, Sidebar } from "@/components/layout/Sidebar.tsx";
import { useDb } from "@/lib/db.ts";
import { expireUnpaidOrders } from "@/lib/workflow.ts";
import { todayISO } from "@/lib/dates.ts";
import { activeWorkOrder, delayOf } from "@/lib/delay.ts";
import { useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";
export function RootLayout() {
    const user = useAuthStore((state) => state.user);
    const logout = useAuthStore((state) => state.logout);
    const refresh = useAuthStore((state) => state.refresh);
    const message = useToastStore((state) => state.message);
    const show = useToastStore((state) => state.show);
    const clear = useToastStore((state) => state.clear);
    const { pathname } = useLocation();
    const db = useDb();
    const today = todayISO();
    const alerts = db.orders.filter((order) => delayOf(order, activeWorkOrder(db.workOrders, order.id), today)).length;
    const account = db.users.find((item) => item.id === user?.id);
    const revoked = Boolean(user) && account?.status !== "ACTIVE";
    useEffect(() => {
        const expired = expireUnpaidOrders();
        if (expired > 0)
            show(`계약금 입금 마감일이 지난 대기 수주 ${expired}건을 취소하고 일정을 되돌렸습니다.`);
    }, [show]);
    useEffect(() => {
        if (revoked) {
            logout();
            show("계정이 비활성화되어 로그아웃했습니다. 최고 관리자에게 문의하세요.");
        }
        else if (account && user && (account.role !== user.role || account.name !== user.name)) {
            refresh();
        }
    }, [revoked, account, user, logout, refresh, show]);
    if (!user || revoked)
        return _jsx(Navigate, { to: "/login", replace: true });
    const trail = crumbs(pathname);
    return (_jsxs("div", { className: "flex min-h-screen bg-canvas", children: [_jsx(Sidebar, {}), _jsxs("div", { className: "flex min-w-0 flex-1 flex-col", children: [_jsxs("header", { className: "flex h-14 items-center justify-between border-b border-line bg-white px-6", children: [_jsx("p", { className: "flex items-center gap-2 text-sm text-muted", children: trail.map((item, index) => (_jsxs("span", { className: "flex items-center gap-2", children: [index > 0 ? _jsx("span", { children: "\u203A" }) : null, _jsx("span", { className: index === trail.length - 1 ? "font-semibold text-ink" : "", children: item })] }, item))) }), _jsxs("div", { className: "flex items-center gap-4 text-sm text-muted", children: [_jsxs("span", { className: "flex items-center gap-1", children: [_jsx("span", { className: "h-1.5 w-1.5 rounded-full bg-success" }), "\uB0B4\uBD80 \uB124\uD2B8\uC6CC\uD06C \uC5F0\uACB0\uB428"] }), _jsx(Bell, { size: 16 }), _jsxs(Link, { to: "/", className: "rounded-full bg-primary-soft px-2 py-1 text-xs font-semibold text-primary", title: "\uC9C0\uC5F0\u00B7\uC704\uD5D8 \uC218\uC8FC", children: ["\uC54C\uB9BC ", alerts] })] })] }), _jsx("main", { className: "flex-1 px-6 py-6", children: _jsx(Outlet, {}) }), _jsxs("footer", { className: "flex items-center justify-between px-6 py-4 text-xs text-muted", children: [_jsx("span", { children: "\u00A9 2026 \uC0DD\uC0B0\uD50C\uB85C\uC6B0 \u00B7 \uB0B4\uBD80 \uC5C5\uBB34 \uC804\uC6A9" }), _jsx("span", { children: "\uBAA8\uB4E0 \uB370\uC774\uD130\uB294 \uB514\uC790\uC778 \uAC80\uD1A0\uC6A9 \uAC00\uC0C1 \uB370\uC774\uD130\uC785\uB2C8\uB2E4." })] })] }), message ? (_jsx("button", { type: "button", className: "fixed right-6 bottom-6 rounded-lg bg-ink px-4 py-3 text-white", onClick: clear, children: message })) : null] }));
}
