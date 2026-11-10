import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge, Card, PageHeader } from "@/components/ui.tsx";
import { apiStatus, readApiErrorMessage } from "@/lib/apiClient.ts";
import { cn } from "@/lib/cn.ts";
import { isWeekend, parseISO, todayISO } from "@/lib/dates.ts";
import { workOrderStatusLabel, workOrderTone } from "@/lib/labels.ts";
import { asWorkOrderStatus, fetchProductionDays, schedulesOnDate, workOrderSpans, type ProductionSchedule } from "@/lib/productionCalenderApi.ts";
import type { WorkOrderStatus } from "@/types/domain.ts";

const barStatuses: WorkOrderStatus[] = ["PREPARE", "PRODUCE", "SUSPEND", "PACK"];
// 칸 높이를 유지한 채 두 줄까지 보여주고, 나머지는 날짜의 +N건으로 넘긴다.
const shownLanes = 2;
const weekdayNames = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
function monthOrders(rows: ProductionSchedule[], year: number, month: number): ProductionSchedule[] {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const unique = new Map<number, ProductionSchedule>();
  for (const row of rows) {
    if (!row.plannedStartDate.startsWith(prefix)) continue;
    if (!unique.has(row.workOrderId)) unique.set(row.workOrderId, row);
  }
  return [...unique.values()];
}

function countStatus(rows: ProductionSchedule[], status: WorkOrderStatus): number {
  return rows.filter((row) => row.status === status).length;
}

