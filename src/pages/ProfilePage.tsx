import { BadgeCheck, Mail, Phone, RefreshCw, Shield, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui.tsx";
import { readApiErrorMessage } from "@/lib/apiClient.ts";
import { getMe, toRole, type MeResponse } from "@/lib/userApi.ts";
import { accountStatusLabel, roleLabel } from "@/lib/labels.ts";
import { useAuthStore } from "@/stores/useAuthStore.ts";

export function ProfilePage() {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const updateSessionUser = useAuthStore((state) => state.updateSessionUser);

  useEffect(() => {
    let ignore = false;
    void (async () => {
      await Promise.resolve();
      try {
        const response = await getMe();
        if (ignore) return;
        setUser(response);
        updateSessionUser({ name: response.name, email: response.email, role: toRole(response.role) });
      } catch (reason: unknown) {
        if (!ignore) setError(readApiErrorMessage(reason));
      }
    })();
    return () => {
      ignore = true;
    };
  }, [reloadKey, updateSessionUser]);

  if (error) {
    return (
      <section className="rounded-xl border border-line bg-white p-8 text-center">
        <p className="text-danger">{error}</p>
        <Button tone="ghost" className="mt-4" onClick={() => {
          setError("");
          setReloadKey((key) => key + 1);
        }}>
          <RefreshCw size={15} className="mr-2" />다시 시도
        </Button>
      </section>
    );
  }
  if (!user) return <div className="h-56 animate-pulse rounded-xl border border-line bg-white" aria-label="내 정보 불러오는 중" />;
  const role = toRole(user.role);

  const rows = [
    { icon: Mail, label: "로그인 ID", value: user.email },
    { icon: Phone, label: "연락처", value: user.phone },
    { icon: Shield, label: "역할", value: roleLabel[role], badge: true },
    { icon: BadgeCheck, label: "계정 상태", value: accountStatusLabel[user.status], status: true },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold">내 정보</h1>
      <p className="mt-2 text-sm text-muted">로그인한 본인의 정보를 확인할 수 있습니다.</p>
      <div className="mt-6 rounded-xl border border-line bg-white p-5 sm:p-8">
        <div className="grid items-stretch gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <section className="px-6 py-5 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary-soft text-primary">
            <UserRound size={28} />
          </span>
          <h2 className="mt-4 text-xl font-bold">{user.name}</h2>
          <p className="mt-3 inline-flex rounded-md bg-primary-soft px-2 py-1 text-xs font-semibold text-primary">{roleLabel[role]}</p>
          <p className="mx-auto mt-4 max-w-[180px] text-sm leading-6 text-muted">ProdFlow와 함께 더 효율적인 생산 관리를 만들어갑니다.</p>
        </section>
        <section className="rounded-xl border border-line bg-white">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center gap-4 border-b border-line px-6 py-4 last:border-b-0">
              <row.icon size={16} className="shrink-0 text-muted" />
              <span className="w-36 shrink-0 text-sm text-muted">{row.label}</span>
              {row.badge ? (
                <span className="rounded-md bg-primary-soft px-2 py-1 text-xs font-semibold text-primary">{row.value}</span>
              ) : row.status ? (
                <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${user.status === "ACTIVE" ? "bg-primary-soft text-primary" : "bg-orange-50 text-orange-700"}`}>
                  <span className={`size-1.5 rounded-full ${user.status === "ACTIVE" ? "bg-primary" : "bg-orange-500"}`} />
                  {row.value}
                </span>
              ) : (
                <span className="text-sm font-medium">{row.value}</span>
              )}
            </div>
          ))}
        </section>
        </div>
      </div>
    </div>
  );
}
