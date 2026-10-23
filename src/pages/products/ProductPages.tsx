import { useState } from "react";
import { ArrowLeft, Banknote, Check, ChevronRight, ClipboardList, FileUp, Info, Package, Pencil, Plus, Wallet } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { Badge, Button } from "@/components/ui.tsx";
import { localDate, todayISO } from "@/lib/dates.ts";
import { orderStatusLabel, orderStatusTone } from "@/lib/labels.ts";
import { productTitle } from "@/lib/orderText.ts";
import { useDb } from "@/lib/db.ts";
import { formatWon, lineAmount, orderTotal } from "@/lib/money.ts";
import { saveProduct } from "@/lib/workflow.ts";
import { canManageOrders, useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";

export function ProductListPage() {
  const db = useDb();
  const role = useAuthStore((state) => state.user?.role);
  const [keyword, setKeyword] = useState("");
  const rows = db.products.filter((product) => `${product.productName} ${product.modelName} ${product.description}`.includes(keyword.trim()));
  const [selectedId, setSelectedId] = useState(rows[0]?.id ?? "");
  const selected = db.products.find((product) => product.id === selectedId) ?? rows[0];
  const related = (productId: string) => db.orders.filter((order) => order.lines.some((line) => line.productId === productId) && order.status !== "CANCELLED");
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">생산품목 관리</h1>
          <p className="mt-1 text-muted">생산 가능한 제품 명칭과 설명을 등록하고, 수주 등록 시 자동 입력 및 자동 완성을 관리하세요.</p>
        </div>
        {canManageOrders(role) ? <Link to="/products/new" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 font-semibold text-white">+ 품목 등록</Link> : null}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <section className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-muted">전체 등록 품목</p><p className="mt-2 text-2xl font-semibold">{db.products.length}종</p></section>
        <section className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-muted">이번 달 생산 품목</p><p className="mt-2 text-2xl font-semibold">{new Set(db.orders.flatMap((order) => order.lines.map((line) => line.productId))).size}종</p></section>
        <section className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-muted">검색 결과</p><p className="mt-2 text-2xl font-semibold">{rows.length}종</p></section>
      </div>
      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="overflow-hidden rounded-xl border border-line bg-white">
          <div className="flex items-center justify-between px-5 py-4"><h2 className="font-semibold">등록된 생산품목</h2><span className="text-sm text-muted">총 {rows.length}종</span></div>
          <div className="px-5 pb-3"><input className="h-10 w-full rounded-lg border border-line px-3" value={keyword} placeholder="품목명, 설명, 카테고리 검색" onChange={(event) => setKeyword(event.target.value)} /></div>
          <table className="w-full text-left text-sm">
            <thead className="bg-primary-soft/40 text-muted"><tr><th className="px-5 py-3 font-medium">품목명</th><th className="py-3 font-medium">모델</th><th className="py-3 font-medium">설명</th><th className="py-3 font-medium">단가</th><th className="py-3 font-medium">최근 수정</th><th className="w-12 py-3 pr-3 font-medium"><span className="sr-only">상세</span></th></tr></thead>
            <tbody>
              {rows.map((product) => (
                <tr key={product.id} className={`cursor-pointer border-t border-line ${selected?.id === product.id ? "bg-primary-soft" : ""}`} onClick={() => setSelectedId(product.id)}>
                  <td className="px-5 py-3 font-semibold">{product.productName}</td>
                  <td>{product.modelName}</td>
                  <td className="max-w-48 truncate">{product.description}</td>
                  <td>{formatWon(product.unitPrice)}</td>
                  <td className="whitespace-nowrap">{localDate(product.updatedAt)}</td>
                  <td className="pr-3">
                    <Link
                      to={`/products/${product.id}`}
                      aria-label={`${product.productName} 상세`}
                      className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-white hover:text-primary"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <ChevronRight size={18} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        {selected ? (
          <aside className="space-y-3">
            <section className="rounded-xl border border-line bg-white p-5">
              <h2 className="font-semibold">품목 상세</h2>
              {selected.designImageUrl ? <img src={selected.designImageUrl} alt="" className="mt-3 h-16 w-16 rounded-lg object-cover" /> : null}
              <p className="mt-3 text-lg font-semibold">{selected.productName}</p>
              <p className="text-sm text-muted">{selected.modelName}</p>
              <p className="mt-3 text-sm">{selected.description}</p>
              <p className="mt-3 font-semibold">{formatWon(selected.unitPrice)}</p>
              {selected.drawingPdfName && selected.drawingPdfUrl ? <a className="mt-2 block text-sm text-primary" href={selected.drawingPdfUrl} download={selected.drawingPdfName}>도면 {selected.drawingPdfName}</a> : null}
              <div className="mt-4 flex gap-2">
                {canManageOrders(role) ? <Link to={`/products/${selected.id}/edit`} className="inline-flex h-10 items-center rounded-lg border border-line px-3">정보 수정</Link> : null}
                {canManageOrders(role) ? <Link to="/orders/new" className="inline-flex h-10 items-center rounded-lg bg-primary px-3 font-semibold text-white">+ 수주 등록</Link> : null}
              </div>
            </section>
            <section className="rounded-xl border border-line bg-white p-5">
              <h3 className="font-semibold">최근 수주</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {related(selected.id).slice(0, 3).map((order) => (
                  <li key={order.id}><Link className="text-primary" to={`/orders/${order.id}`}>{order.orderNo}</Link> <span className="text-muted">{order.dueDate}</span></li>
                ))}
              </ul>
            </section>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

const MAX_DRAWING_BYTES = 2 * 1024 * 1024;

function collapsedName(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function formatPriceInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits).toLocaleString("ko-KR") : "";
}

export function ProductFormPage() {
  const { productId } = useParams();
  return <ProductEditor productId={productId} />;
}

function ProductEditor({ productId }: { productId?: string }) {
  const db = useDb();
  const navigate = useNavigate();
  const actor = useAuthStore((state) => state.user);
  const show = useToastStore((state) => state.show);
  const current = productId ? db.products.find((product) => product.id === productId) : undefined;
  const editing = Boolean(productId);
  const [productName, setProductName] = useState(current?.productName ?? "");
  const [description, setDescription] = useState(current?.description ?? "");
  const [priceText, setPriceText] = useState(current ? formatPriceInput(String(current.unitPrice)) : "");
  const [nameCheck, setNameCheck] = useState("");
  const [drawingPdfName, setDrawingPdfName] = useState(current?.drawingPdfName ?? "");
  const [drawingPdfUrl, setDrawingPdfUrl] = useState(current?.drawingPdfUrl ?? "");
  const [drawingError, setDrawingError] = useState("");
  const nameTaken = (name: string) => db.products.some((product) => product.id !== current?.id && collapsedName(product.productName) === collapsedName(name));
  if (editing && !current) return <p>품목을 찾을 수 없습니다.</p>;

  function checkName() {
    if (!productName.trim()) {
      setNameCheck("품목명을 입력하세요.");
      return false;
    }
    if (nameTaken(productName)) {
      setNameCheck("같은 품목명이 있습니다.");
      return false;
    }
    setNameCheck("사용할 수 있는 품목명입니다.");
    return true;
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{editing ? "생산품목 수정" : "생산품목 등록"}</h1>
          <p className="mt-1 text-muted">{editing ? "등록된 품목의 이름, 설명, 기준 단가와 도면을 수정합니다." : "생산 가능한 품목의 기본 정보와 수주 등록 시 사용할 기준 단가를 설정합니다."}</p>
        </div>
        <Link to="/products" className="inline-flex h-10 items-center gap-1 rounded-lg border border-line bg-white px-4">
          <ArrowLeft size={16} /> 생산품목 목록으로
        </Link>
      </div>
      <form
        className="mt-6 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]"
        onSubmit={(event) => {
          event.preventDefault();
          const unitPrice = Number(priceText.replace(/\D/g, ""));
          if (!checkName()) {
            show(productName.trim() && nameTaken(productName) ? "같은 품목명이 있습니다." : "품목명을 입력하세요.");
            return;
          }
          if (priceText.trim() === "" || !Number.isInteger(unitPrice) || unitPrice < 0) {
            show("기준 단가를 0원 이상 정수로 입력하세요.");
            return;
          }
          try {
            saveProduct({
              id: current?.id,
              productName,
              modelName: current?.modelName ?? "",
              description: description.trim(),
              unitPrice,
              designImageUrl: current?.designImageUrl ?? "",
              drawingPdfName,
              drawingPdfUrl,
              actorName: actor?.name ?? "",
            });
            show("품목을 저장했습니다. 이미 들어간 수주 단가는 바뀌지 않습니다.");
            navigate("/products");
          } catch (error: unknown) {
            show(error instanceof Error ? error.message : "저장하지 못했습니다.");
          }
        }}
      >
        <div className="space-y-4">
          <section className="rounded-xl border border-line bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">생산품목 기본 정보</h2>
                <p className="mt-1 text-sm text-muted">품목을 구분할 수 있는 이름과 설명을 입력해 주세요.</p>
              </div>
              <p className="shrink-0 text-xs text-danger">* 필수 입력 항목</p>
            </div>
            <label className="mt-5 block text-sm font-semibold">
              품목명 <span className="text-danger">*</span>
              <span className="mt-2 flex gap-2">
                <input
                  className="h-10 min-w-0 flex-1 rounded-lg border border-line px-3 font-normal"
                  value={productName}
                  placeholder="예: 정밀 브러쉬 8형"
                  onChange={(event) => {
                    setProductName(event.target.value);
                    setNameCheck("");
                  }}
                />
                <Button type="button" tone="ghost" onClick={checkName}>중복 확인</Button>
              </span>
            </label>
            <p className="mt-2 text-xs text-muted">같은 품목명이 있는지 확인하세요. 규격이 다르면 이름에 규격이나 모델을 함께 입력해 주세요.</p>
            {nameCheck ? <p className={`mt-1 text-xs ${nameCheck.startsWith("사용") ? "text-success" : "text-danger"}`}>{nameCheck}</p> : null}
            <label className="mt-5 block text-sm font-semibold">
              품목 설명 <span className="font-normal text-muted">(선택)</span>
              <textarea
                className="mt-2 h-28 w-full resize-none rounded-lg border border-line px-3 py-2 font-normal"
                value={description}
                placeholder="재질, 가공 방식, 표면 마감 등 품목을 구분할 수 있는 설명을 입력하세요"
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <p className="mt-4 border-t border-line pt-4 text-xs text-muted">수주 등록 시 선택한 품목의 설명이 자동으로 입력됩니다.</p>
          </section>
          <section className="rounded-xl border border-line bg-white p-5">
            <h2 className="font-semibold">단가</h2>
            <p className="mt-1 text-sm text-muted">새 수주에 사용할 기본값을 설정합니다.</p>
            <label className="mt-5 block text-sm font-semibold">
              기준 단가 (원) <span className="text-danger">*</span>
              <input
                className="mt-2 h-10 w-full rounded-lg border border-line px-3 font-normal"
                inputMode="numeric"
                value={priceText}
                placeholder="예: 1,200"
                onChange={(event) => setPriceText(formatPriceInput(event.target.value))}
              />
            </label>
            <p className="mt-2 text-xs text-muted">부가세 별도 금액으로 입력하세요. 부가세 포함 여부는 수주 등록 시 설정합니다.</p>
            <p className="mt-4 rounded-lg border border-line px-4 py-3 text-sm text-muted">기준 단가를 수정해도 이미 저장된 수주의 가격 정보는 소급해서 변경되지 않습니다.</p>
          </section>
          <section className="rounded-xl border border-line bg-white p-5">
            <h2 className="font-semibold">도면</h2>
            <p className="mt-1 text-sm text-muted">생산에 사용할 도면 PDF를 올려 주세요. 2MB 이하입니다.</p>
            <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted hover:border-primary hover:text-primary">
              <FileUp size={20} />
              <span className="mt-2 font-semibold text-ink">PDF 파일 선택</span>
              <span className="mt-1 text-xs">클릭해서 도면 파일을 추가하세요.</span>
              <input
                className="sr-only"
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  const pdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
                  if (!pdf) {
                    setDrawingError("PDF 파일만 올릴 수 있습니다.");
                    return;
                  }
                  if (file.size > MAX_DRAWING_BYTES) {
                    setDrawingError("도면은 2MB 이하로 올려 주세요.");
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    setDrawingPdfName(file.name);
                    setDrawingPdfUrl(String(reader.result ?? ""));
                    setDrawingError("");
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </label>
            {drawingPdfName ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                <span className="truncate">{drawingPdfName}</span>
                <button
                  type="button"
                  className="shrink-0 text-muted"
                  onClick={() => {
                    setDrawingPdfName("");
                    setDrawingPdfUrl("");
                    setDrawingError("");
                  }}
                >
                  삭제
                </button>
              </div>
            ) : null}
            {drawingError ? <p className="mt-2 text-xs text-danger">{drawingError}</p> : null}
          </section>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <p className="text-sm text-muted">{editing ? "입력 내용을 확인한 후 저장해 주세요." : "입력 내용을 확인한 후 등록해 주세요."}</p>
            <div className="flex gap-2">
              <Link to="/products" className="inline-flex h-10 items-center rounded-lg border border-line bg-white px-4 font-semibold">취소</Link>
              <Button type="submit"><Check size={16} className="mr-1" />{editing ? "변경 저장" : "생산품목 등록"}</Button>
            </div>
          </div>
        </div>
        <aside className="space-y-4">
          <section className="rounded-xl border border-line bg-white p-5">
            <div className="flex gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line text-primary"><ClipboardList size={18} /></span>
              <div>
                <h2 className="font-semibold">등록 기준</h2>
                <p className="mt-2 text-sm text-muted">같은 품목은 하나의 기준 정보로 관리하세요. 이름과 설명을 확인하면 중복 등록을 줄일 수 있습니다.</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4 text-sm">
              <span className="text-muted">필수 항목</span>
              <span>품목명 · 기준 단가</span>
            </div>
          </section>
          <section className="rounded-xl bg-primary-soft p-5">
            <div className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-primary"><Info size={16} /></span>
              <div>
                <h2 className="font-semibold">수주 가격은 별도로 보존됩니다</h2>
                <p className="mt-2 text-sm text-muted">기준 단가는 새 수주의 기본값입니다. 수주별로 조정한 단가와 금액은 저장 당시의 값으로 유지됩니다.</p>
              </div>
            </div>
          </section>
          <section className="rounded-xl border border-line bg-white p-5">
            <h2 className="font-semibold">등록 후 활용</h2>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex items-center gap-2"><Check size={16} className="text-primary" />품목명 검색 및 선택</li>
              <li className="flex items-center gap-2"><Check size={16} className="text-primary" />기준 단가를 불러온 후 수량 입력</li>
            </ul>
            <p className="mt-4 border-t border-line pt-4 text-xs text-muted">미등록 품목은 수주 등록 시 함께 추가할 수도 있습니다.</p>
          </section>
        </aside>
      </form>
    </div>
  );
}

function productionFinished(status: string): boolean {
  return status === "PACKING" || status === "PACKED" || status === "SHIPPING" || status === "COMPLETED";
}

export function ProductDetailPage() {
  const { productId = "" } = useParams();
  const db = useDb();
  const role = useAuthStore((state) => state.user?.role);
  const product = db.products.find((item) => item.id === productId);
  if (!product) return <p>품목을 찾을 수 없습니다.</p>;
  const today = todayISO();
  const history = db.orders
    .filter((order) => order.status !== "CANCELLED" && order.lines.some((line) => line.productId === product.id))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const lineOf = (orderId: string) => history.find((order) => order.id === orderId)?.lines.find((line) => line.productId === product.id);
  // 생산 완료 전 수량은 실적이 아니므로 포장중 이후만 누적한다.
  const produced = history.reduce((sum, order) => sum + (productionFinished(order.status) ? (lineOf(order.id)?.quantity ?? 0) : 0), 0);
  const traded = history.reduce((sum, order) => sum + lineAmount(lineOf(order.id) ?? { quantity: 0, unitPrice: 0, vatIncluded: true }), 0);
  const recent = history[0];
  const recentLine = recent ? lineOf(recent.id) : undefined;
  const recentClient = db.clients.find((client) => client.id === recent?.clientId);
  const recentRows = history.slice(0, 5);
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">생산품목 상세</h1>
          <p className="mt-1 text-muted">품목의 기준 정보와 연결된 생산·수주 이력을 확인합니다.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/products" className="inline-flex h-10 items-center gap-1 rounded-lg border border-line bg-white px-4"><ArrowLeft size={16} />목록으로</Link>
          {canManageOrders(role) ? <Link to={`/products/${product.id}/edit`} className="inline-flex h-10 items-center gap-1 rounded-lg border border-line bg-white px-4"><Pencil size={16} />정보 수정</Link> : null}
          {canManageOrders(role) ? <Link to="/orders/new" className="inline-flex h-10 items-center gap-1 rounded-lg bg-primary px-4 font-semibold text-white"><Plus size={16} />수주 등록</Link> : null}
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <section className="rounded-xl border border-line bg-white p-5">
          <div className="flex items-start justify-between gap-3"><p className="text-sm text-muted">누적 생산량</p><span className="grid h-9 w-9 place-items-center rounded-lg bg-primary-soft text-primary"><Package size={16} /></span></div>
          <p className="mt-3 text-2xl font-semibold">{produced.toLocaleString("ko-KR")}개</p>
          <p className="mt-1 text-xs text-muted">완료된 생산 기준</p>
        </section>
        <section className="rounded-xl border border-line bg-white p-5">
          <div className="flex items-start justify-between gap-3"><p className="text-sm text-muted">누적 거래액 · 부가세 포함</p><span className="grid h-9 w-9 place-items-center rounded-lg bg-primary-soft text-primary"><Wallet size={16} /></span></div>
          <p className="mt-3 text-2xl font-semibold">{formatWon(traded)}</p>
          <p className="mt-1 text-xs text-muted">연결 수주 누적 거래액</p>
        </section>
        <section className="rounded-xl border border-line bg-white p-5">
          <div className="flex items-start justify-between gap-3"><p className="text-sm text-muted">기준 단가 · 부가세 별도</p><span className="grid h-9 w-9 place-items-center rounded-lg bg-primary-soft text-primary"><Banknote size={16} /></span></div>
          <p className="mt-3 text-2xl font-semibold">{formatWon(product.unitPrice)}</p>
          <p className="mt-1 text-xs text-muted">수주 등록 시 기본으로 적용</p>
        </section>
      </div>
      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
        <section className="rounded-xl border border-line bg-white p-5">
          <h2 className="font-semibold">생산품목 정보</h2>
          <div className="mt-4 flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"><Package size={18} /></span>
            <div>
              <p className="text-lg font-semibold">{product.productName}</p>
              <p className="text-sm text-muted">{[product.modelName, `${localDate(product.createdAt)} 등록`].filter(Boolean).join(" · ")}</p>
            </div>
          </div>
          <p className="mt-5 text-sm text-muted">설명</p>
          <p className="mt-1">{product.description || "설명이 없습니다."}</p>
          <div className="mt-5 grid gap-4 border-t border-line pt-4 sm:grid-cols-3">
            <div><p className="text-xs text-muted">모델</p><p className="mt-1 font-semibold">{product.modelName || "-"}</p></div>
            <div><p className="text-xs text-muted">등록자</p><p className="mt-1 font-semibold">{product.createdByName}</p></div>
            <div><p className="text-xs text-muted">기준 단가 · 부가세 별도</p><p className="mt-1 font-semibold">{formatWon(product.unitPrice)}</p></div>
          </div>
          {product.drawingPdfName && product.drawingPdfUrl ? <a className="mt-4 inline-block text-sm text-primary" href={product.drawingPdfUrl} download={product.drawingPdfName}>도면 {product.drawingPdfName}</a> : null}
        </section>
        <section className="overflow-hidden rounded-xl border border-line bg-white">
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
            <div>
              <h2 className="font-semibold">관련 생산 및 수주 이력</h2>
              <p className="mt-1 text-sm text-muted">이 품목에 포함된 최근 수주 {recentRows.length}건 · 수량과 품목 금액은 {product.productName} 기준</p>
            </div>
            <Link to="/calendar" className="inline-flex items-center text-sm text-primary">생산 캘린더 <ChevronRight size={16} /></Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-primary-soft/40 text-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">수주번호</th>
                  <th className="py-3 font-medium">거래처</th>
                  <th className="py-3 font-medium">수량</th>
                  <th className="py-3 font-medium">저장 단가</th>
                  <th className="py-3 font-medium">품목 금액 · 부가세 포함</th>
                  <th className="py-3 font-medium">납기일</th>
                  <th className="py-3 font-medium">작업 상태</th>
                  <th className="w-12 py-3 pr-3 font-medium"><span className="sr-only">수주 상세</span></th>
                </tr>
              </thead>
              <tbody>
                {recentRows.length === 0 ? <tr><td className="px-5 py-6 text-muted" colSpan={8}>연결된 수주가 없습니다.</td></tr> : recentRows.map((order) => {
                  const line = lineOf(order.id);
                  const client = db.clients.find((item) => item.id === order.clientId);
                  if (!line) return null;
                  return (
                    <tr key={order.id} className="border-t border-line">
                      <td className="px-5 py-3 font-semibold"><Link className="text-primary" to={`/orders/${order.id}`}>{order.orderNo}</Link></td>
                      <td>{client?.companyName ?? "거래처 없음"}</td>
                      <td>{line.quantity.toLocaleString("ko-KR")}개</td>
                      <td>{formatWon(line.unitPrice)}</td>
                      <td>{formatWon(lineAmount(line))}</td>
                      <td className="whitespace-nowrap">{order.dueDate}</td>
                      <td><Badge className={orderStatusTone(order.status)}>{orderStatusLabel[order.status]}</Badge></td>
                      <td className="pr-3">
                        <Link to={`/orders/${order.id}`} aria-label={`${order.orderNo} 상세`} className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-primary-soft hover:text-primary">
                          <ChevronRight size={18} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        </div>
        <aside className="space-y-4">
          <section className="rounded-xl border border-line bg-white p-5">
            <div className="flex items-center justify-between"><h2 className="font-semibold">최근 연결 수주</h2>{recent ? <Link className="inline-flex items-center text-sm text-primary" to={`/orders/${recent.id}`}>상세 <ChevronRight size={16} /></Link> : null}</div>
            {recent && recentLine ? (
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{recent.orderNo}</p>
                  <Badge className={orderStatusTone(recent.status)}>{orderStatusLabel[recent.status]}</Badge>
                </div>
                <p>{recentClient?.companyName ?? "거래처 없음"}</p>
                <p className="text-muted">{productTitle(product)}</p>
                <div className="flex justify-between border-t border-line pt-3"><span className="text-muted">이 품목 수량</span><span>{recentLine.quantity.toLocaleString("ko-KR")}개</span></div>
                <div className="flex justify-between"><span className="text-muted">이 품목 금액 · 부가세 포함</span><span>{formatWon(lineAmount(recentLine))}</span></div>
                <div className="flex justify-between"><span className="text-muted">전체 수주 금액 · 부가세 포함</span><span>{formatWon(orderTotal(recent.lines))}</span></div>
                <div className="flex justify-between"><span className="text-muted">납기일</span><span>{recent.dueDate}{recent.dueDate === today ? " · 오늘" : ""}</span></div>
              </div>
            ) : <p className="mt-4 text-sm text-muted">연결된 수주가 없습니다.</p>}
          </section>
          <section className="rounded-xl bg-primary-soft p-5">
            <div className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-primary"><Info size={16} /></span>
              <div>
                <h2 className="font-semibold">수주 단가는 이력으로 보존됩니다</h2>
                <p className="mt-2 text-sm text-muted">기준 단가를 변경해도 이미 저장된 수주의 단가와 금액은 바뀌지 않습니다. 과거 거래는 수주 당시 정보로 확인하세요.</p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
