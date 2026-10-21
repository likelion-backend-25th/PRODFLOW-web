import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Badge, Button, Card, PageHeader, TextField } from "@/components/ui.tsx";
import { useDb } from "@/lib/db.ts";
import { lineStatusLabel, lineTone } from "@/lib/labels.ts";
import { orderItemsText } from "@/lib/orderText.ts";
import { saveLine, setLineStatus } from "@/lib/workflow.ts";
import { canProduce, useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";
import type { LineStatus } from "@/types/domain.ts";

export function LineListPage() {
  const db = useDb();
  const role = useAuthStore((state) => state.user?.role);
  const running = db.lines.filter((line) => line.status === "RUNNING").length;
  const available = db.lines.filter((line) => line.status === "AVAILABLE").length;
  const stopped = db.lines.filter((line) => line.status === "MAINTENANCE" || line.status === "BROKEN").length;
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">생산라인</h1>
          <p className="mt-1 text-muted">라인별 가동 상태와 진행 수주, 담당 직원을 확인하세요.</p>
        </div>
        {role === "SUPER_ADMIN" ? <Link to="/lines/new" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 font-semibold text-white">+ 라인 등록</Link> : null}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <section className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-muted">전체 라인</p><p className="mt-2 text-2xl font-semibold">{db.lines.length}개</p></section>
        <section className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-muted">가동중</p><p className="mt-2 text-2xl font-semibold">{running}개</p></section>
        <section className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-muted">가동가능</p><p className="mt-2 text-2xl font-semibold">{available}개</p></section>
        <section className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-muted">점검·고장</p><p className="mt-2 text-2xl font-semibold">{stopped}개</p></section>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {db.lines.map((line) => {
          const current = db.workOrders.find((item) => item.lineId === line.id && (item.status === "IN_PRODUCTION" || item.status === "PAUSED"));
          const order = db.orders.find((item) => item.id === current?.orderId);
          const assignee = db.users.find((item) => item.id === current?.assigneeId);
          return (
            <section key={line.id} className="rounded-xl border border-line bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{line.name}</h2>
                <Badge className={lineTone(line.status)}>{lineStatusLabel[line.status]}</Badge>
              </div>
              <dl className="mt-4 space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-muted">가능 케이스</dt><dd className="text-right">{order ? orderItemsText(db.products, order.lines) : "없음"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">진행 수주</dt><dd>{order?.orderNo ?? "없음"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">담당 직원</dt><dd>{assignee?.name ?? "미지정"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">하루 생산량</dt><dd>{line.dailyCapacity.toLocaleString("ko-KR")}개</dd></div>
              </dl>
              <p className="mt-4 text-sm font-semibold text-primary">
                {current ? `${current.status === "PAUSED" ? "일시정지 · " : ""}${current.quantity.toLocaleString("ko-KR")}개 · 완료 예정 ${current.plannedEndDate}` : "진행 중인 작업 없음"}
              </p>
              <Link to={`/lines/${line.id}`} className="mt-4 inline-flex h-10 items-center rounded-lg border border-line px-3 text-sm">라인 상세 →</Link>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function LineFormPage() {
  const { lineId } = useParams();
  const db = useDb();
  const navigate = useNavigate();
  const show = useToastStore((state) => state.show);
  const current = db.lines.find((line) => line.id === lineId);
  const [name, setName] = useState(current?.name ?? "");
  const [dailyCapacity, setDailyCapacity] = useState(current?.dailyCapacity ?? 500);
  return (
    <div>
      <PageHeader title={current ? "라인 정보 수정" : "라인 등록"} />
      <form className="grid max-w-md gap-3" onSubmit={(event) => {
        event.preventDefault();
        try {
          saveLine({ id: current?.id, name, dailyCapacity });
          show("라인 정보를 저장했습니다.");
          navigate("/lines");
        } catch (error: unknown) {
          show(error instanceof Error ? error.message : "저장하지 못했습니다.");
        }
      }}>
        <TextField label="라인 이름" value={name} onChange={(event) => setName(event.target.value)} />
        <TextField label="하루 생산량" type="number" value={dailyCapacity} onChange={(event) => setDailyCapacity(Number(event.target.value))} />
        <Button type="submit">저장</Button>
      </form>
    </div>
  );
}

export function LineDetailPage() {
  const { lineId = "" } = useParams();
  const db = useDb();
  const role = useAuthStore((state) => state.user?.role);
  const show = useToastStore((state) => state.show);
  const line = db.lines.find((item) => item.id === lineId);
  if (!line) return <p>라인을 찾을 수 없습니다.</p>;
  const current = db.workOrders.find((item) => item.lineId === line.id && (item.status === "IN_PRODUCTION" || item.status === "PAUSED"));
  return (
    <div className="space-y-4">
      <PageHeader title={line.name} action={role === "SUPER_ADMIN" ? <Link to={`/lines/${line.id}/edit`}><Button tone="ghost">생산량 수정</Button></Link> : null} />
      <Card>
        <p>하루 생산량 {line.dailyCapacity.toLocaleString("ko-KR")}개</p>
        <p className="mt-2">현재 작업 {current ? db.orders.find((order) => order.id === current.orderId)?.orderNo : "없음"}</p>
        {canProduce(role) ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {(["AVAILABLE", "MAINTENANCE", "BROKEN"] as LineStatus[]).map((status) => (
              <Button key={status} tone="ghost" onClick={() => {
                try {
                  setLineStatus(line.id, status);
                  show("라인 상태를 변경했습니다. 점검·고장 라인은 공장 생산량에서 빠집니다.");
                } catch (error: unknown) {
                  show(error instanceof Error ? error.message : "변경하지 못했습니다.");
                }
              }}>{lineStatusLabel[status]}</Button>
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
