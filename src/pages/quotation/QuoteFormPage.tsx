import { Calendar, Check, ChevronDown, MapPin, Plus, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { DueDateCalendar } from "@/components/DueDateCalendar.tsx";
import { ProductModal } from "@/components/ProductModal.tsx";
import { QuoteSendConfirmModal, type QuotePdfPreviewStatus } from "@/components/QuoteSendConfirmModal.tsx";
import { Button } from "@/components/ui.tsx";
import { cn } from "@/lib/cn.ts";
import { readApiErrorMessage } from "@/lib/apiClient.ts";
import { addDays, parseISO, todayISO } from "@/lib/dates.ts";
import { screenHolidayDates } from "@/lib/db.ts";
import { getClient, listClients, type ClientListItem } from "@/lib/clientApi.ts";
import { depositTarget, digitsOnly, formatWon, lineAmount } from "@/lib/money.ts";
import { searchProducts } from "@/lib/productApi.ts";
import { createQuotationPdf, getQuotation, listDailyPlanned, listLineCapacities, previewQuotationSchedule, readPdfFailure, regenerateQuotationPdf, updateQuotationPdf, type QuotationSchedulePreview } from "@/lib/quotationApi.ts";
import { capacityUntil } from "@/lib/schedule.ts";
import type { Line, LineStatus } from "@/types/domain.ts";
import { useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

function lineStatusOf(status: string): LineStatus {
  if (status === "OPERATING") return "RUNNING";
  if (status === "AVAILABLE") return "AVAILABLE";
  if (status === "BROKEN") return "BROKEN";
  return "MAINTENANCE";
}

function labelDate(iso: string): string {
  const date = parseISO(iso);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}.${month}.${day} (${weekdays[date.getDay()]})`;
}

interface LineDraft {
  productId: string;
  productName: string;
  modelName: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

interface ProductChoice {
  id: string;
  productName: string;
  modelName: string;
  description: string;
  unitPrice: number;
}

export function QuoteFormPage() {
  const actor = useAuthStore((state) => state.user);
  const show = useToastStore((state) => state.show);
  const [clientId, setClientId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [zipcode, setZipcode] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [detailAddress, setDetailAddress] = useState("");
  const [newAddressOpen, setNewAddressOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const [clientActive, setClientActive] = useState(0);
  const [productQuery, setProductQuery] = useState("");
  const [productActive, setProductActive] = useState(0);
  const [modalName, setModalName] = useState<string | null>(null);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [vatIncluded, setVatIncluded] = useState(false);
  const [requestedDueDate, setRequestedDueDate] = useState("");
  const [validityDays, setValidityDays] = useState<7 | 14>(14);
  const [dueOpen, setDueOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [draftId, setDraftId] = useState<number | null>(null);
  const [draftNo, setDraftNo] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfStatus, setPdfStatus] = useState<QuotePdfPreviewStatus>("empty");
  const [pdfMessage, setPdfMessage] = useState("");
  const [schedule, setSchedule] = useState<QuotationSchedulePreview | null>(null);
  const [scheduleError, setScheduleError] = useState("");
  const [capacity, setCapacity] = useState<{ total: number; available: number } | null>(null);
  const dueRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");

  const priced = lines.map((line) => {
    const total = lineAmount({ quantity: line.quantity || 0, unitPrice: line.unitPrice || 0 }, vatIncluded);
    const supply = vatIncluded ? Math.round(total / 1.1) : (line.quantity || 0) * (line.unitPrice || 0);
    return { supply, vat: total - supply, total };
  });
  const supply = priced.reduce((sum, item) => sum + item.supply, 0);
  const vat = priced.reduce((sum, item) => sum + item.vat, 0);
  const total = priced.reduce((sum, item) => sum + item.total, 0);
  const quantity = lines.reduce((sum, line) => sum + (line.quantity || 0), 0);
  const earliest = schedule?.earliestDueDate ?? null;
  const duePlan = schedule?.feasible && schedule.plannedStartDate && schedule.plannedEndDate ? schedule : null;
  const dueTooSoon = Boolean(requestedDueDate && earliest && requestedDueDate < earliest);
  const feasible = Boolean(schedule?.feasible);
  const validUntil = addDays(todayISO(), validityDays);
  useEffect(() => {
    if (!dueOpen) return;
    function close(event: MouseEvent) {
      if (!dueRef.current?.contains(event.target as Node)) setDueOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [dueOpen]);
  useEffect(() => {
    const selected = lines.filter((line) => line.productId);
    const items = selected.flatMap((line) => {
      const productId = Number(line.productId);
      if (!Number.isInteger(productId) || productId <= 0 || line.quantity < 100) return [];
      return [{ productId, quantity: line.quantity }];
    });
    if (selected.length === 0) {
      setSchedule(null);
      setScheduleError("");
      return;
    }
    if (items.length !== selected.length) {
      setSchedule(null);
      setScheduleError("품목은 서버에 등록된 품목 번호이고, 수량은 100개 이상이어야 합니다.");
      return;
    }
    let ignore = false;
    const timer = window.setTimeout(() => {
      previewQuotationSchedule({ items, requestedDueDate: requestedDueDate || undefined }).then((result) => {
        if (ignore) return;
        setSchedule(result);
        setScheduleError("");
      }).catch((reason: unknown) => {
        if (ignore) return;
        setSchedule(null);
        setScheduleError(readApiErrorMessage(reason));
      });
    }, 250);
    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [lines, requestedDueDate]);
  useEffect(() => {
    if (!requestedDueDate || requestedDueDate < todayISO()) {
      setCapacity(null);
      return;
    }
    let ignore = false;
    const from = todayISO();
    Promise.all([listLineCapacities(), listDailyPlanned(from, requestedDueDate)]).then(([lineRows, days]) => {
      if (ignore) return;
      const factoryLines: Line[] = lineRows.map((line, index) => ({
        id: String(index),
        name: "",
        dailyCapacity: line.dailyCapacity,
        status: lineStatusOf(line.status),
      }));
      const occupying = days.map((day) => ({
        id: day.date,
        status: "CONFIRMED" as const,
        allocations: [{ date: day.date.slice(0, 10), quantity: day.plannedQuantity }],
      }));
      const next = capacityUntil(requestedDueDate, from, factoryLines, screenHolidayDates, occupying);
      setCapacity({ total: next.total, available: next.available });
    }).catch(() => {
      if (!ignore) setCapacity(null);
    });
    return () => {
      ignore = true;
    };
  }, [requestedDueDate]);

  const [clientMatches, setClientMatches] = useState<ClientListItem[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientListItem | null>(null);
  const [searchParams] = useSearchParams();
  const draftParam = Number(searchParams.get("draft"));
  useEffect(() => {
    if (!Number.isInteger(draftParam) || draftParam <= 0) return;
    let ignore = false;
    getQuotation(draftParam).then((detail) => {
      if (ignore) return;
      if (detail.status !== "DRAFT") {
        show("초안만 이어서 작성할 수 있습니다.");
        return;
      }
      const dueDate = detail.requestedDueDate.slice(0, 10);
      const until = detail.validUntil.slice(0, 10);
      setDraftId(detail.id);
      setDraftNo(detail.quotationNo);
      setClientId(String(detail.clientId));
      setCompanyName(detail.clientCompany);
      setContactName(detail.clientName);
      setContactPhone(detail.clientPhone);
      setContactEmail(detail.clientEmail);
      setZipcode("");
      setCompanyAddress(detail.clientAddress ?? "");
      setDetailAddress("");
      setSelectedClient({
        id: detail.clientId,
        company: detail.clientCompany,
        employee: detail.clientName,
        phone: detail.clientPhone,
        email: detail.clientEmail,
        totalOrder: 0,
        totalAmount: 0,
        recentOrderedAt: null,
      });
      setLines(detail.items.map((item) => ({
        productId: String(item.productId),
        productName: item.productName,
        modelName: item.deviceName,
        description: "",
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })));
      setVatIncluded(detail.vatIncluded);
      setRequestedDueDate(dueDate);
      setValidityDays(until === addDays(todayISO(), 7) ? 7 : 14);
    }).catch((error: unknown) => {
      if (!ignore) show(readApiErrorMessage(error));
    });
    return () => {
      ignore = true;
    };
  }, [draftParam, show]);
  const [productMatches, setProductMatches] = useState<ProductChoice[]>([]);
  useEffect(() => {
    const query = companyName.trim();
    if (!query) {
      setClientMatches([]);
      return;
    }
    const timer = window.setTimeout(() => {
      listClients({ keyword: query, page: 0, size: 8 }).then((response) => setClientMatches(response.content)).catch(() => setClientMatches([]));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [companyName]);
  useEffect(() => {
    const query = productQuery.trim();
    if (!query) {
      setProductMatches([]);
      return;
    }
    const timer = window.setTimeout(() => {
      searchProducts(query, "AVAILABLE").then((items) => setProductMatches(items.slice(0, 6).map((item) => ({
        id: String(item.id),
        productName: item.productName,
        modelName: item.deviceName,
        description: item.productDescription,
        unitPrice: item.currentPrice,
      })))).catch(() => setProductMatches([]));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [productQuery]);

  function placeProduct(product: ProductChoice) {
    if (lines.some((line) => line.productId === product.id)) {
      show("이미 추가된 품목입니다. 해당 줄의 수량을 수정하세요.");
      return;
    }
    setLines([...lines, { productId: product.id, productName: product.productName, modelName: product.modelName, description: product.description, quantity: 100, unitPrice: product.unitPrice }]);
    setProductQuery("");
  }

  function pickClient(picked: ClientListItem) {
    setClientId(String(picked.id));
    setSelectedClient(picked);
    setCompanyName(picked.company);
    setContactName(picked.employee);
    setContactPhone(picked.phone);
    setContactEmail(picked.email);
    setZipcode("");
    setCompanyAddress("");
    setDetailAddress("");
    setNewAddressOpen(false);
    setClientOpen(false);
    void getClient(picked.id).then((detail) => {
      setCompanyAddress(detail.address);
    }).catch((error: unknown) => show(readApiErrorMessage(error)));
  }

  function searchAddress() {
    if (!window.daum?.Postcode) {
      show("우편번호 서비스를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    new window.daum.Postcode({
      oncomplete: (data) => {
        setZipcode(data.zonecode);
        setCompanyAddress(data.roadAddress || data.address);
      },
    }).open();
  }

  function draftLines() {
    return lines.filter((line) => line.productId).map((line) => ({ productId: line.productId, quantity: line.quantity, unitPrice: line.unitPrice }));
  }

  function serverClientId() {
    return /^[1-9]\d*$/.test(clientId) ? Number(clientId) : null;
  }

  function createInput() {
    const client = serverClientId();
    return {
      clientId: client ?? undefined,
      requestedDueDate,
      validUntil,
      vatIncluded,
      items: draftLines().flatMap((line) => {
        const productId = Number(line.productId);
        if (!Number.isInteger(productId) || productId <= 0) return [];
        return [{ productId, quantity: line.quantity, unitPrice: line.unitPrice }];
      }),
      newClient: client == null ? {
        company: companyName.trim(),
        employee: contactName.trim(),
        email: contactEmail.trim(),
        phone: contactPhone.trim(),
        zipcode: zipcode.trim(),
        roadAddress: companyAddress.trim(),
        detailAddress: detailAddress.trim(),
      } : undefined,
    };
  }

  async function openPreview() {
    setError("");
    setConfirmOpen(true);
    setPreparing(true);
    setPdfUrl(null);
    setPdfMessage("");
    setPdfStatus("loading");
    try {
      const input = createInput();
      const saved = draftId == null ? await createQuotationPdf(input) : await updateQuotationPdf(draftId, input);
      setDraftId(saved.quotationId);
      setPdfUrl(saved.previewUrl);
      setPdfStatus(saved.previewUrl ? "ready" : "empty");
    } catch (reason: unknown) {
      const failure = readPdfFailure(reason);
      if (failure?.quotationId != null) {
        setDraftId(failure.quotationId);
        try {
          const saved = await regenerateQuotationPdf(failure.quotationId);
          setPdfUrl(saved.previewUrl);
          setPdfStatus(saved.previewUrl ? "ready" : "empty");
          setPreparing(false);
          return;
        } catch (retry: unknown) {
          setPdfStatus("error");
          setPdfMessage(readApiErrorMessage(retry));
          setPreparing(false);
          return;
        }
      }
      setPdfStatus("error");
      setPdfMessage(readApiErrorMessage(reason));
    } finally {
      setPreparing(false);
    }
  }

  function send() {
    if (!actor) return;
    setError("");
    if (!companyName.trim()) {
      setError("회사명을 입력하세요.");
      return;
    }
    if (!contactName.trim()) {
      setError("담당자명을 입력하세요.");
      return;
    }
    if (digitsOnly(contactPhone).length < 9) {
      setError("거래처 연락처를 확인하세요.");
      return;
    }
    if (!contactEmail.trim().includes("@")) {
      setError("이메일을 확인하세요.");
      return;
    }
    if (serverClientId() == null && (!zipcode.trim() || !companyAddress.trim() || !detailAddress.trim())) {
      setNewAddressOpen(true);
      setError("우편번호, 도로명 주소, 상세 주소를 입력하세요.");
      return;
    }
    const nextLines = draftLines();
    if (nextLines.length === 0) {
      setError("품목 줄을 1개 이상 입력하세요.");
      return;
    }
    if (new Set(nextLines.map((line) => line.productId)).size !== nextLines.length) {
      setError("같은 품목이 두 줄 이상 있습니다. 수량을 한 줄로 합치세요.");
      return;
    }
    if (nextLines.some((line) => line.quantity < 100)) {
      setError("견적 품목 수량은 100개 이상이어야 합니다.");
      return;
    }
    if (!requestedDueDate) {
      setError("희망 납기일을 선택하세요.");
      return;
    }
    if (nextLines.some((line) => !Number.isInteger(Number(line.productId)) || Number(line.productId) <= 0)) {
      setError("품목은 서버에 등록된 품목 번호여야 합니다.");
      return;
    }
    void openPreview();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{draftNo ? `${draftNo} 이어서 작성` : "견적 작성"}</h1>
          <p className="mt-1 text-sm text-muted">{draftNo ? "저장하면 이 초안의 견적번호와 ID를 유지한 채 내용과 PDF를 다시 만듭니다." : "거래처를 검색하거나 새로 입력하고, 품목과 희망 납기를 넣습니다. 배송지는 넣지 않습니다."}</p>
        </div>
        <Link to="/quotations" className="inline-flex h-10 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold">견적 목록</Link>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <section className="rounded-xl border border-line bg-white p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">거래처 정보</h2>
              <span className="text-xs font-semibold text-primary">{selectedClient ? "● 기존 거래처" : companyName.trim() ? "● 신규 거래처" : null}</span>
            </div>
            <div className="relative mt-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">회사명 *</span>
                <span className="relative block">
                  <input
                    className="h-10 w-full rounded-lg border border-line bg-white px-3 pr-9 text-sm"
                    value={companyName}
                    placeholder="회사명으로 검색"
                    onFocus={() => setClientOpen(true)}
                    onBlur={() => window.setTimeout(() => setClientOpen(false), 150)}
                    onChange={(event) => {
                      const next = event.target.value;
                      setCompanyName(next);
                      setClientOpen(true);
                      setClientActive(0);
                      if (selectedClient && next !== selectedClient.company) {
                        setClientId("");
                        setSelectedClient(null);
                        setZipcode("");
                        setCompanyAddress("");
                        setDetailAddress("");
                        setNewAddressOpen(false);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (clientMatches.length === 0) return;
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        setClientOpen(true);
                        setClientActive((index) => (index + 1) % clientMatches.length);
                      } else if (event.key === "ArrowUp") {
                        event.preventDefault();
                        setClientOpen(true);
                        setClientActive((index) => (index - 1 + clientMatches.length) % clientMatches.length);
                      } else if (event.key === "Enter" && clientOpen) {
                        event.preventDefault();
                        const item = clientMatches[clientActive] ?? clientMatches[0];
                        if (item) pickClient(item);
                      }
                    }}
                  />
                  <Search size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" />
                </span>
              </label>
              {clientOpen && companyName.trim() ? (
                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-line bg-white shadow-lg">
                  <ul className="max-h-60 overflow-y-auto">
                    {clientMatches.map((item, index) => {
                      const active = index === (clientActive < clientMatches.length ? clientActive : 0);
                      return (
                      <li key={item.id}>
                        <button type="button" className={cn("flex w-full items-center justify-between px-3 py-2 text-left", active && "bg-canvas")} onMouseDown={(event) => event.preventDefault()} onMouseMove={() => { if (!active) setClientActive(index); }} onClick={() => pickClient(item)}>
                          <span>
                            <span className="block text-sm font-semibold">{item.company}</span>
                            <span className="block text-xs text-muted">{item.employee} · {item.phone}</span>
                          </span>
                          {String(item.id) === clientId ? <Check size={16} className="text-primary" /> : null}
                        </button>
                      </li>
                      );
                    })}
                  </ul>
                  {clientMatches.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted">검색 결과가 없습니다. 견적 발송 시 이 회사명으로 거래처가 만들어집니다.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
            {selectedClient ? (
              <div className="mt-2 flex items-center justify-between rounded-lg bg-primary-soft px-3 py-2">
                <span>
                  <span className="block text-sm font-semibold">{selectedClient.company}</span>
                  <span className="block text-xs text-muted">{selectedClient.employee} · {selectedClient.phone}</span>
                </span>
                <Check size={16} className="text-primary" />
              </div>
            ) : null}
            <p className="mt-2 flex items-center gap-1 text-xs text-muted">
              <Plus size={12} className="shrink-0" />검색 결과가 없으면 입력한 회사명으로 자동 등록됩니다.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">담당자명 *</span>
                <input className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm" placeholder="담당자명" value={contactName} onChange={(event) => setContactName(event.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">연락처 *</span>
                <input className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm" placeholder="010-0000-0000" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">이메일 *</span>
                <input type="email" className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm" placeholder="email@example.com" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">회사 주소 *</span>
                <span className="relative block">
                  <input readOnly value={[zipcode, companyAddress, detailAddress].map((part) => part.trim()).filter(Boolean).join(" ")} placeholder="주소" className="h-10 w-full rounded-lg border border-line bg-white px-3 pr-9 text-sm" />
                  <MapPin size={15} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" />
                </span>
              </label>
            </div>
            {selectedClient ? null : (
              <div className="mt-2">
                <button type="button" className="flex items-center gap-1 text-xs font-medium text-primary" aria-expanded={newAddressOpen} onClick={() => setNewAddressOpen((open) => !open)}>
                  신규 거래처 주소 입력
                  <ChevronDown size={14} className={cn("transition", newAddressOpen && "rotate-180")} />
                </button>
                {newAddressOpen ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex gap-2">
                      <input readOnly value={zipcode} placeholder="우편번호" className="h-10 w-28 rounded-lg border border-line bg-white px-3 text-sm" />
                      <button type="button" className="h-10 shrink-0 rounded-lg border border-line bg-white px-4 text-sm font-medium" onClick={searchAddress}>
                        우편번호 찾기
                      </button>
                    </div>
                    <input readOnly value={companyAddress} placeholder="도로명 주소를 입력하세요" className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm" />
                    <input className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm" placeholder="건물명, 층, 호수 등 상세 주소를 입력하세요" value={detailAddress} onChange={(event) => setDetailAddress(event.target.value)} />
                  </div>
                ) : null}
              </div>
            )}
            <p className="mt-3 text-xs text-muted">
              {selectedClient
                ? <span className="text-success">등록된 거래처의 담당자, 연락처, 주소로 불러왔습니다.</span>
                : companyName.trim()
                  ? "견적 발송 시 입력한 거래처가 거래처 목록에 추가됩니다."
                  : "회사명을 검색해 기존 거래처를 고르거나, 새 회사명을 입력하세요."}
            </p>
          </section>
          <section className="rounded-xl border border-line bg-white p-5">
            <div>
              <h2 className="font-semibold">생산품목 및 금액</h2>
              <p className="mt-1 text-sm text-muted">{vatIncluded ? "단가는 부가세 포함 금액으로 입력하세요." : "단가는 부가세 별도 금액으로 입력하세요."}</p>
            </div>
            <div className="relative mt-3">
              <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-3">
                <Search size={15} className="text-muted" />
                <input
                  className="h-10 flex-1 bg-transparent text-sm outline-none"
                  value={productQuery}
                  placeholder="제품명·모델명 검색"
                  onChange={(event) => { setProductQuery(event.target.value); setProductActive(0); }}
                  onKeyDown={(event) => {
                    if (productMatches.length === 0) return;
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setProductActive((index) => (index + 1) % productMatches.length);
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setProductActive((index) => (index - 1 + productMatches.length) % productMatches.length);
                    } else if (event.key === "Enter") {
                      event.preventDefault();
                      const item = productMatches[productActive] ?? productMatches[0];
                      if (item) placeProduct(item);
                    }
                  }}
                />
                <button type="button" className="shrink-0 text-xs font-semibold text-primary" onClick={() => setModalName(productQuery.trim())}>+ 신규 품목 등록</button>
              </div>
              {productQuery.trim() ? (
                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-line bg-white shadow-lg">
                  {productMatches.map((item, index) => {
                    const added = lines.some((line) => line.productId === item.id);
                    const active = index === (productActive < productMatches.length ? productActive : 0);
                    return (
                      <button key={item.id} type="button" className={cn("flex w-full items-center justify-between px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:text-muted", active && "bg-canvas")} disabled={added} onMouseMove={() => { if (!active) setProductActive(index); }} onClick={() => placeProduct(item)}>
                        <span><span className="font-semibold">{item.productName} {item.modelName}</span><span className="ml-2 text-xs text-muted">{added ? "이미 추가됨" : item.description}</span></span>
                        <span className="text-xs text-muted">{formatWon(item.unitPrice)}</span>
                      </button>
                    );
                  })}
                  {productMatches.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted">'{productQuery.trim()}' 품목이 없습니다. <button type="button" className="font-semibold text-primary" onClick={() => setModalName(productQuery.trim())}>신규 품목으로 등록</button></p>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="bg-canvas text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">생산품목 *</th>
                    <th className="w-28 py-2 font-medium">수량 *</th>
                    <th className="w-32 py-2 font-medium">단가 (원) *</th>
                    <th className="w-32 py-2 text-right font-medium">{vatIncluded ? "금액 (VAT 포함)" : "공급가액"}</th>
                    <th className="w-10 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => {
                    return (
                      <tr key={line.productId || index} className="border-t border-line align-middle">
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <span className="h-9 w-9 shrink-0 rounded-md bg-canvas" />
                            <span className="min-w-0">
                              <span className="block font-semibold">{`${line.productName} ${line.modelName}`.trim() || "품목"}</span>
                              <span className="block truncate text-xs text-muted">{line.description || "설명 없음"}</span>
                            </span>
                          </div>
                        </td>
                        <td className="py-3"><input aria-label={`${index + 1}번째 수량`} type="number" min={100} className="h-9 w-24 rounded-lg border border-line px-2 text-right" value={line.quantity} onChange={(event) => {
                          const next = [...lines];
                          const parsed = Number(event.target.value);
                          next[index] = { ...line, quantity: Number.isFinite(parsed) ? Math.floor(parsed) : 0 };
                          setLines(next);
                        }} /></td>
                        <td className="py-3"><input aria-label={`${index + 1}번째 단가`} type="number" min={0} className="h-9 w-28 rounded-lg border border-line px-2 text-right" value={line.unitPrice} onChange={(event) => {
                          const next = [...lines];
                          next[index] = { ...line, unitPrice: Number(event.target.value) };
                          setLines(next);
                        }} /></td>
                        <td className="px-3 py-3 text-right font-semibold">{formatWon(vatIncluded ? priced[index]?.total ?? 0 : priced[index]?.supply ?? 0)}</td>
                        <td className="py-3 text-center">
                          <button type="button" aria-label={`${index + 1}번째 품목 삭제`} className="rounded p-1 text-muted hover:bg-canvas hover:text-danger" onClick={() => setLines(lines.filter((_, item) => item !== index))}><X size={16} /></button>
                        </td>
                      </tr>
                    );
                  })}
                  {lines.length === 0 ? (
                    <tr><td className="px-3 py-8 text-center text-muted" colSpan={5}>검색해서 품목을 고르면 이 목록에 추가됩니다.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={vatIncluded} onChange={(event) => setVatIncluded(event.target.checked)} />
                부가세 포함하여 청구 (10%)
              </label>
              <span className="text-xs text-muted">품목당 최소 100개 · 총 수량 {quantity.toLocaleString("ko-KR")}개 · {lines.filter((line) => line.productId).length}개 품목</span>
            </div>
          </section>
          <section className="rounded-xl border border-line bg-white p-5">
            <h2 className="font-semibold">납기</h2>
            <p className="mt-1 text-sm text-muted">하늘색 날짜만 약속할 수 있습니다. 오늘 등록한다고 보고, 생산은 오늘부터 3일 뒤보다 앞에 두지 않습니다. 그 날이 주말이나 휴일이면 다음 생산일부터 잡습니다. 납기는 생산 완료 후 3일(주말·휴일 제외)입니다.</p>
            {schedule ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary-soft px-3 py-2.5">
                <div>
                  <p className="text-xs font-semibold text-primary">가장 빠른 납기</p>
                  <p className="mt-0.5 text-base font-bold">{labelDate(schedule.earliestDueDate)}</p>
                </div>
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1 rounded-lg bg-white px-3 text-sm font-semibold text-primary disabled:text-muted"
                  disabled={requestedDueDate === schedule.earliestDueDate}
                  onClick={() => { setRequestedDueDate(schedule.earliestDueDate); setDueOpen(false); }}
                >
                  {requestedDueDate === schedule.earliestDueDate ? <><Check size={15} />선택됨</> : "이 날짜로 선택"}
                </button>
              </div>
            ) : (
              <p className={`mt-3 text-sm ${scheduleError ? "font-semibold text-warning" : "text-muted"}`}>
                {scheduleError || "품목 수량을 입력하면 가장 빠른 납기를 계산합니다."}
              </p>
            )}
            <div className="mt-4 grid items-start gap-4 sm:grid-cols-2" ref={dueRef}>
              <div className="relative">
                <span className="text-sm font-semibold">희망 납기</span>
                <button
                  type="button"
                  className={cn(
                    "mt-1 flex h-11 w-full items-center gap-2 rounded-lg border bg-white px-3 text-left text-sm",
                    dueTooSoon || scheduleError ? "border-warning" : "border-line",
                  )}
                  onClick={() => setDueOpen((open) => !open)}
                >
                  <Calendar size={16} className="shrink-0 text-muted" />
                  <span className={requestedDueDate ? "font-semibold" : "text-muted"}>{requestedDueDate ? labelDate(requestedDueDate) : "날짜 선택"}</span>
                </button>
                {dueOpen ? (
                  <div className="absolute z-20 mt-1 w-full min-w-[280px] sm:w-[320px]">
                    <DueDateCalendar
                      value={requestedDueDate}
                      earliest={earliest}
                      ready={quantity > 0}
                      emptyHint="수량을 입력하면 색이 표시됩니다."
                      onChange={(iso) => { setRequestedDueDate(iso); setDueOpen(false); }}
                    />
                  </div>
                ) : null}
                <p className={`mt-1 text-xs ${dueTooSoon || scheduleError ? "font-semibold text-warning" : "text-muted"}`}>
                  {!quantity ? "수량을 먼저 입력하세요." : scheduleError ? scheduleError : dueTooSoon && earliest ? `이 날은 불가합니다. 가장 빠른 날은 ${labelDate(earliest)}입니다.` : requestedDueDate && feasible ? "가능한 납기입니다." : "달력의 하늘색 날짜를 고르세요."}
                </p>
              </div>
              <div>
                <span className="text-sm font-semibold">유효기간</span>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {([14, 7] as const).map((days) => (
                    <button
                      key={days}
                      type="button"
                      className={cn(
                        "rounded-lg border px-3 py-2 text-left text-sm",
                        validityDays === days ? "border-primary bg-primary-soft" : "border-line bg-white",
                      )}
                      onClick={() => setValidityDays(days)}
                    >
                      <span className="block font-semibold">{days}일</span>
                      <span className="block text-xs text-muted">{labelDate(addDays(todayISO(), days))}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted">발행일부터 14일이 기본입니다. 7일로만 줄일 수 있고, 납기와는 별개입니다.</p>
              </div>
            </div>
            {duePlan ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg bg-canvas px-3 py-2">
                  <p className="text-xs text-muted">생산 시작</p>
                  <p className="mt-1 text-sm font-semibold">{duePlan.plannedStartDate ? labelDate(duePlan.plannedStartDate) : "-"}</p>
                </div>
                <div className="rounded-lg bg-canvas px-3 py-2">
                  <p className="text-xs text-muted">생산 완료</p>
                  <p className="mt-1 text-sm font-semibold">{duePlan.plannedEndDate ? labelDate(duePlan.plannedEndDate) : "-"}</p>
                </div>
                <div className="rounded-lg bg-canvas px-3 py-2">
                  <p className="text-xs text-muted">희망 납기</p>
                  <p className="mt-1 text-sm font-semibold">{labelDate(requestedDueDate)}</p>
                </div>
              </div>
            ) : null}
            <p className="mt-3 text-xs text-muted">임시 계획은 확정 예약이 아닙니다. 계약금 입금 전에는 작업지시서를 만들지 않습니다.</p>
          </section>
          <section className="rounded-xl border border-line bg-white p-5">
            <h2 className="font-semibold">생산 가능 여부 확인</h2>
            <p className="mt-1 text-sm text-muted">희망 납기까지 공장의 남은 생산량과 이번 견적 수량을 비교합니다. 포장 1일과 배송 2일을 두어, 생산 완료 후 3일(주말·휴일 제외)이 납기입니다.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-canvas px-3 py-2">
                <p className="text-xs text-muted">희망 납기일</p>
                <p className="mt-1 font-semibold">{requestedDueDate ? labelDate(requestedDueDate) : "-"}</p>
              </div>
              <div className="rounded-lg bg-canvas px-3 py-2">
                <p className="text-xs text-muted">총 생산량</p>
                <p className="mt-1 font-semibold">{capacity ? `${capacity.total.toLocaleString("ko-KR")}개` : "-"}</p>
              </div>
              <div className="rounded-lg bg-canvas px-3 py-2">
                <p className="text-xs text-muted">가용 생산량</p>
                <p className="mt-1 font-semibold">{capacity ? `${capacity.available.toLocaleString("ko-KR")}개` : "-"}</p>
              </div>
            </div>
            <div className="mt-3 text-sm">
              {!requestedDueDate || quantity <= 0 ? (
                <p className="text-muted">품목 수량과 희망 납기를 입력하면 생산 가능 여부를 확인합니다.</p>
              ) : feasible ? (
                <p className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">배정 가능</span>
                  견적 수량 {quantity.toLocaleString("ko-KR")}개는 {earliest ? `${labelDate(earliest)} 이후` : "계산된 납기"}에 생산할 수 있습니다.
                </p>
              ) : (
                <p className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">배정 불가</span>
                  {earliest ? `이 납기로는 수량을 다 만들 수 없습니다. 가장 빠른 납기는 ${labelDate(earliest)}입니다.` : scheduleError}
                  {earliest ? <button type="button" className="text-xs font-semibold text-primary" onClick={() => setRequestedDueDate(earliest)}>{earliest}로 변경</button> : null}
                </p>
              )}
            </div>
          </section>
        </div>
        <aside className="rounded-xl border border-line bg-white p-5 xl:sticky xl:top-6 xl:self-start">
          <h2 className="font-semibold">금액 요약</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted">공급가액</dt><dd>{formatWon(supply)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">부가세</dt><dd>{formatWon(vat)}</dd></div>
            <div className="flex justify-between text-base font-semibold"><dt>총액</dt><dd>{formatWon(total)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">계약금 50%</dt><dd>{formatWon(depositTarget(total))}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">잔금 50%</dt><dd>{formatWon(total - depositTarget(total))}</dd></div>
          </dl>
          {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
          <Button className="mt-4 w-full" disabled={preparing} onClick={send}>{preparing ? "견적서 준비 중…" : "저장 및 견적 확인"}</Button>
        </aside>
      </div>
      {modalName !== null && actor ? (
        <ProductModal
          initialName={modalName}
          actorName={actor.name}
          note="등록하면 생산품목 관리에도 바로 추가되고, 이 견적의 품목 줄에 선택됩니다."
          onClose={() => setModalName(null)}
          onSaved={(productId, unitPrice, productName, modelName) => {
            setModalName(null);
            placeProduct({ id: productId, productName, modelName, description: "", unitPrice });
            show("신규 품목을 등록하고 견적에 추가했습니다.");
          }}
        />
      ) : null}
      {confirmOpen ? (
        <QuoteSendConfirmModal
          companyName={companyName.trim()}
          email={contactEmail.trim()}
          pdfUrl={pdfUrl}
          pdfStatus={pdfStatus}
          pdfMessage={pdfMessage}
          onClose={() => { if (!preparing) setConfirmOpen(false); }}
          onSend={() => undefined}
        />
      ) : null}
    </div>
  );
}
