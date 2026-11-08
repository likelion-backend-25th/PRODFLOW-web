import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { readApiErrorMessage } from "@/lib/apiClient.ts";
import { localDateTime } from "@/lib/dates.ts";
import { cn } from "@/lib/cn.ts";
import { fetchLineNotifications, fetchOrderNotifications, fetchUnreadCount, markNoticeRead, type NoticeItem } from "@/lib/notificationApi.ts";

export function NotificationBell() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [items, setItems] = useState<NoticeItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    void fetchUnreadCount().then((value) => {
      if (!ignore) setCount(value);
    }).catch(() => {
      if (!ignore) setCount(null);
    });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function refreshCount() {
    try {
      setCount(await fetchUnreadCount());
    } catch {
      setCount(null);
    }
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    setLoading(true);
    setError(null);
    try {
      const [lines, orders] = await Promise.all([fetchLineNotifications(), fetchOrderNotifications()]);
      const merged = [...lines, ...orders].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      setItems(merged);
    } catch (reason: unknown) {
      setItems([]);
      setError(readApiErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  }

  async function read(item: NoticeItem) {
    if (item.isRead) return;
    const key = `${item.source}-${item.id}`;
    setPendingId(key);
    try {
      await markNoticeRead(item);
      setItems((current) => current?.map((row) => row.source === item.source && row.id === item.id ? { ...row, isRead: true } : row) ?? current);
      await refreshCount();
    } catch (reason: unknown) {
      setError(readApiErrorMessage(reason));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button type="button" className="relative grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-canvas" aria-expanded={open} aria-label={count == null ? "알림" : `알림 ${count}건`} onClick={() => void toggle()}>
        <Bell size={16} />
        {count != null && count > 0 ? (
          <span className="absolute -top-1 -right-1 min-w-5 rounded-full bg-danger px-1 text-center text-xs font-semibold leading-5 text-white">{count > 99 ? "99+" : count}</span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line bg-white shadow-lg">
          <div className="border-b border-line px-4 py-3">
            <p className="font-semibold">알림</p>
            <p className="text-sm text-muted">{count == null ? "읽지 않은 알림 수를 불러오지 못했습니다." : `읽지 않은 알림 ${count}건`}</p>
          </div>
          {loading ? <p className="px-4 py-6 text-sm text-muted">알림을 불러오는 중입니다.</p> : null}
          {error ? <p className="px-4 py-3 text-sm text-danger">{error}</p> : null}
          {!loading && items && items.length === 0 && !error ? <p className="px-4 py-6 text-sm text-muted">알림이 없습니다.</p> : null}
          {items && items.length > 0 ? (
            <ul className="max-h-96 overflow-auto">
              {items.map((item) => {
                const key = `${item.source}-${item.id}`;
                return (
                  <li key={key} className="border-b border-line last:border-b-0">
                    <button type="button" className={cn("flex w-full gap-3 px-4 py-3 text-left hover:bg-canvas", !item.isRead && "bg-primary-soft/40")} disabled={pendingId === key} onClick={() => void read(item)}>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold text-primary">{item.typeLabel}</span>
                        <span className="mt-0.5 block text-sm font-semibold">{item.title}</span>
                        <span className="mt-0.5 block text-sm text-muted">{item.message}</span>
                        <span className="mt-1 block text-xs text-muted">{localDateTime(item.createdAt)}</span>
                      </span>
                      <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", item.isRead ? "bg-line" : "bg-primary")} aria-label={item.isRead ? "읽음" : "안 읽음"} />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
