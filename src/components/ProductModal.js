import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ImagePlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, TextField } from "@/components/ui.tsx";
import { saveProduct } from "@/lib/workflow.ts";
const MAX_IMAGE_BYTES = 1024 * 1024;
export function ProductModal({ initialName, actorName, onClose, onSaved, }) {
    const [productName, setProductName] = useState(initialName);
    const [modelName, setModelName] = useState("");
    const [description, setDescription] = useState("");
    const [unitPrice, setUnitPrice] = useState("");
    const [designImageUrl, setDesignImageUrl] = useState("");
    const [error, setError] = useState("");
    useEffect(() => {
        const close = (event) => {
            if (event.key === "Escape")
                onClose();
        };
        window.addEventListener("keydown", close);
        return () => window.removeEventListener("keydown", close);
    }, [onClose]);
    function submit() {
        const price = Number(unitPrice);
        if (!productName.trim() || !modelName.trim())
            return setError("제품명과 모델명을 입력하세요.");
        if (unitPrice === "" || !Number.isInteger(price) || price < 0)
            return setError("기준 단가를 0원 이상 정수로 입력하세요.");
        if (!designImageUrl)
            return setError("디자인 이미지를 1장 올려 주세요.");
        try {
            const id = saveProduct({ productName, modelName, description: description.trim(), unitPrice: price, designImageUrl, actorName });
            onSaved(id, price);
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : "품목을 등록하지 못했습니다.");
        }
    }
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4", role: "dialog", "aria-modal": "true", "aria-labelledby": "product-modal-title", onMouseDown: (event) => { if (event.target === event.currentTarget)
            onClose(); }, children: _jsxs("div", { className: "w-full max-w-lg rounded-xl bg-white shadow-xl", children: [_jsxs("div", { className: "flex items-center justify-between border-b border-line px-5 py-4", children: [_jsxs("div", { children: [_jsx("h2", { id: "product-modal-title", className: "font-semibold", children: "\uC2E0\uADDC \uC0DD\uC0B0\uD488\uBAA9 \uB4F1\uB85D" }), _jsx("p", { className: "text-xs text-muted", children: "\uB4F1\uB85D\uD558\uBA74 \uC0DD\uC0B0\uD488\uBAA9 \uAD00\uB9AC\uC5D0\uB3C4 \uBC14\uB85C \uCD94\uAC00\uB418\uACE0, \uC774 \uC218\uC8FC\uC758 \uD488\uBAA9 \uC904\uC5D0 \uC120\uD0DD\uB429\uB2C8\uB2E4." })] }), _jsx("button", { type: "button", className: "rounded-lg p-1 text-muted hover:bg-canvas", "aria-label": "\uB2EB\uAE30", onClick: onClose, children: _jsx(X, { size: 18 }) })] }), _jsxs("div", { className: "grid gap-3 p-5 sm:grid-cols-2", children: [_jsx(TextField, { label: "\uC81C\uD488\uBA85 *", value: productName, autoFocus: true, onChange: (event) => setProductName(event.target.value), placeholder: "\uC608: \uD074\uB9AC\uC5B4 \uCF00\uC774\uC2A4" }), _jsx(TextField, { label: "\uBAA8\uB378\uBA85 *", value: modelName, onChange: (event) => setModelName(event.target.value), placeholder: "\uC608: iPhone 16 Pro" }), _jsx("div", { className: "sm:col-span-2", children: _jsx(TextField, { label: "\uC124\uBA85", value: description, onChange: (event) => setDescription(event.target.value), placeholder: "\uC18C\uC7AC, \uAE30\uB2A5 \uB4F1" }) }), _jsx(TextField, { label: "\uAE30\uC900 \uB2E8\uAC00 (\uC6D0, \uBD80\uAC00\uC138 \uBCC4\uB3C4) *", type: "number", min: 0, value: unitPrice, onChange: (event) => setUnitPrice(event.target.value) }), _jsxs("div", { className: "text-sm", children: [_jsx("span", { className: "mb-1 block text-muted", children: "\uB514\uC790\uC778 \uC774\uBBF8\uC9C0 *" }), _jsxs("label", { className: "flex h-10 cursor-pointer items-center justify-center gap-1 rounded-lg border border-dashed border-line text-muted hover:border-primary hover:text-primary", children: [_jsx(ImagePlus, { size: 16 }), designImageUrl ? "이미지 변경" : "이미지 선택", _jsx("input", { className: "sr-only", type: "file", accept: "image/*", onChange: (event) => {
                                                const file = event.target.files?.[0];
                                                if (!file)
                                                    return;
                                                if (file.size > MAX_IMAGE_BYTES) {
                                                    setError("이미지는 1MB 이하로 올려 주세요.");
                                                    return;
                                                }
                                                const reader = new FileReader();
                                                reader.onload = () => setDesignImageUrl(String(reader.result ?? ""));
                                                reader.readAsDataURL(file);
                                            } })] })] }), designImageUrl ? _jsx("img", { src: designImageUrl, alt: "\uB514\uC790\uC778 \uBBF8\uB9AC\uBCF4\uAE30", className: "h-24 w-24 rounded-lg border border-line object-cover sm:col-span-2" }) : null, error ? _jsx("p", { className: "text-sm text-danger sm:col-span-2", children: error }) : null] }), _jsxs("div", { className: "flex justify-end gap-2 border-t border-line px-5 py-4", children: [_jsx(Button, { tone: "ghost", onClick: onClose, children: "\uCDE8\uC18C" }), _jsx(Button, { onClick: submit, children: "\uD488\uBAA9 \uB4F1\uB85D" })] })] }) }));
}
