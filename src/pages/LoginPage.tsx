import { useState } from "react";
import { Navigate } from "react-router";
import { Button, TextField } from "@/components/ui.tsx";
import { useAuthStore } from "@/stores/useAuthStore.ts";

export function LoginPage() {
  const user = useAuthStore((state) => state.user);
  const login = useAuthStore((state) => state.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
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
              if (pending) return;
              setPending(true);
              void login(email, password).then((message) => {
                setError(message ?? "");
                setPending(false);
              });
            }}
          >
            <TextField label="이메일" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            <TextField label="비밀번호" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            {error ? <p className="text-danger">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={pending}>{pending ? "확인 중" : "로그인"}</Button>
          </form>
        </div>
      </section>
    </div>
  );
}
