import { Box, Building2, ChevronRight, ClipboardList, Factory, LayoutGrid, LogOut, Sparkles, UsersRound } from "lucide-react";
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
  const shipping = db.orders.filter((order) => order.status === "PACKING" || order.status === "PACKED" || order.status === "SHIPPING" || (order.status === "COMPLETED" && order.paymentStatus !== "PAID")).length;
  const location = useLocation();

  return (
    <aside className="sticky top-0 flex h-screen w-[232px] shrink-0 flex-col border-r border-line bg-white px-3 py-4">
      <div className="flex items-center gap-2 px-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-white">
          <LayoutGrid size={16} />
        </span>
        <span className="text-base font-semibold tracking-tight">생산플로우</span>
      </div>
      <button type="button" className="mt-4 flex items-center justify-between rounded-lg bg-canvas px-3 py-2 text-left text-sm">
        <span>본사 · 생산운영팀</span>
        <ChevronRight size={14} className="rotate-90 text-muted" />
      </button>
      <p className="mt-5 px-3 text-[11px] font-semibold tracking-wide text-muted">WORKSPACE</p>
      <nav className="mt-2 flex flex-1 flex-col gap-1">
        <Item to="/" end icon={LayoutGrid} label="대시보드" />
        <Item to="/orders" icon={ClipboardList} label="수주 및 생산기록" badge={orders} active={location.pathname.startsWith("/work-orders") || location.pathname.startsWith("/shipping") || location.pathname.startsWith("/orders/schedule")} />
        <Item to="/orders/schedule" icon={Factory} label="수주 일정 관리" nested />
        <Item to="/work-orders" icon={Factory} label="작업지시 관리" nested />
        <Item to="/shipping" icon={Factory} label="배송 관리" nested badge={shipping} />
        <Item to="/clients" icon={Building2} label="거래처 관리" />
        <Item to="/products" icon={Box} label="생산품목 관리" />
        <Item to="/lines" icon={Factory} label="생산라인" />
        <Item to="/assistant" icon={Sparkles} label="AI 챗봇" />
        {user?.role === "SUPER_ADMIN" ? <Item to="/admin" icon={UsersRound} label="계정 관리" /> : null}
      </nav>
      <div className="space-y-2 px-1 pb-3 text-xs text-muted">
        <div className="rounded-xl bg-canvas p-3">
          <p className="font-semibold text-ink">안전한 내부 업무 공간</p>
          <p className="mt-1">승인된 임직원만 접근할 수 있습니다.</p>
        </div>
        <p>이용 가이드 및 문의</p>
      </div>
      {user ? (
        <div className="flex items-center gap-2 border-t border-line px-2 pt-3">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary">{user.name.slice(0, 1)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{user.name}</span>
            <span className="block truncate text-xs text-muted">{roleLabel[user.role]}</span>
          </span>
          <button type="button" className="text-muted" onClick={logout} aria-label="로그아웃">
            <LogOut size={16} />
          </button>
        </div>
      ) : null}
    </aside>
  );
}

function Item({
  to,
  icon: Icon,
  label,
  end = false,
  badge,
  nested = false,
  active,
}: {
  to: string;
  icon: typeof LayoutGrid;
  label: string;
  end?: boolean;
  badge?: number;
  nested?: boolean;
  active?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-muted",
          nested && "ml-4 py-1.5 text-sm",
          (active || isActive) && "bg-primary-soft font-semibold text-primary",
        )
      }
    >
      {nested ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : <Icon size={16} />}
      <span className="flex-1">{label}</span>
      {badge ? <span className="text-xs text-muted">{badge}</span> : null}
    </NavLink>
  );
}

export function crumbs(pathname: string): string[] {
  if (pathname.startsWith("/orders/schedule")) return ["워크스페이스", "수주 및 생산기록", "수주 일정 관리"];
  if (pathname.startsWith("/work-orders")) return ["워크스페이스", "수주 및 생산기록", "작업지시 관리"];
  if (pathname.startsWith("/shipping")) return ["워크스페이스", "수주 및 생산기록", "배송 관리"];
  if (pathname.startsWith("/orders")) return ["워크스페이스", "수주 및 생산기록"];
  if (pathname.startsWith("/clients")) return ["워크스페이스", "거래처 관리"];
  if (pathname === "/products/new") return ["워크스페이스", "생산품목 관리", "생산품목 등록"];
  if (pathname.endsWith("/edit") && pathname.startsWith("/products/")) return ["워크스페이스", "생산품목 관리", "생산품목 수정"];
  if (/^\/products\/[^/]+$/.test(pathname)) return ["워크스페이스", "생산품목 관리", "생산품목 상세"];
  if (pathname.startsWith("/products")) return ["워크스페이스", "생산품목 관리"];
  if (pathname.startsWith("/lines")) return ["워크스페이스", "생산라인"];
  if (pathname.startsWith("/admin")) return ["워크스페이스", "계정 관리"];
  if (pathname.startsWith("/assistant")) return ["워크스페이스", "AI 챗봇"];
  if (pathname.startsWith("/calendar")) return ["워크스페이스", "대시보드", "생산 캘린더"];
  return ["워크스페이스", "대시보드"];
}
