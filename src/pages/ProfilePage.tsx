import { BadgeCheck, Clock3, Mail, Shield, UserRound } from "lucide-react";
import { useDb } from "@/lib/db.ts";
import { localDateTime } from "@/lib/dates.ts";
import { accountStatusLabel, roleLabel } from "@/lib/labels.ts";
import { useAuthStore } from "@/stores/useAuthStore.ts";

export function ProfilePage() {
  const session = useAuthStore((state) => state.user);
  const db = useDb();
  const user = db.users.find((item) => item.id === session?.id);
  if (!user) return <p className="text-muted">계정 정보를 찾을 수 없습니다.</p>;

  const rows = [
    { icon: UserRound, label: "로그인 ID", value: user.loginId },
    { icon: Mail, label: "이메일", value: user.email },
    { icon: Shield, label: "역할", value: roleLabel[user.role], badge: true },
    { icon: BadgeCheck, label: "계정 상태", value: accountStatusLabel[user.status], status: true },
    { icon: Clock3, label: "마지막 로그인 일시", value: user.lastLoginAt ? localDateTime(user.lastLoginAt).replaceAll("-", ".") : "-" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold">내 정보</h1>
      <p className="mt-2 text-sm text-muted">로그인한 본인의 정보를 확인할 수 있습니다.</p>
      <div className="mt-6 grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-line bg-white px-6 py-10 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary-soft text-primary">
            <UserRound size={28} />
          </span>
          <h2 className="mt-4 text-xl font-bold">{user.name}</h2>
          <p className="mt-3 inline-flex rounded-md bg-primary-soft px-2 py-1 text-xs font-semibold text-primary">{roleLabel[user.role]}</p>
          <p className="mx-auto mt-4 max-w-[180px] text-sm leading-6 text-muted">ProdFlow와 함께 더 효율적인 생산 관리를 만들어갑니다.</p>
        </section>
        <section className="rounded-2xl border border-line bg-white">
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
  );
}
