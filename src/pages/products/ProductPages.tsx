import { useEffect, useState } from "react";
import { ArrowLeft, Banknote, Check, ChevronRight, ClipboardList, FileText, FileUp, Info, Package, Pencil, X } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { Badge, Button } from "@/components/ui.tsx";
import { localDate } from "@/lib/dates.ts";
import { apiStatus, readApiErrorMessage } from "@/lib/apiClient.ts";
import { formatWon } from "@/lib/money.ts";
import { checkModelCode, createProduct, deleteDrawing, getProduct, listCurrentDrawings, listDevices, listProductOrders, listProducts, searchProducts, updateProduct, updateProductStatus, uploadDrawings, type DeviceCode, type ProductDrawing, type ProductItem, type ProductOrderHistory } from "@/lib/productApi.ts";
import { canManageOrders, useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";
import type { ProductStatus } from "@/types/domain.ts";

function toProductRow(product: ProductItem) {
  return {
    id: String(product.id),
    modelCode: product.modelCode,
    productName: product.productName,
    modelName: product.deviceName,
    description: product.productDescription,
    unitPrice: product.currentPrice,
    updatedAt: product.updatedAt,
    createdAt: product.createdAt,
    status: product.status,
  };
}

function useProductOrders(productId: string) {
  const [rows, setRows] = useState<ProductOrderHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const id = Number(productId);
    if (!Number.isInteger(id) || id <= 0) {
      setRows([]);
      setError("");
      setLoading(false);
      return;
    }
    let ignore = false;
    setLoading(true);
    listProductOrders(id).then((items) => {
      if (ignore) return;
      setRows(items);
      setError("");
    }).catch((reason: unknown) => {
      if (ignore) return;
      setRows([]);
      setError(readApiErrorMessage(reason));
    }).finally(() => {
      if (!ignore) setLoading(false);
    });
    return () => {
      ignore = true;
    };
  }, [productId]);
  return { rows, loading, error };
}

