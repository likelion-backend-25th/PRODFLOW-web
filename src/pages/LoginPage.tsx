import { useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { Navigate } from "react-router";
import { AuthVisualPanel } from "@/components/AuthVisualPanel.tsx";
import { Button } from "@/components/ui.tsx";
import { PASSWORD_CHANGED_KEY, useAuthStore } from "@/stores/useAuthStore.ts";

interface LoginFields {
  email: string;
  password: string;
  rememberEmail: boolean;
}

const REMEMBERED_EMAIL_KEY = "prodflow-remembered-email";
const TEST_ACCOUNTS = [
  { label: "최고 관리자", email: "admin1@prodflow.site" },
  { label: "수주 관리자", email: "order1@prodflow.site" },
  { label: "생산 현장 관리자", email: "prod1@prodflow.site" },
  { label: "업무 조회 담당", email: "inquiry1@prodflow.site" },
];
const TEST_PASSWORD = "Abcd123456!?";

export function LoginPage() {
  const user = useAuthStore((state) => state.user);
  const login = useAuthStore((state) => state.login);
  const rememberedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? "";
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [notice] = useState(() => {
    const message = sessionStorage.getItem(PASSWORD_CHANGED_KEY) ?? "";
    if (message) sessionStorage.removeItem(PASSWORD_CHANGED_KEY);
    return message;
  });
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<LoginFields>({
    defaultValues: { email: rememberedEmail, password: "", rememberEmail: Boolean(rememberedEmail) },
  });

  if (user?.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (user) return <Navigate to="/assistant" replace />;

  return (
    <div className="grid min-h-screen grid-cols-1 bg-white lg:grid-cols-[45%_55%]">
      <AuthVisualPanel />
      <section className="relative flex min-h-screen items-center justify-center px-6 py-12 sm:px-10">
        <p className="absolute top-7 right-8 hidden items-center gap-1.5 text-xs text-muted sm:flex">
          <ShieldCheck size={14} className="text-primary" />
          외부 접근이 제한된 내부 전용 서비스
        </p>
        <div className="w-full max-w-[440px]">
          <span className="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary">
            <LockKeyhole size={21} />
          </span>
          <h2 className="mt-5 text-[28px] font-semibold">업무의 흐름을 이어가세요</h2>
          <p className="mt-2 text-sm text-muted">발급받은 사내 계정으로 로그인해 주세요.</p>

          {notice ? <p className="mt-5 rounded-lg bg-primary-soft px-4 py-3 text-sm text-primary">{notice}</p> : null}

          <form
            className="mt-7 space-y-5"
            noValidate
            onSubmit={handleSubmit(async (values) => {
              const message = await login(values.email.trim(), values.password);
              if (message) {
                setError("root", { message });
                return;
              }
              if (values.rememberEmail) localStorage.setItem(REMEMBERED_EMAIL_KEY, values.email.trim());
              else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
            })}
          >
            <label className="block text-sm font-medium">
              이메일
              <span className="relative mt-2 block">
                <Mail size={17} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
                <input
                  type="email"
                  autoComplete="username"
                  placeholder="사내 이메일을 입력하세요"
                  className="h-12 w-full rounded-lg border border-line pr-4 pl-10 outline-none focus:border-primary"
                  {...register("email", {
                    required: "이메일을 입력해 주세요.",
                    pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "올바른 이메일 형식으로 입력해 주세요." },
                  })}
                />
              </span>
              {errors.email ? <span className="mt-1.5 block text-xs text-danger">{errors.email.message}</span> : null}
            </label>

            <label className="block text-sm font-medium">
              비밀번호
              <span className="relative mt-2 block">
                <LockKeyhole size={17} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
                <input
                  type={passwordVisible ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="비밀번호를 입력하세요"
                  className="h-12 w-full rounded-lg border border-line pr-11 pl-10 outline-none focus:border-primary"
                  {...register("password", { required: "비밀번호를 입력해 주세요." })}
                />
                <button
                  type="button"
                  className="absolute top-1/2 right-3.5 -translate-y-1/2 text-muted"
                  aria-label={passwordVisible ? "비밀번호 숨기기" : "비밀번호 표시"}
                  onClick={() => setPasswordVisible((visible) => !visible)}
                >
                  {passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
              {errors.password ? <span className="mt-1.5 block text-xs text-danger">{errors.password.message}</span> : null}
            </label>

            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" className="size-4 accent-primary" {...register("rememberEmail")} />
              아이디 저장
            </label>

            {errors.root ? <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-danger">{errors.root.message}</p> : null}

            <Button type="submit" className="relative h-12 w-full" disabled={isSubmitting}>
              {isSubmitting ? "로그인 중…" : "로그인"}
              <ArrowRight size={18} className="absolute right-5" />
            </Button>
          </form>

          <div className="mt-6 rounded-lg border border-line bg-surface p-4">
            <p className="text-sm font-semibold">권한별 테스트 계정</p>
            <p className="mt-1 text-xs text-muted">권한을 선택하면 이메일과 비밀번호가 입력됩니다.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {TEST_ACCOUNTS.map((account) => (
                <Button
                  key={account.email}
                  type="button"
                  tone="ghost"
                  className="text-xs"
                  disabled={isSubmitting}
                  onClick={() => {
                    setValue("email", account.email, { shouldDirty: true });
                    setValue("password", TEST_PASSWORD, { shouldDirty: true });
                    clearErrors();
                  }}
                >
                  {account.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="mt-8 border-t border-line pt-6 text-xs leading-6 text-muted">
            <p className="font-semibold text-ink">처음 이용하시나요?</p>
            <p className="mt-1">계정은 최고 관리자만 발급할 수 있습니다.</p>
            <p>계정 발급 및 비밀번호 초기화는 사내 관리자에게 문의해 주세요.</p>
          </div>
          <p className="mt-16 text-center text-[11px] text-muted">© 2026 prodflow. All rights reserved.</p>
        </div>
      </section>
    </div>
  );
}