export function CalendarPage() {
  const today = todayISO();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selected, setSelected] = useState<string | null>(today);
  const [schedules, setSchedules] = useState<ProductionSchedule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const leading = first.getDay();
  const cells: Array<string | null> = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: days }, (_, index) => `${year}-${String(month + 1).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  const monthRows = schedules ? monthOrders(schedules, year, month) : null;
  const gridRows = (schedules ?? []).filter((row) => row.status === "PREPARE" || row.status === "PRODUCE" || row.status === "PACK" || row.status === "SUSPEND");
  const spans = workOrderSpans(gridRows);
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const selectedInMonth = selected?.startsWith(monthPrefix) ? selected : null;
  const selectedJobs = selectedInMonth ? schedulesOnDate(spans, selectedInMonth).map((job) => {
    const day = schedulesOnDate(gridRows, selectedInMonth).find((row) => row.workOrderId === job.workOrderId);
    return day ? { ...job, quantity: day.quantity } : job;
  }) : [];
  const selectedDate = selectedInMonth ? parseISO(selectedInMonth) : null;

  useEffect(() => {
    let ignore = false;
    void fetchProductionDays().then((rows) => {
      if (ignore) return;
      setSchedules(rows);
      setError(null);
    }).catch((reason: unknown) => {
      if (ignore || apiStatus(reason) === 401) return;
      setSchedules([]);
      setError(readApiErrorMessage(reason));
    });
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <div className="flex min-h-[calc(100dvh-9.5rem)] flex-col lg:h-[calc(100dvh-9.5rem)]">
      <PageHeader title="생산 캘린더" action={
        <div className="flex items-center gap-1">
          <button type="button" aria-label="이전 달" className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-white text-muted hover:bg-canvas" onClick={() => setCursor(new Date(year, month - 1, 1))}>
            <ChevronLeft size={16} />
          </button>
          <button type="button" className="h-10 min-w-24 rounded-lg bg-primary-soft px-3 font-semibold text-primary" onClick={() => { const now = parseISO(today); setCursor(new Date(now.getFullYear(), now.getMonth(), 1)); setSelected(today); }}>
            {year}.{String(month + 1).padStart(2, "0")}
          </button>
          <button type="button" aria-label="다음 달" className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-white text-muted hover:bg-canvas" onClick={() => setCursor(new Date(year, month + 1, 1))}>
            <ChevronRight size={16} />
          </button>
        </div>
      } />
      <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Summary label="이번 달 작업지시" value={monthRows ? `${monthRows.length}건` : null} />
        <Summary label="생산 진행 중" value={monthRows ? `${countStatus(monthRows, "PRODUCE")}건` : null} />
        <Summary label="포장 대기" value={monthRows ? `${countStatus(monthRows, "PACK")}건` : null} />
        <Summary label="작업 완료" value={monthRows ? `${countStatus(monthRows, "PACK_DONE")}건` : null} />
      </div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <ul className="flex flex-wrap items-center gap-3">
          {barStatuses.map((status) => (
            <li key={status} className="flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-full", workOrderTone(status))} />
              {workOrderStatusLabel[status]}
            </li>
          ))}
        </ul>
        <p>날짜를 누르면 그날의 작업지시가 오른쪽에 열립니다.</p>
      </div>
      {schedules == null ? <p className="mb-3 text-sm text-muted">생산 일정을 불러오는 중입니다.</p> : null}
      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
      <div className="grid min-h-0 flex-1 items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="flex min-h-[32rem] flex-1 flex-col overflow-hidden p-0">
          <div className="grid grid-cols-7 border-b border-line bg-canvas px-2 py-2 text-sm text-muted">
            {["일", "월", "화", "수", "목", "금", "토"].map((label) => <div key={label} className="px-1">{label}</div>)}
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-x-auto">
            <div className="flex min-h-full min-w-[760px] flex-1 flex-col">
              {weeks.map((week, weekIndex) => (
                <WeekRow
                  key={weekIndex}
                  week={week}
                  rows={spans}
                  selected={selectedInMonth}
                  today={today}
                  onSelect={setSelected}
                />
              ))}
            </div>
          </div>
        </Card>
        <Card className="flex h-full min-h-80 flex-col">
          {selected && selectedDate ? (
            <>
              <p className="text-sm text-muted">{selectedDate.getFullYear()}년 {selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일</p>
              <h2 className="text-lg font-semibold">{weekdayNames[selectedDate.getDay()]}</h2>
              <p className="mt-1 text-sm text-muted">작업지시 {selectedJobs.length}건</p>
              {selectedJobs.length === 0 ? (
                <div className="mt-4 flex flex-1 flex-col items-center justify-center rounded-lg bg-canvas px-4 py-10 text-center">
                  <p className="font-semibold">등록된 작업지시가 없습니다.</p>
                  <p className="mt-1 text-sm text-muted">이 날짜의 생산계획이 없습니다.</p>
                </div>
              ) : (
                <ul className="mt-4 min-h-0 flex-1 space-y-2 overflow-auto">
                  {selectedJobs.map((job) => {
                    const status = asWorkOrderStatus(job.status);
                    return (
                      <li key={job.workOrderId}>
                        <Link to={`/work-orders/${job.workOrderId}`} className="block rounded-lg border border-line px-3 py-2 hover:bg-primary-soft/40">
                          <span className="flex items-start justify-between gap-2">
                            <span className="font-semibold text-primary">{job.workNo}</span>
                            {status ? <Badge className={workOrderTone(status)}>{workOrderStatusLabel[status]}</Badge> : <span className="text-sm text-muted">{job.status}</span>}
                          </span>
                          <span className="mt-1 block text-sm">{job.productName}</span>
                          <span className="mt-0.5 block text-sm text-muted">{job.orderNo} · {job.lineName} · {job.quantity.toLocaleString("ko-KR")}개</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center rounded-lg bg-canvas px-4 py-10 text-center">
              <p className="font-semibold">날짜를 선택해 주세요.</p>
              <p className="mt-1 text-sm text-muted">선택한 날짜의 작업지시가 여기에 표시됩니다.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-xl border border-line bg-white px-4 py-3">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value ?? "—"}</p>
    </div>
  );
}

function assignLanes(segments: Array<{ start: string; end: string }>): number[] {
  const ends: string[] = [];
  return segments.map((segment) => {
    const lane = ends.findIndex((end) => end < segment.start);
    if (lane === -1) {
      ends.push(segment.end);
      return ends.length - 1;
    }
    ends[lane] = segment.end;
    return lane;
  });
}

function weekSegments(week: Array<string | null>, rows: ProductionSchedule[]) {
  const dates = week.filter((day): day is string => day != null);
  const first = dates[0];
  const last = dates.at(-1);
  if (!first || !last) return [];
  return rows.flatMap((row) => {
    if (row.plannedEndDate < first || row.plannedStartDate > last) return [];
    const start = row.plannedStartDate < first ? first : row.plannedStartDate;
    const end = row.plannedEndDate > last ? last : row.plannedEndDate;
    const startCol = week.indexOf(start) + 1;
    const endCol = week.indexOf(end) + 2;
    if (startCol < 1) return [];
    return [{
      row,
      start,
      end,
      startCol,
      endCol,
      continuesBefore: row.plannedStartDate < start,
      continuesAfter: row.plannedEndDate > end,
    }];
  }).sort((left, right) => left.start.localeCompare(right.start) || right.end.localeCompare(left.end) || left.row.workNo.localeCompare(right.row.workNo));
}

function WeekRow({
  week,
  rows,
  selected,
  today,
  onSelect,
}: {
  week: Array<string | null>;
  rows: ProductionSchedule[];
  selected: string | null;
  today: string;
  onSelect: (iso: string) => void;
}) {
  const segments = weekSegments(week, rows);
  const lanes = assignLanes(segments);
  const visible: Array<{ segment: (typeof segments)[number]; lane: number }> = [];
  const hidden = new Map<string, number>();
  segments.forEach((segment, index) => {
    const lane = lanes[index] ?? 0;
    if (lane < shownLanes) {
      visible.push({ segment, lane });
      return;
    }
    for (const iso of week) {
      if (!iso || iso < segment.start || iso > segment.end) continue;
      hidden.set(iso, (hidden.get(iso) ?? 0) + 1);
    }
  });

  return (
    <div className="relative grid min-h-[7.5rem] flex-1 grid-cols-7 border-b border-line last:border-b-0">
      {week.map((iso, index) => {
        if (!iso) return <div key={`empty-${index}`} className="border-r border-line bg-canvas/40 last:border-r-0" />;
        const extra = hidden.get(iso) ?? 0;
        return (
          <button
            key={iso}
            type="button"
            className={cn(
              "flex h-full flex-col items-start border-r border-line px-2 py-2 text-left last:border-r-0",
              selected === iso && "bg-primary-soft/50",
              isWeekend(iso) && selected !== iso && "bg-canvas/60",
            )}
            onClick={() => onSelect(iso)}
          >
            <span className="flex w-full items-center justify-between gap-1">
              <span className={cn(
                "inline-flex h-7 w-7 items-center justify-center text-sm font-semibold",
                iso === today && "rounded-full bg-primary text-white",
              )}>
                {Number(iso.slice(8))}
              </span>
              {extra > 0 ? <span className="text-xs font-semibold text-primary">+{extra}건</span> : null}
            </span>
          </button>
        );
      })}
      {visible.length > 0 ? (
        <div className="pointer-events-none absolute inset-x-0 grid grid-cols-7 content-start gap-y-1 px-1" style={{ top: "2.75rem", gridTemplateRows: `repeat(${shownLanes}, 2.25rem)` }}>
          {visible.map(({ segment, lane }) => {
            const status = asWorkOrderStatus(segment.row.status);
            return (
              <Link
                key={`${segment.row.workOrderId}-${segment.start}`}
                to={`/work-orders/${segment.row.workOrderId}`}
                title={`${segment.row.workNo} · ${segment.row.productName} · ${segment.row.plannedStartDate} ~ ${segment.row.plannedEndDate}`}
                className={cn(
                  "pointer-events-auto mx-0.5 flex items-center truncate rounded-md px-2 text-left text-sm font-semibold",
                  segment.continuesBefore && "rounded-l-none",
                  segment.continuesAfter && "rounded-r-none",
                  status ? workOrderTone(status) : "bg-canvas text-ink",
                )}
                style={{ gridColumn: `${segment.startCol} / ${segment.endCol}`, gridRow: lane + 1 }}
              >
                {segment.continuesBefore ? segment.row.workNo : `${segment.row.workNo} ${segment.row.productName}`}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
