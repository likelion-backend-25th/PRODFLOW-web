import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { MapPin } from "lucide-react";
import { useState } from "react";
import { sampleAddresses } from "@/lib/addresses.ts";
import { Button } from "@/components/ui.tsx";
export function AddressPicker({ label, value, onChange, compact }) {
    const [open, setOpen] = useState(false);
    return (_jsxs("div", { children: [_jsx("span", { className: compact ? "mb-1 block text-sm font-medium text-ink" : "mb-1 block text-sm text-muted", children: label }), compact ? (_jsxs("div", { className: "relative", children: [_jsx("input", { readOnly: true, value: value, placeholder: "\uC8FC\uC18C \uAC80\uC0C9\uC73C\uB85C \uC120\uD0DD", className: "h-10 w-full cursor-pointer rounded-lg border border-line bg-white px-3 pr-9 text-sm", onClick: () => setOpen((current) => !current) }), _jsx("button", { type: "button", "aria-label": "\uC8FC\uC18C \uAC80\uC0C9", className: "absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted hover:bg-canvas", onClick: () => setOpen((current) => !current), children: _jsx(MapPin, { size: 15 }) })] })) : (_jsxs("div", { className: "flex gap-2", children: [_jsx("input", { readOnly: true, value: value, placeholder: "\uC8FC\uC18C \uAC80\uC0C9\uC73C\uB85C \uC120\uD0DD", className: "h-10 w-full rounded-lg border border-line bg-white px-3" }), _jsx(Button, { tone: "ghost", className: "shrink-0 whitespace-nowrap", onClick: () => setOpen((current) => !current), children: "\uC8FC\uC18C \uAC80\uC0C9" })] })), open ? (_jsx("ul", { className: "mt-2 rounded-lg border border-line bg-white", children: sampleAddresses.map((address) => (_jsx("li", { children: _jsx("button", { type: "button", className: "block w-full px-3 py-2 text-left hover:bg-primary-soft", onClick: () => {
                            onChange(address);
                            setOpen(false);
                        }, children: address }) }, address))) })) : null] }));
}