export function ProductListPage() {
  const role = useAuthStore((state) => state.user?.role);
  const show = useToastStore((state) => state.show);
  const canWrite = canManageOrders(role);
  const [keyword, setKeyword] = useState("");
  const [tab, setTab] = useState<"available" | "stopped">("available");
  const [available, setAvailable] = useState<ReturnType<typeof toProductRow>[]>([]);
  const [stopped, setStopped] = useState<ReturnType<typeof toProductRow>[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const rows = tab === "available" ? available : stopped;
  const [selectedId, setSelectedId] = useState("");
  const selected = rows.find((product) => product.id === selectedId) ?? rows[0];
  const recentOrders = useProductOrders(selected?.id ?? "");
  useEffect(() => {
    let ignore = false;
    setLoading(true);
    const load = (status: "AVAILABLE" | "DISCONTINUED") => keyword.trim() ? searchProducts(keyword.trim(), status) : listProducts(status);
    Promise.all([load("AVAILABLE"), load("DISCONTINUED")]).then(([nextAvailable, nextStopped]) => {
      if (ignore) return;
      setAvailable(nextAvailable.map(toProductRow));
      setStopped(nextStopped.map(toProductRow));
      setLoadError("");
    }).catch((error: unknown) => {
      if (ignore) return;
      const message = readApiErrorMessage(error);
      setLoadError(message);
      show(message);
    }).finally(() => {
      if (!ignore) setLoading(false);
    });
    return () => {
      ignore = true;
    };
  }, [keyword, reloadKey, show]);
  function moveProduct(id: string, status: "AVAILABLE" | "DISCONTINUED") {
    const next = status === "DISCONTINUED" ? "AVAILABLE" : "DISCONTINUED";
    void updateProductStatus(Number(id), next).then(() => {
      setSelectedId(id);
      setTab(next === "DISCONTINUED" ? "stopped" : "available");
      setReloadKey((value) => value + 1);
      show(next === "DISCONTINUED" ? "생산 중단으로 바꿨습니다. 이미 발행한 견적과 수주는 그대로입니다." : "생산 가능으로 바꿨습니다.");
    }).catch((error: unknown) => show(readApiErrorMessage(error)));
  }
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">생산품목 관리</h1>
          <p className="mt-1 text-muted">생산 가능한 제품 명칭과 설명을 등록하고, 견적 작성 시 자동 입력 및 자동 완성을 관리하세요.</p>
        </div>
        {canManageOrders(role) ? <Link to="/products/new" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 font-semibold text-white">+ 품목 등록</Link> : null}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <section className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-muted">전체 등록 품목</p><p className="mt-2 text-2xl font-semibold">{available.length + stopped.length}종</p></section>
        <section className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-muted">생산 가능</p><p className="mt-2 text-2xl font-semibold">{available.length}종</p></section>
        <section className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-muted">생산 중단</p><p className="mt-2 text-2xl font-semibold">{stopped.length}종</p></section>
      </div>
      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="overflow-hidden rounded-xl border border-line bg-white">
          <div className="flex items-end justify-between gap-3 border-b border-line px-5 pt-4">
            <div className="flex gap-4 text-sm">
              <button type="button" className={tab === "available" ? "border-b-2 border-primary pb-3 font-semibold text-primary" : "pb-3 text-muted"} onClick={() => setTab("available")}>등록된 생산품목 {available.length}</button>
              <button type="button" className={tab === "stopped" ? "border-b-2 border-primary pb-3 font-semibold text-primary" : "pb-3 text-muted"} onClick={() => setTab("stopped")}>생산 중단 품목 {stopped.length}</button>
            </div>
          </div>
          <div className="px-5 py-3"><input className="h-10 w-full rounded-lg border border-line px-3" value={keyword} placeholder="모델코드, 품목명, 기종명, 설명 검색" onChange={(event) => setKeyword(event.target.value)} /></div>
          <table className="w-full text-left text-sm">
            <thead className="bg-primary-soft/40 text-muted"><tr><th className="px-5 py-3 font-medium">모델코드</th><th className="py-3 font-medium">품목명</th><th className="py-3 font-medium">기종명</th><th className="py-3 font-medium">설명</th><th className="py-3 font-medium">단가</th><th className="py-3 font-medium">최근 수정</th><th className="py-3 font-medium">상태</th><th className="w-12 py-3 pr-3 font-medium"><span className="sr-only">상세</span></th></tr></thead>
            <tbody>
              {loading ? <tr><td className="px-5 py-6 text-muted" colSpan={8}>품목을 불러오는 중입니다.</td></tr> : null}
              {!loading && loadError ? <tr><td className="px-5 py-6 text-danger" colSpan={8}>{loadError}</td></tr> : null}
              {!loading && !loadError && rows.length === 0 ? <tr><td className="px-5 py-6 text-muted" colSpan={8}>{tab === "available" ? "등록된 생산품목이 없습니다." : "생산 중단 품목이 없습니다."}</td></tr> : null}
              {!loading && !loadError ? rows.map((product) => (
                <tr key={product.id} className={`cursor-pointer border-t border-line ${selected?.id === product.id ? "bg-primary-soft" : ""}`} onClick={() => setSelectedId(product.id)}>
                  <td className="px-5 py-3">{product.modelCode}</td>
                  <td className="font-semibold">{product.productName}</td>
                  <td>{product.modelName}</td>
                  <td className="max-w-48 truncate">{product.description}</td>
                  <td className="whitespace-nowrap">{formatWon(product.unitPrice)}</td>
                  <td className="whitespace-nowrap">{localDate(product.updatedAt)}</td>
                  <td><ProductStatusMark status={product.status} canChange={canWrite} onChange={() => moveProduct(product.id, product.status)} /></td>
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
              )) : null}
            </tbody>
          </table>
        </section>
        {selected ? (
          <aside className="space-y-3">
            <section className="rounded-xl border border-line bg-white p-5">
              <h2 className="font-semibold">품목 상세</h2>
              <p className="mt-3 text-xs text-muted">{selected.modelCode}</p>
              <p className="text-lg font-semibold">{selected.productName}</p>
              <p className="text-sm text-muted">{selected.modelName}</p>
              <div className="mt-3"><ProductStatusMark status={selected.status} canChange={canWrite} onChange={() => moveProduct(selected.id, selected.status)} /></div>
              <p className="mt-3 text-sm">{selected.description}</p>
              <p className="mt-3 font-semibold">{formatWon(selected.unitPrice)}</p>
              <div className="mt-4 flex gap-2">
                {canManageOrders(role) ? <Link to={`/products/${selected.id}/edit`} className="inline-flex h-10 items-center rounded-lg border border-line px-3">정보 수정</Link> : null}
              </div>
            </section>
            <section className="rounded-xl border border-line bg-white p-5">
              <h3 className="font-semibold">최근 수주</h3>
              <RecentOrderList history={recentOrders} />
            </section>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

const MAX_DRAWING_BYTES = 2 * 1024 * 1024;

function formatPriceInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits).toLocaleString("ko-KR") : "";
}

export function ProductFormPage() {
  const { productId } = useParams();
  return <ProductEditor productId={productId} />;
}

function ProductEditor({ productId }: { productId?: string }) {
  const navigate = useNavigate();
  const show = useToastStore((state) => state.show);
  const editing = Boolean(productId);
  const [ready, setReady] = useState(!editing);
  const [modelCode, setModelCode] = useState("");
  const [productName, setProductName] = useState("");
  const [modelName, setModelName] = useState("");
  const [description, setDescription] = useState("");
  const [priceText, setPriceText] = useState("");
  const [codeCheck, setCodeCheck] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [savedDrawings, setSavedDrawings] = useState<ProductDrawing[]>([]);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [drawingError, setDrawingError] = useState("");
  const [deviceModal, setDeviceModal] = useState(false);
  const [deviceDraft, setDeviceDraft] = useState("");
  const [deviceError, setDeviceError] = useState("");
  const [devices, setDevices] = useState<DeviceCode[]>([]);
  const [extraDevices, setExtraDevices] = useState<string[]>([]);
  useEffect(() => {
    let ignore = false;
    listDevices().then((response) => {
      if (!ignore) setDevices(response);
    }).catch((error: unknown) => {
      if (!ignore) show(readApiErrorMessage(error));
    });
    if (!productId) return () => { ignore = true; };
    const id = Number(productId);
    Promise.all([getProduct(id), listCurrentDrawings(id)]).then(([product, drawings]) => {
      if (ignore) return;
      setModelCode(product.modelCode);
      setProductName(product.productName);
      setModelName(product.deviceName);
      setDescription(product.productDescription ?? "");
      setPriceText(formatPriceInput(String(product.currentPrice)));
      setSavedDrawings(drawings.filter((drawing) => drawing.fileName.length > 0));
      setReady(true);
    }).catch((error: unknown) => {
      if (!ignore) show(readApiErrorMessage(error));
    });
    return () => { ignore = true; };
  }, [productId, show]);

  async function openSavedDrawing(drawing: ProductDrawing) {
    if (!productId) return;
    if (previewId === drawing.id) {
      setPreviewId(null);
      return;
    }
    if (!previewStale(drawing)) {
      setPreviewId(drawing.id);
      return;
    }
    try {
      const drawings = (await listCurrentDrawings(Number(productId))).filter((item) => item.fileName.length > 0);
      setSavedDrawings(drawings);
      setPreviewId(drawing.id);
    } catch (error: unknown) {
      show(readApiErrorMessage(error));
    }
  }

  async function removeSavedDrawing(drawingId: number) {
    if (!productId || deletingId !== null) return;
    setDeletingId(drawingId);
    try {
      await deleteDrawing(Number(productId), drawingId);
      const drawings = (await listCurrentDrawings(Number(productId))).filter((item) => item.fileName.length > 0);
      setSavedDrawings(drawings);
      if (previewId === drawingId) setPreviewId(null);
    } catch (error: unknown) {
      show(readApiErrorMessage(error));
    } finally {
      setDeletingId(null);
    }
  }

  const deviceNames = [...new Set([...devices.map((device) => device.name), modelName, ...extraDevices].filter(Boolean))].sort((left, right) => left.localeCompare(right, "ko"));
  if (editing && !ready) return <p>품목을 불러오는 중입니다.</p>;

  function addDevice() {
    const next = deviceDraft.trim();
    if (!next) {
      setDeviceError("기종명을 입력하세요.");
      return;
    }
    setExtraDevices((items) => items.some((item) => item.toLowerCase() === next.toLowerCase()) ? items : [...items, next]);
    setModelName(next);
    setDeviceDraft("");
    setDeviceError("");
    setDeviceModal(false);
  }

  async function checkCode(): Promise<string | null> {
    if (editing) return null;
    if (!modelCode.trim()) {
      const message = "모델코드를 입력하세요.";
      setCodeCheck(message);
      return message;
    }
    try {
      const result = await checkModelCode(modelCode.trim());
      if (result.available) {
        setCodeCheck("사용할 수 있는 모델코드입니다.");
        return null;
      }
      const message = "같은 모델코드가 있습니다.";
      setCodeCheck(message);
      return message;
    } catch (error: unknown) {
      const message = readApiErrorMessage(error);
      setCodeCheck(message);
      return message;
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{editing ? "생산품목 수정" : "생산품목 등록"}</h1>
          <p className="mt-1 text-muted">{editing ? "등록된 품목의 이름, 기종, 기준 단가와 파일을 수정합니다." : "생산 가능한 품목의 기본 정보와 견적 작성 시 사용할 기준 단가를 설정합니다."}</p>
        </div>
        <Link to="/products" className="inline-flex h-10 items-center gap-1 rounded-lg border border-line bg-white px-4">
          <ArrowLeft size={16} /> 생산품목 목록으로
        </Link>
      </div>
      <form
        className="mt-6 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]"
        onSubmit={async (event) => {
          event.preventDefault();
          const unitPrice = Number(priceText.replace(/\D/g, ""));
          const codeError = await checkCode();
          if (codeError) {
            show(codeError);
            return;
          }
          if (!productName.trim()) {
            show("품목명을 입력하세요.");
            return;
          }
          if (!modelName.trim()) {
            show("기종을 선택하세요.");
            return;
          }
          if (priceText.trim() === "" || !Number.isInteger(unitPrice) || unitPrice <= 0) {
            show("기준 단가를 1원 이상 정수로 입력하세요.");
            return;
          }
          const device = devices.find((item) => item.name.trim().toLowerCase() === modelName.trim().toLowerCase());
          if (editing && !device) {
            show("수정할 때는 이미 등록된 기종만 고를 수 있습니다. 새 기종은 품목을 새로 등록할 때 만듭니다.");
            return;
          }
          try {
            // 기종은 기존 코드와 새 이름 중 하나만 보낸다. 둘을 같이 보내면 서버가 거절한다.
            const saved = editing && productId
              ? await updateProduct(Number(productId), {
                productName: productName.trim(),
                deviceCode: device?.id ?? 0,
                productDescription: description.trim(),
                currentPrice: unitPrice,
              })
              : await createProduct({
                modelCode: modelCode.trim(),
                productName: productName.trim(),
                ...(device ? { deviceCode: device.id } : { deviceName: modelName.trim() }),
                productDescription: description.trim(),
                currentPrice: unitPrice,
              });
            if (pendingFiles.length > 0) {
              await uploadDrawings(saved.id, pendingFiles);
              const drawings = (await listCurrentDrawings(saved.id)).filter((item) => item.fileName.length > 0);
              setSavedDrawings(drawings);
              setPendingFiles([]);
            }
            show("품목을 저장했습니다. 이미 들어간 수주 단가는 바뀌지 않습니다.");
            navigate("/products");
          } catch (error: unknown) {
            show(readApiErrorMessage(error));
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
              모델코드 <span className="text-danger">*</span>
              <span className="mt-2 flex gap-2">
                <input
                  className="h-10 min-w-0 flex-1 rounded-lg border border-line px-3 font-normal disabled:bg-canvas"
                  value={modelCode}
                  placeholder="예: PM-0005"
                  disabled={editing}
                  onChange={(event) => {
                    setModelCode(event.target.value);
                    setCodeCheck("");
                  }}
                />
                {editing ? null : <Button type="button" tone="ghost" onClick={() => void checkCode()}>중복 확인</Button>}
              </span>
            </label>
            <p className="mt-2 text-xs text-muted">같은 모델코드가 있는지 확인하세요.</p>
            {codeCheck ? <p className={`mt-1 text-xs ${codeCheck.startsWith("사용") ? "text-success" : "text-danger"}`}>{codeCheck}</p> : null}
            <label className="mt-5 block text-sm font-semibold">
              품목명 <span className="text-danger">*</span>
              <input
                className="mt-2 h-10 w-full rounded-lg border border-line px-3 font-normal"
                value={productName}
                placeholder="예: 정밀 브러쉬 8형"
                onChange={(event) => setProductName(event.target.value)}
              />
            </label>
            <p className="mt-2 text-xs text-muted">규격이 다르면 이름에 규격이나 모델을 함께 입력해 주세요.</p>
            <div className="mt-5 text-sm font-semibold">
              기종명 <span className="text-danger">*</span>
              <span className="mt-2 flex gap-2">
                <select
                  className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-white px-3 font-normal"
                  value={modelName}
                  onChange={(event) => setModelName(event.target.value)}
                >
                  <option value="">기종을 선택하세요</option>
                  {deviceNames.map((device) => <option key={device} value={device}>{device}</option>)}
                </select>
                {editing ? null : <Button type="button" tone="ghost" onClick={() => { setDeviceDraft(""); setDeviceError(""); setDeviceModal(true); }}>기종 추가</Button>}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted">{editing ? "수정할 때는 이미 등록된 기종만 고를 수 있습니다." : "등록된 기종을 고르거나, 기종 추가로 새 기종을 넣으세요."}</p>
            <label className="mt-5 block text-sm font-semibold">
              품목 설명 <span className="font-normal text-muted">(선택)</span>
              <textarea
                className="mt-2 h-28 w-full resize-none rounded-lg border border-line px-3 py-2 font-normal"
                value={description}
                placeholder="재질, 가공 방식, 표면 마감 등 품목을 구분할 수 있는 설명을 입력하세요"
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <p className="mt-4 border-t border-line pt-4 text-xs text-muted">견적 작성 시 선택한 품목의 설명이 자동으로 입력됩니다.</p>
          </section>
          <section className="rounded-xl border border-line bg-white p-5">
            <h2 className="font-semibold">단가</h2>
            <p className="mt-1 text-sm text-muted">새 견적에 사용할 기본값을 설정합니다.</p>
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
            <p className="mt-2 text-xs text-muted">부가세 별도 금액으로 입력하세요. 부가세 포함 여부는 견적 작성 시 정하고, 수주 등록 때 그대로 가져옵니다.</p>
            <p className="mt-4 rounded-lg border border-line px-4 py-3 text-sm text-muted">기준 단가를 수정해도 이미 저장된 수주의 가격 정보는 소급해서 변경되지 않습니다.</p>
          </section>
          <section className="rounded-xl border border-line bg-white p-5">
            <h2 className="font-semibold">파일</h2>
            <p className="mt-1 text-sm text-muted">생산에 사용할 파일을 올려 주세요. 파일마다 2MB 이하이고, 여러 장을 한 번에 고를 수 있습니다.</p>
            <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted hover:border-primary hover:text-primary">
              <FileUp size={20} />
              <span className="mt-2 font-semibold text-ink">파일 선택</span>
              <span className="mt-1 text-xs">클릭해서 파일을 추가하세요.</span>
              <input
                className="sr-only"
                type="file"
                multiple
                onChange={(event) => {
                  const selected = [...(event.target.files ?? [])];
                  event.target.value = "";
                  if (selected.length === 0) return;
                  const oversized = selected.filter((file) => file.size > MAX_DRAWING_BYTES);
                  const accepted = selected.filter((file) => file.size <= MAX_DRAWING_BYTES);
                  setPendingFiles((current) => [...current, ...accepted]);
                  setDrawingError(oversized.length > 0 ? "2MB를 넘는 파일은 빼 두었습니다." : "");
                }}
              />
            </label>
            {pendingFiles.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {pendingFiles.map((file, index) => (
                  <li key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">{file.name}</span>
                    <button type="button" className="shrink-0 text-muted" onClick={() => setPendingFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}>빼기</button>
                  </li>
                ))}
              </ul>
            ) : null}
            {savedDrawings.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {savedDrawings.map((drawing) => (
                  <li key={drawing.id} className="rounded-lg border border-line px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <button type="button" className="min-w-0 truncate text-left text-primary" onClick={() => void openSavedDrawing(drawing)}>
                        {drawing.fileName}
                      </button>
                      <button type="button" className="shrink-0 text-muted disabled:opacity-40" disabled={deletingId === drawing.id} onClick={() => void removeSavedDrawing(drawing.id)}>삭제</button>
                    </div>
                    {previewId === drawing.id ? <DrawingPreview drawing={savedDrawings.find((item) => item.id === drawing.id) ?? drawing} /> : null}
                  </li>
                ))}
              </ul>
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
              <span>모델코드 · 품목명 · 기종명 · 기준 단가</span>
            </div>
          </section>
          <section className="rounded-xl bg-primary-soft p-5">
            <div className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-primary"><Info size={16} /></span>
              <div>
                <h2 className="font-semibold">견적·수주 가격은 별도로 보존됩니다</h2>
                <p className="mt-2 text-sm text-muted">기준 단가는 새 견적의 처음 값입니다. 견적과 수주에 저장한 단가는 이후 기준 단가를 고쳐도 바뀌지 않습니다.</p>
              </div>
            </div>
          </section>
          <section className="rounded-xl border border-line bg-white p-5">
            <h2 className="font-semibold">등록 후 활용</h2>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex items-center gap-2"><Check size={16} className="text-primary" />품목명 검색 및 선택</li>
              <li className="flex items-center gap-2"><Check size={16} className="text-primary" />기준 단가를 불러온 후 수량 입력</li>
            </ul>
            <p className="mt-4 border-t border-line pt-4 text-xs text-muted">없는 품목은 견적 작성 중 모달에서 등록합니다. 수주 등록에서는 품목을 새로 만들지 않습니다.</p>
          </section>
        </aside>
      </form>
      {deviceModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-labelledby="device-modal-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeviceModal(false); }}>
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 id="device-modal-title" className="font-semibold">기종 추가</h2>
              <button type="button" className="rounded-lg p-1 text-muted hover:bg-canvas" aria-label="닫기" onClick={() => setDeviceModal(false)}><X size={18} /></button>
            </div>
            <div className="p-5">
              <label className="block text-sm font-semibold">
                기종명 <span className="text-danger">*</span>
                <input
                  className="mt-2 h-10 w-full rounded-lg border border-line px-3 font-normal"
                  value={deviceDraft}
                  placeholder="예: Galaxy S26"
                  autoFocus
                  onChange={(event) => { setDeviceDraft(event.target.value); setDeviceError(""); }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    addDevice();
                  }}
                />
              </label>
              {deviceError ? <p className="mt-2 text-xs text-danger">{deviceError}</p> : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
              <Button tone="ghost" onClick={() => setDeviceModal(false)}>취소</Button>
              <Button onClick={addDevice}>추가</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProductStatusMark({ status, canChange, onChange }: { status: ProductStatus; canChange: boolean; onChange: () => void }) {
  const stopped = status === "DISCONTINUED";
  const className = stopped ? "bg-slate-100 text-slate-600" : "bg-primary-soft text-primary";
  const label = stopped ? "생산 중단" : "생산 가능";
  if (!canChange) return <Badge className={className}>{label}</Badge>;
  return (
    <button type="button" className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${className}`} onClick={(event) => { event.stopPropagation(); onChange(); }}>
      {label}
    </button>
  );
}

function isImageFile(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(name);
}

function previewStale(drawing: ProductDrawing | null): boolean {
  if (!drawing?.previewUrl || !drawing.expiresAt) return true;
  const expires = Date.parse(drawing.expiresAt);
  return Number.isNaN(expires) || expires <= Date.now();
}

function DrawingPreview({ drawing }: { drawing: ProductDrawing }) {
  if (!drawing.previewUrl) return <p className="mt-3 text-xs text-muted">파일을 열 수 없습니다.</p>;
  return (
    <div className="mt-3">
      {isImageFile(drawing.fileName) ? (
        <img src={drawing.previewUrl} alt={drawing.fileName} className="max-h-64 w-full rounded-lg border border-line object-contain" />
      ) : (
        <iframe title={drawing.fileName} src={drawing.previewUrl} className="h-64 w-full rounded-lg border border-line" />
      )}
      <a href={drawing.previewUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-primary">새 탭에서 열기</a>
    </div>
  );
}

function ProductFileWindow({ productId, drawings, onDrawings }: { productId: number; drawings: ProductDrawing[]; onDrawings: (items: ProductDrawing[]) => void }) {
  const show = useToastStore((state) => state.show);
  const [openId, setOpenId] = useState<number | null>(null);
  const open = drawings.find((drawing) => drawing.id === openId) ?? null;

  async function toggle(drawing: ProductDrawing) {
    if (openId === drawing.id) {
      setOpenId(null);
      return;
    }
    if (!previewStale(drawing)) {
      setOpenId(drawing.id);
      return;
    }
    try {
      const fresh = (await listCurrentDrawings(productId)).filter((item) => item.fileName.length > 0);
      onDrawings(fresh);
      setOpenId(drawing.id);
    } catch (error: unknown) {
      show(readApiErrorMessage(error));
    }
  }

  return (
    <section className="flex h-full w-full flex-col rounded-xl border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">관련 파일</p>
          <p className="mt-1 text-xs text-muted">파일 이름을 누르면 내용을 봅니다.</p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"><FileText size={16} /></span>
      </div>
      {drawings.length === 0 ? <p className="mt-4 text-sm text-muted">올린 파일이 없습니다.</p> : drawings.map((drawing) => (
        <button key={drawing.id} type="button" className="mt-4 truncate text-left text-sm text-primary" onClick={() => void toggle(drawing)}>
          {drawing.fileName}
        </button>
      ))}
      {open ? <DrawingPreview drawing={open} /> : null}
    </section>
  );
}

function RecentOrderList({ history }: { history: ReturnType<typeof useProductOrders> }) {
  if (history.loading) return <p className="mt-3 text-sm text-muted">수주 이력을 불러오는 중입니다.</p>;
  if (history.error) return <p className="mt-3 text-sm text-danger">{history.error}</p>;
  if (history.rows.length === 0) return <p className="mt-3 text-sm text-muted">관련 수주가 없습니다.</p>;
  return (
    <ul className="mt-3 space-y-1">
      {history.rows.map((row) => (
        <li key={row.orderId}>
          <Link to={`/orders/${row.orderId}`} className="block rounded-lg px-2 py-2 hover:bg-canvas">
            <p className="font-semibold">{row.orderNo}</p>
            <p className="text-sm text-muted">{row.clientName} · {row.quantity.toLocaleString("ko-KR")}개 · {row.statusName}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ProductDetailPage() {
  const { productId = "" } = useParams();
  const role = useAuthStore((state) => state.user?.role);
  const recentOrders = useProductOrders(productId);
  const [product, setProduct] = useState<ReturnType<typeof toProductRow> | null>(null);
  const [drawings, setDrawings] = useState<ProductDrawing[]>([]);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    const id = Number(productId);
    if (!Number.isInteger(id) || id <= 0) {
      setMissing(true);
      return;
    }
    let ignore = false;
    Promise.all([getProduct(id), listCurrentDrawings(id)]).then(([item, drawings]) => {
      if (ignore) return;
      setProduct(toProductRow(item));
      setDrawings(drawings.filter((drawing) => drawing.fileName.length > 0));
      setLoadError("");
    }).catch((error: unknown) => {
      if (ignore) return;
      if (apiStatus(error) === 404) setMissing(true);
      else setLoadError(readApiErrorMessage(error));
    });
    return () => { ignore = true; };
  }, [productId]);
  if (loadError) return <p>{loadError}</p>;
  if (missing) return <p>품목을 찾을 수 없습니다.</p>;
  if (!product) return <p>품목을 불러오는 중입니다.</p>;
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
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <section className="rounded-xl border border-line bg-white p-5">
          <div className="flex items-start justify-between gap-3"><p className="text-sm text-muted">기준 단가 · 부가세 별도</p><span className="grid h-9 w-9 place-items-center rounded-lg bg-primary-soft text-primary"><Banknote size={16} /></span></div>
          <p className="mt-3 text-2xl font-semibold">{formatWon(product.unitPrice)}</p>
          <p className="mt-1 text-xs text-muted">견적 작성 시 처음 단가로 적용</p>
        </section>
      </div>
      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
        <section className="rounded-xl border border-line bg-white p-5">
          <h2 className="font-semibold">생산품목 정보</h2>
          <div className="mt-4 flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"><Package size={18} /></span>
                <div>
                  <p className="text-lg font-semibold">{product.productName}</p>
                  <p className="text-sm text-muted">{[product.modelCode, product.modelName, `${localDate(product.createdAt)} 등록`].filter(Boolean).join(" · ")}</p>
                </div>
              </div>
              <p className="mt-5 text-sm text-muted">설명</p>
              <p className="mt-1">{product.description || "설명이 없습니다."}</p>
            </div>
            <div className="w-full max-w-xs shrink-0">
              <ProductFileWindow productId={Number(product.id)} drawings={drawings} onDrawings={setDrawings} />
            </div>
          </div>
          <div className="mt-5 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
            <div><p className="text-xs text-muted">기종명</p><p className="mt-1 font-semibold">{product.modelName || "-"}</p></div>
            <div><p className="text-xs text-muted">기준 단가 · 부가세 별도</p><p className="mt-1 font-semibold">{formatWon(product.unitPrice)}</p></div>
          </div>
        </section>
        <section className="overflow-hidden rounded-xl border border-line bg-white">
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
            <div>
              <h2 className="font-semibold">관련 생산 및 수주 이력</h2>
              <p className="mt-1 text-sm text-muted">최근 수주 3건입니다. 저장된 단가와 금액은 수주 당시 값입니다.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-primary-soft/40 text-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">수주번호</th>
                  <th className="py-3 font-medium">거래처</th>
                  <th className="py-3 font-medium">수량</th>
                  <th className="py-3 font-medium">저장 단가</th>
                  <th className="py-3 font-medium">품목 금액</th>
                  <th className="py-3 font-medium">납기일</th>
                  <th className="py-3 font-medium">작업 상태</th>
                  <th className="w-12 py-3 pr-3 font-medium"><span className="sr-only">수주 상세</span></th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.loading ? <tr><td className="px-5 py-6 text-muted" colSpan={8}>수주 이력을 불러오는 중입니다.</td></tr> : null}
                {!recentOrders.loading && recentOrders.error ? <tr><td className="px-5 py-6 text-danger" colSpan={8}>{recentOrders.error}</td></tr> : null}
                {!recentOrders.loading && !recentOrders.error && recentOrders.rows.length === 0 ? <tr><td className="px-5 py-6 text-muted" colSpan={8}>관련 수주가 없습니다.</td></tr> : null}
                {recentOrders.rows.map((row) => (
                  <tr key={row.orderId} className="border-t border-line">
                    <td className="px-5 py-3">{row.orderNo}</td>
                    <td>{row.clientName}</td>
                    <td>{row.quantity.toLocaleString("ko-KR")}</td>
                    <td className="whitespace-nowrap">{formatWon(row.unitPrice)}</td>
                    <td className="whitespace-nowrap">{formatWon(row.lineAmount)}</td>
                    <td className="whitespace-nowrap">{row.estimatedDueDate ? localDate(row.estimatedDueDate) : "-"}</td>
                    <td>{row.statusName}</td>
                    <td className="pr-3">
                      <Link to={`/orders/${row.orderId}`} aria-label={`${row.orderNo} 수주 상세`} className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-canvas hover:text-primary">
                        <ChevronRight size={18} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        </div>
        <aside className="space-y-4">
          <section className="rounded-xl border border-line bg-white p-5">
            <h2 className="font-semibold">최근 연결 수주</h2>
            <RecentOrderList history={recentOrders} />
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
