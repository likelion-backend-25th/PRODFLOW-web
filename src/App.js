import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { RootLayout } from "@/layouts/RootLayout.tsx";
import { AdminPage } from "@/pages/AdminPage.tsx";
import { AssistantPage } from "@/pages/AssistantPage.tsx";
import { CalendarPage } from "@/pages/CalendarPage.tsx";
import { ClientDetailPage, ClientFormPage, ClientListPage } from "@/pages/clients/ClientPages.tsx";
import { DashboardPage } from "@/pages/DashboardPage.tsx";
import { LineDetailPage, LineFormPage, LineListPage } from "@/pages/lines/LinePages.tsx";
import { LoginPage } from "@/pages/LoginPage.tsx";
import { OrderDetailPage } from "@/pages/orders/OrderDetailPage.tsx";
import { OrderListPage } from "@/pages/orders/OrderListPage.tsx";
import { OrderRegisterPage } from "@/pages/orders/OrderRegisterPage.tsx";
import { QuoteDetailPage } from "@/pages/quotes/QuoteDetailPage.tsx";
import { QuoteFormPage } from "@/pages/quotes/QuoteFormPage.tsx";
import { QuoteListPage } from "@/pages/quotes/QuoteListPage.tsx";
import { ProductDetailPage, ProductFormPage, ProductListPage } from "@/pages/products/ProductPages.tsx";
import { ShippingPage } from "@/pages/ShippingPage.tsx";
import { WorkOrderDetailPage, WorkOrderListPage } from "@/pages/work-orders/WorkOrderPages.tsx";
import { useAuthStore } from "@/stores/useAuthStore.ts";
function AdminOnly({ children }) {
    const role = useAuthStore((state) => state.user?.role);
    if (role !== "SUPER_ADMIN")
        return _jsx("p", { children: "\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." });
    return children;
}
function OrderWriters({ children }) {
    const role = useAuthStore((state) => state.user?.role);
    if (role !== "SUPER_ADMIN" && role !== "ORDER_MANAGER")
        return _jsx("p", { children: "\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." });
    return children;
}
export default function App() {
    return (_jsx(BrowserRouter, { children: _jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }), _jsxs(Route, { element: _jsx(RootLayout, {}), children: [_jsx(Route, { path: "/", element: _jsx(DashboardPage, {}) }), _jsx(Route, { path: "/quotes", element: _jsx(QuoteListPage, {}) }), _jsx(Route, { path: "/quotes/new", element: _jsx(OrderWriters, { children: _jsx(QuoteFormPage, {}) }) }), _jsx(Route, { path: "/quotes/:quotationId", element: _jsx(QuoteDetailPage, {}) }), _jsx(Route, { path: "/orders", element: _jsx(OrderListPage, {}) }), _jsx(Route, { path: "/orders/new", element: _jsx(OrderWriters, { children: _jsx(OrderRegisterPage, {}) }) }), _jsx(Route, { path: "/orders/:orderId", element: _jsx(OrderDetailPage, {}) }), _jsx(Route, { path: "/work-orders", element: _jsx(WorkOrderListPage, {}) }), _jsx(Route, { path: "/work-orders/:workOrderId", element: _jsx(WorkOrderDetailPage, {}) }), _jsx(Route, { path: "/shipping", element: _jsx(ShippingPage, {}) }), _jsx(Route, { path: "/clients", element: _jsx(ClientListPage, {}) }), _jsx(Route, { path: "/clients/new", element: _jsx(OrderWriters, { children: _jsx(ClientFormPage, {}) }) }), _jsx(Route, { path: "/clients/:clientId", element: _jsx(ClientDetailPage, {}) }), _jsx(Route, { path: "/clients/:clientId/edit", element: _jsx(OrderWriters, { children: _jsx(ClientFormPage, {}) }) }), _jsx(Route, { path: "/products", element: _jsx(ProductListPage, {}) }), _jsx(Route, { path: "/products/new", element: _jsx(OrderWriters, { children: _jsx(ProductFormPage, {}) }) }), _jsx(Route, { path: "/products/:productId", element: _jsx(ProductDetailPage, {}) }), _jsx(Route, { path: "/products/:productId/edit", element: _jsx(OrderWriters, { children: _jsx(ProductFormPage, {}) }) }), _jsx(Route, { path: "/lines", element: _jsx(LineListPage, {}) }), _jsx(Route, { path: "/lines/new", element: _jsx(OrderWriters, { children: _jsx(LineFormPage, {}) }) }), _jsx(Route, { path: "/lines/:lineId", element: _jsx(LineDetailPage, {}) }), _jsx(Route, { path: "/lines/:lineId/edit", element: _jsx(AdminOnly, { children: _jsx(LineFormPage, {}) }) }), _jsx(Route, { path: "/calendar", element: _jsx(CalendarPage, {}) }), _jsx(Route, { path: "/admin", element: _jsx(AdminOnly, { children: _jsx(AdminPage, {}) }) }), _jsx(Route, { path: "/assistant", element: _jsx(AssistantPage, {}) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] })] }) }));
}
