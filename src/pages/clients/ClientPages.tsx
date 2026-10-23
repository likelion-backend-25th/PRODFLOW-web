import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Building2, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Ellipsis, FileSpreadsheet, Info, MapPin, Pencil, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui.tsx";
import { sampleAddresses } from "@/lib/addresses.ts";
import type { Client } from "@/types/domain.ts";
import { cn } from "@/lib/cn.ts";
import { localDate, todayISO } from "@/lib/dates.ts";
import { useDb } from "@/lib/db.ts";
import { orderStatusLabel, orderStatusTone, paymentStatusLabel, paymentTone, workStatusOrder } from "@/lib/labels.ts";
import { digitsOnly, orderQuantity, orderTotal } from "@/lib/money.ts";
import { orderItems, orderItemsText } from "@/lib/orderText.ts";
import { clientFullAddress, importClients, saveClient } from "@/lib/workflow.ts";
import { canManageOrders, useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";

const template = "사업자등록번호,회사명,대표자,주소,대표전화,담당자명,담당자휴대번호,세금계산서이메일\n";

const PAGE_SIZE = 8;

type ClientSort = "RECENT" | "NAME" | "AMOUNT";

const sortLabel: Record<ClientSort, string> = {
  RECENT: "최근 거래순",
  NAME: "회사명순",
  AMOUNT: "누적 거래액순",
};

const dotted = (iso: string) => iso.replaceAll("-", ".");

export function ClientListPage() {
  const db = useDb();
  const role = useAuthStore((state) => state.user?.role);
  const show = useToastStore((state) => state.show);
  const [keyword, setKeyword] = useState("");
  const [sort, setSort] = useState<ClientSort>("RECENT");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const canWrite = canManageOrders(role);
  const month = todayISO().slice(0, 7);

  const stats = db.clients.map((client) => {
    const orders = db.orders
      .filter((order) => order.clientId === client.id && order.status !== "CANCELLED")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return {
      client,
      orders,
      amount: orders.reduce((sum, order) => sum + orderTotal(order.lines), 0),
      latest: orders[0] ? localDate(orders[0].createdAt) : "",
    };
  });
  const query = keyword.trim();
  const rows = stats
    .filter(({ client }) => `${client.companyName} ${client.representative} ${client.phone} ${client.contactMobile}`.includes(query))
    .sort((left, right) => {
      if (sort === "NAME") return left.client.companyName.localeCompare(right.client.companyName, "ko");
      if (sort === "AMOUNT") return right.amount - left.amount;
      return right.latest.localeCompare(left.latest) || left.client.companyName.localeCompare(right.client.companyName, "ko");
    });
  const currentPage = Math.min(page, pageCountOf(rows.length, PAGE_SIZE));
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selected = rows.find((row) => row.client.id === selectedId) ?? pageRows[0];
  const traded = new Set(db.orders.filter((order) => order.status !== "CANCELLED" && localDate(order.createdAt).startsWith(month)).map((order) => order.clientId)).size;
  const joined = db.clients.filter((client) => localDate(client.createdAt).startsWith(month)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-[27px] font-bold">거래처 관리</h1>
          <p className="text-xs text-muted">거래처 정보를 정확하게 관리하고 수주 등록 시간을 줄이세요.</p>
        </div>
        {canWrite ? (
          <div className="flex gap-2">
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-4 text-[13px] font-medium">
              <Plus size={16} />
              엑셀 일괄등록
              <input className="hidden" type="file" accept=".csv,text/csv" onChange={async (event) => {
                const input = event.currentTarget;
                const file = input.files?.[0];
                if (!file) return;
                const text = (await file.text()).replace(/^\uFEFF/, "");
                input.value = "";
                const lines = text.split(/\r?\n/).slice(1).filter((line) => line.trim());
                const imported = importClients(lines.map((line) => {
                  const [businessNumber, companyName, representative, address, phone, contactName, contactMobile, taxEmail] = line.split(",");
                  return { businessNumber: businessNumber ?? "", companyName: companyName ?? "", representative: representative ?? "", address: address ?? "", postalCode: "", addressDetail: "", phone: phone ?? "", contactName: contactName ?? "", contactMobile: contactMobile ?? "", taxEmail: taxEmail ?? "" };
                }));
                setResult(`성공 ${imported.created}건${imported.errors.length ? ` / ${imported.errors.join(" ")}` : ""}`);
                show("엑셀 등록을 반영했습니다.");
              }} />
            </label>
            <Link to="/clients/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-medium text-white">
              <Plus size={16} />
              거래처 등록
            </Link>
          </div>
        ) : null}
      </div>
      {result ? <p className="-mt-3 text-sm text-muted">{result}</p> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="전체 거래처" value={db.clients.length} icon={<Building2 size={23} className="text-primary" />} />
        <Metric label="이번 달 거래" value={traded} />
        <Metric label="이번 달 신규 등록" value={joined} />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_316px]">
        <div className="min-w-0 space-y-5">
          <section className="space-y-[18px] rounded-xl border border-line bg-white p-[22px]">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">등록된 거래처</h2>
              <span className="text-[11px] text-muted">총 {rows.length}개사</span>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <label className="relative block w-[300px] max-w-full">
                <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
                <input
                  className="h-[38px] w-full rounded-[7px] border border-line bg-white pr-3 pl-[35px] text-xs placeholder:text-muted"
                  value={keyword}
                  placeholder="회사명, 대표자명, 연락처 검색"
                  onChange={(event) => {
                    setKeyword(event.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <label className="relative block">
                <select
                  aria-label="정렬"
                  className="h-[38px] appearance-none rounded-[7px] border border-line bg-white pr-[41px] pl-3 text-xs"
                  value={sort}
                  onChange={(event) => {
                    setSort(event.target.value as ClientSort);
                    setPage(1);
                  }}
                >
                  {(Object.keys(sortLabel) as ClientSort[]).map((key) => <option key={key} value={key}>{sortLabel[key]}</option>)}
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2" />
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left whitespace-nowrap">
                <thead className="border-y border-line bg-canvas/60 text-[11px] text-muted">
                  <tr className="h-10 [&_th]:font-medium">
                    <th className="pl-[14px]">회사명</th>
                    <th>대표자</th>
                    <th>연락처</th>
                    <th>이메일</th>
                    <th>누적 수주</th>
                    <th className="text-right">누적 거래액</th>
                    <th className="text-center">최근 수주일</th>
                    <th className="w-8 pr-[14px]"><span className="sr-only">상세</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(({ client, orders, amount, latest }) => {
                    const active = selected?.client.id === client.id;
                    return (
                      <tr key={client.id} className={cn("h-[61px] cursor-pointer border-b border-line", active && "bg-primary-soft")} onClick={() => setSelectedId(client.id)}>
                        <td className="pl-[14px]">
                          <span className="flex items-center gap-2">
                            <span className={cn("flex size-7 items-center justify-center rounded-[7px] text-[10px] font-bold", active ? "bg-primary/15 text-primary" : "bg-canvas")}>
                              {client.companyName.slice(0, 1)}
                            </span>
                            <span className="text-[11px] font-bold">{client.companyName}</span>
                          </span>
                        </td>
                        <td className="text-xs">{client.representative}</td>
                        <td className="text-[10px]">{client.phone}</td>
                        <td className="text-[10px] text-muted">{client.taxEmail}</td>
                        <td className="text-xs">{orders.length}건</td>
                        <td className="text-right text-xs">₩{amount.toLocaleString("ko-KR")}</td>
                        <td className="text-center text-[10px] text-muted">{latest ? dotted(latest) : "-"}</td>
                        <td className="pr-[14px]">
                          <Link to={`/clients/${client.id}`} aria-label={`${client.companyName} 상세`} className="flex text-muted" onClick={(event) => event.stopPropagation()}>
                            <ChevronRight size={14} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                  {pageRows.length === 0 ? (
                    <tr><td colSpan={8} className="py-10 text-center text-xs text-muted">조건에 맞는 거래처가 없습니다.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <Pager total={rows.length} page={currentPage} pageSize={PAGE_SIZE} unit="개사" onChange={setPage} />
          </section>

          {canWrite ? (
            <section className="flex items-start gap-[14px] rounded-[10px] border border-line bg-white p-[18px]">
              <span className="size-[42px] shrink-0 rounded-[10px] bg-primary-soft" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs font-bold">여러 거래처를 한 번에 등록하세요</p>
                <div className="text-[10px] text-muted">
                  <p>양식에 사업자등록번호 · 회사명 · 대표자 · 주소 · 연락처를 입력한 뒤 업로드하세요.</p>
                  <p>지원 형식 .csv · 사업자등록번호가 겹치는 행은 등록하지 않고 오류로 표시합니다.</p>
                </div>
              </div>
              <button type="button" className="shrink-0 text-[11px] font-medium text-primary" onClick={() => download(template, "거래처양식.csv")}>
                양식 다운로드
              </button>
            </section>
          ) : null}
        </div>

        {selected ? (
          <aside className="space-y-4">
            <section className="space-y-[18px] rounded-xl border border-line bg-white p-[22px]">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold">거래처 정보</h2>
                <Link to={`/clients/${selected.client.id}`} aria-label="거래처 상세" className="text-muted">
                  <Ellipsis size={18} />
                </Link>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex size-[46px] items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Building2 size={24} />
                </span>
                <div className="space-y-1">
                  <p className="text-xl font-bold">{selected.client.companyName}</p>
                  <p className="text-[10px] text-muted">{dotted(localDate(selected.client.createdAt))} 등록</p>
                </div>
              </div>
              <hr className="border-line" />
              <InfoRow label="대표자명" value={selected.client.representative} />
              <InfoRow label="이메일" value={selected.client.taxEmail} muted />
              <InfoRow label="연락처" value={selected.client.phone} />
              <InfoRow label="주소" value={clientFullAddress(selected.client)} />
              {canWrite ? (
                <div className="flex gap-2">
                  <Link to={`/clients/${selected.client.id}/edit`} className="inline-flex h-8 items-center rounded-lg border border-line bg-white px-3 text-xs font-medium">
                    정보 수정
                  </Link>
                  <Link to={`/orders/new?clientId=${selected.client.id}`} className="inline-flex h-8 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-medium text-white">
                    <Plus size={16} />
                    수주 등록
                  </Link>
                </div>
              ) : null}
              <hr className="border-line" />
              <div className="flex items-start justify-between">
                <div className="space-y-[5px]">
                  <p className="text-[10px] text-muted">누적 수주</p>
                  <p className="text-xl font-bold">{selected.orders.length}건</p>
                </div>
                <div className="space-y-[5px]">
                  <p className="text-[10px] text-muted">누적 거래액</p>
                  <p className="text-lg font-bold">₩{selected.amount.toLocaleString("ko-KR")}</p>
                </div>
              </div>
            </section>

            <section className="space-y-[18px] rounded-xl border border-line bg-white p-[22px]">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold">최근 수주</h2>
                <Link to={`/clients/${selected.client.id}`} className="text-[10px] text-primary">전체 →</Link>
              </div>
              {selected.orders.length === 0 ? <p className="text-xs text-muted">아직 수주가 없습니다.</p> : null}
              {selected.orders.slice(0, 3).map((order) => (
                <Link key={order.id} to={`/orders/${order.id}`} className="block space-y-2">
                  <span className="flex items-start justify-between">
                    <span className="text-[10px] text-muted">{order.orderNo}</span>
                    <StatusPill label={orderStatusLabel[order.status]} tone={orderStatusTone(order.status)} />
                  </span>
                  <span className="block text-xs font-bold">{orderItemsText(db.products, order.lines)}</span>
                  <span className="flex items-start justify-between">
                    <span className="text-[10px] text-muted">납기 {dotted(order.dueDate)}</span>
                    <span className="text-xs font-bold">₩{orderTotal(order.lines).toLocaleString("ko-KR")}</span>
                  </span>
                </Link>
              ))}
            </section>

            <section className="flex items-center gap-3 rounded-lg bg-primary-soft p-[15px]">
              <Info size={18} className="shrink-0 text-primary" />
              <div className="space-y-[3px]">
                <p className="text-xs font-medium text-primary">수주와 연결되는 거래처 정보</p>
                <p className="text-[11px] text-muted">수주 등록 시 회사명을 검색하면 연락처와 주소가 자동으로 입력됩니다.</p>
              </div>
            </section>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon?: ReactNode }) {
  return (
    <section className="flex items-center justify-between rounded-[10px] border border-line bg-white p-5">
      <div className="space-y-[7px]">
        <p className="text-[11px] text-muted">{label}</p>
        <p className="text-2xl font-bold">{value}개사</p>
      </div>
      {icon}
    </section>
  );
}

function pageCountOf(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

function Pager({ total, page, pageSize, unit, onChange }: { total: number; page: number; pageSize: number; unit: string; onChange: (page: number) => void }) {
  const pageCount = pageCountOf(total, pageSize);
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between">
      <p className="text-[11px] text-muted">총 {total}{unit} 중 {total ? `${first}–${last}` : "0"}{unit} 표시</p>
      {pageCount > 1 ? (
        <div className="flex items-center gap-[5px] text-[11px] font-medium">
          <button type="button" aria-label="이전 페이지" className="text-muted disabled:opacity-40" disabled={page === 1} onClick={() => onChange(page - 1)}>
            <ChevronLeft size={15} />
          </button>
          {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
            <button
              key={number}
              type="button"
              className={cn("size-[29px] rounded-md", number === page ? "bg-primary-soft text-primary" : "bg-white text-muted")}
              onClick={() => onChange(number)}
            >
              {number}
            </button>
          ))}
          <button type="button" aria-label="다음 페이지" className="text-muted disabled:opacity-40" disabled={page === pageCount} onClick={() => onChange(page + 1)}>
            <ChevronRight size={15} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={cn("inline-flex items-center gap-[5px] rounded-md px-[9px] py-1 text-[11px] font-medium whitespace-nowrap", tone)}>
      <span className="size-1 rounded-[2px] bg-current" />
      {label}
    </span>
  );
}

function InfoRow({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="space-y-[5px]">
      <p className="text-[10px] text-muted">{label}</p>
      <p className={cn("text-xs", muted && "text-muted")}>{value || "-"}</p>
    </div>
  );
}

const emptyClient = { businessNumber: "", companyName: "", representative: "", address: "", postalCode: "", addressDetail: "", phone: "", contactName: "", contactMobile: "", taxEmail: "" };

export function ClientFormPage() {
  const { clientId } = useParams();
  const db = useDb();
  const navigate = useNavigate();
  const show = useToastStore((state) => state.show);
  const current = db.clients.find((client) => client.id === clientId);
  const [form, setForm] = useState(current ?? emptyClient);
  const [checked, setChecked] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const [duplicates, setDuplicates] = useState<Client[]>([]);
  const editing = Boolean(current);
  // 비활성·삭제 계정은 거래처 담당으로 새로 고르지 않는다.
  const staff = db.users
    .filter((user) => user.status === "ACTIVE")
    .sort((left, right) => left.name.localeCompare(right.name, "ko"));
  const selectedStaff = staff.find((user) => user.name === form.contactName);
  const patch = (next: Partial<typeof form>) => {
    setForm({ ...form, ...next });
    setChecked(false);
  };
  const runDuplicateCheck = () => {
    const companyName = form.companyName.trim();
    if (!companyName) {
      show("회사명을 입력한 뒤 중복을 확인하세요.");
      return;
    }
    const phone = digitsOnly(form.phone);
    const found = db.clients.filter((client) =>
      client.id !== current?.id
      && client.companyName.trim() === companyName
      && (!phone || digitsOnly(client.phone) === phone),
    );
    setDuplicates(found);
    setChecked(true);
    show(found.length ? `같은 회사명의 거래처가 ${found.length}곳 있습니다.` : "겹치는 거래처가 없습니다.");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-[27px] font-bold">{editing ? "거래처 수정" : "거래처 등록"}</h1>
          <p className="text-xs text-muted">
            {editing
              ? "등록된 거래처 정보를 수정합니다. 변경한 정보는 이후 수주 작성 시 자동으로 입력됩니다."
              : "새 거래처의 기본 정보를 등록합니다. 등록된 정보는 수주 작성 시 자동으로 입력됩니다."}
          </p>
        </div>
        <Link to="/clients" className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-4 text-[13px] font-medium">
          <ArrowLeft size={16} className="text-muted" />
          거래처 목록으로
        </Link>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <form
          className="space-y-[18px] rounded-xl border border-line bg-white p-[22px]"
          onSubmit={(event) => {
            event.preventDefault();
            if (!checked) {
              show("등록 전에 중복 확인을 눌러 주세요.");
              return;
            }
            try {
              saveClient({ ...form, id: current?.id, businessNumber: digitsOnly(form.businessNumber) });
              show(editing ? "거래처를 수정했습니다." : "거래처를 등록했습니다.");
              navigate("/clients");
            } catch (error: unknown) {
              show(error instanceof Error ? error.message : "저장하지 못했습니다.");
            }
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-[3px]">
              <h2 className="text-base font-bold">거래처 기본 정보</h2>
              <p className="text-[11px] text-muted">사업자등록번호, 회사명, 대표자, 주소, 대표전화는 필수 입력 항목입니다.</p>
            </div>
            <span className="text-[10px] text-muted">* 필수 입력 항목</span>
          </div>

          <div className="space-y-2">
            <div className="flex items-end gap-2.5">
              <FormField label="사업자등록번호 *" className="flex-1">
                <input
                  required
                  inputMode="numeric"
                  placeholder="숫자 10자리"
                  value={form.businessNumber}
                  className={inputClass}
                  onChange={(event) => patch({ businessNumber: event.target.value })}
                />
              </FormField>
              <Button tone="ghost" className="shrink-0 text-[13px] font-medium" onClick={runDuplicateCheck}>중복 확인</Button>
            </div>
            <p className="text-[10px] text-muted">
              {checked
                ? duplicates.length
                  ? "같은 회사명의 거래처가 있습니다. 아래 목록을 확인한 뒤 새로 등록할지 정하세요."
                  : "겹치는 거래처가 없습니다. 등록을 계속하세요."
                : "같은 사업자등록번호는 등록되지 않습니다. 회사명과 연락처가 같은 거래처도 먼저 확인해 주세요."}
            </p>
            {checked && duplicates.length > 0 ? (
              <ul className="rounded-[7px] border border-line">
                {duplicates.map((client) => (
                  <li key={client.id}>
                    <Link to={`/clients/${client.id}`} className="flex items-center justify-between px-3 py-2 text-xs hover:bg-primary-soft">
                      <span className="font-medium">{client.companyName}</span>
                      <span className="text-muted">{client.representative} · {client.phone}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <FormField label="회사명 *">
            <input required placeholder="정식 회사명을 입력하세요" value={form.companyName} className={inputClass} onChange={(event) => patch({ companyName: event.target.value })} />
          </FormField>

          <div className="grid gap-[14px] sm:grid-cols-2">
            <FormField label="대표자명 *">
              <input required placeholder="예: 홍길동" value={form.representative} className={inputClass} onChange={(event) => patch({ representative: event.target.value })} />
            </FormField>
            <FormField label="연락처 *">
              <input required placeholder="예: 02-1234-5678" value={form.phone} className={inputClass} onChange={(event) => patch({ phone: event.target.value })} />
            </FormField>
            <FormField label="이메일">
              <input type="email" placeholder="예: user1234@company.com" value={form.taxEmail} className={inputClass} onChange={(event) => patch({ taxEmail: event.target.value })} />
            </FormField>
            <FormField label="담당 직원">
              <span className="relative block">
                <select
                  className={`${inputClass} appearance-none pr-9`}
                  value={selectedStaff?.id ?? (form.contactName ? currentContact : "")}
                  onChange={(event) => {
                    const user = staff.find((item) => item.id === event.target.value);
                    patch({ contactName: user?.name ?? (event.target.value === currentContact ? form.contactName : "") });
                  }}
                >
                  <option value="">담당 직원을 선택하세요</option>
                  {form.contactName && !selectedStaff ? <option value={currentContact}>{form.contactName}</option> : null}
                  {staff.map((user) => (
                    <option key={user.id} value={user.id}>{user.name} · {user.department}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" />
              </span>
            </FormField>
          </div>

          <hr className="border-line" />

          <CompanyAddress
            postalCode={form.postalCode}
            road={form.address}
            detail={form.addressDetail}
            open={addressOpen}
            onToggle={() => setAddressOpen((current) => !current)}
            onPick={(item) => {
              patch({ postalCode: item.zonecode, address: item.road });
              setAddressOpen(false);
            }}
            onDetail={(addressDetail) => patch({ addressDetail })}
          />

          <section className="flex items-start gap-3 rounded-lg bg-primary-soft p-[15px]">
            <Info size={18} className="shrink-0 text-primary" />
            <div className="space-y-1">
              <p className="text-xs font-medium text-primary">등록 전 중복 여부를 확인하세요</p>
              <p className="text-[11px] text-muted">이미 등록된 회사라면 새로 등록하지 않고 기존 정보를 수정해 주세요. 같은 이름의 회사는 연락처와 주소를 함께 확인하세요.</p>
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <p className="text-[11px] text-muted">입력 내용을 확인한 후 등록해 주세요.</p>
            <div className="flex gap-2">
              <Button tone="ghost" className="text-[13px] font-medium" onClick={() => navigate("/clients")}>취소</Button>
              <Button type="submit" className="gap-2 text-[13px] font-medium">
                <Check size={16} />
                {editing ? "수정 저장" : "거래처 등록"}
              </Button>
            </div>
          </div>
        </form>

        <aside className="space-y-4">
          <section className="space-y-[18px] rounded-xl border border-line bg-white p-[22px]">
            <h2 className="text-base font-bold">등록 안내</h2>
            <ol className="space-y-5">
              {registrationSteps.map((step, index) => (
                <li key={step.title} className="flex items-start gap-2.5">
                  <span className="flex size-[23px] shrink-0 items-center justify-center rounded-xl bg-primary-soft text-[10px] font-bold text-primary">{index + 1}</span>
                  <span className="space-y-[5px]">
                    <span className="block text-xs font-medium">{step.title}</span>
                    <span className="block text-[11px] text-muted">{step.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
          <section className="flex items-start gap-3 rounded-lg bg-primary-soft p-[15px]">
            <Info size={18} className="shrink-0 text-primary" />
            <div className="space-y-1">
              <p className="text-xs font-medium text-primary">다음 수주부터 더 빠르게</p>
              <p className="text-[11px] text-muted">회사명을 선택하면 연락처와 주소를 다시 입력하지 않아도 됩니다.</p>
            </div>
          </section>
          {editing ? null : (
            <section className="space-y-[18px] rounded-xl border border-line bg-white p-[22px]">
              <h2 className="text-base font-bold">여러 거래처를 등록하나요?</h2>
              <div className="flex items-start gap-2.5">
                <FileSpreadsheet size={20} className="shrink-0 text-primary" />
                <p className="text-[11px] text-muted">거래처 관리의 엑셀 일괄등록을 이용하세요. 지정 양식의 .csv 파일을 지원합니다.</p>
              </div>
              <Link to="/clients" className="block text-[11px] text-primary">거래처 관리로 →</Link>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

const currentContact = "current";

const inputClass = "h-[41px] w-full rounded-[7px] border border-line bg-white px-3 text-xs placeholder:text-muted/70";

function CompanyAddress({
  postalCode,
  road,
  detail,
  open,
  onToggle,
  onPick,
  onDetail,
}: {
  postalCode: string;
  road: string;
  detail: string;
  open: boolean;
  onToggle: () => void;
  onPick: (item: (typeof sampleAddresses)[number]) => void;
  onDetail: (value: string) => void;
}) {
  const jibun = sampleAddresses.find((item) => item.road === road)?.jibun ?? "";
  return (
    <div className="space-y-[7px]">
      <p className="text-xs font-medium">회사 주소 *</p>
      <div className="flex items-center gap-2">
        <input readOnly value={postalCode} placeholder="우편번호" className={inputClass} />
        <button type="button" className="h-[41px] shrink-0 rounded-[7px] border border-line bg-white px-4 text-[13px] font-medium" onClick={onToggle}>
          우편번호 찾기
        </button>
      </div>
      {open ? (
        <ul className="rounded-[7px] border border-line bg-white">
          {sampleAddresses.map((item) => (
            <li key={item.road}>
              <button type="button" className="block w-full px-3 py-2 text-left text-xs hover:bg-primary-soft" onClick={() => onPick(item)}>
                <span className="mr-2 text-muted">{item.zonecode}</span>
                {item.road}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <span className="relative block">
        <input readOnly value={road} placeholder="도로명 주소를 입력하세요" className={`${inputClass} pr-9`} />
        <MapPin size={15} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" />
      </span>
      {jibun ? <p className="text-[10px] text-muted">(예상 지번 주소 : {jibun})</p> : null}
      <input placeholder="건물명, 층, 호수 등 상세 주소를 입력하세요" value={detail} className={inputClass} onChange={(event) => onDetail(event.target.value)} />
      <p className="text-[10px] text-muted">수주 작성 시 기본 배송지로 불러옵니다. 실제 배송지는 수주별로 변경할 수 있습니다.</p>
    </div>
  );
}

const registrationSteps = [
  { title: "기본 정보 입력", body: "사업자등록번호와 회사명, 연락처를 정확하게 입력해 주세요." },
  { title: "기존 거래처 확인", body: "중복 확인으로 같은 회사명과 연락처의 거래처를 비교하세요." },
  { title: "수주에서 바로 사용", body: "등록 후 수주 작성 화면에서 회사명을 검색할 수 있습니다." },
];

function FormField({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={cn("block space-y-[7px]", className)}>
      <span className="block text-xs font-medium">{label}</span>
      {children}
    </label>
  );
}

const HISTORY_PAGE_SIZE = 10;

export function ClientDetailPage() {
  const { clientId = "" } = useParams();
  const db = useDb();
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.user?.role);
  const [page, setPage] = useState(1);
  const client = db.clients.find((item) => item.id === clientId);
  if (!client) return <p>거래처를 찾을 수 없습니다.</p>;

  const canWrite = canManageOrders(role);
  const history = db.orders
    .filter((order) => order.clientId === client.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  // 취소 건은 거래 실적이 아니므로 누적 수주·거래액에서 뺀다.
  const active = history.filter((order) => order.status !== "CANCELLED");
  const open = active.filter((order) => order.status !== "COMPLETED");
  const latest = active[0];
  const breakdown = workStatusOrder
    .map((status) => ({ status, count: active.filter((order) => order.status === status).length }))
    .filter((item) => item.count > 0)
    .map((item) => `${orderStatusLabel[item.status]} ${item.count}`)
    .join(" · ");
  const currentPage = Math.min(page, pageCountOf(history.length, HISTORY_PAGE_SIZE));
  const pageRows = history.slice((currentPage - 1) * HISTORY_PAGE_SIZE, currentPage * HISTORY_PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-[27px] font-bold">거래처 상세</h1>
          <p className="text-xs text-muted">거래처 기본 정보와 연결된 수주 및 거래 내역을 확인합니다.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/clients" className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-4 text-[13px] font-medium">
            <ArrowLeft size={16} className="text-muted" />
            목록으로
          </Link>
          {canWrite ? (
            <>
              <Link to={`/clients/${client.id}/edit`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-4 text-[13px] font-medium">
                <Pencil size={13} />
                정보 수정
              </Link>
              <Link to={`/orders/new?clientId=${client.id}`} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-medium text-white">
                <Plus size={16} />
                수주 등록
              </Link>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <DetailMetric label="누적 수주" icon={<ClipboardList size={20} />} value={`${active.length}건`} caption={breakdown || "아직 수주가 없습니다."} />
        <DetailMetric label="누적 거래액" icon={<Building2 size={20} />} value={`₩${active.reduce((sum, order) => sum + orderTotal(order.lines), 0).toLocaleString("ko-KR")}`} caption="취소 건을 뺀 수주 금액 합계" />
        <DetailMetric
          label="최근 수주일"
          icon={<CalendarDays size={20} />}
          value={latest ? dotted(localDate(latest.createdAt)) : "-"}
          caption={latest ? `${latest.orderNo} · ${orderStatusLabel[latest.status]}` : "아직 수주가 없습니다."}
        />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_316px]">
        <div className="min-w-0 space-y-5">
          <section className="space-y-[18px] rounded-xl border border-line bg-white p-[22px]">
            <h2 className="text-base font-bold">거래처 정보</h2>
            <div className="flex items-center gap-[14px]">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <Building2 size={26} />
              </span>
              <div className="space-y-1">
                <p className="text-[21px] font-bold">{client.companyName}</p>
                <p className="text-[11px] text-muted">{dotted(localDate(client.createdAt))} 등록 · 사업자등록번호 {formatBusinessNumber(client.businessNumber)}</p>
              </div>
            </div>
            <hr className="border-line" />
            <div className="grid gap-[18px] sm:grid-cols-2 sm:gap-x-6">
              <DetailField label="대표자명" value={client.representative} />
              <DetailField label="연락처" value={client.phone} />
              <DetailField label="담당 직원" value={client.contactName} />
              <DetailField label="담당자 휴대번호" value={client.contactMobile} />
              <DetailField label="회사 주소" value={clientFullAddress(client)} wide />
              <DetailField label="거래처 이메일" value={client.taxEmail} wide />
            </div>
          </section>
          <section className="flex items-start gap-3 rounded-lg bg-primary-soft p-[15px]">
            <Info size={18} className="shrink-0 text-primary" />
            <div className="space-y-1">
              <p className="text-xs font-medium text-primary">수주와 연결되는 거래처 정보</p>
              <p className="text-[11px] text-muted">수주 등록에서 이 거래처를 선택하면 연락처와 주소가 자동으로 입력됩니다. 배송지는 수주별로 확인해 주세요.</p>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="space-y-[18px] rounded-xl border border-line bg-white p-[22px]">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">최근 수주</h2>
              {latest ? <Link to={`/orders/${latest.id}`} className="text-[11px] text-primary">상세 →</Link> : null}
            </div>
            {latest ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted">{latest.orderNo}</span>
                  <StatusPill label={orderStatusLabel[latest.status]} tone={orderStatusTone(latest.status)} />
                </div>
                <p className="text-sm font-bold">{orderItemsText(db.products, latest.lines)}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted">납기일</span>
                  <span className="text-xs">{dotted(latest.dueDate)}{latest.dueDate === todayISO() ? " · 오늘" : ""}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted">수주 금액 · VAT 포함</span>
                  <span className="text-sm font-bold">₩{orderTotal(latest.lines).toLocaleString("ko-KR")}</span>
                </div>
                <hr className="border-line" />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted">입금 확인</span>
                  <StatusPill label={paymentStatusLabel[latest.paymentStatus]} tone={paymentTone(latest.paymentStatus)} />
                </div>
              </>
            ) : (
              <p className="text-xs text-muted">아직 수주가 없습니다.</p>
            )}
          </section>
          <section className="flex items-start justify-between rounded-[10px] border border-line bg-white p-[18px] text-xs">
            <span className="text-muted">진행 중인 수주</span>
            <span className="font-bold text-primary">{open.length}건 · ₩{open.reduce((sum, order) => sum + orderTotal(order.lines), 0).toLocaleString("ko-KR")}</span>
          </section>
        </aside>
      </div>

      <section className="space-y-[18px] rounded-xl border border-line bg-white p-[22px]">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-[3px]">
            <h2 className="text-base font-bold">수주 이력</h2>
            <p className="text-[11px] text-muted">{client.companyName}의 전체 수주 {history.length}건 · 최근 등록순</p>
          </div>
          <span className="text-[11px] text-muted">금액은 VAT 포함</span>
        </div>
        <div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left [&_td]:pr-4 [&_th]:pr-4">
              <thead className="border-y border-line bg-canvas/60 text-[11px] text-muted">
                <tr className="h-10 whitespace-nowrap [&_th]:font-normal">
                  <th className="w-[173px] pl-[14px]">수주번호 / 등록일</th>
                  <th>생산 품목</th>
                  <th>총 생산 수량</th>
                  <th className="w-[145px]">수주 금액</th>
                  <th className="w-[125px]">납기일</th>
                  <th className="w-[100px]">진행 상태</th>
                  <th className="w-[105px]">입금 확인</th>
                  <th className="w-[34px] pr-[14px]"><span className="sr-only">상세</span></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((order) => (
                  <tr key={order.id} className="cursor-pointer border-b border-line hover:bg-primary-soft/40" onClick={() => navigate(`/orders/${order.id}`)}>
                    <td className="py-[13px] pl-[14px]">
                      <Link to={`/orders/${order.id}`} className="block text-xs font-medium text-primary" onClick={(event) => event.stopPropagation()}>{order.orderNo}</Link>
                      <span className="mt-1 block text-[10px] text-muted">{dotted(localDate(order.createdAt))}</span>
                    </td>
                    <td className="py-[13px] pr-4 text-xs font-medium">
                      {orderItems(db.products, order.lines).names.map((name) => <span key={name} className="block whitespace-nowrap">{name}</span>)}
                    </td>
                    <td className="text-xs font-medium">{orderQuantity(order.lines).toLocaleString("ko-KR")}</td>
                    <td className="text-xs font-medium">₩{orderTotal(order.lines).toLocaleString("ko-KR")}</td>
                    <td className="text-xs">{dotted(order.dueDate)}</td>
                    <td><StatusPill label={orderStatusLabel[order.status]} tone={orderStatusTone(order.status)} /></td>
                    <td><StatusPill label={paymentStatusLabel[order.paymentStatus]} tone={paymentTone(order.paymentStatus)} /></td>
                    <td className="pr-[14px] text-muted"><ChevronRight size={14} /></td>
                  </tr>
                ))}
                {history.length === 0 ? (
                  <tr><td colSpan={8} className="py-10 text-center text-xs text-muted">아직 등록된 수주가 없습니다.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="pt-4">
            <Pager total={history.length} page={currentPage} pageSize={HISTORY_PAGE_SIZE} unit="건" onChange={setPage} />
          </div>
        </div>
      </section>
    </div>
  );
}

function DetailMetric({ label, icon, value, caption }: { label: string; icon: ReactNode; value: string; caption: string }) {
  return (
    <section className="space-y-2 rounded-[10px] border border-line bg-white p-5">
      <div className="flex items-start justify-between">
        <p className="text-[11px] text-muted">{label}</p>
        <span className="text-primary">{icon}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-[10px] text-muted">{caption}</p>
    </section>
  );
}

function DetailField({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn("space-y-1.5", wide && "sm:col-span-2")}>
      <p className="text-[11px] text-muted">{label}</p>
      <p className="text-[13px]">{value || "-"}</p>
    </div>
  );
}

function formatBusinessNumber(value: string): string {
  const digits = digitsOnly(value);
  return digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}` : value;
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
