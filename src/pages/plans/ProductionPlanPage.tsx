import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Badge, PageHeader, tableClass } from "@/components/ui.tsx";
import { readApiErrorMessage } from "@/lib/apiClient.ts";
import { parseISO, todayISO } from "@/lib/dates.ts";
import { workOrderStatusLabel, workOrderTone } from "@/lib/labels.ts";
import { fetchDailyPlans, type DailyPlanRow } from "@/lib/workOrdersApi.ts";
import { useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export function ProductionPlanPage() {
  const user = useAuthStore((state) => state.user);
  const show = useToastStore((state) => state.show);
  const today = todayISO();
  const [cursor, setCursor] = useState(() => {
    const now = parseISO(todayISO());
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [plans, setPlans] = useState<DailyPlanRow[] | null>(null);

  useEffect(() => {
    let ignore = false;
    void fetchDailyPlans().then((rows) => {
      if (!ignore) setPlans(rows);
    }).catch((error: unknown) => {
      if (!ignore) show(readApiErrorMessage(error));
    });
    return () => {
      ignore = true;
    };
  }, [show]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const key = monthKey(year, month);
  const visible = (plans ?? []).filter((plan) => {
    if (!plan.planDate.startsWith(key)) return false;
    if (user?.role === "PRODUCTION_MANAGER") return String(plan.assignedId) === user.id;
    return true;
  });
  const days = new Map<string, DailyPlanRow[]>();
  visible.forEach((plan) => {
    const bucket = days.get(plan.planDate) ?? [];
    bucket.push(plan);
    days.set(plan.planDate, bucket);
  });
  const dates = [...days.keys()].sort();

  return (
    <div>
      <PageHeader
        title="일일 생산계획"
        action={(
          <div className="flex gap-2">
            <button type="button" className="h-10 rounded-lg border border-line bg-white px-3" onClick={() => setCursor(new Date(year, month - 1, 1))}>이전달</button>
            <span className="self-center font-semibold">{year}.{String(month + 1).padStart(2, "0")}</span>
            <button type="button" className="h-10 rounded-lg border border-line bg-white px-3" onClick={() => setCursor(new Date(year, month + 1, 1))}>다음달</button>
          </div>
        )}
      />
      <p className="mb-4 text-sm text-muted">해당 날짜에 잡힌 작업입니다.</p>
      {plans == null ? <p className="text-muted">일일 생산계획을 불러오는 중입니다.</p> : null}
      {plans != null && dates.length === 0 ? <p className="text-muted">이 달에 잡힌 작업이 없습니다.</p> : null}
      <div className="space-y-4">
        {dates.map((date) => {
          const rows = (days.get(date) ?? []).slice().sort((left, right) => left.lineName.localeCompare(right.lineName, "ko") || left.workNo.localeCompare(right.workNo));
          return (
            <section key={date} className="overflow-hidden rounded-xl border border-line bg-white">
              <div className="px-5 py-3">
                <h2 className="text-sm font-semibold">
                  {date} ({weekdays[parseISO(date).getDay()]})
                  {date === today ? <span className="ml-2 text-primary">오늘</span> : null}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className={tableClass}>
                  <thead>
                    <tr className="border-b border-line text-sm text-muted">
                      <th>라인</th>
                      <th>작업지시</th>
                      <th>품목</th>
                      <th>거래처</th>
                      <th>담당</th>
                      <th>계획 수량</th>
                      <th>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.planId}>
                        <td>{row.lineName}</td>
                        <td><Link className="font-semibold text-primary" to={`/work-orders/${row.workOrderId}`}>{row.workNo}</Link></td>
                        <td>{row.productName}</td>
                        <td>{row.clientName}</td>
                        <td>{row.assignedName}</td>
                        <td>{row.quantity.toLocaleString("ko-KR")}개</td>
                        <td><Badge className={workOrderTone(row.status)}>{workOrderStatusLabel[row.status]}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
