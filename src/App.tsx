import type { ReactNode } from "react";
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
import { OrderSchedulePage } from "@/pages/orders/OrderSchedulePage.tsx";
import { QuoteDetailPage } from "@/pages/quotes/QuoteDetailPage.tsx";
import { QuoteFormPage } from "@/pages/quotes/QuoteFormPage.tsx";
import { QuoteListPage } from "@/pages/quotes/QuoteListPage.tsx";
import { ProductDetailPage, ProductFormPage, ProductListPage } from "@/pages/products/ProductPages.tsx";
import { ShippingPage } from "@/pages/ShippingPage.tsx";
import { WorkOrderDetailPage, WorkOrderListPage } from "@/pages/work-orders/WorkOrderPages.tsx";
import { useAuthStore } from "@/stores/useAuthStore.ts";

function AdminOnly({ children }: { children: ReactNode }) {
  const role = useAuthStore((state) => state.user?.role);
  if (role !== "SUPER_ADMIN") return <p>권한이 없습니다.</p>;
  return children;
}

function OrderWriters({ children }: { children: ReactNode }) {
  const role = useAuthStore((state) => state.user?.role);
  if (role !== "SUPER_ADMIN" && role !== "ORDER_MANAGER") return <p>권한이 없습니다.</p>;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RootLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/quotes" element={<QuoteListPage />} />
          <Route path="/quotes/new" element={<OrderWriters><QuoteFormPage /></OrderWriters>} />
          <Route path="/quotes/:quotationId" element={<QuoteDetailPage />} />
          <Route path="/orders" element={<OrderListPage />} />
          <Route path="/orders/schedule" element={<OrderSchedulePage />} />
          <Route path="/orders/new" element={<OrderWriters><OrderRegisterPage /></OrderWriters>} />
          <Route path="/orders/:orderId" element={<OrderDetailPage />} />
          <Route path="/work-orders" element={<WorkOrderListPage />} />
          <Route path="/work-orders/:workOrderId" element={<WorkOrderDetailPage />} />
          <Route path="/shipping" element={<ShippingPage />} />
          <Route path="/clients" element={<ClientListPage />} />
          <Route path="/clients/new" element={<OrderWriters><ClientFormPage /></OrderWriters>} />
          <Route path="/clients/:clientId" element={<ClientDetailPage />} />
          <Route path="/clients/:clientId/edit" element={<OrderWriters><ClientFormPage /></OrderWriters>} />
          <Route path="/products" element={<ProductListPage />} />
          <Route path="/products/new" element={<OrderWriters><ProductFormPage /></OrderWriters>} />
          <Route path="/products/:productId" element={<ProductDetailPage />} />
          <Route path="/products/:productId/edit" element={<OrderWriters><ProductFormPage /></OrderWriters>} />
          <Route path="/lines" element={<LineListPage />} />
          <Route path="/lines/new" element={<OrderWriters><LineFormPage /></OrderWriters>} />
          <Route path="/lines/:lineId" element={<LineDetailPage />} />
          <Route path="/lines/:lineId/edit" element={<AdminOnly><LineFormPage /></AdminOnly>} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/admin" element={<AdminOnly><AdminPage /></AdminOnly>} />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
