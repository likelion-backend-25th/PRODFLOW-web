import { useState } from "react";
import { ChevronLeft, ChevronRight, Ellipsis, Info, Plus, Search, UserRound, Users } from "lucide-react";
import { Button, SelectField, TextField } from "@/components/ui.tsx";
import { cn } from "@/lib/cn.ts";
import { localDateTime } from "@/lib/dates.ts";
import { resetDb, useDb } from "@/lib/db.ts";
import { accountStatusLabel, roleLabel } from "@/lib/labels.ts";
import { deleteHoliday, deleteUser, saveHoliday, saveUser, setUserStatus, type UserInput } from "@/lib/workflow.ts";
import { useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";
import type { Role, User } from "@/types/domain.ts";

const PAGE_SIZE = 15;

function dotted(stamp: string): string {
  return localDateTime(stamp).replaceAll("-", ".");
}

function StatusBadge({ status }: { status: User["status"] }) {
  const active = status === "ACTIVE";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold", active ? "bg-primary-soft text-primary" : "bg-orange-50 text-orange-700")}>
      <span className={cn("size-1.5 rounded-full", active ? "bg-primary" : "bg-orange-500")} />
      {accountStatusLabel[status]}
    </span>
  );
}

function RoleBadge({ role }: { role: Role }) {
  const admin = role === "SUPER_ADMIN";
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold", admin ? "bg-primary-soft text-primary" : "bg-slate-100 text-slate-600")}>
      <span className={cn("size-1.5 rounded-full", admin ? "bg-primary" : "bg-slate-400")} />
      {roleLabel[role]}
    </span>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon?: boolean }) {
  return (
    <section className="flex items-start justify-between rounded-xl border border-line bg-white p-5">
      <div>
        <p className="text-sm text-muted">{label}</p>
        <p className="mt-3 text-2xl font-bold">{value}명</p>
      </div>
      {icon ? <Users className="size-6 text-primary" /> : null}
    </section>
  );
}

type Draft = UserInput;

const emptyDraft: Draft = { loginId: "", password: "", name: "", email: "", department: "", role: "ORDER_MANAGER", status: "ACTIVE" };

