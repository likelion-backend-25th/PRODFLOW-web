import { useState } from "react";
import { Navigate } from "react-router";
import { Button, TextField } from "@/components/ui.tsx";
import { apiClient, readApiErrorMessage } from "@/lib/apiClient.ts";
import { useAuthStore } from "@/stores/useAuthStore.ts";

export function ChangePasswordPage() {
  const user = useAuthStore((state) => state.user);
  const clearPasswordChange = useAuthStore((state) => state.clearPasswordChange);
  const logout = useAuthStore((state) => state.logout);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  if (!user) return <Navigate to="/login" replace />;
  if (!user.mustChangePassword) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <form
        className="w-full max-w-sm rounded-xl border border-line bg-white p-6"
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          if (newPassword !== confirmPassword) {
            setError("새 비밀번호와 확인 비밀번호가 일치하지 않습니다.");
            return;
          }
          setPending(true);
          void apiClient.post("/auth/change-password", { temporaryPassword, newPassword, confirmPassword }).then(() => {
            clearPasswordChange();
          }).catch((reason: unknown) => {
            setError(readApiErrorMessage(reason));
            setPending(false);
          });
        }}
      >
        <h1 className="text-2xl font-semibold">비밀번호 변경</h1>
        <p className="mt-2 text-sm text-muted">임시 비밀번호를 바꾼 뒤에 업무 화면을 사용할 수 있습니다.</p>
        <div className="mt-6 space-y-4">
          <TextField label="현재 비밀번호" type="password" value={temporaryPassword} autoComplete="current-password" onChange={(event) => setTemporaryPassword(event.target.value)} />
          <TextField label="새 비밀번호" type="password" value={newPassword} autoComplete="new-password" onChange={(event) => setNewPassword(event.target.value)} />
          <TextField label="새 비밀번호 확인" type="password" value={confirmPassword} autoComplete="new-password" onChange={(event) => setConfirmPassword(event.target.value)} />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={pending}>{pending ? "변경 중…" : "비밀번호 변경"}</Button>
          <Button type="button" tone="ghost" className="w-full" onClick={logout}>다른 계정으로 로그인</Button>
        </div>
      </form>
    </div>
  );
}
