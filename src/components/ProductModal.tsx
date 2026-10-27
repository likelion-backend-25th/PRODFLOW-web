import { ImagePlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, TextField } from "@/components/ui.tsx";
import { saveProduct } from "@/lib/workflow.ts";

const MAX_IMAGE_BYTES = 1024 * 1024;

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
  onSaved: (productId: string, unitPrice: number) => void;
}) {
  const [productName, setProductName] = useState(initialName);
  const [modelName, setModelName] = useState("");
  const [description, setDescription] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [designImageUrl, setDesignImageUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  function submit() {
    const price = Number(unitPrice);
    if (!productName.trim() || !modelName.trim()) return setError("제품명과 모델명을 입력하세요.");
    if (unitPrice === "" || !Number.isInteger(price) || price < 0) return setError("기준 단가를 0원 이상 정수로 입력하세요.");
    if (!designImageUrl) return setError("디자인 이미지를 1장 올려 주세요.");
    try {
      const id = saveProduct({ productName, modelName, description: description.trim(), unitPrice: price, designImageUrl, actorName });
      onSaved(id, price);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "품목을 등록하지 못했습니다.");
    }
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
          <TextField label="제품명 *" value={productName} autoFocus onChange={(event) => setProductName(event.target.value)} placeholder="예: 클리어 케이스" />
          <TextField label="모델명 *" value={modelName} onChange={(event) => setModelName(event.target.value)} placeholder="예: iPhone 16 Pro" />
          <div className="sm:col-span-2">
            <TextField label="설명" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="소재, 기능 등" />
          </div>
          <TextField label="기준 단가 (원, 부가세 별도) *" type="number" min={0} value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} />
          <div className="text-sm">
            <span className="mb-1 block text-muted">디자인 이미지 *</span>
            <label className="flex h-10 cursor-pointer items-center justify-center gap-1 rounded-lg border border-dashed border-line text-muted hover:border-primary hover:text-primary">
              <ImagePlus size={16} />{designImageUrl ? "이미지 변경" : "이미지 선택"}
              <input className="sr-only" type="file" accept="image/*" onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (file.size > MAX_IMAGE_BYTES) {
                  setError("이미지는 1MB 이하로 올려 주세요.");
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => setDesignImageUrl(String(reader.result ?? ""));
                reader.readAsDataURL(file);
              }} />
            </label>
          </div>
          {designImageUrl ? <img src={designImageUrl} alt="디자인 미리보기" className="h-24 w-24 rounded-lg border border-line object-cover sm:col-span-2" /> : null}
          {error ? <p className="text-sm text-danger sm:col-span-2">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <Button tone="ghost" onClick={onClose}>취소</Button>
          <Button onClick={submit}>품목 등록</Button>
        </div>
      </div>
    </div>
  );
}