export function AdminPage() {
  const db = useDb();
  const me = useAuthStore((state) => state.user);
  const refreshSession = useAuthStore((state) => state.refresh);
  const show = useToastStore((state) => state.show);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [issued, setIssued] = useState("");
  const [date, setDate] = useState("");
  const [holidayName, setHolidayName] = useState("");

  const accounts = db.users.filter((user) => user.status !== "DELETED");
  const term = keyword.trim().toLowerCase();
  const rows = accounts.filter((user) => {
    if (statusFilter !== "ALL" && user.status !== statusFilter) return false;
    return `${user.name} ${user.email} ${user.department} ${user.loginId}`.toLowerCase().includes(term);
  });
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const selected = accounts.find((user) => user.id === selectedId) ?? rows[0];
  const isMe = selected?.id === me?.id;

  function act(action: () => void, success: string): boolean {
    try {
      action();
      show(success);
      return true;
    } catch (error: unknown) {
      show(error instanceof Error ? error.message : "처리하지 못했습니다.");
      return false;
    }
  }

  function submitDraft() {
    if (!draft || !me) return;
    try {
      const id = saveUser(draft, me.id);
      if (draft.id) {
        if (draft.id === me.id) refreshSession();
        show("계정 정보를 수정했습니다.");
      } else {
        setSelectedId(id);
        setIssued(`${draft.name.trim()} · ${draft.loginId.trim()}`);
      }
      setDraft(null);
    } catch (error: unknown) {
      show(error instanceof Error ? error.message : "처리하지 못했습니다.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">계정 관리</h1>
          <p className="mt-1 text-sm text-muted">직원 계정은 최고 관리자가 발급하고 활성화합니다. 외부 접근은 차단된 상태로 유지됩니다.</p>
        </div>
        <Button onClick={() => setDraft({ ...emptyDraft })}><Plus className="mr-1 size-4" />계정 추가</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="전체 계정" value={accounts.length} icon />
        <Stat label="활성 계정" value={accounts.filter((user) => user.status === "ACTIVE").length} />
        <Stat label="비활성" value={accounts.filter((user) => user.status === "INACTIVE").length} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="overflow-hidden rounded-xl border border-line bg-white">
          <div className="flex items-center justify-between px-5 pt-5">
            <h2 className="font-semibold">등록된 계정</h2>
            <span className="text-sm text-muted">총 {rows.length}명</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <label className="relative block w-full max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <input className="h-10 w-full rounded-lg border border-line pr-3 pl-9 text-sm" value={keyword} placeholder="이름, 이메일, 부서 검색" onChange={(event) => { setKeyword(event.target.value); setPage(1); }} />
            </label>
            <select className="h-10 rounded-lg border border-line bg-white px-3 text-sm" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as typeof statusFilter); setPage(1); }}>
              <option value="ALL">전체 상태</option>
              <option value="ACTIVE">활성</option>
              <option value="INACTIVE">비활성</option>
            </select>
          </div>
          <div className="overflow-x-auto px-5">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-y border-line text-xs text-muted">
                <tr>
                  <th className="py-3 font-medium">이름</th>
                  <th className="py-3 font-medium">이메일</th>
                  <th className="py-3 font-medium">부서</th>
                  <th className="py-3 font-medium">역할</th>
                  <th className="py-3 font-medium">상태</th>
                  <th className="py-3 font-medium">최근 접속</th>
                  <th className="w-8 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.map((user) => (
                  <tr key={user.id} className={cn("cursor-pointer border-b border-line last:border-0 hover:bg-primary-soft/30", selected?.id === user.id && "bg-primary-soft/50")} onClick={() => { setSelectedId(user.id); setMenuOpen(false); }}>
                    <td className="py-3">
                      <span className="flex items-center gap-3">
                        <span className="grid size-7 place-items-center rounded-md bg-primary-soft text-xs font-semibold text-primary">{user.name.slice(0, 1)}</span>
                        <span className="font-semibold">{user.name}</span>
                      </span>
                    </td>
                    <td>{user.email}</td>
                    <td className="text-xs text-muted">{user.department}</td>
                    <td><RoleBadge role={user.role} /></td>
                    <td><StatusBadge status={user.status} /></td>
                    <td className="text-xs text-muted">{user.lastLoginAt ? dotted(user.lastLoginAt) : "로그인 이력 없음"}</td>
                    <td><ChevronRight className="size-4 text-muted" /></td>
                  </tr>
                ))}
                {visible.length === 0 ? <tr><td colSpan={7} className="py-10 text-center text-muted">조건에 맞는 계정이 없습니다.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-5 py-4 text-xs text-muted">
            <span>총 {rows.length}명 중 {rows.length ? (current - 1) * PAGE_SIZE + 1 : 0}–{(current - 1) * PAGE_SIZE + visible.length}명 표시</span>
            <span className="flex items-center gap-1">
              <button type="button" className="grid size-7 place-items-center rounded-md disabled:opacity-30" disabled={current === 1} onClick={() => setPage(current - 1)} aria-label="이전 페이지"><ChevronLeft className="size-4" /></button>
              {Array.from({ length: pages }, (_, index) => index + 1).map((number) => (
                <button key={number} type="button" className={cn("grid size-7 place-items-center rounded-md font-semibold", number === current ? "bg-primary-soft text-primary" : "text-ink")} onClick={() => setPage(number)}>{number}</button>
              ))}
              <button type="button" className="grid size-7 place-items-center rounded-md disabled:opacity-30" disabled={current === pages} onClick={() => setPage(current + 1)} aria-label="다음 페이지"><ChevronRight className="size-4" /></button>
            </span>
          </div>
        </section>

        <aside className="space-y-3">
          {selected ? (
            <section className="rounded-xl border border-line bg-white p-5">
              <div className="relative flex items-center justify-between">
                <h2 className="font-semibold">계정 상세</h2>
                <button type="button" className="grid size-7 place-items-center rounded-md hover:bg-primary-soft/50" aria-label="더보기" onClick={() => setMenuOpen((open) => !open)}><Ellipsis className="size-4" /></button>
                {menuOpen ? (
                  <div className="absolute top-8 right-0 z-10 w-36 rounded-lg border border-line bg-white py-1 text-sm shadow-lg">
                    <button type="button" className="block w-full px-3 py-2 text-left hover:bg-primary-soft/40 disabled:opacity-40" disabled={isMe} onClick={() => {
                      setMenuOpen(false);
                      const next = selected.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
                      act(() => setUserStatus(selected.id, next, me?.id ?? ""), next === "ACTIVE" ? "계정을 활성화했습니다." : "계정을 비활성화했습니다.");
                    }}>{selected.status === "ACTIVE" ? "계정 비활성화" : "계정 활성화"}</button>
                  </div>
                ) : null}
              </div>
              <div className="mt-4 flex items-center gap-3 border-b border-line pb-4">
                <span className="grid size-11 place-items-center rounded-lg bg-primary-soft text-primary"><UserRound className="size-5" /></span>
                <div>
                  <p className="text-lg font-bold">{selected.name}{isMe ? <span className="ml-1 text-xs font-medium text-muted">(나)</span> : null}</p>
                  <p className="text-xs text-muted">{selected.accountNo} · {dotted(selected.createdAt).slice(0, 10)} 계정 발급</p>
                </div>
              </div>
              <dl className="mt-4 space-y-4 text-sm">
                <div><dt className="text-xs text-muted">이메일</dt><dd className="mt-1 break-all">{selected.email}</dd></div>
                <div><dt className="text-xs text-muted">아이디</dt><dd className="mt-1">{selected.loginId}</dd></div>
                <div><dt className="text-xs text-muted">부서</dt><dd className="mt-1">{selected.department}</dd></div>
                <div><dt className="text-xs text-muted">역할</dt><dd className="mt-1">{roleLabel[selected.role]}</dd></div>
                <div><dt className="text-xs text-muted">상태</dt><dd className="mt-1">{accountStatusLabel[selected.status]}</dd></div>
                {selected.role === "PRODUCTION_MANAGER" ? (
                  <div>
                    <dt className="text-xs text-muted">최근 출퇴근 {selected.clockedIn ? <span className="ml-1 rounded bg-primary-soft px-1.5 py-0.5 font-semibold text-primary">근무중</span> : null}</dt>
                    <dd className="mt-1 space-y-1 text-xs">
                      {db.attendance.filter((item) => item.userId === selected.id).slice(0, 5).map((item) => (
                        <p key={item.id}>{dotted(item.clockInAt)} ~ {item.clockOutAt ? dotted(item.clockOutAt).slice(11) : "근무중"}</p>
                      ))}
                      {db.attendance.every((item) => item.userId !== selected.id) ? <p className="text-muted">기록 없음</p> : null}
                    </dd>
                  </div>
                ) : null}
              </dl>
              <div className="mt-5 flex justify-between gap-2">
                <button type="button" className="h-9 rounded-lg bg-primary-soft px-3 text-sm font-semibold text-primary" onClick={() => setDraft({ id: selected.id, loginId: selected.loginId, password: "", name: selected.name, email: selected.email, department: selected.department, role: selected.role, status: selected.status === "INACTIVE" ? "INACTIVE" : "ACTIVE" })}>계정 정보 수정</button>
                <button type="button" className="h-9 rounded-lg bg-danger px-5 text-sm font-semibold text-white disabled:opacity-40" disabled={isMe} onClick={() => setConfirmDelete(true)}>계정 삭제</button>
              </div>
            </section>
          ) : null}
          <section className="flex gap-3 rounded-xl border border-primary/20 bg-primary-soft/60 p-4 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <p className="font-semibold text-primary">직원 계정 생성</p>
              <p className="mt-1 text-muted">계정은 최고 관리자만 발급할 수 있습니다. 비밀번호 초기화는 계정 정보 수정에서 새 비밀번호를 입력해 처리합니다.</p>
            </div>
          </section>
        </aside>
      </div>

      <section className="rounded-xl border border-line bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">휴일</h2>
          <Button tone="ghost" onClick={() => { resetDb(); setSelectedId(""); show("예시 데이터를 처음 상태로 되돌렸습니다."); }}>예시 데이터 초기화</Button>
        </div>
        <p className="mb-3 text-sm text-muted">토요일과 일요일은 항상 쉽니다. 여기 날짜도 생산량 계산에서 빠지며, 이미 잡힌 수주는 옮기지 않습니다.</p>
        <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
          event.preventDefault();
          if (act(() => saveHoliday(date, holidayName), "휴일을 등록했습니다.")) {
            setDate("");
            setHolidayName("");
          }
        }}>
          <TextField label="날짜" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <TextField label="이름" value={holidayName} onChange={(event) => setHolidayName(event.target.value)} />
          <Button type="submit">등록</Button>
        </form>
        <ul className="mt-3 divide-y divide-line text-sm">
          {db.holidays.map((holiday) => (
            <li key={holiday.id} className="flex items-center justify-between py-2">
              <span>{holiday.date} {holiday.name}</span>
              <Button tone="ghost" onClick={() => deleteHoliday(holiday.id)}>삭제</Button>
            </li>
          ))}
        </ul>
      </section>

      {draft ? (
        <div className="fixed inset-0 z-20 grid place-items-center bg-ink/40 p-4">
          <form className="w-full max-w-md rounded-xl border border-line bg-white p-5" onSubmit={(event) => { event.preventDefault(); submitDraft(); }}>
            <h2 className="mb-4 text-lg font-semibold">{draft.id ? "계정 정보 수정" : "계정 추가"}</h2>
            <div className="grid gap-3">
              <TextField label="아이디" value={draft.loginId} disabled={Boolean(draft.id)} onChange={(event) => setDraft({ ...draft, loginId: event.target.value })} />
              <TextField label={draft.id ? "새 비밀번호 (비워 두면 유지)" : "초기 비밀번호 (8자 이상)"} type="password" autoComplete="new-password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} />
              <TextField label="이름" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              <TextField label="이메일" type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
              <TextField label="부서" value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })} />
              <SelectField label="역할" value={draft.role} disabled={draft.id === me?.id} onChange={(event) => setDraft({ ...draft, role: event.target.value as Role })}>
                {Object.entries(roleLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </SelectField>
              {draft.id ? (
                <SelectField label="상태" value={draft.status} disabled={draft.id === me?.id} onChange={(event) => setDraft({ ...draft, status: event.target.value as Draft["status"] })}>
                  <option value="ACTIVE">활성</option>
                  <option value="INACTIVE">비활성</option>
                </SelectField>
              ) : null}
              {draft.id === me?.id ? <p className="text-xs text-muted">자기 계정의 역할과 상태는 다른 최고 관리자가 바꿉니다.</p> : null}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button tone="ghost" onClick={() => setDraft(null)}>취소</Button>
              <Button type="submit">{draft.id ? "저장" : "추가"}</Button>
            </div>
          </form>
        </div>
      ) : null}

      {confirmDelete && selected ? (
        <div className="fixed inset-0 z-20 grid place-items-center bg-ink/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-line bg-white p-5">
            <h2 className="text-lg font-semibold">{selected.name} 계정을 삭제할까요?</h2>
            <p className="mt-2 text-sm text-muted">삭제한 계정은 로그인할 수 없고 목록에서 빠집니다. 이미 남은 처리 이력의 담당자 이름은 그대로 유지되고, 같은 아이디는 다시 쓸 수 없습니다.</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button tone="ghost" onClick={() => setConfirmDelete(false)}>취소</Button>
              <Button tone="danger" onClick={() => {
                if (act(() => deleteUser(selected.id, me?.id ?? ""), "계정을 삭제했습니다.")) setSelectedId("");
                setConfirmDelete(false);
              }}>삭제</Button>
            </div>
          </div>
        </div>
      ) : null}

      {issued ? (
        <div className="fixed inset-0 z-20 grid place-items-center bg-ink/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-line bg-white p-5">
            <h2 className="text-lg font-semibold">계정을 발급했습니다</h2>
            <p className="mt-2 text-muted">{issued}</p>
            <p className="mt-1 text-sm text-muted">초기 비밀번호는 직원에게 따로 전달하세요.</p>
            <div className="mt-4 flex justify-end"><Button onClick={() => setIssued("")}>확인</Button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
