import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Navigate } from "react-router";
import { Button, TextField } from "@/components/ui.tsx";
import { useAuthStore } from "@/stores/useAuthStore.ts";
const samples = [
    ["admin", "admin1234", "최고 관리자"],
    ["order", "order1234", "수주 관리자"],
    ["floor1", "floor1234", "현장 관리자 1"],
    ["floor2", "floor1234", "현장 관리자 2"],
    ["viewer", "viewer1234", "조회 담당"],
];
export function LoginPage() {
    const user = useAuthStore((state) => state.user);
    const login = useAuthStore((state) => state.login);
    const [loginId, setLoginId] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    if (user)
        return _jsx(Navigate, { to: "/", replace: true });
    return (_jsxs("div", { className: "grid min-h-screen grid-cols-1 bg-white md:grid-cols-2", children: [_jsxs("section", { className: "relative hidden overflow-hidden bg-primary-deep md:block", children: [_jsx("img", { src: "/login-panel.jpg", alt: "", className: "absolute inset-0 h-full w-full object-cover" }), _jsx("div", { className: "absolute inset-0 bg-primary-deep/45" }), _jsxs("div", { className: "absolute bottom-16 left-12 right-12 text-white", children: [_jsx("p", { className: "text-sm tracking-[0.18em] text-white/80", children: "PRODFLOW" }), _jsxs("h1", { className: "mt-3 text-4xl font-semibold", children: ["\uD578\uB4DC\uD3F0 \uCF00\uC774\uC2A4", _jsx("br", {}), "\uC0DD\uC0B0 \uAD00\uB9AC"] })] })] }), _jsx("section", { className: "flex items-center justify-center px-8 py-16", children: _jsxs("div", { className: "w-full max-w-sm", children: [_jsxs("div", { className: "mb-8", children: [_jsx("span", { className: "grid h-10 w-10 place-items-center rounded-md bg-primary text-sm font-semibold text-white", children: "P" }), _jsx("h2", { className: "mt-4 text-2xl font-semibold", children: "\uB85C\uADF8\uC778" })] }), _jsxs("form", { className: "space-y-4", onSubmit: (event) => {
                                event.preventDefault();
                                const message = login(loginId, password);
                                setError(message ?? "");
                            }, children: [_jsx(TextField, { label: "\uC544\uC774\uB514", value: loginId, onChange: (event) => setLoginId(event.target.value) }), _jsx(TextField, { label: "\uBE44\uBC00\uBC88\uD638", type: "password", value: password, onChange: (event) => setPassword(event.target.value) }), error ? _jsx("p", { className: "text-danger", children: error }) : null, _jsx(Button, { type: "submit", className: "w-full", children: "\uB85C\uADF8\uC778" })] }), _jsx("ul", { className: "mt-8 space-y-1 text-sm", children: samples.map(([id, pw, role]) => (_jsx("li", { children: _jsxs("button", { type: "button", className: "text-primary", onClick: () => { setLoginId(id); setPassword(pw); }, children: [role, " \u00B7 ", id, " / ", pw] }) }, id))) })] }) })] }));
}
