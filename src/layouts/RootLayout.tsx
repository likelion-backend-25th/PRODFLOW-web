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
    if (expired > 0) show(`계약금 입금 마감일이 지난 대기 수주 ${expired}건을 취소하고 일정을 되돌렸습니다.`);
  }, [show]);

  useEffect(() => {
    if (revoked) {
      logout();
      show("계정이 비활성화되어 로그아웃했습니다. 최고 관리자에게 문의하세요.");
    } else if (account && user && (account.role !== user.role || account.name !== user.name)) {
      refresh();
    }
  }, [revoked, account, user, logout, refresh, show]);

  if (!user || revoked) return <Navigate to="/login" replace />;
  const trail = crumbs(pathname);

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-line bg-white px-6">
          <p className="flex items-center gap-2 text-sm text-muted">
            {trail.map((item, index) => (
              <span key={item} className="flex items-center gap-2">
                {index > 0 ? <span>›</span> : null}
                <span className={index === trail.length - 1 ? "font-semibold text-ink" : ""}>{item}</span>
              </span>
            ))}
          </p>
          <div className="flex items-center gap-4 text-sm text-muted">
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-success" />내부 네트워크 연결됨</span>
            <Bell size={16} />
            <Link to="/" className="rounded-full bg-primary-soft px-2 py-1 text-xs font-semibold text-primary" title="지연·위험 수주">알림 {alerts}</Link>
          </div>
        </header>
        <main className="flex-1 px-6 py-6">
          <Outlet />
        </main>
        <footer className="flex items-center justify-between px-6 py-4 text-xs text-muted">
          <span>© 2026 PRODFLOW · 내부 업무 전용</span>
          <span>모든 데이터는 디자인 검토용 가상 데이터입니다.</span>
        </footer>
      </div>
      {message ? (
        <button type="button" className="fixed right-6 bottom-6 rounded-lg bg-ink px-4 py-3 text-white" onClick={clear}>
          {message}
        </button>
      ) : null}
    </div>
  );
}