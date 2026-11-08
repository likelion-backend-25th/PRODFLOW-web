import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { readApiErrorMessage } from "@/lib/apiClient.ts";
import { localDateTime } from "@/lib/dates.ts";
import { cn } from "@/lib/cn.ts";
import { fetchLineNotifications, fetchOrderNotifications, fetchUnreadCount, markNoticeRead, notificationsChangedEvent, type NoticeItem } from "@/lib/notificationApi.ts";

const unreadPollMs = 30_000;

export function NotificationBell() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [items, setItems] = useState<NoticeItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [dot, setDot] = useState(false);

  const openRef = useRef(open);
  openRef.current = open;
  const countRef = useRef(count);
  countRef.current = count;
  const previousCount = useRef<number | null>(null);
  const dotGen = useRef(0);
  const unreadGen = useRef(0);
  const unreadTask = useRef<Promise<number | null> | null>(null);
  const listGen = useRef(0);
  const listTask = useRef<Promise<void> | null>(null);
  const listLoadedAt = useRef(0);

  function refreshCount(force = false): Promise<number | null> {
    if (!force && unreadTask.current) return unreadTask.current;
    const gen = ++unreadGen.current;
    const seenDot = dotGen.current;
    const task = fetchUnreadCount()
      .then((value) => {
        if (unreadGen.current !== gen) return null;
        const baseline = previousCount.current;
        previousCount.current = value;
        setCount(value);
        const arrived = baseline == null ? value > 0 : value > baseline;
        const dismissedDuringFetch = dotGen.current !== seenDot;
        if (value === 0) setDot(false);
        else if (arrived && !dismissedDuringFetch) setDot(true);
        return value;
      })
      .catch(() => (unreadGen.current === gen ? countRef.current : null))
      .finally(() => {
        if (unreadTask.current === task) unreadTask.current = null;
      });
    unreadTask.current = task;
    return task;
  }

  function loadNotices(force = false): Promise<void> {
    if (!force && listTask.current) return listTask.current;
    if (!force && Date.now() - listLoadedAt.current < 1500) return Promise.resolve();
    const gen = ++listGen.current;
    const task = Promise.all([fetchLineNotifications(), fetchOrderNotifications()])
      .then(([lines, orders]) => {
        if (listGen.current !== gen) return;
        setItems([...lines, ...orders].sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
        setError(null);
        listLoadedAt.current = Date.now();
      })
      .finally(() => {
        if (listTask.current === task) listTask.current = null;
      });
    listTask.current = task;
    return task;
  }

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;

    function clearTimer() {
      if (timer == null) return;
      window.clearInterval(timer);
      timer = undefined;
    }

    function startTimer() {
      clearTimer();
      if (document.visibilityState !== "visible") return;
      timer = window.setInterval(() => {
        if (stopped || document.visibilityState !== "visible") return;
        const before = countRef.current;
        void refreshCount().then((next) => {
          if (stopped || !openRef.current || next == null || next === before) return;
          void loadNotices(true).catch((reason: unknown) => {
            if (!stopped) setError(readApiErrorMessage(reason));
          });
        });
      }, unreadPollMs);
    }

    void refreshCount();
    startTimer();

    function onVisible() {
      if (document.visibilityState !== "visible") {
        clearTimer();
        return;
      }
      const before = countRef.current;
      void refreshCount().then((next) => {
        if (stopped || !openRef.current || next == null || next === before) return;
        void loadNotices(true).catch((reason: unknown) => {
          if (!stopped) setError(readApiErrorMessage(reason));
        });
      });
      startTimer();
    }

    function onChanged() {
      void refreshCount(true);
      void loadNotices(true).catch((reason: unknown) => {
        if (!stopped) setError(readApiErrorMessage(reason));
      });
    }

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(notificationsChangedEvent, onChanged);
    return () => {
      stopped = true;
      clearTimer();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(notificationsChangedEvent, onChanged);
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

  function hideDot() {
    dotGen.current += 1;
    setDot(false);
  }

  async function toggle() {
    const next = !open;
    hideDot();
    setOpen(next);
    if (!next) return;
    const fresh = Date.now() - listLoadedAt.current < 1500 && items != null;
    if (fresh) return;
    setLoading(items == null);
    setError(null);
    try {
      await loadNotices();
    } catch (reason: unknown) {
      setItems((current) => current ?? []);
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
      await refreshCount(true);
    } catch (reason: unknown) {
      setError(readApiErrorMessage(reason));
    } finally {
      setPendingId(null);
    }
  }

  async function readAll() {
    if (pendingId != null) return;
    setPendingId("all");
    setError(null);
    try {
      const [lines, orders] = await Promise.all([fetchLineNotifications(), fetchOrderNotifications()]);
      const current = [...lines, ...orders].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      const unread = current.filter((row) => !row.isRead);
      await Promise.all(unread.map((row) => markNoticeRead(row)));
      setItems(current.map((row) => ({ ...row, isRead: true })));
      listLoadedAt.current = Date.now();
      await refreshCount(true);
      hideDot();
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
        {dot ? (
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-danger" aria-hidden="true" />
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line bg-white shadow-lg">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <p className="text-sm text-muted">{count == null ? "읽지 않은 알림 수를 불러오지 못했습니다." : `읽지 않은 알림 ${count}건`}</p>
            <button type="button" className="shrink-0 text-sm font-semibold text-primary disabled:text-muted" disabled={count == null || count === 0 || pendingId != null} onClick={() => void readAll()}>
              모두 읽음
            </button>
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
                    <button type="button" className={cn("flex w-full gap-3 px-4 py-3 text-left hover:bg-canvas", !item.isRead && "bg-primary-soft/40")} disabled={pendingId === key || pendingId === "all"} onClick={() => void read(item)}>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold text-primary">{item.typeLabel}</span>
                        <span className="mt-0.5 block text-sm font-semibold">{item.title}</span>
                        <span className="mt-0.5 block text-sm text-muted">{item.message}</span>
                        <span className="mt-1 block text-xs text-muted">{localDateTime(item.createdAt)}</span>
                      </span>
                      <span className="mt-1 flex shrink-0 items-center gap-1 text-xs text-muted">
                        <span className={cn("h-2 w-2 rounded-full", item.isRead ? "bg-line" : "bg-primary")} aria-hidden="true" />
                        {item.isRead ? "읽음" : "안 읽음"}
                      </span>
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
