import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { AddressPicker } from "@/components/AddressPicker.tsx";
import { Button, Card, PageHeader, TextField } from "@/components/ui.tsx";
import { localDate } from "@/lib/dates.ts";
import { useDb } from "@/lib/db.ts";
import { digitsOnly } from "@/lib/money.ts";
import { importClients, saveClient } from "@/lib/workflow.ts";
import { canManageOrders, useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";
const template = "사업자등록번호,회사명,대표자,주소,대표전화,담당자명,담당자휴대번호,세금계산서이메일\n";
export function ClientListPage() {
    const db = useDb();
    const role = useAuthStore((state) => state.user?.role);
    const show = useToastStore((state) => state.show);
    const [keyword, setKeyword] = useState("");
    const [result, setResult] = useState("");
    const rows = db.clients.filter((client) => `${client.companyName} ${client.representative} ${client.phone} ${client.address}`.includes(keyword.trim()));
    const [selectedId, setSelectedId] = useState(rows[0]?.id ?? "");
    const selected = db.clients.find((client) => client.id === selectedId) ?? rows[0];
    const month = new Date().toLocaleDateString("en-CA").slice(0, 7);
    const traded = new Set(db.orders.filter((order) => order.createdAt.startsWith(month)).map((order) => order.clientId)).size;
    const ordersOf = (clientId) => db.orders.filter((order) => order.clientId === clientId && order.status !== "CANCELLED");
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "\uD074\uB77C\uC774\uC5B8\uD2B8 \uAD00\uB9AC" }), _jsx("p", { className: "mt-1 text-muted", children: "\uAC70\uB798\uCC98 \uC815\uBCF4\uB97C \uC815\uD655\uD558\uAC8C \uAD00\uB9AC\uD558\uACE0 \uC218\uC8FC \uB4F1\uB85D \uC2DC\uAC04\uC744 \uC904\uC774\uC138\uC694." })] }), canManageOrders(role) ? (_jsxs("div", { className: "flex gap-2", children: [_jsx(Button, { tone: "ghost", onClick: () => download(template, "거래처양식.csv"), children: "\uC591\uC2DD \uB2E4\uC6B4\uB85C\uB4DC" }), _jsxs("label", { className: "inline-flex h-10 cursor-pointer items-center rounded-lg border border-line bg-white px-4 font-semibold", children: ["\uC5D1\uC140 \uC77C\uAD04\uB4F1\uB85D", _jsx("input", { className: "hidden", type: "file", accept: ".csv,text/csv", onChange: async (event) => {
                                            const file = event.target.files?.[0];
                                            if (!file)
                                                return;
                                            const text = (await file.text()).replace(/^\uFEFF/, "");
                                            const lines = text.split(/\r?\n/).slice(1).filter((line) => line.trim());
                                            const imported = importClients(lines.map((line) => {
                                                const [businessNumber, companyName, representative, address, phone, contactName, contactMobile, taxEmail] = line.split(",");
                                                return { businessNumber: businessNumber ?? "", companyName: companyName ?? "", representative: representative ?? "", address: address ?? "", phone: phone ?? "", contactName: contactName ?? "", contactMobile: contactMobile ?? "", taxEmail: taxEmail ?? "" };
                                            }));
                                            setResult(`성공 ${imported.created}건${imported.errors.length ? ` / ${imported.errors.join(" ")}` : ""}`);
                                            show("엑셀 등록을 반영했습니다.");
                                        } })] }), _jsx(Link, { to: "/clients/new", className: "inline-flex h-10 items-center rounded-lg bg-primary px-4 font-semibold text-white", children: "+ \uD074\uB77C\uC774\uC5B8\uD2B8 \uB4F1\uB85D" })] })) : null] }), result ? _jsx("p", { className: "mt-2 text-sm text-muted", children: result }) : null, _jsxs("div", { className: "mt-4 grid gap-3 md:grid-cols-3", children: [_jsxs("section", { className: "rounded-xl border border-line bg-white p-4", children: [_jsx("p", { className: "text-sm text-muted", children: "\uC804\uCCB4 \uD074\uB77C\uC774\uC5B8\uD2B8" }), _jsxs("p", { className: "mt-2 text-2xl font-semibold", children: [db.clients.length, "\uAC1C\uC0AC"] })] }), _jsxs("section", { className: "rounded-xl border border-line bg-white p-4", children: [_jsx("p", { className: "text-sm text-muted", children: "\uC774\uBC88 \uB2EC \uAC70\uB798" }), _jsxs("p", { className: "mt-2 text-2xl font-semibold", children: [traded, "\uAC1C\uC0AC"] })] }), _jsxs("section", { className: "rounded-xl border border-line bg-white p-4", children: [_jsx("p", { className: "text-sm text-muted", children: "\uB4F1\uB85D \uAC70\uB798\uCC98" }), _jsxs("p", { className: "mt-2 text-2xl font-semibold", children: [rows.length, "\uAC1C\uC0AC"] })] })] }), _jsxs("div", { className: "mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]", children: [_jsxs("section", { className: "overflow-hidden rounded-xl border border-line bg-white", children: [_jsxs("div", { className: "flex items-center justify-between gap-3 px-5 py-4", children: [_jsx("h2", { className: "font-semibold", children: "\uB4F1\uB85D\uB41C \uD074\uB77C\uC774\uC5B8\uD2B8" }), _jsxs("span", { className: "text-sm text-muted", children: ["\uCD1D ", rows.length, "\uAC1C\uC0AC"] })] }), _jsx("div", { className: "px-5 pb-3", children: _jsx("input", { className: "h-10 w-full rounded-lg border border-line px-3", value: keyword, placeholder: "\uD68C\uC0AC\uBA85, \uB300\uD45C\uC790\uBA85, \uC5F0\uB77D\uCC98 \uAC80\uC0C9", onChange: (event) => setKeyword(event.target.value) }) }), _jsxs("table", { className: "w-full text-left", children: [_jsx("thead", { className: "bg-primary-soft/40 text-sm text-muted", children: _jsxs("tr", { children: [_jsx("th", { className: "px-5 py-3 font-medium", children: "\uD68C\uC0AC\uBA85" }), _jsx("th", { className: "py-3 font-medium", children: "\uB300\uD45C\uC790" }), _jsx("th", { className: "py-3 font-medium", children: "\uC5F0\uB77D\uCC98" }), _jsx("th", { className: "py-3 font-medium", children: "\uC18C\uC7AC\uC9C0" }), _jsx("th", { className: "py-3 font-medium", children: "\uB204\uC801 \uC218\uC8FC" }), _jsx("th", { className: "py-3 pr-5 font-medium", children: "\uCD5C\uADFC \uC218\uC8FC\uC77C" })] }) }), _jsx("tbody", { children: rows.map((client) => {
                                            const orders = ordersOf(client.id);
                                            const latest = orders.map((order) => localDate(order.createdAt)).sort().at(-1) ?? "-";
                                            return (_jsxs("tr", { className: `cursor-pointer border-t border-line ${selected?.id === client.id ? "bg-primary-soft" : ""}`, onClick: () => setSelectedId(client.id), children: [_jsx("td", { className: "px-5 py-3 font-semibold", children: client.companyName }), _jsx("td", { children: client.representative }), _jsx("td", { children: client.phone }), _jsx("td", { className: "max-w-40 truncate", children: client.address }), _jsxs("td", { children: [orders.length, "\uAC74"] }), _jsx("td", { className: "pr-5", children: latest })] }, client.id));
                                        }) })] })] }), selected ? (_jsxs("aside", { className: "space-y-3", children: [_jsxs("section", { className: "rounded-xl border border-line bg-white p-5", children: [_jsx("h2", { className: "font-semibold", children: "\uD074\uB77C\uC774\uC5B8\uD2B8 \uC0C1\uC138" }), _jsx("p", { className: "mt-3 text-lg font-semibold", children: selected.companyName }), _jsx("p", { className: "text-sm text-muted", children: selected.businessNumber }), _jsxs("dl", { className: "mt-4 space-y-2 text-sm", children: [_jsxs("div", { children: [_jsx("dt", { className: "text-muted", children: "\uB300\uD45C\uC790\uBA85" }), _jsx("dd", { children: selected.representative })] }), _jsxs("div", { children: [_jsx("dt", { className: "text-muted", children: "\uC5F0\uB77D\uCC98" }), _jsx("dd", { children: selected.phone })] }), _jsxs("div", { children: [_jsx("dt", { className: "text-muted", children: "\uC8FC\uC18C" }), _jsx("dd", { children: selected.address })] })] }), _jsxs("div", { className: "mt-4 flex gap-2", children: [canManageOrders(role) ? _jsx(Link, { to: `/clients/${selected.id}/edit`, className: "inline-flex h-10 items-center rounded-lg border border-line px-3", children: "\uC815\uBCF4 \uC218\uC815" }) : null, canManageOrders(role) ? _jsx(Link, { to: `/orders/new?clientId=${selected.id}`, className: "inline-flex h-10 items-center rounded-lg bg-primary px-3 font-semibold text-white", children: "+ \uC218\uC8FC \uB4F1\uB85D" }) : null] }), _jsxs("div", { className: "mt-4 grid grid-cols-2 gap-2 text-sm", children: [_jsxs("p", { children: ["\uB204\uC801 \uC218\uC8FC", _jsx("br", {}), _jsxs("span", { className: "text-lg font-semibold", children: [ordersOf(selected.id).length, "\uAC74"] })] }), _jsxs("p", { children: ["\uB204\uC801 \uAC70\uB798\uC561", _jsx("br", {}), _jsxs("span", { className: "text-lg font-semibold", children: [ordersOf(selected.id).reduce((sum, order) => sum + order.lines.reduce((lineSum, line) => lineSum + line.quantity * line.unitPrice, 0), 0).toLocaleString("ko-KR"), "\uC6D0"] })] })] })] }), _jsxs("section", { className: "rounded-xl border border-line bg-white p-5", children: [_jsx("h3", { className: "font-semibold", children: "\uCD5C\uADFC \uC218\uC8FC" }), _jsx("ul", { className: "mt-3 space-y-2 text-sm", children: ordersOf(selected.id).slice(0, 3).map((order) => (_jsxs("li", { className: "flex justify-between gap-2", children: [_jsx(Link, { className: "text-primary", to: `/orders/${order.id}`, children: order.orderNo }), _jsx("span", { className: "text-muted", children: order.dueDate })] }, order.id))) })] })] })) : null] })] }));
}
export function ClientFormPage() {
    const { clientId } = useParams();
    const db = useDb();
    const navigate = useNavigate();
    const show = useToastStore((state) => state.show);
    const current = db.clients.find((client) => client.id === clientId);
    const [form, setForm] = useState(current ?? { businessNumber: "", companyName: "", representative: "", address: "", phone: "", contactName: "", contactMobile: "", taxEmail: "" });
    return (_jsxs("div", { children: [_jsx(PageHeader, { title: current ? "거래처 수정" : "거래처 등록" }), _jsx("form", { className: "max-w-3xl", onSubmit: (event) => {
                    event.preventDefault();
                    try {
                        saveClient({ ...form, id: current?.id, businessNumber: digitsOnly(form.businessNumber) });
                        show("거래처를 저장했습니다.");
                        navigate("/clients");
                    }
                    catch (error) {
                        show(error instanceof Error ? error.message : "저장하지 못했습니다.");
                    }
                }, children: _jsxs(Card, { className: "grid gap-3 md:grid-cols-2", children: [_jsx(TextField, { label: "\uC0AC\uC5C5\uC790\uB4F1\uB85D\uBC88\uD638", value: form.businessNumber, onChange: (event) => setForm({ ...form, businessNumber: event.target.value }) }), _jsx(TextField, { label: "\uD68C\uC0AC\uBA85", value: form.companyName, onChange: (event) => setForm({ ...form, companyName: event.target.value }) }), _jsx(TextField, { label: "\uB300\uD45C\uC790", value: form.representative, onChange: (event) => setForm({ ...form, representative: event.target.value }) }), _jsx(AddressPicker, { label: "\uC8FC\uC18C", value: form.address, onChange: (address) => setForm({ ...form, address }) }), _jsx(TextField, { label: "\uB300\uD45C\uC804\uD654", value: form.phone, onChange: (event) => setForm({ ...form, phone: event.target.value }) }), _jsx(TextField, { label: "\uB2F4\uB2F9\uC790\uBA85", value: form.contactName, onChange: (event) => setForm({ ...form, contactName: event.target.value }) }), _jsx(TextField, { label: "\uB2F4\uB2F9\uC790 \uD734\uB300\uBC88\uD638", value: form.contactMobile, onChange: (event) => setForm({ ...form, contactMobile: event.target.value }) }), _jsx(TextField, { label: "\uC138\uAE08\uACC4\uC0B0\uC11C \uC774\uBA54\uC77C", value: form.taxEmail, onChange: (event) => setForm({ ...form, taxEmail: event.target.value }) }), _jsx("div", { className: "flex justify-end md:col-span-2", children: _jsx(Button, { type: "submit", children: "\uC800\uC7A5" }) })] }) })] }));
}
export function ClientDetailPage() {
    const { clientId = "" } = useParams();
    const db = useDb();
    const role = useAuthStore((state) => state.user?.role);
    const client = db.clients.find((item) => item.id === clientId);
    if (!client)
        return _jsx("p", { children: "\uAC70\uB798\uCC98\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const orders = db.orders.filter((order) => order.clientId === client.id);
    return (_jsxs("div", { className: "space-y-4", children: [_jsx(PageHeader, { title: client.companyName, action: canManageOrders(role) ? _jsx(Link, { to: `/clients/${client.id}/edit`, children: _jsx(Button, { tone: "ghost", children: "\uC218\uC815" }) }) : null }), _jsxs(Card, { className: "grid gap-2 md:grid-cols-2", children: [_jsxs("p", { children: ["\uC0AC\uC5C5\uC790\uBC88\uD638 ", client.businessNumber] }), _jsxs("p", { children: ["\uB300\uD45C ", client.representative] }), _jsxs("p", { children: ["\uC8FC\uC18C ", client.address] }), _jsxs("p", { children: ["\uC804\uD654 ", client.phone] }), _jsxs("p", { children: ["\uB2F4\uB2F9 ", client.contactName, " ", client.contactMobile] }), _jsxs("p", { children: ["\uC774\uBA54\uC77C ", client.taxEmail] })] }), _jsxs(Card, { children: [_jsx("h2", { className: "mb-2 font-semibold", children: "\uAD00\uB828 \uC218\uC8FC" }), _jsx("ul", { children: orders.map((order) => _jsx("li", { children: _jsx(Link, { className: "text-primary", to: `/orders/${order.id}`, children: order.orderNo }) }, order.id)) })] })] }));
}
function download(content, name) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
}
