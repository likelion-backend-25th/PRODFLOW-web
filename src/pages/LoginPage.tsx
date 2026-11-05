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
  if (user) return <Navigate to="/" replace />;

  return (
    <div className="grid min-h-screen grid-cols-1 bg-white md:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-primary-deep md:block">
        <img src="/login-panel.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-primary-deep/45" />
        <div className="absolute bottom-16 left-12 right-12 text-white">
          <p className="text-sm tracking-[0.18em] text-white/80">PRODFLOW</p>
          <h1 className="mt-3 text-4xl font-semibold">핸드폰 케이스<br />생산 관리</h1>
        </div>
      </section>
      <section className="flex items-center justify-center px-8 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <span className="grid h-10 w-10 place-items-center rounded-md bg-primary text-sm font-semibold text-white">P</span>
            <h2 className="mt-4 text-2xl font-semibold">로그인</h2>
          </div>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const message = login(loginId, password);
              setError(message ?? "");
            }}
          >
            <TextField label="아이디" value={loginId} onChange={(event) => setLoginId(event.target.value)} />
            <TextField label="비밀번호" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            {error ? <p className="text-danger">{error}</p> : null}
            <Button type="submit" className="w-full">로그인</Button>
          </form>
          <ul className="mt-8 space-y-1 text-sm">
            {samples.map(([id, pw, role]) => (
              <li key={id}>
                <button type="button" className="text-primary" onClick={() => { setLoginId(id); setPassword(pw); }}>
                  {role} · {id} / {pw}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
