import { ArrowLeft, Check, CircleAlert, CircleCheck, Info, Mail, MessageSquare, Phone, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router";
import { z } from "zod";
import { AddressPicker } from "@/components/AddressPicker.tsx";
import { ProductModal } from "@/components/ProductModal.tsx";
import { Button } from "@/components/ui.tsx";
import { cn } from "@/lib/cn.ts";
import { todayISO } from "@/lib/dates.ts";
import { useDb } from "@/lib/db.ts";
import { depositTarget, digitsOnly, formatWon, lineAmount } from "@/lib/money.ts";
import { capacityUntil } from "@/lib/schedule.ts";
import { DueDateError, createOrder, previewSchedule } from "@/lib/workflow.ts";
import { useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";
import type { Database, NotifyChannel } from "@/types/domain.ts";

const DRAFT_KEY = "prodflow-order-draft";

interface LineValues {
  productId: string;
  quantity: number;
  unitPrice: number;
}

interface FormValues {
  clientId: string;
  lines: LineValues[];
  vatSeparate: boolean;
  requestedDueDate: string;
  receiverPhone: string;
  shippingAddress: string;
  notifyChannel: NotifyChannel;
  memo: string;
}

const schema = z.object({
  clientId: z.string().min(1, "클라이언트를 선택하세요."),
  lines: z
    .array(z.object({
      productId: z.string().min(1, "생산품목을 선택하세요."),
      quantity: z.number({ error: "수량을 입력하세요." }).int("수량은 정수로 입력하세요.").positive("수량은 1개 이상입니다."),
      unitPrice: z.number({ error: "단가를 입력하세요." }).int("단가는 원 단위 정수로 입력하세요.").min(0, "단가는 0원 이상입니다."),
    }))
    .min(1, "생산품목을 1개 이상 추가하세요."),
  vatSeparate: z.boolean(),
  requestedDueDate: z.string().min(1, "납기일을 선택하세요."),
  receiverPhone: z.string().refine((value) => digitsOnly(value).length >= 9, "배송 수신 연락처를 확인하세요."),
  shippingAddress: z.string().min(1, "배송지를 선택하세요."),
  notifyChannel: z.enum(["SMS", "EMAIL"]),
  memo: z.string().max(200, "업무 메모는 200자 이내로 입력하세요."),
});

const emptyLine: LineValues = { productId: "", quantity: 100, unitPrice: 0 };

function blankValues(db: Database, clientId: string | null): FormValues {
  const client = db.clients.find((item) => item.id === clientId);
  return {
    clientId: client?.id ?? "",
    lines: [{ ...emptyLine }],
    vatSeparate: true,
    requestedDueDate: "",
    receiverPhone: client?.contactMobile ?? "",
    shippingAddress: client?.address ?? "",
    notifyChannel: "SMS",
    memo: "",
  };
}

function readDraft(db: Database): { values: FormValues; savedAt: string } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as { values: FormValues; savedAt: string };
    const values = { ...blankValues(db, null), ...draft.values };
    if (!db.clients.some((client) => client.id === values.clientId)) values.clientId = "";
    values.lines = (values.lines?.length ? values.lines : [{ ...emptyLine }]).map((line) => ({
      ...line,
      productId: db.products.some((product) => product.id === line.productId) ? line.productId : "",
    }));
    return { values, savedAt: draft.savedAt };
  } catch {
    return null;
  }
}

