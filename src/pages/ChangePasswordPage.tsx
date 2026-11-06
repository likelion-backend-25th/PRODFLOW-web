import { useState } from "react";
import { ArrowRight, Check, Eye, EyeOff, Info, LockKeyhole, type LucideIcon } from "lucide-react";
import { useForm, useWatch, type UseFormRegisterReturn } from "react-hook-form";
import { Navigate } from "react-router";
import { AuthVisualPanel } from "@/components/AuthVisualPanel.tsx";
import { Button } from "@/components/ui.tsx";
import { apiClient, readApiErrorMessage } from "@/lib/apiClient.ts";
import { cn } from "@/lib/cn.ts";
import { useAuthStore } from "@/stores/useAuthStore.ts";

interface ChangePasswordFields {
  temporaryPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export function ChangePasswordPage() {
  const user = useAuthStore((state) => state.user);
  const issuedTemporaryPassword = useAuthStore((state) => state.temporaryPassword);
  const completePasswordChange = useAuthStore((state) => state.completePasswordChange);
  const logout = useAuthStore((state) => state.logout);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFields>({
    defaultValues: { temporaryPassword: issuedTemporaryPassword ?? "", newPassword: "", confirmPassword: "" },
  });

  const [temporaryPassword = "", newPassword = "", confirmPassword = ""] = useWatch({
    control,
    name: ["temporaryPassword", "newPassword", "confirmPassword"],
  });
  const lengthOk = newPassword.length >= 8 && newPassword.length <= 20;
  const differsFromTemporary = newPassword.length > 0 && newPassword !== temporaryPassword;
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;

  if (!user) return <Navigate to="/login" replace />;
  if (!user.mustChangePassword) return <Navigate to="/dashboard" replace />;

  return (
    <div className="grid min-h-screen grid-cols-1 bg-white lg:grid-cols-[45%_55%]">
      <AuthVisualPanel />
      <section className="flex min-h-screen items-center justify-center overflow-y-auto px-6 py-12 sm:px-10">
        <form
          className="w-full max-w-[440px]"
          noValidate
          onSubmit={handleSubmit(async (values) => {
            if (values.newPassword === values.temporaryPassword) {
              setError("newPassword", { message: "기존 비밀번호와 다른 비밀번호를 사용해 주세요." });
              return;
            }
            if (values.newPassword !== values.confirmPassword) {
              setError("confirmPassword", { message: "새 비밀번호와 확인 비밀번호가 일치하지 않습니다." });
              return;
            }
            try {
              await apiClient.post("/auth/change-password", values);
              // 서버가 Refresh Token을 폐기하므로 변경 후 새 비밀번호로 다시 로그인한다.
              completePasswordChange();
            } catch (reason: unknown) {
              setError("root", { message: readApiErrorMessage(reason) });
            }
          })}
        >
          <h1 className="text-[28px] leading-tight font-semibold">비밀번호를 변경해주세요</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            보안을 위해 임시 비밀번호를 새로운 비밀번호로 변경한 후 서비스를 이용할 수 있습니다.
          </p>

          <div className="mt-9 space-y-5">
            <PasswordInput
              label="발급된 임시 비밀번호"
              autoComplete="current-password"
              readOnly
              error={errors.temporaryPassword?.message}
              registration={register("temporaryPassword", { required: "발급된 임시 비밀번호를 입력해 주세요." })}
            />
            <div>
              <PasswordInput
                label="새 비밀번호"
                autoComplete="new-password"
                error={errors.newPassword?.message}
                registration={register("newPassword", {
                  required: "새 비밀번호를 입력해 주세요.",
                  minLength: { value: 8, message: "비밀번호는 8자 이상이어야 합니다." },
                  maxLength: { value: 20, message: "비밀번호는 20자 이하여야 합니다." },
                })}
              />
              <div className="mt-3 rounded-lg border border-line bg-canvas px-4 py-3">
                <p className="text-xs font-semibold">비밀번호 설정 기준</p>
                <ul className="mt-2 space-y-2 text-xs">
                  <PasswordRule ok={lengthOk}>8자 이상 20자 이하</PasswordRule>
                  <PasswordRule ok={differsFromTemporary}>발급된 임시 비밀번호와 다른 비밀번호</PasswordRule>
                </ul>
              </div>
            </div>
            <div>
              <PasswordInput
                label="새 비밀번호 확인"
                autoComplete="new-password"
                error={errors.confirmPassword?.message}
                registration={register("confirmPassword", { required: "새 비밀번호 확인을 입력해 주세요." })}
              />
              {passwordsMatch ? (
                <p className="mt-2 flex items-center gap-2 text-xs text-primary">
                  <CheckCircle icon={Check} />
                  새 비밀번호가 일치합니다.
                </p>
              ) : null}
            </div>
          </div>

          {errors.root ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-danger">{errors.root.message}</p> : null}

          <Button type="submit" className="relative mt-6 h-12 w-full" disabled={isSubmitting}>
            {isSubmitting ? "변경 중…" : "비밀번호 변경 후 시작하기"}
            <ArrowRight size={18} className="absolute right-5" />
          </Button>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted">
            <Info size={14} />
            변경 후 새 비밀번호로 다시 로그인합니다.
          </p>
          <button type="button" className="mx-auto mt-3 block text-xs text-muted hover:text-ink" onClick={() => void logout()}>
            다른 계정으로 로그인
          </button>
        </form>
      </section>
    </div>
  );
}

function PasswordInput({
  label,
  autoComplete,
  registration,
  error,
  readOnly = false,
}: {
  label: string;
  autoComplete: string;
  registration: UseFormRegisterReturn;
  error?: string;
  readOnly?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="block text-sm font-medium">
      {label} <span className="text-danger">*</span>
      <span className="relative mt-2 block">
        <LockKeyhole size={17} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
        <input
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          readOnly={readOnly}
          className={cn(
            "h-12 w-full rounded-lg border bg-white pr-11 pl-10 outline-none focus:border-primary",
            readOnly && "cursor-not-allowed bg-canvas text-muted",
            error ? "border-danger" : "border-line",
          )}
          {...registration}
        />
        <button
          type="button"
          className="absolute top-1/2 right-3.5 -translate-y-1/2 text-muted"
          aria-label={visible ? `${label} 숨기기` : `${label} 표시`}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
      {error ? <span className="mt-1.5 block text-xs text-danger">{error}</span> : null}
    </label>
  );
}

function PasswordRule({ ok, children }: { ok: boolean; children: string }) {
  return (
    <li className={cn("flex items-center gap-2", ok ? "text-primary" : "text-muted")}>
      <CheckCircle icon={Check} active={ok} />
      {children}
    </li>
  );
}

function CheckCircle({ icon: Icon, active = true }: { icon: LucideIcon; active?: boolean }) {
  return (
    <span className={cn("grid size-4 shrink-0 place-items-center rounded-full", active ? "bg-primary text-white" : "border border-line bg-white text-transparent")}>
      <Icon size={10} strokeWidth={3} />
    </span>
  );
}
