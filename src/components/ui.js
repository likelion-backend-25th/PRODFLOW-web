import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { forwardRef } from "react";
import { cn } from "@/lib/cn.ts";
export function Button({ tone = "primary", className, type = "button", ...props }) {
    return (_jsx("button", { type: type, className: cn("inline-flex h-10 items-center justify-center rounded-lg px-4 font-semibold disabled:opacity-40", tone === "primary" && "bg-primary text-white", tone === "ghost" && "border border-line bg-white text-ink", tone === "danger" && "bg-danger text-white", className), ...props }));
}
export const TextField = forwardRef(function TextField({ label, className, icon, ...props }, ref) {
    return (_jsxs("label", { className: "block text-sm", children: [_jsx("span", { className: "mb-1 block text-muted", children: label }), _jsxs("span", { className: "relative block", children: [icon ? _jsx("span", { className: "pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted", children: icon }) : null, _jsx("input", { ref: ref, className: cn("h-10 w-full rounded-lg border border-line bg-white px-3", icon && "pl-9", className), ...props })] })] }));
});
export function SelectField({ label, children, ...props }) {
    return (_jsxs("label", { className: "block text-sm", children: [_jsx("span", { className: "mb-1 block text-muted", children: label }), _jsx("select", { className: "h-10 w-full rounded-lg border border-line bg-white px-3", ...props, children: children })] }));
}
export function Badge({ className, children }) {
    return _jsx("span", { className: cn("inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold", className), children: children });
}
export function Card({ children, className }) {
    return _jsx("section", { className: cn("rounded-xl border border-line bg-white p-5", className), children: children });
}
export function PageHeader({ title, action }) {
    return (_jsxs("div", { className: "mb-5 flex items-center justify-between gap-3", children: [_jsx("h1", { className: "text-2xl font-semibold", children: title }), action] }));
}
export const tableClass = "w-full text-left [&_tbody_tr]:border-b [&_tbody_tr]:border-line [&_tbody_tr:last-child]:border-0 [&_tbody_tr:hover]:bg-primary-soft/40 [&_td]:px-4 [&_td]:py-3 [&_th]:px-4 [&_th]:py-3 [&_th]:font-medium";
