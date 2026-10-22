import { useState } from "react";
import { Link } from "react-router";
import { Button, Card, PageHeader } from "@/components/ui.tsx";
import { useDb } from "@/lib/db.ts";
import { orderStatusLabel } from "@/lib/labels.ts";
import { factoryCapacity, isWorkingDay, occupiedOn, occupiesFactory } from "@/lib/schedule.ts";
import { canManageOrders, useAuthStore } from "@/stores/useAuthStore.ts";

export function CalendarPage() {
  const db = useDb();
  const role = useAuthStore((state) => state.user?.role);
  const now = new Date();
  const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [selected, setSelected] = useState<string | null>(null);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const holidays = db.holidays.map((holiday) => holiday.date);
  const cells = Array.from({ length: first.getDay() + days }, (_, index) => {
    if (index < first.getDay()) return null;
    const day = index - first.getDay() + 1;
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return iso;
  });
  const selectedOrders = selected ? db.orders.filter((order) => occupiesFactory(order.status) && order.allocations.some((slot) => slot.date === selected)) : [];
  const selectedWorking = selected ? isWorkingDay(selected, holidays) : false;
  const selectedCapacity = selectedWorking ? factoryCapacity(db.lines) : 0;
  const selectedUsed = selected ? occupiedOn(selected, db.orders) : 0;

  return (
    <div>
      <PageHeader title="생산 캘린더" action={
        <div className="flex gap-2">
          <button type="button" className="h-10 rounded-lg border border-line bg-white px-3" onClick={() => setCursor(new Date(year, month - 1, 1))}>이전달</button>
          <span className="self-center font-semibold">{year}.{String(month + 1).padStart(2, "0")}</span>
          <button type="button" className="h-10 rounded-lg border border-line bg-white px-3" onClick={() => setCursor(new Date(year, month + 1, 1))}>다음달</button>
        </div>
      } />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="p-4">
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-line">
            {["일", "월", "화", "수", "목", "금", "토"].map((label) => <div key={label} className="bg-canvas px-2 py-2 text-muted">{label}</div>)}
            {cells.map((iso, index) => {
              if (!iso) return <div key={`empty-${index}`} className="min-h-28 bg-white" />;
              const working = isWorkingDay(iso, holidays);
              const capacity = working ? factoryCapacity(db.lines) : 0;
              const used = occupiedOn(iso, db.orders);
              const orders = db.orders.filter((order) => occupiesFactory(order.status) && order.allocations.some((slot) => slot.date === iso));
              return (
                <button key={iso} type="button" className={`min-h-28 bg-white p-2 text-left ${selected === iso ? "ring-2 ring-primary ring-inset" : ""}`} onClick={() => setSelected(iso)}>
                  <p className="font-semibold">{Number(iso.slice(8))}</p>
                  <p className="text-xs text-muted">{working ? `잔여 ${Math.max(0, capacity - used)}` : "휴무"}</p>
                  {orders.slice(0, 2).map((order) => <span key={order.id} className="mt-1 block truncate rounded-full bg-primary-soft px-2 text-xs text-primary">{order.orderNo}</span>)}
                </button>
              );
            })}
          </div>
        </Card>
        <Card className="sticky top-6 space-y-3">
          {selected ? (
            <>
              <h2 className="font-semibold">{selected}</h2>
              <p className="text-muted">{selectedWorking ? `잔여 ${Math.max(0, selectedCapacity - selectedUsed).toLocaleString("ko-KR")}개 / ${selectedCapacity.toLocaleString("ko-KR")}개` : "휴무일입니다."}</p>
              <ul className="space-y-2">
                {selectedOrders.length === 0 ? <li className="text-muted">이 날짜에 잡힌 수주가 없습니다.</li> : null}
                {selectedOrders.map((order) => (
                  <li key={order.id} className="flex items-center justify-between gap-2">
                    <Link className="font-semibold text-primary" to={`/orders/${order.id}`}>{order.orderNo}</Link>
                    <span className="text-muted">{orderStatusLabel[order.status]}</span>
                  </li>
                ))}
              </ul>
              {canManageOrders(role) ? <Link to="/orders/new"><Button className="w-full">수주 등록</Button></Link> : null}
            </>
          ) : (
            <p className="text-muted">날짜를 누르면 그날의 수주와 남은 생산량이 열립니다.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