function clockLabel(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function OrderFormPage() {
  const db = useDb();
  const navigate = useNavigate();
  const actor = useAuthStore((state) => state.user);
  const show = useToastStore((state) => state.show);
  const [searchParams] = useSearchParams();
  const presetClientId = searchParams.get("clientId");
  const [initial] = useState(() => (presetClientId ? null : readDraft(db)));
  const [savedAt, setSavedAt] = useState<string | null>(initial?.savedAt ?? null);
  const [clientQuery, setClientQuery] = useState(() => db.clients.find((client) => client.id === (initial?.values.clientId ?? presetClientId))?.companyName ?? "");
  const [clientOpen, setClientOpen] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [modalName, setModalName] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [laterDue, setLaterDue] = useState("");

  const form = useForm<FormValues>({ defaultValues: initial?.values ?? blankValues(db, presetClientId) });
  const fields = useFieldArray({ control: form.control, name: "lines" });
  const watched = useWatch({ control: form.control });
  const values: FormValues = { ...blankValues(db, null), ...watched, lines: (watched.lines ?? []).map((line) => ({ productId: line?.productId ?? "", quantity: Number(line?.quantity), unitPrice: Number(line?.unitPrice) })) } as FormValues;
  const draftJson = JSON.stringify(values);

  useEffect(() => {
    const parsed = JSON.parse(draftJson) as FormValues;
    const touched = parsed.clientId || parsed.memo || parsed.requestedDueDate || parsed.lines.some((line) => line.productId);
    if (!touched) return;
    const timer = window.setTimeout(() => {
      const at = new Date().toISOString();
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ values: parsed, savedAt: at }));
      setSavedAt(at);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [draftJson]);

  const client = db.clients.find((item) => item.id === values.clientId);
  const clientMatches = db.clients.filter((item) => `${item.companyName} ${item.representative} ${item.businessNumber} ${item.phone}`.toLowerCase().includes(clientQuery.trim().toLowerCase()));
  const productMatches = productQuery.trim()
    ? db.products.filter((item) => `${item.productName} ${item.modelName} ${item.description}`.toLowerCase().includes(productQuery.trim().toLowerCase())).slice(0, 6)
    : [];

  const amounts = values.lines.map((line) => {
    const quantity = Number.isFinite(line.quantity) ? line.quantity : 0;
    const unitPrice = Number.isFinite(line.unitPrice) ? line.unitPrice : 0;
    const total = lineAmount({ quantity, unitPrice, vatIncluded: !values.vatSeparate });
    const supply = values.vatSeparate ? quantity * unitPrice : Math.round(total / 1.1);
    return { quantity, supply, total };
  });
  const quantity = amounts.reduce((sum, item) => sum + item.quantity, 0);
  const total = amounts.reduce((sum, item) => sum + item.total, 0);
  const supply = amounts.reduce((sum, item) => sum + item.supply, 0);
  const deposit = depositTarget(total);

  const preview = useMemo(() => {
    if (quantity <= 0) return null;
    try {
      return previewSchedule(quantity);
    } catch (reason: unknown) {
      return reason instanceof Error ? reason.message : null;
    }
  }, [quantity, db]);
  const capacity = values.requestedDueDate ? capacityUntil(values.requestedDueDate, todayISO(), db.lines, db.holidays.map((holiday) => holiday.date), db.orders) : null;
  const earliest = preview && typeof preview !== "string" ? preview.earliestDueDate : null;
  const feasible = Boolean(earliest && values.requestedDueDate && values.requestedDueDate >= earliest);

  const steps = [
    { label: "클라이언트 정보", done: Boolean(client), target: "order-client" },
    { label: "생산품목 및 금액", done: values.lines.length > 0 && values.lines.every((line) => line.productId && line.quantity > 0 && line.unitPrice >= 0), target: "order-items" },
    { label: "납기 및 배송", done: Boolean(values.requestedDueDate && values.shippingAddress && digitsOnly(values.receiverPhone).length >= 9), target: "order-delivery" },
  ];

  function pickClient(id: string) {
    const picked = db.clients.find((item) => item.id === id);
    if (!picked) return;
    form.setValue("clientId", picked.id);
    form.setValue("shippingAddress", picked.address);
    form.setValue("receiverPhone", picked.contactMobile);
    setClientQuery(picked.companyName);
    setClientOpen(false);
  }

  function placeProduct(productId: string, unitPrice: number) {
    if (values.lines.some((line) => line.productId === productId)) {
      show("이미 추가된 품목입니다. 해당 줄의 수량을 수정하세요.");
      return;
    }
    const empty = values.lines.findIndex((line) => !line.productId);
    if (empty >= 0) {
      form.setValue(`lines.${empty}.productId`, productId);
      form.setValue(`lines.${empty}.unitPrice`, unitPrice);
    } else {
      fields.append({ productId, quantity: 100, unitPrice });
    }
    setProductQuery("");
  }

  function clearDraft() {
    localStorage.removeItem(DRAFT_KEY);
    setSavedAt(null);
    form.reset(blankValues(db, null));
    setClientQuery("");
    setError("");
    setLaterDue("");
  }

  const submit = form.handleSubmit(() => {
    setLaterDue("");
    const parsed = schema.safeParse({ ...values, lines: values.lines.map((line) => ({ ...line, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice) })) });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "입력값을 확인하세요.");
      return;
    }
    if (!actor) return;
    const input = parsed.data;
    try {
      const order = createOrder({
        clientId: input.clientId,
        lines: input.lines.map((line) => ({ ...line, vatIncluded: !input.vatSeparate })),
        requestedDueDate: input.requestedDueDate,
        shippingAddress: input.shippingAddress,
        receiverPhone: input.receiverPhone,
        notifyChannel: input.notifyChannel,
        memo: input.memo,
        actor,
      });
      localStorage.removeItem(DRAFT_KEY);
      show(`${order.orderNo} 수주를 등록했습니다. 선금이 확인되면 작업지시가 만들어집니다.`);
      navigate(`/orders/${order.id}`);
    } catch (reason: unknown) {
      if (reason instanceof DueDateError) setLaterDue(reason.earliestDue);
      setError(reason instanceof Error ? reason.message : "등록하지 못했습니다.");
    }
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">신규 수주 등록</h1>
          <p className="mt-1 text-sm text-muted">클라이언트를 선택하면 등록된 연락처와 주소가 자동으로 입력됩니다.</p>
        </div>
        <Link to="/orders" className="inline-flex h-10 items-center gap-1 rounded-lg border border-line bg-white px-4 text-sm font-semibold"><ArrowLeft size={16} />수주 목록으로</Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white px-4 py-3">
        <ol className="flex flex-wrap items-center gap-2 text-sm">
          {steps.map((step, index) => (
            <li key={step.label} className="flex items-center gap-2">
              {index > 0 ? <span className="text-muted">›</span> : null}
              <button type="button" className="flex items-center gap-2" onClick={() => document.getElementById(step.target)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold", step.done ? "bg-primary text-white" : "bg-canvas text-muted")}>{step.done ? <Check size={13} /> : index + 1}</span>
                <span className={step.done ? "font-semibold text-ink" : "text-muted"}>{step.label}</span>
              </button>
            </li>
          ))}
        </ol>
        <span className="text-xs text-muted">* 필수 입력 항목</span>
      </div>

      <form className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]" onSubmit={submit}>
        <div className="min-w-0 space-y-4">
          <Section id="order-client" title="클라이언트 정보" badge={client ? <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary"><Check size={12} />등록된 클라이언트</span> : null}>
            <div className="relative">
              <FieldLabel>회사명 *</FieldLabel>
              <div className="relative">
                <input
                  className="h-10 w-full rounded-lg border border-line bg-white px-3 pr-9 text-sm"
                  value={clientQuery}
                  placeholder="회사명, 대표자, 사업자번호로 검색"
                  onFocus={() => setClientOpen(true)}
                  onBlur={() => window.setTimeout(() => setClientOpen(false), 150)}
                  onChange={(event) => {
                    setClientQuery(event.target.value);
                    setClientOpen(true);
                    if (client && event.target.value !== client.companyName) form.setValue("clientId", "");
                  }}
                />
                <Search size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" />
              </div>
              {clientOpen ? (
                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-line bg-white shadow-lg">
                  <ul className="max-h-60 overflow-y-auto">
                    {clientMatches.slice(0, 8).map((item) => (
                      <li key={item.id}>
                        <button type="button" className={cn("flex w-full items-center justify-between px-3 py-2 text-left hover:bg-canvas", item.id === values.clientId && "bg-primary-soft")} onMouseDown={(event) => event.preventDefault()} onClick={() => pickClient(item.id)}>
                          <span>
                            <span className="block text-sm font-semibold">{item.companyName}</span>
                            <span className="block text-xs text-muted">{item.representative} · {item.phone} · {item.address}</span>
                          </span>
                          {item.id === values.clientId ? <Check size={16} className="text-primary" /> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {clientMatches.length === 0 ? (
                    <p className="border-t border-line px-3 py-2 text-xs text-muted">검색 결과가 없습니다. <Link to="/clients/new" className="font-semibold text-primary">클라이언트 관리에서 먼저 등록</Link>한 뒤 선택하세요.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <ReadField label="사업자등록번호" value={client?.businessNumber} />
              <ReadField label="대표자명" value={client?.representative} />
              <ReadField label="대표전화" value={client?.phone} />
              <ReadField label="담당자 / 휴대번호" value={client ? `${client.contactName} · ${client.contactMobile}` : undefined} />
              <div className="sm:col-span-2"><ReadField label="회사 주소" value={client?.address} /></div>
              <div className="sm:col-span-2"><ReadField label="세금계산서 이메일" value={client?.taxEmail} /></div>
            </div>
            <p className="mt-3 text-xs text-muted">
              {client ? <span className="text-success">✓ 등록된 클라이언트 정보를 불러왔습니다. 정보 수정은 클라이언트 관리에서 합니다.</span> : "회사명을 검색해 등록된 클라이언트를 선택하세요."}
            </p>
          </Section>

          <Section
            id="order-items"
            title="생산품목 및 금액"
            description={values.vatSeparate ? "단가는 부가세 별도 금액으로 입력하세요." : "단가는 부가세 포함 금액으로 입력하세요."}
            action={<Button tone="ghost" className="h-9 px-3 text-sm" onClick={() => fields.append({ ...emptyLine })}><Plus size={15} className="mr-1" />품목 추가</Button>}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="bg-canvas text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">생산품목 *</th>
                    <th className="w-28 py-2 font-medium">수량 *</th>
                    <th className="w-32 py-2 font-medium">단가 (원) *</th>
                    <th className="w-32 py-2 text-right font-medium">{values.vatSeparate ? "공급가액" : "금액 (VAT 포함)"}</th>
                    <th className="w-10 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {fields.fields.map((field, index) => {
                    const line = values.lines[index];
                    const product = db.products.find((item) => item.id === line?.productId);
                    const used = new Set(values.lines.filter((_, other) => other !== index).map((item) => item.productId));
                    return (
                      <tr key={field.id} className="border-t border-line align-top">
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            {product?.designImageUrl ? <img src={product.designImageUrl} alt="" className="h-9 w-9 shrink-0 rounded-md border border-line object-cover" /> : <span className="h-9 w-9 shrink-0 rounded-md bg-canvas" />}
                            <div className="min-w-0 flex-1">
                              <select
                                aria-label={`${index + 1}번째 생산품목`}
                                className="h-9 w-full rounded-lg border border-line bg-white px-2 font-semibold"
                                value={line?.productId ?? ""}
                                onChange={(event) => {
                                  const picked = db.products.find((item) => item.id === event.target.value);
                                  form.setValue(`lines.${index}.productId`, event.target.value);
                                  if (picked) form.setValue(`lines.${index}.unitPrice`, picked.unitPrice);
                                }}
                              >
                                <option value="">품목을 선택하세요</option>
                                {db.products.map((item) => <option key={item.id} value={item.id} disabled={used.has(item.id)}>{item.productName} {item.modelName}</option>)}
                              </select>
                              <p className="mt-1 truncate text-xs text-muted">{product ? product.description || "설명 없음" : "아래 검색이나 신규 품목 등록으로도 추가할 수 있습니다."}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3"><input aria-label={`${index + 1}번째 수량`} type="number" min={1} className="h-9 w-24 rounded-lg border border-line px-2 text-right" {...form.register(`lines.${index}.quantity`, { valueAsNumber: true })} /></td>
                        <td className="py-3"><input aria-label={`${index + 1}번째 단가`} type="number" min={0} className="h-9 w-28 rounded-lg border border-line px-2 text-right" {...form.register(`lines.${index}.unitPrice`, { valueAsNumber: true })} /></td>
                        <td className="py-3 pt-5 text-right font-semibold">{formatWon(values.vatSeparate ? amounts[index]?.supply ?? 0 : amounts[index]?.total ?? 0)}</td>
                        <td className="py-3 pt-4 text-center">
                          <button type="button" aria-label={`${index + 1}번째 품목 삭제`} className="rounded p-1 text-muted hover:bg-canvas hover:text-danger disabled:opacity-30" disabled={fields.fields.length === 1} onClick={() => fields.remove(index)}><X size={16} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="relative mt-3">
              <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-3">
                <Search size={15} className="text-muted" />
                <input className="h-10 flex-1 bg-transparent text-sm outline-none" value={productQuery} placeholder="제품명·모델명 일부를 입력하면 등록된 품목을 찾아 줄을 추가합니다." onChange={(event) => setProductQuery(event.target.value)} />
                <button type="button" className="shrink-0 text-xs font-semibold text-primary" onClick={() => setModalName(productQuery.trim())}>+ 신규 품목 등록</button>
              </div>
              {productQuery.trim() ? (
                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-line bg-white shadow-lg">
                  {productMatches.map((item) => (
                    <button key={item.id} type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-canvas" onClick={() => placeProduct(item.id, item.unitPrice)}>
                      <span><span className="font-semibold">{item.productName} {item.modelName}</span><span className="ml-2 text-xs text-muted">{item.description}</span></span>
                      <span className="text-xs text-muted">{formatWon(item.unitPrice)}</span>
                    </button>
                  ))}
                  {productMatches.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted">'{productQuery.trim()}' 품목이 없습니다. <button type="button" className="font-semibold text-primary" onClick={() => setModalName(productQuery.trim())}>신규 품목으로 등록</button></p>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" {...form.register("vatSeparate")} />
                부가세 포함하여 청구 (10%)
              </label>
              <span className="text-xs text-muted">총 수량 {quantity.toLocaleString("ko-KR")}개 · {values.lines.filter((line) => line.productId).length}개 품목</span>
            </div>
          </Section>

          <Section id="order-delivery" title="납기 및 배송" description="출고 시 선택한 알림 채널로 배송 안내가 발송됩니다.">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <FieldLabel>납기일 *</FieldLabel>
                <input type="date" min={todayISO()} className="h-10 w-full rounded-lg border border-line bg-white px-3" {...form.register("requestedDueDate")} />
                <span className="mt-1 block text-xs text-muted">{typeof preview === "string" ? preview : earliest ? `가장 빠른 납기일 ${earliest}` : "품목 수량을 입력하면 가장 빠른 납기일을 계산합니다."}</span>
              </label>
              <label className="block text-sm">
                <FieldLabel>배송 수신 연락처 *</FieldLabel>
                <span className="relative block">
                  <input className="h-10 w-full rounded-lg border border-line bg-white px-3 pr-9" placeholder="010-0000-0000" {...form.register("receiverPhone")} />
                  <Phone size={15} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" />
                </span>
              </label>
            </div>
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-end">
                {client ? (
                  values.shippingAddress === client.address
                    ? <span className="text-xs font-semibold text-success">✓ 클라이언트 주소와 동일</span>
                    : <button type="button" className="text-xs font-semibold text-primary" onClick={() => form.setValue("shippingAddress", client.address)}>클라이언트 주소로 채우기</button>
                ) : null}
              </div>
              <AddressPicker label="배송지 *" value={values.shippingAddress} onChange={(address) => form.setValue("shippingAddress", address)} />
            </div>
            <div className="mt-4">
              <FieldLabel>배송 알림 채널</FieldLabel>
              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  { id: "SMS", label: "SMS 문자", icon: <MessageSquare size={16} /> },
                  { id: "EMAIL", label: "이메일", icon: <Mail size={16} /> },
                ] as const).map((channel) => (
                  <button
                    key={channel.id}
                    type="button"
                    aria-pressed={values.notifyChannel === channel.id}
                    className={cn("flex h-11 items-center justify-center gap-2 rounded-lg border text-sm font-semibold", values.notifyChannel === channel.id ? "border-primary bg-primary-soft text-primary" : "border-line bg-white text-muted")}
                    onClick={() => form.setValue("notifyChannel", channel.id)}
                  >
                    {channel.icon}{channel.label}{values.notifyChannel === channel.id ? <Check size={15} /> : null}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">
                {values.notifyChannel === "SMS" ? "출고 시 배송 수신 연락처로 택배사와 운송장 번호를 문자로 보냅니다." : `출고 시 ${client?.taxEmail ?? "클라이언트 이메일"}로 배송 안내 메일을 보냅니다.`}
              </p>
            </div>
            <label className="mt-4 block text-sm">
              <FieldLabel>업무 메모</FieldLabel>
              <input className="h-10 w-full rounded-lg border border-line bg-white px-3" maxLength={200} placeholder="예: 납품 전 담당자에게 연락 부탁드립니다." {...form.register("memo")} />
            </label>
          </Section>

          <Section title="생산 가능 여부 확인" description="납기일까지 공장의 남은 생산량과 이번 수주 수량을 비교합니다. 출고 준비를 위해 납기 2 영업일 전까지 생산을 마칩니다.">
            <div className="grid gap-3 sm:grid-cols-3">
              <ReadField label="총 생산량" value={capacity ? `${capacity.total.toLocaleString("ko-KR")}개` : undefined} />
              <ReadField label="가용 생산량" value={capacity ? `${capacity.available.toLocaleString("ko-KR")}개` : undefined} />
              <ReadField label="수주 예정량" value={`${quantity.toLocaleString("ko-KR")}개`} />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              {!values.requestedDueDate || quantity <= 0 ? (
                <p className="text-muted">품목 수량과 납기일을 입력하면 생산 가능 여부를 확인합니다.</p>
              ) : feasible ? (
                <p className="flex items-center gap-2"><span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary"><CircleCheck size={13} />생산 가능</span>수주 예정량 {quantity.toLocaleString("ko-KR")}개는 {capacity?.lastProductionDate ?? "-"}까지의 가용 생산량 안에 들어갑니다.</p>
              ) : (
                <p className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning"><CircleAlert size={13} />생산 불가</span>{earliest ? `이 납기로는 수량을 다 만들 수 없습니다. 가장 빠른 납기일은 ${earliest}입니다.` : typeof preview === "string" ? preview : ""}
                  {earliest ? <button type="button" className="text-xs font-semibold text-primary" onClick={() => form.setValue("requestedDueDate", earliest)}>{earliest}로 변경</button> : null}
                </p>
              )}
            </div>
          </Section>
        </div>

        <aside className="space-y-3 xl:sticky xl:top-6">
          <section className="rounded-xl border border-line bg-white p-5">
            <h2 className="font-semibold">수주 요약</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <SummaryRow label="등록일" value={todayISO()} />
              <SummaryRow label="납품일" value={values.requestedDueDate || "납기일 선택 전"} muted={!values.requestedDueDate} />
              <div className="border-t border-line" />
              <SummaryRow label="공급가액" value={formatWon(supply)} />
              <SummaryRow label="부가세 (10%)" value={formatWon(total - supply)} />
              <div className="border-t border-line" />
              <SummaryRow label="계약금 (선금 50%)" value={formatWon(deposit)} />
              <SummaryRow label="잔금 (배송 완료 후)" value={formatWon(total - deposit)} />
            </dl>
            <div className="mt-4 rounded-lg bg-primary-soft p-4">
              <p className="text-xs font-semibold text-primary">총 수주 금액</p>
              <p className="mt-1 text-2xl font-bold text-primary">{formatWon(total)}</p>
              <p className="mt-1 text-xs text-primary/80">수량·단가·부가세 기준 자동 계산</p>
            </div>
            <Button type="submit" className="mt-4 w-full" disabled={Boolean(values.requestedDueDate && earliest && !feasible)}><Check size={16} className="mr-1" />수주 등록</Button>
            {error ? (
              <div className="mt-3 text-sm text-danger">
                <p>{error}</p>
                {laterDue ? <button type="button" className="mt-1 text-xs font-semibold text-primary" onClick={() => { form.setValue("requestedDueDate", laterDue); setError(""); setLaterDue(""); }}>{laterDue}로 납기 변경</button> : null}
              </div>
            ) : null}
          </section>
          <section className="flex gap-2 rounded-xl border border-primary/30 bg-primary-soft/50 p-4 text-sm">
            <Info size={16} className="mt-0.5 shrink-0 text-primary" />
            <div>
              <p className="font-semibold text-primary">선금 확인 후 생산 시작</p>
              <p className="mt-1 text-xs text-muted">등록하면 가상계좌가 발급되고 일정이 잡힙니다. 계약금(선금 50%)이 입금되면 작업지시가 자동으로 만들어집니다.</p>
            </div>
          </section>
          <p className="flex items-center justify-between px-1 text-xs text-muted">
            <span>{savedAt ? `임시저장 · 자동 저장 ${clockLabel(savedAt)}` : "입력하면 자동으로 임시저장됩니다."}</span>
            {savedAt ? <button type="button" className="font-semibold text-muted hover:text-danger" onClick={clearDraft}>임시저장 비우기</button> : null}
          </p>
        </aside>
      </form>

      {modalName !== null && actor ? (
        <ProductModal
          initialName={modalName}
          actorName={actor.name}
          onClose={() => setModalName(null)}
          onSaved={(productId, unitPrice) => {
            setModalName(null);
            placeProduct(productId, unitPrice);
            show("신규 품목을 등록하고 수주에 추가했습니다.");
          }}
        />
      ) : null}
    </div>
  );
}

function Section({ id, title, description, badge, action, children }: { id?: string; title: string; description?: string; badge?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-xl border border-line bg-white p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
        </div>
        {badge ?? action}
      </div>
      {children}
    </section>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="mb-1 block text-sm font-medium text-ink">{children}</span>;
}

function ReadField({ label, value }: { label: string; value?: string }) {
  return (
    <div className="text-sm">
      <FieldLabel>{label}</FieldLabel>
      <p className={cn("flex h-10 items-center truncate rounded-lg border border-line bg-canvas px-3", !value && "text-muted")}>{value || "-"}</p>
    </div>
  );
}

function SummaryRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("font-semibold", muted && "font-normal text-muted")}>{value}</dd>
    </div>
  );
}
