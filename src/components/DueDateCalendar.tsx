import { useEffect, useState } from "react";
import { cn } from "@/lib/cn.ts";
import { todayISO } from "@/lib/dates.ts";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

function monthCells(year: number, month: number): Array<string | null> {
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: Array<string | null> = [
    ...Array.from({ length: first }, () => null),
    ...Array.from({ length: days }, (_, index) => `${year}-${String(month + 1).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function DueDateCalendar({
  value,
  earliest,
  latest,
  ready,
  emptyHint,
  onChange,
}: {
  value: string;
  earliest: string | null;
  latest?: string | null;
  ready: boolean;
  emptyHint?: string;
  onChange: (iso: string) => void;
}) {
  const today = todayISO();
  const [cursor, setCursor] = useState(() => {
    const base = value || today;
    const [year, month] = base.split("-").map(Number);
    return { year: year ?? new Date().getFullYear(), month: (month ?? 1) - 1 };
  });

  useEffect(() => {
    if (!value) return;
    const [year, month] = value.split("-").map(Number);
    if (!year || !month) return;
    setCursor({ year, month: month - 1 });
  }, [value]);

  const cells = monthCells(cursor.year, cursor.month);
  const thisMonth = today.slice(0, 7);
  const cursorMonth = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}`;

  function shift(delta: number) {
    const next = new Date(cursor.year, cursor.month + delta, 1);
    const key = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    if (key < thisMonth) return;
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
  }

  return (
    <div className="mt-1 rounded-lg border border-line bg-white p-3">
      <div className="flex items-center justify-between">
        <button type="button" className="h-8 w-8 rounded-md text-muted hover:bg-canvas disabled:opacity-30" aria-label="이전 달" disabled={cursorMonth <= thisMonth} onClick={() => shift(-1)}>‹</button>
        <p className="text-sm font-semibold">{cursor.year}년 {cursor.month + 1}월</p>
        <button type="button" className="h-8 w-8 rounded-md text-muted hover:bg-canvas" aria-label="다음 달" onClick={() => shift(1)}>›</button>
      </div>
      <div className="mt-2 grid grid-cols-7 text-center text-[11px] text-muted">
        {weekdays.map((day) => <span key={day} className="py-1">{day}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((iso, index) => {
          if (!iso) return <span key={`empty-${index}`} />;
          const past = iso < today;
          const isToday = iso === today;
          const inRange = (earliest === null || iso >= earliest) && (latest == null || iso <= latest);
          const possible = ready && (earliest !== null || latest != null) && inRange && !past;
          const impossible = ready && !possible;
          const blocked = past || !possible;
          return (
            <button
              key={iso}
              type="button"
              disabled={blocked}
              aria-pressed={iso === value}
              aria-label={iso}
              className={cn(
                "h-8 rounded-md text-xs",
                isToday && "bg-violet-200 font-semibold text-violet-950",
                !isToday && possible && "bg-sky-100 text-sky-950 hover:bg-sky-200",
                !isToday && impossible && "bg-rose-100 text-rose-900",
                !isToday && !possible && !impossible && "bg-canvas text-muted",
                blocked && "cursor-not-allowed opacity-70",
                isToday && possible && "hover:bg-violet-300",
                iso === value && "ring-2 ring-ink",
              )}
              onClick={() => onChange(iso)}
            >
              {Number(iso.slice(-2))}
            </button>
          );
        })}
      </div>
      <p className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-violet-200 ring-1 ring-violet-300" />오늘</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-sky-100 ring-1 ring-sky-200" />가능</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-rose-100 ring-1 ring-rose-200" />불가</span>
        {!ready && emptyHint ? <span>{emptyHint}</span> : null}
      </p>
    </div>
  );
}
