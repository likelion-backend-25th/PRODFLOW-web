import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { NotificationBell } from "@/components/NotificationBell.tsx";
import { Sidebar } from "@/components/layout/Sidebar.tsx";
import { crumbs } from "@/lib/crumbs.ts";
import { expireUnpaidOrders } from "@/lib/workflow.ts";
import { useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";

export function RootLayout() {
  const user = useAuthStore((state) => state.user);
  const message = useToastStore((state) => state.message);
  const show = useToastStore((state) => state.show);
  const clear = useToastStore((state) => state.clear);
  const { pathname } = useLocation();

  useEffect(() => {
    const expired = expireUnpaidOrders();
    if (expired > 0) show(`계약금 입금 마감일이 지난 대기 수주 ${expired}건을 취소하고 일정을 되돌렸습니다.`);
  }, [show]);

  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
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
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 px-6 py-6">
          <Outlet />
        </main>
        <footer className="flex items-center justify-between px-6 py-4 text-xs text-muted">
          <span>© 2026 PRODFLOW · 내부 업무 전용</span>
          <span>권한에 따라 업무 데이터가 표시됩니다.</span>
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