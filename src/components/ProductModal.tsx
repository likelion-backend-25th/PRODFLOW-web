import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, TextField } from "@/components/ui.tsx";
import { readApiErrorMessage } from "@/lib/apiClient.ts";
import { checkModelCode, createProduct, uploadDrawing } from "@/lib/productApi.ts";

export function ProductModal({
  initialName,
  actorName,
  note = "등록하면 생산품목 관리에도 바로 추가되고, 이 수주의 품목 줄에 선택됩니다.",
  onClose,
  onSaved,
}: {
  initialName: string;
  actorName: string;
  note?: string;
  onClose: () => void;
  onSaved: (productId: string, unitPrice: number, productName: string, modelName: string) => void;
}) {
  void actorName;
  const [modelCode, setModelCode] = useState("");
  const [productName, setProductName] = useState(initialName);
  const [modelName, setModelName] = useState("");
  const [description, setDescription] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [drawing, setDrawing] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  function submit() {
    const price = Number(unitPrice);
    if (!modelCode.trim() || !productName.trim() || !modelName.trim()) return setError("모델코드, 제품명, 기종명을 입력하세요.");
    if (unitPrice === "" || !Number.isInteger(price) || price <= 0) return setError("기준 단가를 1원 이상 정수로 입력하세요.");
    setPending(true);
    setError("");
    void checkModelCode(modelCode.trim()).then(async (checked) => {
      if (!checked.available) {
        setError("같은 모델코드가 있습니다.");
        setPending(false);
        return;
      }
      const product = await createProduct({
        modelCode: modelCode.trim(),
        productName: productName.trim(),
        deviceName: modelName.trim(),
        productDescription: description.trim(),
        currentPrice: price,
      });
      if (drawing) await uploadDrawing(product.id, drawing);
      onSaved(String(product.id), price, product.productName, product.deviceName);
    }).catch((reason: unknown) => {
      setError(readApiErrorMessage(reason));
      setPending(false);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-labelledby="product-modal-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 id="product-modal-title" className="font-semibold">신규 생산품목 등록</h2>
            <p className="text-xs text-muted">{note}</p>
          </div>
          <button type="button" className="rounded-lg p-1 text-muted hover:bg-canvas" aria-label="닫기" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          <TextField label="모델코드 *" value={modelCode} autoFocus onChange={(event) => setModelCode(event.target.value)} placeholder="예: CASE-001" />
          <TextField label="제품명 *" value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="예: 클리어 케이스" />
          <TextField label="기종명 *" value={modelName} onChange={(event) => setModelName(event.target.value)} placeholder="예: iPhone 16 Pro" />
          <div className="sm:col-span-2">
            <TextField label="설명" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="소재, 기능 등" />
          </div>
          <TextField label="기준 단가 (원, 부가세 별도) *" type="number" min={0} value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} />
          <div className="text-sm">
            <span className="mb-1 block text-muted">도면 파일</span>
            <label className="flex h-10 cursor-pointer items-center justify-center rounded-lg border border-dashed border-line px-2 text-muted hover:border-primary hover:text-primary">
              <span className="truncate">{drawing ? drawing.name : "파일 선택"}</span>
              <input className="sr-only" type="file" onChange={(event) => setDrawing(event.target.files?.[0] ?? null)} />
            </label>
          </div>
          {error ? <p className="text-sm text-danger sm:col-span-2">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <Button tone="ghost" onClick={onClose}>취소</Button>
          <Button disabled={pending} onClick={submit}>{pending ? "등록 중…" : "품목 등록"}</Button>
        </div>
      </div>
    </div>
  );
}
