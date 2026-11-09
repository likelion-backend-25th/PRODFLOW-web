import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Building2, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Ellipsis, FileSpreadsheet, Info, MapPin, Pencil, Plus, Search } from "lucide-react";
import { Badge, Button } from "@/components/ui.tsx";
import { cn } from "@/lib/cn.ts";
import { digitsOnly } from "@/lib/money.ts";
import { readApiErrorMessage } from "@/lib/apiClient.ts";
import { createClient, getClient, importClientsFile, listClients, updateClient, type ClientDetail, type ClientListItem, type ClientPage } from "@/lib/clientApi.ts";
import { orderStatusLabel, orderStatusTone, paymentStatusLabel, paymentTone } from "@/lib/labels.ts";
import { getRecentClientOrder, listClientOrders, screenOrderStatus, screenPaymentStatus, type ClientOrder, type ClientOrderPage } from "@/lib/orderApi.ts";
import { canManageOrders, useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";

const PAGE_SIZE = 8;

type ClientSort = "RECENT" | "NAME";

const sortLabel: Record<ClientSort, string> = {
  RECENT: "최근 등록순",
  NAME: "회사명순",
};

interface ClientRow {
  item: ClientListItem;
  detail: ClientDetail | null;
}

const emptyClientPage: ClientPage = { content: [], totalElements: 0, totalPages: 0, number: 0, size: PAGE_SIZE };

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("ko-KR");
}

