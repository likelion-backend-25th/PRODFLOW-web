import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { AddressPicker } from "@/components/AddressPicker.tsx";
import { Button, Card, PageHeader, TextField } from "@/components/ui.tsx";
import { localDate } from "@/lib/dates.ts";
import { useDb } from "@/lib/db.ts";
import { digitsOnly } from "@/lib/money.ts";
import { importClients, saveClient } from "@/lib/workflow.ts";
import { canManageOrders, useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";

const template = "사업자등록번호,회사명,대표자,주소,대표전화,담당자명,담당자휴대번호,세금계산서이메일\n";

export function ClientListPage() {
  const db = useDb();
  const role = useAuthStore((state) => state.user?.role);
  const show = useToastStore((state) => state.show);
  const [keyword, setKeyword] = useState("");
  const [result, setResult] = useState("");
  const rows = db.clients.filter((client) => `${client.companyName} ${client.representative} ${client.phone} ${client.address}`.includes(keyword.trim()));
  const [selectedId, setSelectedId] = useState(rows[0]?.id ?? "");
  const selected = db.clients.find((client) => client.id === selectedId) ?? rows[0];
  const month = new Date().toLocaleDateString("en-CA").slice(0, 7);
  const traded = new Set(db.orders.filter((order) => order.createdAt.startsWith(month)).map((order) => order.clientId)).size;
  const ordersOf = (clientId: string) => db.orders.filter((order) => order.clientId === clientId && order.status !== "CANCELLED");

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">클라이언트 관리</h1>
          <p className="mt-1 text-muted">거래처 정보를 정확하게 관리하고 수주 등록 시간을 줄이세요.</p>
        </div>
        {canManageOrders(role) ? (
          <div className="flex gap-2">
            <Button tone="ghost" onClick={() => download(template, "거래처양식.csv")}>양식 다운로드</Button>
            <label className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-line bg-white px-4 font-semibold">
              엑셀 일괄등록
              <input className="hidden" type="file" accept=".csv,text/csv" onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const text = (await file.text()).replace(/^\uFEFF/, "");
                const lines = text.split(/\r?\n/).slice(1).filter((line) => line.trim());
                const imported = importClients(lines.map((line) => {
                  const [businessNumber, companyName, representative, address, phone, contactName, contactMobile, taxEmail] = line.split(",");
                  return { businessNumber: businessNumber ?? "", companyName: companyName ?? "", representative: representative ?? "", address: address ?? "", phone: phone ?? "", contactName: contactName ?? "", contactMobile: contactMobile ?? "", taxEmail: taxEmail ?? "" };
                }));
                setResult(`성공 ${imported.created}건${imported.errors.length ? ` / ${imported.errors.join(" ")}` : ""}`);
                show("엑셀 등록을 반영했습니다.");
              }} />
            </label>
            <Link to="/clients/new" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 font-semibold text-white">+ 클라이언트 등록</Link>
          </div>
        ) : null}
      </div>
      {result ? <p className="mt-2 text-sm text-muted">{result}</p> : null}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <section className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-muted">전체 클라이언트</p><p className="mt-2 text-2xl font-semibold">{db.clients.length}개사</p></section>
        <section className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-muted">이번 달 거래</p><p className="mt-2 text-2xl font-semibold">{traded}개사</p></section>
        <section className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-muted">등록 거래처</p><p className="mt-2 text-2xl font-semibold">{rows.length}개사</p></section>
      </div>
      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="overflow-hidden rounded-xl border border-line bg-white">
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <h2 className="font-semibold">등록된 클라이언트</h2>
            <span className="text-sm text-muted">총 {rows.length}개사</span>
          </div>
          <div className="px-5 pb-3">
            <input className="h-10 w-full rounded-lg border border-line px-3" value={keyword} placeholder="회사명, 대표자명, 연락처 검색" onChange={(event) => setKeyword(event.target.value)} />
          </div>
          <table className="w-full text-left">
            <thead className="bg-primary-soft/40 text-sm text-muted">
              <tr><th className="px-5 py-3 font-medium">회사명</th><th className="py-3 font-medium">대표자</th><th className="py-3 font-medium">연락처</th><th className="py-3 font-medium">소재지</th><th className="py-3 font-medium">누적 수주</th><th className="py-3 pr-5 font-medium">최근 수주일</th></tr>
            </thead>
            <tbody>
              {rows.map((client) => {
                const orders = ordersOf(client.id);
                const latest = orders.map((order) => localDate(order.createdAt)).sort().at(-1) ?? "-";
                return (
                  <tr key={client.id} className={`cursor-pointer border-t border-line ${selected?.id === client.id ? "bg-primary-soft" : ""}`} onClick={() => setSelectedId(client.id)}>
                    <td className="px-5 py-3 font-semibold">{client.companyName}</td>
                    <td>{client.representative}</td>
                    <td>{client.phone}</td>
                    <td className="max-w-40 truncate">{client.address}</td>
                    <td>{orders.length}건</td>
                    <td className="pr-5">{latest}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        {selected ? (
          <aside className="space-y-3">
            <section className="rounded-xl border border-line bg-white p-5">
              <h2 className="font-semibold">클라이언트 상세</h2>
              <p className="mt-3 text-lg font-semibold">{selected.companyName}</p>
              <p className="text-sm text-muted">{selected.businessNumber}</p>
              <dl className="mt-4 space-y-2 text-sm">
                <div><dt className="text-muted">대표자명</dt><dd>{selected.representative}</dd></div>
                <div><dt className="text-muted">연락처</dt><dd>{selected.phone}</dd></div>
                <div><dt className="text-muted">주소</dt><dd>{selected.address}</dd></div>
              </dl>
              <div className="mt-4 flex gap-2">
                {canManageOrders(role) ? <Link to={`/clients/${selected.id}/edit`} className="inline-flex h-10 items-center rounded-lg border border-line px-3">정보 수정</Link> : null}
                {canManageOrders(role) ? <Link to={`/orders/new?clientId=${selected.id}`} className="inline-flex h-10 items-center rounded-lg bg-primary px-3 font-semibold text-white">+ 수주 등록</Link> : null}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <p>누적 수주<br /><span className="text-lg font-semibold">{ordersOf(selected.id).length}건</span></p>
                <p>누적 거래액<br /><span className="text-lg font-semibold">{ordersOf(selected.id).reduce((sum, order) => sum + order.lines.reduce((lineSum, line) => lineSum + line.quantity * line.unitPrice, 0), 0).toLocaleString("ko-KR")}원</span></p>
              </div>
            </section>
            <section className="rounded-xl border border-line bg-white p-5">
              <h3 className="font-semibold">최근 수주</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {ordersOf(selected.id).slice(0, 3).map((order) => (
                  <li key={order.id} className="flex justify-between gap-2">
                    <Link className="text-primary" to={`/orders/${order.id}`}>{order.orderNo}</Link>
                    <span className="text-muted">{order.dueDate}</span>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export function ClientFormPage() {
  const { clientId } = useParams();
  const db = useDb();
  const navigate = useNavigate();
  const show = useToastStore((state) => state.show);
  const current = db.clients.find((client) => client.id === clientId);
  const [form, setForm] = useState(current ?? { businessNumber: "", companyName: "", representative: "", address: "", phone: "", contactName: "", contactMobile: "", taxEmail: "" });
  return (
    <div>
      <PageHeader title={current ? "거래처 수정" : "거래처 등록"} />
      <form className="max-w-3xl" onSubmit={(event) => {
        event.preventDefault();
        try {
          saveClient({ ...form, id: current?.id, businessNumber: digitsOnly(form.businessNumber) });
          show("거래처를 저장했습니다.");
          navigate("/clients");
        } catch (error: unknown) {
          show(error instanceof Error ? error.message : "저장하지 못했습니다.");
        }
      }}>
        <Card className="grid gap-3 md:grid-cols-2">
        <TextField label="사업자등록번호" value={form.businessNumber} onChange={(event) => setForm({ ...form, businessNumber: event.target.value })} />
        <TextField label="회사명" value={form.companyName} onChange={(event) => setForm({ ...form, companyName: event.target.value })} />
        <TextField label="대표자" value={form.representative} onChange={(event) => setForm({ ...form, representative: event.target.value })} />
        <AddressPicker label="주소" value={form.address} onChange={(address) => setForm({ ...form, address })} />
        <TextField label="대표전화" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        <TextField label="담당자명" value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} />
        <TextField label="담당자 휴대번호" value={form.contactMobile} onChange={(event) => setForm({ ...form, contactMobile: event.target.value })} />
        <TextField label="세금계산서 이메일" value={form.taxEmail} onChange={(event) => setForm({ ...form, taxEmail: event.target.value })} />
        <div className="flex justify-end md:col-span-2"><Button type="submit">저장</Button></div>
        </Card>
      </form>
    </div>
  );
}

export function ClientDetailPage() {
  const { clientId = "" } = useParams();
  const db = useDb();
  const role = useAuthStore((state) => state.user?.role);
  const client = db.clients.find((item) => item.id === clientId);
  if (!client) return <p>거래처를 찾을 수 없습니다.</p>;
  const orders = db.orders.filter((order) => order.clientId === client.id);
  return (
    <div className="space-y-4">
      <PageHeader title={client.companyName} action={canManageOrders(role) ? <Link to={`/clients/${client.id}/edit`}><Button tone="ghost">수정</Button></Link> : null} />
      <Card className="grid gap-2 md:grid-cols-2">
        <p>사업자번호 {client.businessNumber}</p>
        <p>대표 {client.representative}</p>
        <p>주소 {client.address}</p>
        <p>전화 {client.phone}</p>
        <p>담당 {client.contactName} {client.contactMobile}</p>
        <p>이메일 {client.taxEmail}</p>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">관련 수주</h2>
        <ul>{orders.map((order) => <li key={order.id}><Link className="text-primary" to={`/orders/${order.id}`}>{order.orderNo}</Link></li>)}</ul>
      </Card>
    </div>
  );
}

function download(content: string, name: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
