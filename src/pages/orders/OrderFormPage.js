import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { ArrowLeft, Check, CircleAlert, CircleCheck, Info, Mail, MessageSquare, Phone, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { DueDateError, createOrder, previewCapacity, previewSchedule } from "@/lib/workflow.ts";
import { useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";
const DRAFT_KEY = "prodflow-order-draft";
const schema = z.object({
    clientId: z.string(),
    companyName: z.string().trim().min(1, "회사명을 입력하세요."),
    contactName: z.string().trim().min(1, "담당자명을 입력하세요."),
    contactPhone: z.string().refine((value) => digitsOnly(value).length >= 9, "거래처 연락처를 확인하세요."),
    contactEmail: z.string().trim().email("이메일을 확인하세요."),
    companyAddress: z.string().trim().min(1, "회사 주소를 선택하세요."),
    lines: z
        .array(z.object({
        productId: z.string().min(1, "생산품목을 선택하세요."),
        quantity: z.number({ error: "수량을 입력하세요." }).int("수량은 정수로 입력하세요.").positive("수량은 1개 이상입니다."),
        unitPrice: z.number({ error: "단가를 입력하세요." }).int("단가는 원 단위 정수로 입력하세요.").min(0, "단가는 0원 이상입니다."),
    }))
        .min(1, "생산품목을 1개 이상 추가하세요."),
    vatSeparate: z.boolean(),
    depositDueDate: z.string().min(1, "계약금 입금 마감일을 선택하세요."),
    requestedDueDate: z.string().min(1, "납기일을 선택하세요."),
    receiverPhone: z.string().refine((value) => digitsOnly(value).length >= 9, "배송 수신 연락처를 확인하세요."),
    shippingAddress: z.string().min(1, "배송지를 선택하세요."),
    notifyChannel: z.enum(["SMS", "EMAIL"]),
    memo: z.string().max(200, "업무 메모는 200자 이내로 입력하세요."),
});
const emptyLine = { productId: "", quantity: 100, unitPrice: 0 };
function clientFields(db, clientId) {
    const client = db.clients.find((item) => item.id === clientId);
    return {
        clientId: client?.id ?? "",
        companyName: client?.companyName ?? "",
        contactName: client?.contactName ?? "",
        contactPhone: client?.contactMobile || client?.phone || "",
        contactEmail: client?.taxEmail ?? "",
        companyAddress: client?.address ?? "",
    };
}
function blankValues(db, clientId) {
    const client = db.clients.find((item) => item.id === clientId);
    return {
        ...clientFields(db, clientId),
        lines: [{ ...emptyLine }],
        vatSeparate: true,
        depositDueDate: todayISO(),
        requestedDueDate: "",
        receiverPhone: client?.contactMobile ?? "",
        shippingAddress: client?.address ?? "",
        notifyChannel: "SMS",
        memo: "",
    };
}
function readDraft(db) {
    try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (!raw)
            return null;
        const draft = JSON.parse(raw);
        const values = { ...blankValues(db, null), ...draft.values };
        if (!db.clients.some((client) => client.id === values.clientId)) {
            values.clientId = "";
        }
        else if (!values.companyName) {
            Object.assign(values, clientFields(db, values.clientId));
        }
        values.lines = (values.lines?.length ? values.lines : [{ ...emptyLine }]).map((line) => ({
            ...line,
            productId: db.products.some((product) => product.id === line.productId) ? line.productId : "",
        }));
        return { values, savedAt: draft.savedAt };
    }
    catch {
        return null;
    }
}
function clockLabel(iso) {
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
    const [savedAt, setSavedAt] = useState(initial?.savedAt ?? null);
    const [clientOpen, setClientOpen] = useState(false);
    const [productQuery, setProductQuery] = useState("");
    const [modalName, setModalName] = useState(null);
    const [error, setError] = useState("");
    const [laterDue, setLaterDue] = useState("");
    const form = useForm({ defaultValues: initial?.values ?? blankValues(db, presetClientId) });
    const fields = useFieldArray({ control: form.control, name: "lines" });
    const watched = useWatch({ control: form.control });
    const values = { ...blankValues(db, null), ...watched, lines: (watched.lines ?? []).map((line) => ({ productId: line?.productId ?? "", quantity: Number(line?.quantity), unitPrice: Number(line?.unitPrice) })) };
    const draftJson = JSON.stringify(values);
    useEffect(() => {
        const parsed = JSON.parse(draftJson);
        const touched = parsed.clientId || parsed.companyName || parsed.memo || parsed.requestedDueDate || parsed.depositDueDate !== todayISO() || parsed.lines.some((line) => line.productId);
        if (!touched)
            return;
        const timer = window.setTimeout(() => {
            const at = new Date().toISOString();
            localStorage.setItem(DRAFT_KEY, JSON.stringify({ values: parsed, savedAt: at }));
            setSavedAt(at);
        }, 600);
        return () => window.clearTimeout(timer);
    }, [draftJson]);
    const client = db.clients.find((item) => item.id === values.clientId);
    const clientQuery = values.companyName;
    const clientMatches = db.clients.filter((item) => `${item.companyName} ${item.representative} ${item.businessNumber} ${item.phone} ${item.contactName}`.toLowerCase().includes(clientQuery.trim().toLowerCase()));
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
        if (quantity <= 0)
            return null;
        try {
            return previewSchedule(quantity, undefined, values.depositDueDate || undefined);
        }
        catch (reason) {
            return reason instanceof Error ? reason.message : null;
        }
    }, [quantity, db, values.depositDueDate]);
    const capacity = values.requestedDueDate ? previewCapacity(values.requestedDueDate, undefined, values.depositDueDate || undefined) : null;
    const schedule = preview && typeof preview !== "string" ? preview : null;
    const earliest = schedule?.earliestDueDate ?? null;
    const feasible = Boolean(quantity > 0
        && values.requestedDueDate
        && capacity
        && capacity.available >= quantity
        && earliest
        && values.requestedDueDate >= earliest);
    const steps = [
        { label: "거래처 정보", done: Boolean(values.companyName.trim() && values.contactName.trim() && values.contactEmail.trim() && values.companyAddress.trim() && digitsOnly(values.contactPhone).length >= 9), target: "order-client" },
        { label: "생산품목 및 금액", done: values.lines.length > 0 && values.lines.every((line) => line.productId && line.quantity > 0 && line.unitPrice >= 0), target: "order-items" },
        { label: "납기 및 배송", done: Boolean(values.depositDueDate && values.requestedDueDate && values.shippingAddress && digitsOnly(values.receiverPhone).length >= 9), target: "order-delivery" },
    ];
    function pickClient(id) {
        const picked = db.clients.find((item) => item.id === id);
        if (!picked)
            return;
        form.setValue("clientId", picked.id);
        form.setValue("companyName", picked.companyName);
        form.setValue("contactName", picked.contactName);
        form.setValue("contactPhone", picked.contactMobile || picked.phone);
        form.setValue("contactEmail", picked.taxEmail);
        form.setValue("companyAddress", picked.address);
        form.setValue("shippingAddress", picked.address);
        form.setValue("receiverPhone", picked.contactMobile || picked.phone);
        setClientOpen(false);
    }
    function placeProduct(productId, unitPrice) {
        if (values.lines.some((line) => line.productId === productId)) {
            show("이미 추가된 품목입니다. 해당 줄의 수량을 수정하세요.");
            return;
        }
        const empty = values.lines.findIndex((line) => !line.productId);
        if (empty >= 0) {
            form.setValue(`lines.${empty}.productId`, productId);
            form.setValue(`lines.${empty}.unitPrice`, unitPrice);
        }
        else {
            fields.append({ productId, quantity: 100, unitPrice });
        }
        setProductQuery("");
    }
    function clearDraft() {
        localStorage.removeItem(DRAFT_KEY);
        setSavedAt(null);
        form.reset(blankValues(db, null));
        setError("");
        setLaterDue("");
    }
    const submit = form.handleSubmit(() => {
        setLaterDue("");
        const parsed = schema.safeParse({
            ...values,
            shippingAddress: values.shippingAddress || values.companyAddress,
            receiverPhone: values.receiverPhone || values.contactPhone,
            lines: values.lines.map((line) => ({ ...line, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice) })),
        });
        if (!parsed.success) {
            setError(parsed.error.issues[0]?.message ?? "입력값을 확인하세요.");
            return;
        }
        if (!actor)
            return;
        const input = parsed.data;
        try {
            const order = createOrder({
                clientId: input.clientId || undefined,
                client: {
                    companyName: input.companyName,
                    contactName: input.contactName,
                    phone: input.contactPhone,
                    taxEmail: input.contactEmail,
                    address: input.companyAddress,
                },
                lines: input.lines.map((line) => ({ ...line, vatIncluded: !input.vatSeparate })),
                depositDueDate: input.depositDueDate,
                requestedDueDate: input.requestedDueDate,
                shippingAddress: input.shippingAddress || input.companyAddress,
                receiverPhone: input.receiverPhone || input.contactPhone,
                notifyChannel: input.notifyChannel,
                memo: input.memo,
                actor,
            });
            localStorage.removeItem(DRAFT_KEY);
            show(`${order.orderNo} 수주를 등록했습니다. 선금이 확인되면 작업지시가 만들어집니다.`);
            navigate(`/orders/${order.id}`);
        }
        catch (reason) {
            if (reason instanceof DueDateError)
                setLaterDue(reason.earliestDue);
            setError(reason instanceof Error ? reason.message : "등록하지 못했습니다.");
        }
    });
    return (_jsxs("div", { children: [_jsxs("div", { className: "mb-4 flex flex-wrap items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "\uC2E0\uADDC \uC218\uC8FC \uB4F1\uB85D" }), _jsx("p", { className: "mt-1 text-sm text-muted", children: "\uB4F1\uB85D\uB41C \uAC70\uB798\uCC98\uB97C \uAC80\uC0C9\uD558\uAC70\uB098, \uC5C6\uB294 \uD68C\uC0AC\uBA74 \uC785\uB825\uD55C \uC815\uBCF4\uB85C \uC790\uB3D9 \uB4F1\uB85D\uB429\uB2C8\uB2E4." })] }), _jsxs(Link, { to: "/orders", className: "inline-flex h-10 items-center gap-1 rounded-lg border border-line bg-white px-4 text-sm font-semibold", children: [_jsx(ArrowLeft, { size: 16 }), "\uC218\uC8FC \uBAA9\uB85D\uC73C\uB85C"] })] }), _jsxs("div", { className: "mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white px-4 py-3", children: [_jsx("ol", { className: "flex flex-wrap items-center gap-2 text-sm", children: steps.map((step, index) => (_jsxs("li", { className: "flex items-center gap-2", children: [index > 0 ? _jsx("span", { className: "text-muted", children: "\u203A" }) : null, _jsxs("button", { type: "button", className: "flex items-center gap-2", onClick: () => document.getElementById(step.target)?.scrollIntoView({ behavior: "smooth", block: "start" }), children: [_jsx("span", { className: cn("flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold", step.done ? "bg-primary text-white" : "bg-canvas text-muted"), children: step.done ? _jsx(Check, { size: 13 }) : index + 1 }), _jsx("span", { className: step.done ? "font-semibold text-ink" : "text-muted", children: step.label })] })] }, step.label))) }), _jsx("span", { className: "text-xs text-muted", children: "* \uD544\uC218 \uC785\uB825 \uD56D\uBAA9" })] }), _jsxs("form", { className: "grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]", onSubmit: submit, children: [_jsxs("div", { className: "min-w-0 space-y-4", children: [_jsxs(Section, { id: "order-client", title: "\uAC70\uB798\uCC98 \uC815\uBCF4", badge: _jsx("span", { className: "text-xs font-semibold text-primary", children: client ? "● 기존 거래처" : values.companyName.trim() ? "● 신규 거래처" : null }), children: [_jsxs("div", { className: "relative", children: [_jsx(FieldLabel, { children: "\uD68C\uC0AC\uBA85 *" }), _jsxs("div", { className: "relative", children: [_jsx("input", { className: "h-10 w-full rounded-lg border border-line bg-white px-3 pr-9 text-sm", value: clientQuery, placeholder: "\uD68C\uC0AC\uBA85\uC73C\uB85C \uAC80\uC0C9", onFocus: () => setClientOpen(true), onBlur: () => window.setTimeout(() => setClientOpen(false), 150), onChange: (event) => {
                                                            const next = event.target.value;
                                                            form.setValue("companyName", next);
                                                            setClientOpen(true);
                                                            if (client && next !== client.companyName)
                                                                form.setValue("clientId", "");
                                                        } }), _jsx(Search, { size: 16, className: "pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" })] }), clientOpen && clientQuery.trim() ? (_jsxs("div", { className: "absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-line bg-white shadow-lg", children: [_jsx("ul", { className: "max-h-60 overflow-y-auto", children: clientMatches.slice(0, 8).map((item) => (_jsx("li", { children: _jsxs("button", { type: "button", className: cn("flex w-full items-center justify-between px-3 py-2 text-left hover:bg-canvas", item.id === values.clientId && "bg-primary-soft"), onMouseDown: (event) => event.preventDefault(), onClick: () => pickClient(item.id), children: [_jsxs("span", { children: [_jsx("span", { className: "block text-sm font-semibold", children: item.companyName }), _jsxs("span", { className: "block text-xs text-muted", children: [item.contactName || item.representative, " \u00B7 ", item.contactMobile || item.phone, " \u00B7 ", item.address] })] }), item.id === values.clientId ? _jsx(Check, { size: 16, className: "text-primary" }) : null] }) }, item.id))) }), clientMatches.length === 0 ? (_jsx("p", { className: "px-3 py-2 text-xs text-muted", children: "\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uC218\uC8FC \uB4F1\uB85D \uC2DC \uC774 \uD68C\uC0AC\uBA85\uC73C\uB85C \uAC70\uB798\uCC98\uAC00 \uB9CC\uB4E4\uC5B4\uC9D1\uB2C8\uB2E4." })) : null] })) : null] }), client ? (_jsxs("div", { className: "mt-2 flex items-center justify-between rounded-lg bg-primary-soft px-3 py-2", children: [_jsxs("span", { children: [_jsx("span", { className: "block text-sm font-semibold", children: client.companyName }), _jsxs("span", { className: "block text-xs text-muted", children: [client.contactName || client.representative, " \u00B7 ", client.contactMobile || client.phone, " \u00B7 ", client.address] })] }), _jsx(Check, { size: 16, className: "text-primary" })] })) : null, _jsxs("p", { className: "mt-2 flex items-center gap-1 text-xs text-muted", children: [_jsx(Plus, { size: 12, className: "shrink-0" }), "\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC73C\uBA74 \uC785\uB825\uD55C \uD68C\uC0AC\uBA85\uC73C\uB85C \uC790\uB3D9 \uB4F1\uB85D\uB429\uB2C8\uB2E4."] }), _jsxs("div", { className: "mt-3 grid gap-3 sm:grid-cols-2", children: [_jsxs("label", { className: "block text-sm", children: [_jsx(FieldLabel, { children: "\uB2F4\uB2F9\uC790\uBA85 *" }), _jsx("input", { className: "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm", placeholder: "\uB2F4\uB2F9\uC790\uBA85", ...form.register("contactName") })] }), _jsxs("label", { className: "block text-sm", children: [_jsx(FieldLabel, { children: "\uC5F0\uB77D\uCC98 *" }), _jsx("input", { className: "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm", placeholder: "010-0000-0000", ...form.register("contactPhone") })] }), _jsxs("label", { className: "block text-sm", children: [_jsx(FieldLabel, { children: "\uC774\uBA54\uC77C *" }), _jsx("input", { type: "email", className: "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm", placeholder: "email@example.com", ...form.register("contactEmail") })] }), _jsx(AddressPicker, { compact: true, label: "\uD68C\uC0AC \uC8FC\uC18C *", value: values.companyAddress, onChange: (address) => {
                                                    form.setValue("companyAddress", address);
                                                    if (!values.shippingAddress || values.shippingAddress === client?.address)
                                                        form.setValue("shippingAddress", address);
                                                } })] }), _jsx("p", { className: "mt-3 text-xs text-muted", children: client
                                            ? _jsx("span", { className: "text-success", children: "\u2713 \uB4F1\uB85D\uB41C \uAC70\uB798\uCC98\uC758 \uB2F4\uB2F9\uC790, \uC5F0\uB77D\uCC98, \uC8FC\uC18C\uB85C \uBD88\uB7EC\uC654\uC2B5\uB2C8\uB2E4." })
                                            : values.companyName.trim()
                                                ? "수주 등록 시 입력한 거래처가 클라이언트 목록에 추가됩니다."
                                                : "회사명을 검색해 기존 거래처를 고르거나, 새 회사명을 입력하세요." })] }), _jsxs(Section, { id: "order-items", title: "\uC0DD\uC0B0\uD488\uBAA9 \uBC0F \uAE08\uC561", description: values.vatSeparate ? "단가는 부가세 별도 금액으로 입력하세요." : "단가는 부가세 포함 금액으로 입력하세요.", action: _jsxs(Button, { tone: "ghost", className: "h-9 px-3 text-sm", onClick: () => fields.append({ ...emptyLine }), children: [_jsx(Plus, { size: 15, className: "mr-1" }), "\uD488\uBAA9 \uCD94\uAC00"] }), children: [_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full min-w-[620px] text-left text-sm", children: [_jsx("thead", { className: "bg-canvas text-xs text-muted", children: _jsxs("tr", { children: [_jsx("th", { className: "px-3 py-2 font-medium", children: "\uC0DD\uC0B0\uD488\uBAA9 *" }), _jsx("th", { className: "w-28 py-2 font-medium", children: "\uC218\uB7C9 *" }), _jsx("th", { className: "w-32 py-2 font-medium", children: "\uB2E8\uAC00 (\uC6D0) *" }), _jsx("th", { className: "w-32 py-2 text-right font-medium", children: values.vatSeparate ? "공급가액" : "금액 (VAT 포함)" }), _jsx("th", { className: "w-10 py-2" })] }) }), _jsx("tbody", { children: fields.fields.map((field, index) => {
                                                        const line = values.lines[index];
                                                        const product = db.products.find((item) => item.id === line?.productId);
                                                        const used = new Set(values.lines.filter((_, other) => other !== index).map((item) => item.productId));
                                                        return (_jsxs("tr", { className: "border-t border-line align-top", children: [_jsx("td", { className: "px-3 py-3", children: _jsxs("div", { className: "flex items-center gap-2", children: [product?.designImageUrl ? _jsx("img", { src: product.designImageUrl, alt: "", className: "h-9 w-9 shrink-0 rounded-md border border-line object-cover" }) : _jsx("span", { className: "h-9 w-9 shrink-0 rounded-md bg-canvas" }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("select", { "aria-label": `${index + 1}번째 생산품목`, className: "h-9 w-full rounded-lg border border-line bg-white px-2 font-semibold", value: line?.productId ?? "", onChange: (event) => {
                                                                                            const picked = db.products.find((item) => item.id === event.target.value);
                                                                                            form.setValue(`lines.${index}.productId`, event.target.value);
                                                                                            if (picked)
                                                                                                form.setValue(`lines.${index}.unitPrice`, picked.unitPrice);
                                                                                        }, children: [_jsx("option", { value: "", children: "\uD488\uBAA9\uC744 \uC120\uD0DD\uD558\uC138\uC694" }), db.products.map((item) => _jsxs("option", { value: item.id, disabled: used.has(item.id), children: [item.productName, " ", item.modelName] }, item.id))] }), _jsx("p", { className: "mt-1 truncate text-xs text-muted", children: product ? product.description || "설명 없음" : "아래 검색이나 신규 품목 등록으로도 추가할 수 있습니다." })] })] }) }), _jsx("td", { className: "py-3", children: _jsx("input", { "aria-label": `${index + 1}번째 수량`, type: "number", min: 1, className: "h-9 w-24 rounded-lg border border-line px-2 text-right", ...form.register(`lines.${index}.quantity`, { valueAsNumber: true }) }) }), _jsx("td", { className: "py-3", children: _jsx("input", { "aria-label": `${index + 1}번째 단가`, type: "number", min: 0, className: "h-9 w-28 rounded-lg border border-line px-2 text-right", ...form.register(`lines.${index}.unitPrice`, { valueAsNumber: true }) }) }), _jsx("td", { className: "py-3 pt-5 text-right font-semibold", children: formatWon(values.vatSeparate ? amounts[index]?.supply ?? 0 : amounts[index]?.total ?? 0) }), _jsx("td", { className: "py-3 pt-4 text-center", children: _jsx("button", { type: "button", "aria-label": `${index + 1}번째 품목 삭제`, className: "rounded p-1 text-muted hover:bg-canvas hover:text-danger disabled:opacity-30", disabled: fields.fields.length === 1, onClick: () => fields.remove(index), children: _jsx(X, { size: 16 }) }) })] }, field.id));
                                                    }) })] }) }), _jsxs("div", { className: "relative mt-3", children: [_jsxs("div", { className: "flex items-center gap-2 rounded-lg border border-line bg-canvas px-3", children: [_jsx(Search, { size: 15, className: "text-muted" }), _jsx("input", { className: "h-10 flex-1 bg-transparent text-sm outline-none", value: productQuery, placeholder: "\uC81C\uD488\uBA85\u00B7\uBAA8\uB378\uBA85 \uC77C\uBD80\uB97C \uC785\uB825\uD558\uBA74 \uB4F1\uB85D\uB41C \uD488\uBAA9\uC744 \uCC3E\uC544 \uC904\uC744 \uCD94\uAC00\uD569\uB2C8\uB2E4.", onChange: (event) => setProductQuery(event.target.value) }), _jsx("button", { type: "button", className: "shrink-0 text-xs font-semibold text-primary", onClick: () => setModalName(productQuery.trim()), children: "+ \uC2E0\uADDC \uD488\uBAA9 \uB4F1\uB85D" })] }), productQuery.trim() ? (_jsxs("div", { className: "absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-line bg-white shadow-lg", children: [productMatches.map((item) => (_jsxs("button", { type: "button", className: "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-canvas", onClick: () => placeProduct(item.id, item.unitPrice), children: [_jsxs("span", { children: [_jsxs("span", { className: "font-semibold", children: [item.productName, " ", item.modelName] }), _jsx("span", { className: "ml-2 text-xs text-muted", children: item.description })] }), _jsx("span", { className: "text-xs text-muted", children: formatWon(item.unitPrice) })] }, item.id))), productMatches.length === 0 ? (_jsxs("p", { className: "px-3 py-2 text-xs text-muted", children: ["'", productQuery.trim(), "' \uD488\uBAA9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. ", _jsx("button", { type: "button", className: "font-semibold text-primary", onClick: () => setModalName(productQuery.trim()), children: "\uC2E0\uADDC \uD488\uBAA9\uC73C\uB85C \uB4F1\uB85D" })] })) : null] })) : null] }), _jsxs("div", { className: "mt-3 flex flex-wrap items-center justify-between gap-2 text-sm", children: [_jsxs("label", { className: "flex items-center gap-2", children: [_jsx("input", { type: "checkbox", className: "h-4 w-4 accent-[var(--color-primary)]", ...form.register("vatSeparate") }), "\uBD80\uAC00\uC138 \uD3EC\uD568\uD558\uC5EC \uCCAD\uAD6C (10%)"] }), _jsxs("span", { className: "text-xs text-muted", children: ["\uCD1D \uC218\uB7C9 ", quantity.toLocaleString("ko-KR"), "\uAC1C \u00B7 ", values.lines.filter((line) => line.productId).length, "\uAC1C \uD488\uBAA9"] })] })] }), _jsxs(Section, { id: "order-delivery", title: "\uB0A9\uAE30 \uBC0F \uBC30\uC1A1", description: "\uCD9C\uACE0 \uC2DC \uC120\uD0DD\uD55C \uC54C\uB9BC \uCC44\uB110\uB85C \uBC30\uC1A1 \uC548\uB0B4\uAC00 \uBC1C\uC1A1\uB429\uB2C8\uB2E4.", children: [_jsxs("div", { className: "grid gap-3 sm:grid-cols-2", children: [_jsxs("label", { className: "block text-sm", children: [_jsx(FieldLabel, { children: "\uACC4\uC57D\uAE08 \uC785\uAE08 \uB9C8\uAC10\uC77C *" }), _jsx("input", { type: "date", min: todayISO(), className: "h-10 w-full rounded-lg border border-line bg-white px-3", ...form.register("depositDueDate") }), _jsx("span", { className: "mt-1 block text-xs text-muted", children: "\uC774 \uB0A0\uBD80\uD130 \uC0DD\uC0B0 \uC77C\uC815\uC744 \uC7A1\uC2B5\uB2C8\uB2E4. \uC774 \uB0A0\uC774 \uC9C0\uB098\uB3C4 \uACC4\uC57D\uAE08\uC774 \uC5C6\uC73C\uBA74 \uC218\uC8FC\uAC00 \uCDE8\uC18C\uB429\uB2C8\uB2E4." })] }), _jsxs("label", { className: "block text-sm", children: [_jsx(FieldLabel, { children: "\uB0A9\uAE30\uC77C *" }), _jsx("input", { type: "date", min: values.depositDueDate || todayISO(), className: "h-10 w-full rounded-lg border border-line bg-white px-3", ...form.register("requestedDueDate") })] }), _jsxs("label", { className: "block text-sm", children: [_jsx(FieldLabel, { children: "\uBC30\uC1A1 \uC218\uC2E0 \uC5F0\uB77D\uCC98 *" }), _jsxs("span", { className: "relative block", children: [_jsx("input", { className: "h-10 w-full rounded-lg border border-line bg-white px-3 pr-9", placeholder: "010-0000-0000", ...form.register("receiverPhone") }), _jsx(Phone, { size: 15, className: "pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" })] })] })] }), _jsx("div", { className: cn("mt-3 rounded-xl border p-4", typeof preview === "string" ? "border-warning/40 bg-warning-soft" : schedule ? "border-primary/30 bg-primary-soft" : "border-line bg-canvas"), children: typeof preview === "string" ? (_jsx("p", { className: "text-sm font-semibold text-warning", children: preview })) : schedule ? (_jsxs(_Fragment, { children: [_jsx("p", { className: "text-xs font-semibold text-primary", children: "\uC218\uB7C9 \uAE30\uC900\uC73C\uB85C \uACC4\uC0B0\uD55C \uACF5\uC7A5 \uC77C\uC815" }), _jsxs("div", { className: "mt-3 grid gap-3 sm:grid-cols-3", children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs text-muted", children: "\uAC00\uC7A5 \uBE60\uB978 \uB0A9\uAE30\uC77C" }), _jsx("p", { className: "mt-1 text-lg font-bold text-primary", children: schedule.earliestDueDate })] }), _jsxs("div", { children: [_jsx("p", { className: "text-xs text-muted", children: "\uC0DD\uC0B0 \uC2DC\uC791 \uC608\uC815\uC77C" }), _jsx("p", { className: "mt-1 text-base font-semibold", children: schedule.plannedStartDate })] }), _jsxs("div", { children: [_jsx("p", { className: "text-xs text-muted", children: "\uC0DD\uC0B0 \uC644\uB8CC \uC608\uC815\uC77C" }), _jsx("p", { className: "mt-1 text-base font-semibold", children: schedule.plannedEndDate })] })] }), values.requestedDueDate !== schedule.earliestDueDate ? (_jsx("button", { type: "button", className: "mt-3 text-xs font-semibold text-primary", onClick: () => form.setValue("requestedDueDate", schedule.earliestDueDate), children: "\uAC00\uC7A5 \uBE60\uB978 \uB0A9\uAE30\uC77C\uB85C \uB123\uAE30" })) : (_jsx("p", { className: "mt-3 text-xs font-semibold text-success", children: "\uC120\uD0DD\uD55C \uB0A9\uAE30\uC77C\uC774 \uAC00\uC7A5 \uBE60\uB978 \uB0A9\uAE30\uC77C\uACFC \uAC19\uC2B5\uB2C8\uB2E4." }))] })) : (_jsx("p", { className: "text-sm text-muted", children: "\uD488\uBAA9 \uC218\uB7C9\uC744 \uC785\uB825\uD558\uBA74 \uAC00\uC7A5 \uBE60\uB978 \uB0A9\uAE30\uC77C, \uC0DD\uC0B0 \uC2DC\uC791 \uC608\uC815\uC77C, \uC0DD\uC0B0 \uC644\uB8CC \uC608\uC815\uC77C\uC744 \uBCF4\uC5EC \uC90D\uB2C8\uB2E4." })) }), _jsxs("div", { className: "mt-3", children: [_jsx("div", { className: "mb-1 flex items-center justify-end", children: values.companyAddress ? (values.shippingAddress === values.companyAddress
                                                    ? _jsx("span", { className: "text-xs font-semibold text-success", children: "\u2713 \uD68C\uC0AC \uC8FC\uC18C\uC640 \uB3D9\uC77C" })
                                                    : _jsx("button", { type: "button", className: "text-xs font-semibold text-primary", onClick: () => form.setValue("shippingAddress", values.companyAddress), children: "\uD68C\uC0AC \uC8FC\uC18C\uB85C \uCC44\uC6B0\uAE30" })) : null }), _jsx(AddressPicker, { label: "\uBC30\uC1A1\uC9C0 *", value: values.shippingAddress, onChange: (address) => form.setValue("shippingAddress", address) })] }), _jsxs("div", { className: "mt-4", children: [_jsx(FieldLabel, { children: "\uBC30\uC1A1 \uC54C\uB9BC \uCC44\uB110" }), _jsx("div", { className: "grid gap-2 sm:grid-cols-2", children: [
                                                    { id: "SMS", label: "SMS 문자", icon: _jsx(MessageSquare, { size: 16 }) },
                                                    { id: "EMAIL", label: "이메일", icon: _jsx(Mail, { size: 16 }) },
                                                ].map((channel) => (_jsxs("button", { type: "button", "aria-pressed": values.notifyChannel === channel.id, className: cn("flex h-11 items-center justify-center gap-2 rounded-lg border text-sm font-semibold", values.notifyChannel === channel.id ? "border-primary bg-primary-soft text-primary" : "border-line bg-white text-muted"), onClick: () => form.setValue("notifyChannel", channel.id), children: [channel.icon, channel.label, values.notifyChannel === channel.id ? _jsx(Check, { size: 15 }) : null] }, channel.id))) }), _jsx("p", { className: "mt-1 text-xs text-muted", children: values.notifyChannel === "SMS" ? "출고 시 배송 수신 연락처로 택배사와 운송장 번호를 문자로 보냅니다." : `출고 시 ${values.contactEmail || "거래처 이메일"}로 배송 안내 메일을 보냅니다.` })] }), _jsxs("label", { className: "mt-4 block text-sm", children: [_jsx(FieldLabel, { children: "\uC5C5\uBB34 \uBA54\uBAA8" }), _jsx("input", { className: "h-10 w-full rounded-lg border border-line bg-white px-3", maxLength: 200, placeholder: "\uC608: \uB0A9\uD488 \uC804 \uB2F4\uB2F9\uC790\uC5D0\uAC8C \uC5F0\uB77D \uBD80\uD0C1\uB4DC\uB9BD\uB2C8\uB2E4.", ...form.register("memo") })] })] }), _jsxs(Section, { title: "\uC0DD\uC0B0 \uAC00\uB2A5 \uC5EC\uBD80 \uD655\uC778", description: "\uB0A9\uAE30\uC77C\uAE4C\uC9C0 \uACF5\uC7A5\uC758 \uB0A8\uC740 \uC0DD\uC0B0\uB7C9\uACFC \uC774\uBC88 \uC218\uC8FC \uC218\uB7C9\uC744 \uBE44\uAD50\uD569\uB2C8\uB2E4. \uCD9C\uACE0 \uC900\uBE44\uB97C \uC704\uD574 \uB0A9\uAE30 2 \uC601\uC5C5\uC77C \uC804\uAE4C\uC9C0 \uC0DD\uC0B0\uC744 \uB9C8\uCE69\uB2C8\uB2E4.", children: [_jsxs("div", { className: "grid gap-3 sm:grid-cols-3", children: [_jsx(ReadField, { label: "\uCD1D \uC0DD\uC0B0\uB7C9", value: capacity ? `${capacity.total.toLocaleString("ko-KR")}개` : undefined }), _jsx(ReadField, { label: "\uAC00\uC6A9 \uC0DD\uC0B0\uB7C9", value: capacity ? `${capacity.available.toLocaleString("ko-KR")}개` : undefined }), _jsx(ReadField, { label: "\uC218\uC8FC \uC608\uC815\uB7C9", value: `${quantity.toLocaleString("ko-KR")}개` })] }), _jsx("div", { className: "mt-3 flex flex-wrap items-center justify-between gap-2 text-sm", children: !values.requestedDueDate || quantity <= 0 ? (_jsx("p", { className: "text-muted", children: "\uD488\uBAA9 \uC218\uB7C9\uACFC \uB0A9\uAE30\uC77C\uC744 \uC785\uB825\uD558\uBA74 \uC0DD\uC0B0 \uAC00\uB2A5 \uC5EC\uBD80\uB97C \uD655\uC778\uD569\uB2C8\uB2E4." })) : feasible ? (_jsxs("p", { className: "flex items-center gap-2", children: [_jsxs("span", { className: "inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary", children: [_jsx(CircleCheck, { size: 13 }), "\uC0DD\uC0B0 \uAC00\uB2A5"] }), "\uC218\uC8FC \uC608\uC815\uB7C9 ", quantity.toLocaleString("ko-KR"), "\uAC1C\uB294 ", capacity?.lastProductionDate ?? "-", "\uAE4C\uC9C0\uC758 \uAC00\uC6A9 \uC0DD\uC0B0\uB7C9 \uC548\uC5D0 \uB4E4\uC5B4\uAC11\uB2C8\uB2E4."] })) : (_jsxs("p", { className: "flex flex-wrap items-center gap-2", children: [_jsxs("span", { className: "inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning", children: [_jsx(CircleAlert, { size: 13 }), "\uC0DD\uC0B0 \uBD88\uAC00"] }), earliest ? `이 납기로는 수량을 다 만들 수 없습니다. 가장 빠른 납기일은 ${earliest}입니다.` : typeof preview === "string" ? preview : "", earliest ? _jsxs("button", { type: "button", className: "text-xs font-semibold text-primary", onClick: () => form.setValue("requestedDueDate", earliest), children: [earliest, "\uB85C \uBCC0\uACBD"] }) : null] })) })] })] }), _jsxs("aside", { className: "space-y-3 xl:sticky xl:top-6", children: [_jsxs("section", { className: "rounded-xl border border-line bg-white p-5", children: [_jsx("h2", { className: "font-semibold", children: "\uC218\uC8FC \uC694\uC57D" }), _jsxs("dl", { className: "mt-4 space-y-3 text-sm", children: [_jsx(SummaryRow, { label: "\uB4F1\uB85D\uC77C", value: todayISO() }), _jsx(SummaryRow, { label: "\uACC4\uC57D\uAE08 \uB9C8\uAC10", value: values.depositDueDate || "마감일 선택 전", muted: !values.depositDueDate }), _jsx(SummaryRow, { label: "\uB0A9\uD488\uC77C", value: values.requestedDueDate || "납기일 선택 전", muted: !values.requestedDueDate }), _jsx(SummaryRow, { label: "\uAC00\uC7A5 \uBE60\uB978 \uB0A9\uAE30", value: earliest ?? "수량 입력 전", muted: !earliest }), _jsx(SummaryRow, { label: "\uC0DD\uC0B0 \uC2DC\uC791 \uC608\uC815", value: schedule?.plannedStartDate ?? "수량 입력 전", muted: !schedule }), _jsx(SummaryRow, { label: "\uC0DD\uC0B0 \uC644\uB8CC \uC608\uC815", value: schedule?.plannedEndDate ?? "수량 입력 전", muted: !schedule }), _jsx("div", { className: "border-t border-line" }), _jsx(SummaryRow, { label: "\uACF5\uAE09\uAC00\uC561", value: formatWon(supply) }), _jsx(SummaryRow, { label: "\uBD80\uAC00\uC138 (10%)", value: formatWon(total - supply) }), _jsx("div", { className: "border-t border-line" }), _jsx(SummaryRow, { label: "\uACC4\uC57D\uAE08 (\uC120\uAE08 50%)", value: formatWon(deposit) }), _jsx(SummaryRow, { label: "\uC794\uAE08 (\uBC30\uC1A1 \uC644\uB8CC \uD6C4)", value: formatWon(total - deposit) })] }), _jsxs("div", { className: "mt-4 rounded-lg bg-primary-soft p-4", children: [_jsx("p", { className: "text-xs font-semibold text-primary", children: "\uCD1D \uC218\uC8FC \uAE08\uC561" }), _jsx("p", { className: "mt-1 text-2xl font-bold text-primary", children: formatWon(total) }), _jsx("p", { className: "mt-1 text-xs text-primary/80", children: "\uC218\uB7C9\u00B7\uB2E8\uAC00\u00B7\uBD80\uAC00\uC138 \uAE30\uC900 \uC790\uB3D9 \uACC4\uC0B0" })] }), _jsxs(Button, { type: "submit", className: "mt-4 w-full", disabled: Boolean(values.requestedDueDate && earliest && !feasible), children: [_jsx(Check, { size: 16, className: "mr-1" }), "\uC218\uC8FC \uB4F1\uB85D"] }), error ? (_jsxs("div", { className: "mt-3 text-sm text-danger", children: [_jsx("p", { children: error }), laterDue ? _jsxs("button", { type: "button", className: "mt-1 text-xs font-semibold text-primary", onClick: () => { form.setValue("requestedDueDate", laterDue); setError(""); setLaterDue(""); }, children: [laterDue, "\uB85C \uB0A9\uAE30 \uBCC0\uACBD"] }) : null] })) : null] }), _jsxs("section", { className: "flex gap-2 rounded-xl border border-primary/30 bg-primary-soft/50 p-4 text-sm", children: [_jsx(Info, { size: 16, className: "mt-0.5 shrink-0 text-primary" }), _jsxs("div", { children: [_jsx("p", { className: "font-semibold text-primary", children: "\uC120\uAE08 \uD655\uC778 \uD6C4 \uC0DD\uC0B0 \uC2DC\uC791" }), _jsx("p", { className: "mt-1 text-xs text-muted", children: "\uB4F1\uB85D\uD558\uBA74 \uC785\uAE08 \uB9C8\uAC10\uC77C\uBD80\uD130 \uC77C\uC815\uC774 \uC7A1\uD788\uACE0 \uAC00\uC0C1\uACC4\uC88C\uAC00 \uBC1C\uAE09\uB429\uB2C8\uB2E4. \uB9C8\uAC10\uC77C\uAE4C\uC9C0 \uACC4\uC57D\uAE08\uC774 \uC5C6\uC73C\uBA74 \uC218\uC8FC\uAC00 \uCDE8\uC18C\uB429\uB2C8\uB2E4. \uACC4\uC57D\uAE08\uC774 \uC785\uAE08\uB418\uBA74 \uC791\uC5C5\uC9C0\uC2DC\uAC00 \uB9CC\uB4E4\uC5B4\uC9D1\uB2C8\uB2E4." })] })] }), _jsxs("p", { className: "flex items-center justify-between px-1 text-xs text-muted", children: [_jsx("span", { children: savedAt ? `임시저장 · 자동 저장 ${clockLabel(savedAt)}` : "입력하면 자동으로 임시저장됩니다." }), savedAt ? _jsx("button", { type: "button", className: "font-semibold text-muted hover:text-danger", onClick: clearDraft, children: "\uC784\uC2DC\uC800\uC7A5 \uBE44\uC6B0\uAE30" }) : null] })] })] }), modalName !== null && actor ? (_jsx(ProductModal, { initialName: modalName, actorName: actor.name, onClose: () => setModalName(null), onSaved: (productId, unitPrice) => {
                    setModalName(null);
                    placeProduct(productId, unitPrice);
                    show("신규 품목을 등록하고 수주에 추가했습니다.");
                } })) : null] }));
}
function Section({ id, title, description, badge, action, children }) {
    return (_jsxs("section", { id: id, className: "scroll-mt-6 rounded-xl border border-line bg-white p-5", children: [_jsxs("div", { className: "mb-4 flex flex-wrap items-start justify-between gap-2", children: [_jsxs("div", { children: [_jsx("h2", { className: "font-semibold", children: title }), description ? _jsx("p", { className: "mt-0.5 text-xs text-muted", children: description }) : null] }), badge ?? action] }), children] }));
}
function FieldLabel({ children }) {
    return _jsx("span", { className: "mb-1 block text-sm font-medium text-ink", children: children });
}
function ReadField({ label, value }) {
    return (_jsxs("div", { className: "text-sm", children: [_jsx(FieldLabel, { children: label }), _jsx("p", { className: cn("flex h-10 items-center truncate rounded-lg border border-line bg-canvas px-3", !value && "text-muted"), children: value || "-" })] }));
}
function SummaryRow({ label, value, muted }) {
    return (_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsx("dt", { className: "text-muted", children: label }), _jsx("dd", { className: cn("font-semibold", muted && "font-normal text-muted"), children: value })] }));
}