export function ClientListPage() {
  const role = useAuthStore((state) => state.user?.role);
  const show = useToastStore((state) => state.show);
  const [keyword, setKeyword] = useState("");
  const [sort, setSort] = useState<ClientSort>("RECENT");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [list, setList] = useState<ClientPage>(emptyClientPage);
  const [loadError, setLoadError] = useState("");
  const [details, setDetails] = useState<Record<number, ClientDetail>>({});
  const [recentOrders, setRecentOrders] = useState<Record<number, ClientOrder | null>>({});
  const [reloadKey, setReloadKey] = useState(0);
  const canWrite = canManageOrders(role);
  useEffect(() => {
    let ignore = false;
    listClients({
      keyword: keyword.trim(),
      page: page - 1,
      size: PAGE_SIZE,
      sort: sort === "NAME" ? "company,asc" : "createdAt,desc",
    }).then((response) => {
      if (ignore) return;
      setList(response);
      setLoadError("");
    }).catch((error: unknown) => {
      if (ignore) return;
      setList(emptyClientPage);
      setLoadError(readApiErrorMessage(error));
    });
    return () => {
      ignore = true;
    };
  }, [keyword, page, reloadKey, sort]);
  const pageRows: ClientRow[] = list.content.map((item) => ({ item, detail: details[item.id] ?? null }));
  const selected = pageRows.find((row) => String(row.item.id) === selectedId) ?? pageRows[0];
  useEffect(() => {
    const id = selected?.item.id;
    if (!id || details[id]) return;
    let ignore = false;
    getClient(id).then((detail) => {
      if (!ignore) setDetails((current) => ({ ...current, [id]: detail }));
    }).catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [details, selected]);
  useEffect(() => {
    const id = selected?.item.id;
    if (!id || Object.hasOwn(recentOrders, id)) return;
    let ignore = false;
    getRecentClientOrder(id).then((order) => {
      if (!ignore) setRecentOrders((current) => ({ ...current, [id]: order }));
    }).catch(() => {
      if (!ignore) setRecentOrders((current) => ({ ...current, [id]: null }));
    });
    return () => {
      ignore = true;
    };
  }, [recentOrders, selected]);
  const selectedRecentOrder = selected ? recentOrders[selected.item.id] : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-[27px] font-bold">거래처 관리</h1>
          <p className="text-xs text-muted">거래처 정보를 정확하게 관리하고, 견적 작성 때 바로 찾으세요.</p>
        </div>
        {canWrite ? (
          <div className="flex gap-2">
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-4 text-[13px] font-medium">
              <Plus size={16} />
              엑셀 일괄등록
              <input className="hidden" type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={async (event) => {
                const input = event.currentTarget;
                const file = input.files?.[0];
                input.value = "";
                if (!file) return;
                try {
                  const imported = await importClientsFile(file);
                  setResult(`성공 ${imported.length}건`);
                  setPage(1);
                  setReloadKey((value) => value + 1);
                  show("엑셀 등록을 반영했습니다.");
                } catch (error: unknown) {
                  setResult(readApiErrorMessage(error));
                }
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
        <Metric label="전체 거래처" value={list.totalElements} icon={<Building2 size={23} className="text-primary" />} />
        <Metric label="이 페이지" value={pageRows.length} />
        <Metric label="검색 결과" value={loadError ? 0 : list.totalElements} />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_316px]">
        <div className="min-w-0 space-y-5">
          <section className="space-y-[18px] rounded-xl border border-line bg-white p-[22px]">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">등록된 거래처</h2>
              <span className="text-[11px] text-muted">총 {list.totalElements}개사</span>
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
                  {pageRows.map(({ item }) => {
                    const active = selected?.item.id === item.id;
                    return (
                      <tr key={item.id} className={cn("h-[61px] cursor-pointer border-b border-line", active && "bg-primary-soft")} onClick={() => setSelectedId(String(item.id))}>
                        <td className="pl-[14px]">
                          <span className="flex items-center gap-2">
                            <span className={cn("flex size-7 items-center justify-center rounded-[7px] text-[10px] font-bold", active ? "bg-primary/15 text-primary" : "bg-canvas")}>
                              {item.company.slice(0, 1)}
                            </span>
                            <span className="text-[11px] font-bold">{item.company}</span>
                          </span>
                        </td>
                        <td className="text-xs">{item.employee}</td>
                        <td className="text-[10px]">{item.phone}</td>
                        <td className="text-[10px] text-muted">{item.email}</td>
                        <td className="text-xs">{item.totalOrder}건</td>
                        <td className="text-right text-xs">₩{item.totalAmount.toLocaleString("ko-KR")}</td>
                        <td className="text-center text-[10px] text-muted">{formatDate(item.recentOrderedAt)}</td>
                        <td className="pr-[14px]">
                          <Link to={`/clients/${item.id}`} aria-label={`${item.company} 상세`} className="flex text-muted" onClick={(event) => event.stopPropagation()}>
                            <ChevronRight size={14} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                  {loadError ? <tr><td colSpan={8} className="py-10 text-center text-xs text-danger">{loadError}</td></tr> : null}
                  {!loadError && pageRows.length === 0 ? (
                    <tr><td colSpan={8} className="py-10 text-center text-xs text-muted">조건에 맞는 거래처가 없습니다.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <Pager total={list.totalElements} page={page} pageSize={PAGE_SIZE} unit="개사" onChange={setPage} />
          </section>

        </div>

        {selected ? (
          <aside className="space-y-4">
            <section className="space-y-[18px] rounded-xl border border-line bg-white p-[22px]">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold">거래처 정보</h2>
                <Link to={`/clients/${selected.item.id}`} aria-label="거래처 상세" className="text-muted">
                  <Ellipsis size={18} />
                </Link>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex size-[46px] items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Building2 size={24} />
                </span>
                <div className="space-y-1">
                  <p className="text-xl font-bold">{selected.item.company}</p>
                  <p className="text-[10px] text-muted">{selected.detail?.userName || "담당 직원"}</p>
                </div>
              </div>
              <hr className="border-line" />
              <InfoRow label="대표자명" value={selected.item.employee} />
              <InfoRow label="이메일" value={selected.item.email} muted />
              <InfoRow label="연락처" value={selected.item.phone} />
              <InfoRow label="주소" value={selected.detail?.address || "-"} />
              {canWrite ? (
                <div className="flex gap-2">
                  <Link to={`/clients/${selected.item.id}/edit`} className="inline-flex h-8 items-center rounded-lg border border-line bg-white px-3 text-xs font-medium">
                    정보 수정
                  </Link>
                </div>
              ) : null}
              <hr className="border-line" />
              <div className="flex items-start justify-between">
                <div className="space-y-[5px]">
                  <p className="text-[10px] text-muted">누적 수주</p>
                  <p className="text-xl font-bold">{selected.item.totalOrder}건</p>
                </div>
                <div className="space-y-[5px]">
                  <p className="text-[10px] text-muted">누적 거래액</p>
                  <p className="text-lg font-bold">₩{selected.item.totalAmount.toLocaleString("ko-KR")}</p>
                </div>
              </div>
            </section>

            <section className="space-y-[18px] rounded-xl border border-line bg-white p-[22px]">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold">최근 수주</h2>
                <Link to={`/orders?keyword=${encodeURIComponent(selected.item.company)}`} className="text-[11px] font-medium text-primary">전체 →</Link>
              </div>
              {selectedRecentOrder ? (
                <div className="space-y-3">
                  <InfoRow
                    label="수주번호"
                    value={selectedRecentOrder.customerOrder.orderNo}
                  />
                  <InfoRow label="품목 요약" value={selectedRecentOrder.productName} />
                  <div className="grid grid-cols-2 gap-3">
                    <InfoRow label="납기일" value={selectedRecentOrder.customerOrder.estimatedDueDate} />
                    <InfoRow label="금액" value={`₩${selectedRecentOrder.customerOrder.totalAmount.toLocaleString("ko-KR")}`} />
                  </div>
                  <div className="space-y-[5px]">
                    <p className="text-[10px] text-muted">진행 상태</p>
                    <Badge className={orderStatusTone(screenOrderStatus(selectedRecentOrder.customerOrder.statusCode.code))}>
                      {selectedRecentOrder.customerOrder.statusCode.name || orderStatusLabel[screenOrderStatus(selectedRecentOrder.customerOrder.statusCode.code)]}
                    </Badge>
                  </div>
                </div>
              ) : selectedRecentOrder === null ? (
                <p className="text-xs text-muted">등록된 수주가 없습니다.</p>
              ) : (
                <p className="text-xs text-muted">최근 수주를 불러오는 중입니다.</p>
              )}
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

function InfoRow({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="space-y-[5px]">
      <p className="text-[10px] text-muted">{label}</p>
      <p className={cn("text-xs", muted && "text-muted")}>{value || "-"}</p>
    </div>
  );
}

const emptyClient = { companyName: "", representative: "", zipcode: "", roadAddress: "", detailAddress: "", phone: "", taxEmail: "" };

export function ClientFormPage() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const show = useToastStore((state) => state.show);
  const manager = useAuthStore((state) => state.user);
  const [form, setForm] = useState(emptyClient);
  const [checked, setChecked] = useState(false);
  const [duplicates, setDuplicates] = useState<ClientListItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const editing = Boolean(clientId);
  useEffect(() => {
    if (!clientId) return;
    const id = Number(clientId);
    if (!Number.isInteger(id)) return;
    getClient(id).then((detail) => {
      setForm({
        companyName: detail.company,
        representative: detail.employee,
        zipcode: detail.zipcode,
        roadAddress: detail.roadAddress,
        detailAddress: detail.detailAddress,
        phone: detail.phone,
        taxEmail: detail.email,
      });
    }).catch((error: unknown) => show(readApiErrorMessage(error)));
  }, [clientId, show]);
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
    void listClients({ keyword: companyName, page: 0, size: 20 }).then((response) => {
      const found = response.content.filter((client) =>
        String(client.id) !== clientId
        && client.company.trim() === companyName
        && (!phone || digitsOnly(client.phone) === phone),
      );
      setDuplicates(found);
      setChecked(true);
      show(found.length ? `같은 회사명의 거래처가 ${found.length}곳 있습니다.` : "겹치는 거래처가 없습니다.");
    }).catch((error: unknown) => show(readApiErrorMessage(error)));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-[27px] font-bold">{editing ? "거래처 수정" : "거래처 등록"}</h1>
          <p className="text-xs text-muted">
            {editing
              ? "등록된 거래처 정보를 수정합니다. 변경한 정보는 이후 견적 작성 시 자동으로 입력됩니다."
              : "새 거래처의 기본 정보를 등록합니다. 등록된 정보는 견적 작성 시 자동으로 입력됩니다."}
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
          onSubmit={async (event) => {
            event.preventDefault();
            if (!checked) {
              show("등록 전에 중복 확인을 눌러 주세요.");
              return;
            }
            const userId = Number(manager?.id);
            if (!Number.isInteger(userId) || userId <= 0) {
              show("로그인한 계정으로만 거래처를 저장할 수 있습니다.");
              return;
            }
            const input = {
              company: form.companyName.trim(),
              employee: form.representative.trim(),
              email: form.taxEmail.trim(),
              phone: form.phone.trim(),
              userId,
              address: { zipcode: form.zipcode.trim(), roadAddress: form.roadAddress.trim(), detailAddress: form.detailAddress.trim() },
            };
            setIsSubmitting(true);
            try {
              await (editing && clientId ? updateClient(Number(clientId), input) : createClient(input));
              show(editing ? "거래처를 수정했습니다." : "거래처를 등록했습니다.");
              navigate("/clients");
            } catch (error: unknown) {
              show(readApiErrorMessage(error));
            } finally {
              setIsSubmitting(false);
            }
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-[3px]">
              <h2 className="text-base font-bold">거래처 기본 정보</h2>
              <p className="text-[11px] text-muted">회사명, 대표자, 주소, 대표전화는 필수 입력 항목입니다.</p>
            </div>
            <span className="text-[10px] text-muted">* 필수 입력 항목</span>
          </div>

          <div className="space-y-2">
            <div className="flex items-end gap-2.5">
              <FormField label="회사명 *" className="flex-1">
                <input required placeholder="정식 회사명을 입력하세요" value={form.companyName} className={inputClass} onChange={(event) => patch({ companyName: event.target.value })} />
              </FormField>
              <Button tone="ghost" className="shrink-0 text-[13px] font-medium" onClick={runDuplicateCheck}>중복 확인</Button>
            </div>
            <p className="text-[10px] text-muted">
              {checked
                ? duplicates.length
                  ? "같은 회사명의 거래처가 있습니다. 아래 목록을 확인한 뒤 새로 등록할지 정하세요."
                  : "겹치는 거래처가 없습니다. 등록을 계속하세요."
                : "회사명과 연락처가 같은 거래처가 있는지 먼저 확인해 주세요."}
            </p>
            {checked && duplicates.length > 0 ? (
              <ul className="rounded-[7px] border border-line">
                {duplicates.map((client) => (
                  <li key={client.id}>
                    <Link to={`/clients/${client.id}`} className="flex items-center justify-between px-3 py-2 text-xs hover:bg-primary-soft">
                      <span className="font-medium">{client.company}</span>
                      <span className="text-muted">{client.employee} · {client.phone}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="grid gap-[14px] sm:grid-cols-2">
            <FormField label="대표자명 *">
              <input required placeholder="예: 홍길동" value={form.representative} className={inputClass} onChange={(event) => patch({ representative: event.target.value })} />
            </FormField>
            <FormField label="연락처 *">
              <input required placeholder="예: 02-1234-5678" value={form.phone} className={inputClass} onChange={(event) => patch({ phone: event.target.value })} />
            </FormField>
            <FormField label="이메일 *">
              <input required type="email" placeholder="예: user1234@company.com" value={form.taxEmail} className={inputClass} onChange={(event) => patch({ taxEmail: event.target.value })} />
            </FormField>
            <FormField label="담당 직원">
              <span className="relative block">
                <select
                  className={`${inputClass} appearance-none pr-9`}
                  value={manager?.id ?? ""}
                  onChange={() => undefined}
                >
                  <option value={manager?.id ?? ""}>{manager ? `${manager.name} · 로그인한 계정` : "로그인 필요"}</option>
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" />
              </span>
            </FormField>
          </div>

          <hr className="border-line" />

          <CompanyAddress
            zipcode={form.zipcode}
            road={form.roadAddress}
            detail={form.detailAddress}
            onSearch={() => {
              if (!window.daum?.Postcode) {
                show("우편번호 서비스를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
                return;
              }
              new window.daum.Postcode({
                oncomplete: (data) => {
                  patch({
                    zipcode: data.zonecode,
                    roadAddress: data.roadAddress || data.address,
                  });
                },
              }).open();
            }}
            onDetail={(detailAddress) => patch({ detailAddress })}
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
              <Button type="submit" disabled={isSubmitting} className="gap-2 text-[13px] font-medium">
                <Check size={16} />
                {isSubmitting ? "저장 중…" : editing ? "수정 저장" : "거래처 등록"}
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
                <p className="text-[11px] text-muted">거래처 관리의 엑셀 일괄등록을 이용하세요. 지정 양식의 .xlsx, .xls 파일을 지원합니다.</p>
              </div>
              <Link to="/clients" className="block text-[11px] text-primary">거래처 관리로 →</Link>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

const inputClass = "h-[41px] w-full rounded-[7px] border border-line bg-white px-3 text-xs placeholder:text-muted/70";

function CompanyAddress({
  zipcode,
  road,
  detail,
  onSearch,
  onDetail,
}: {
  zipcode: string;
  road: string;
  detail: string;
  onSearch: () => void;
  onDetail: (value: string) => void;
}) {
  return (
    <div className="space-y-[7px]">
      <p className="text-xs font-medium">회사 주소 *</p>
      <div className="flex items-center gap-2">
        <input required readOnly value={zipcode} placeholder="우편번호" className={inputClass} />
        <button type="button" className="h-[41px] shrink-0 rounded-[7px] border border-line bg-white px-4 text-[13px] font-medium" onClick={onSearch}>
          우편번호 찾기
        </button>
      </div>
      <span className="relative block">
        <input required readOnly value={road} placeholder="도로명 주소를 입력하세요" className={`${inputClass} pr-9`} />
        <MapPin size={15} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" />
      </span>
      <input placeholder="건물명, 층, 호수 등 상세 주소를 입력하세요" value={detail} className={inputClass} onChange={(event) => onDetail(event.target.value)} />
      <p className="text-[10px] text-muted">견적 작성 때 거래처 주소로 채워집니다. 배송지는 승인된 견적으로 수주를 등록할 때 확인합니다.</p>
    </div>
  );
}

const registrationSteps = [
  { title: "기본 정보 입력", body: "회사명과 연락처를 정확하게 입력해 주세요." },
  { title: "기존 거래처 확인", body: "중복 확인으로 같은 회사명과 연락처의 거래처를 비교하세요." },
  { title: "견적에서 바로 사용", body: "등록 후 견적 작성 화면에서 회사명을 검색할 수 있습니다." },
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
  const role = useAuthStore((state) => state.user?.role);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [recentOrder, setRecentOrder] = useState<ClientOrder | null>(null);
  const [recentError, setRecentError] = useState("");
  const [history, setHistory] = useState<ClientOrderPage | null>(null);
  const [historyError, setHistoryError] = useState("");
  const numericClientId = Number(clientId);
  const validClientId = Number.isInteger(numericClientId) && numericClientId > 0;
  useEffect(() => {
    if (!validClientId) return;
    let ignore = false;
    getClient(numericClientId).then((response) => {
      if (!ignore) setDetail(response);
    }).catch((error: unknown) => {
      if (!ignore) setLoadError(readApiErrorMessage(error));
    });
    return () => {
      ignore = true;
    };
  }, [numericClientId, validClientId]);
  useEffect(() => {
    if (!validClientId) return;
    let ignore = false;
    getRecentClientOrder(numericClientId).then((response) => {
      if (ignore) return;
      setRecentOrder(response);
      setRecentError("");
    }).catch((error: unknown) => {
      if (!ignore) setRecentError(readApiErrorMessage(error));
    });
    return () => {
      ignore = true;
    };
  }, [numericClientId, validClientId]);
  useEffect(() => {
    if (!validClientId) return;
    let ignore = false;
    listClientOrders(numericClientId, page - 1, HISTORY_PAGE_SIZE).then((response) => {
      if (ignore) return;
      setHistory(response);
      setHistoryError("");
    }).catch((error: unknown) => {
      if (!ignore) setHistoryError(readApiErrorMessage(error));
    });
    return () => {
      ignore = true;
    };
  }, [numericClientId, page, validClientId]);
  if (!validClientId) return <p>거래처를 찾을 수 없습니다.</p>;
  if (loadError) return <p>{loadError}</p>;
  if (!detail) return <p>거래처를 불러오는 중입니다.</p>;
  const client = {
    id: String(detail.id),
    companyName: detail.company,
    representative: detail.employee,
    phone: detail.phone,
    contactName: detail.userName,
    contactMobile: detail.userPhone,
    taxEmail: detail.email,
  };
  const canWrite = canManageOrders(role);
  const breakdown = `진행 중 ${detail.ongoingOrders}건`;
  const historyRows = history?.content ?? [];

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
            </>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <DetailMetric label="누적 수주" icon={<ClipboardList size={20} />} value={`${detail.totalOrder}건`} caption={breakdown} />
        <DetailMetric label="누적 거래액" icon={<Building2 size={20} />} value={`₩${detail.totalAmount.toLocaleString("ko-KR")}`} caption="서버에 집계된 수주 금액" />
        <DetailMetric
          label="진행 중 수주"
          icon={<CalendarDays size={20} />}
          value={`${detail.ongoingOrders}건`}
          caption="완료되지 않은 수주"
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
                <p className="text-[11px] text-muted">{detail.userName} 담당</p>
              </div>
            </div>
            <hr className="border-line" />
            <div className="grid gap-[18px] sm:grid-cols-2 sm:gap-x-6">
              <DetailField label="대표자명" value={client.representative} />
              <DetailField label="연락처" value={client.phone} />
              <DetailField label="담당 직원" value={client.contactName} />
              <DetailField label="담당자 휴대번호" value={client.contactMobile} />
              <DetailField label="회사 주소" value={detail.address} wide />
              <DetailField label="거래처 이메일" value={client.taxEmail} wide />
            </div>
          </section>
          <section className="flex items-start gap-3 rounded-lg bg-primary-soft p-[15px]">
            <Info size={18} className="shrink-0 text-primary" />
            <div className="space-y-1">
              <p className="text-xs font-medium text-primary">수주와 연결되는 거래처 정보</p>
              <p className="text-[11px] text-muted">견적 작성에서 이 거래처를 선택하면 연락처와 주소가 채워집니다. 배송지는 승인 후 수주 등록에서 확인합니다.</p>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="space-y-[18px] rounded-xl border border-line bg-white p-[22px]">
            <h2 className="text-base font-bold">최근 수주</h2>
            {recentOrder ? (
              <>
                <div className="space-y-1">
                  <Link to={`/orders/${recentOrder.customerOrder.id}`} className="text-sm font-bold text-primary">{recentOrder.customerOrder.orderNo}</Link>
                  <p className="text-[10px] text-muted">{formatDate(recentOrder.customerOrder.createdAt)} 등록</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge className={orderStatusTone(screenOrderStatus(recentOrder.customerOrder.statusCode.code))}>
                    {recentOrder.customerOrder.statusCode.name || orderStatusLabel[screenOrderStatus(recentOrder.customerOrder.statusCode.code)]}
                  </Badge>
                  <Badge className={paymentTone(screenPaymentStatus(recentOrder.customerOrder.paymentStatus))}>
                    {paymentStatusLabel[screenPaymentStatus(recentOrder.customerOrder.paymentStatus)]}
                  </Badge>
                </div>
                <InfoRow label="생산 품목" value={recentOrder.productName} />
                <InfoRow label="수주 금액" value={`₩${recentOrder.customerOrder.totalAmount.toLocaleString("ko-KR")}`} />
                <InfoRow label="납기일" value={recentOrder.customerOrder.estimatedDueDate} />
              </>
            ) : recentError ? (
              <p className="text-xs text-danger">{recentError}</p>
            ) : (
              <p className="text-xs text-muted">최근 수주를 불러오는 중입니다.</p>
            )}
          </section>
        </aside>
      </div>

      <section className="space-y-[18px] rounded-xl border border-line bg-white p-[22px]">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-[3px]">
            <h2 className="text-base font-bold">수주 이력</h2>
            <p className="text-[11px] text-muted">{client.companyName}의 전체 수주 {history?.totalElements ?? 0}건 · 최근 등록순</p>
          </div>
          <span className="text-[11px] text-muted">금액은 VAT 포함</span>
        </div>
        <div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] table-fixed text-left [&_td]:pr-4 [&_th]:pr-4">
              <colgroup>
                {Array.from({ length: 6 }, (_, index) => <col key={index} className="w-[16%]" />)}
                <col className="w-[4%]" />
              </colgroup>
              <thead className="border-y border-line bg-canvas/60 text-[11px] text-muted">
                <tr className="h-10 whitespace-nowrap [&_th]:font-normal">
                  <th className="pl-[14px]">수주번호 / 등록일</th>
                  <th>생산 품목</th>
                  <th>수주 금액</th>
                  <th>납기일</th>
                  <th>진행 상태</th>
                  <th>입금 확인</th>
                  <th className="pr-[14px]"><span className="sr-only">상세</span></th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map(({ customerOrder: order, productName }) => {
                  const status = screenOrderStatus(order.statusCode.code);
                  const payment = screenPaymentStatus(order.paymentStatus);
                  return (
                    <tr key={order.id} className="h-[61px] border-b border-line">
                      <td className="pl-[14px]">
                        <Link to={`/orders/${order.id}`} className="text-xs font-bold text-primary">{order.orderNo}</Link>
                        <p className="mt-0.5 text-[10px] text-muted">{formatDate(order.createdAt)}</p>
                      </td>
                      <td className="text-xs">{productName}</td>
                      <td className="text-xs font-medium">₩{order.totalAmount.toLocaleString("ko-KR")}</td>
                      <td className="text-xs">{order.estimatedDueDate}</td>
                      <td><Badge className={orderStatusTone(status)}>{order.statusCode.name || orderStatusLabel[status]}</Badge></td>
                      <td><Badge className={paymentTone(payment)}>{paymentStatusLabel[payment]}</Badge></td>
                      <td className="pr-[14px]">
                        <Link to={`/orders/${order.id}`} aria-label={`${order.orderNo} 상세`} className="flex text-muted">
                          <ChevronRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {historyError ? <tr><td colSpan={7} className="py-10 text-center text-xs text-danger">{historyError}</td></tr> : null}
                {!historyError && history && historyRows.length === 0 ? (
                  <tr><td colSpan={7} className="py-10 text-center text-xs text-muted">등록된 수주 이력이 없습니다.</td></tr>
                ) : null}
                {!historyError && !history ? <tr><td colSpan={7} className="py-10 text-center text-xs text-muted">수주 이력을 불러오는 중입니다.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="pt-4">
            <Pager total={history?.totalElements ?? 0} page={page} pageSize={HISTORY_PAGE_SIZE} unit="건" onChange={setPage} />
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

