import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Info, Plus, RefreshCw, Search, UserRound, Users, X } from "lucide-react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { Button } from "@/components/ui.tsx";
import { readApiErrorMessage } from "@/lib/apiClient.ts";
import { cn } from "@/lib/cn.ts";
import {
  createUser,
  deleteUser,
  generateTemporaryPassword,
  getUser,
  getUsers,
  getUserStats,
  toApiRole,
  toRole,
  updateUser,
  type EditableAccountStatus,
  type UserResponse,
  type UserStatsResponse,
} from "@/lib/userApi.ts";
import { accountStatusLabel, roleLabel } from "@/lib/labels.ts";
import { useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";
import type { Role } from "@/types/domain.ts";

const PAGE_SIZE = 15;
const roles: Role[] = ["SUPER_ADMIN", "ORDER_MANAGER", "PRODUCTION_MANAGER", "VIEWER"];

interface UserFormFields {
  name: string;
  email: string;
  phone: string;
  role: Role;
  status: EditableAccountStatus;
}

function formatDateTime(value: string | null): string {
  if (!value) return "로그인 이력 없음";
  const dateTime = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  // DB와 API가 한국 시각을 전달하므로 프론트에서는 시간대 연산 없이 표시 형식만 바꾼다.
  return dateTime
    ? `${dateTime[1]}. ${dateTime[2]}. ${dateTime[3]}. ${dateTime[4]}:${dateTime[5]}`
    : value;
}

function StatusBadge({ status }: { status: UserResponse["status"] }) {
  const active = status === "ACTIVE";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold", active ? "bg-primary-soft text-primary" : "bg-warning-soft text-warning")}>
      <span className={cn("size-1.5 rounded-full", active ? "bg-primary" : "bg-warning")} />
      {accountStatusLabel[status]}
    </span>
  );
}

function RoleBadge({ role }: { role: UserResponse["role"] }) {
  const mappedRole = toRole(role);
  const admin = mappedRole === "SUPER_ADMIN";
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold", admin ? "bg-primary-soft text-primary" : "bg-canvas text-muted")}>
      <span className={cn("size-1.5 rounded-full", admin ? "bg-primary" : "bg-muted")} />
      {roleLabel[mappedRole]}
    </span>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon?: boolean }) {
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

export function UserManagementPage() {
  const sessionUser = useAuthStore((state) => state.user);
  const updateSessionUser = useAuthStore((state) => state.updateSessionUser);
  const showToast = useToastStore((state) => state.show);
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<"ALL" | EditableAccountStatus>("ALL");
  const [page, setPage] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [stats, setStats] = useState<UserStatsResponse>({ totalAccounts: 0, activeAccounts: 0, inactiveAccounts: 0 });
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<"create" | UserResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserResponse | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setKeyword(keywordInput.trim());
      setPage(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [keywordInput]);

  useEffect(() => {
    let ignore = false;
    void (async () => {
      await Promise.resolve();
      if (ignore) return;
      setLoading(true);
      setError("");
      try {
        const [pageResponse, statsResponse] = await Promise.all([
          getUsers({ keyword, status: status === "ALL" ? undefined : status, page, size: PAGE_SIZE }),
          getUserStats(),
        ]);
        if (ignore) return;
        setUsers(pageResponse.content);
        setTotalElements(pageResponse.totalElements);
        setTotalPages(pageResponse.totalPages);
        setStats(statsResponse);
        setSelectedId((current) => pageResponse.content.some((user) => user.id === current)
          ? current
          : (pageResponse.content[0]?.id ?? null));
        if (pageResponse.content.length === 0) setSelected(null);
      } catch (reason: unknown) {
        if (!ignore) setError(readApiErrorMessage(reason));
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [keyword, page, reloadKey, status]);

  useEffect(() => {
    if (selectedId === null) return;
    let ignore = false;
    void (async () => {
      await Promise.resolve();
      if (ignore) return;
      setDetailLoading(true);
      try {
        const response = await getUser(selectedId);
        if (!ignore) setSelected(response);
      } catch (reason: unknown) {
        if (!ignore) setError(readApiErrorMessage(reason));
      } finally {
        if (!ignore) setDetailLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [reloadKey, selectedId]);

  const currentPage = Math.min(page + 1, Math.max(totalPages, 1));
  const visiblePages = useMemo(() => {
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, start + 4);
    return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
  }, [currentPage, totalPages]);

  function refresh(preferredId?: number): void {
    if (preferredId !== undefined) setSelectedId(preferredId);
    setReloadKey((key) => key + 1);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">계정 관리</h1>
          <p className="mt-1 text-sm text-muted">직원은 직접 회원가입을 신청하고, 최고 관리자가 승인 후 계정을 활성화합니다.</p>
        </div>
        <Button onClick={() => setEditor("create")}><Plus className="mr-1 size-4" />계정 추가</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="전체 계정" value={stats.totalAccounts} icon />
        <StatCard label="사용 계정" value={stats.activeAccounts} />
        <StatCard label="비활성" value={stats.inactiveAccounts} />
      </div>

      {error ? (
        <section className="rounded-xl border border-line bg-white p-8 text-center">
          <p className="text-danger">{error}</p>
          <Button tone="ghost" className="mt-4" onClick={() => refresh()}>
            <RefreshCw size={15} className="mr-2" />다시 시도
          </Button>
        </section>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section className="overflow-hidden rounded-xl border border-line bg-white">
            <div className="flex items-center justify-between px-5 pt-5">
              <h2 className="font-semibold">등록된 계정</h2>
              <span className="text-sm text-muted">총 {totalElements}명</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <label className="relative block w-full max-w-xs">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
                <input
                  className="h-10 w-full rounded-lg border border-line pr-3 pl-9 text-sm outline-none focus:border-primary"
                  value={keywordInput}
                  placeholder="이름, 이메일, 전화번호 검색"
                  onChange={(event) => setKeywordInput(event.target.value)}
                />
              </label>
              <select
                className="h-10 rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-primary"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as typeof status);
                  setPage(0);
                }}
              >
                <option value="ALL">전체 상태</option>
                <option value="ACTIVE">사용</option>
                <option value="INACTIVE">비활성</option>
              </select>
            </div>

            <div className="overflow-x-auto px-5">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-y border-line text-xs text-muted">
                  <tr>
                    <th className="py-3 font-medium">이름</th>
                    <th className="py-3 font-medium">이메일</th>
                    <th className="py-3 font-medium">전화번호</th>
                    <th className="py-3 font-medium">역할</th>
                    <th className="py-3 font-medium">상태</th>
                    <th className="py-3 font-medium">최근 접속</th>
                    <th className="w-8 py-3" />
                  </tr>
                </thead>
                <tbody className={cn(loading && "opacity-50")}>
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      className={cn("cursor-pointer border-b border-line last:border-0 hover:bg-primary-soft/30", selectedId === user.id && "bg-primary-soft/50")}
                      onClick={() => setSelectedId(user.id)}
                    >
                      <td className="py-3">
                        <span className="flex items-center gap-3">
                          <span className="grid size-7 place-items-center rounded-md bg-primary-soft text-xs font-semibold text-primary">{user.name.slice(0, 1)}</span>
                          <span className="font-semibold">{user.name}</span>
                        </span>
                      </td>
                      <td>{user.email}</td>
                      <td className="text-xs text-muted">{user.phone}</td>
                      <td><RoleBadge role={user.role} /></td>
                      <td><StatusBadge status={user.status} /></td>
                      <td className="text-xs text-muted">{formatDateTime(user.lastLoginAt)}</td>
                      <td><ChevronRight className="size-4 text-muted" /></td>
                    </tr>
                  ))}
                  {!loading && users.length === 0 ? (
                    <tr><td colSpan={7} className="py-12 text-center text-muted">조건에 맞는 계정이 없습니다.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-5 py-4 text-xs text-muted">
              <span>
                총 {totalElements}명 중 {totalElements ? page * PAGE_SIZE + 1 : 0}–
                {Math.min(page * PAGE_SIZE + users.length, totalElements)}명 표시
              </span>
              <span className="flex items-center gap-1">
                <button type="button" className="grid size-7 place-items-center rounded-md disabled:opacity-30" disabled={page === 0} onClick={() => setPage((value) => value - 1)} aria-label="이전 페이지">
                  <ChevronLeft className="size-4" />
                </button>
                {visiblePages.map((number) => (
                  <button key={number} type="button" className={cn("grid size-7 place-items-center rounded-md font-semibold", number === currentPage ? "bg-primary-soft text-primary" : "text-ink")} onClick={() => setPage(number - 1)}>
                    {number}
                  </button>
                ))}
                <button type="button" className="grid size-7 place-items-center rounded-md disabled:opacity-30" disabled={page + 1 >= totalPages} onClick={() => setPage((value) => value + 1)} aria-label="다음 페이지">
                  <ChevronRight className="size-4" />
                </button>
              </span>
            </div>
          </section>

          <aside className="space-y-3">
            <section className="min-h-80 rounded-xl border border-line bg-white p-5">
              <h2 className="font-semibold">계정 상세</h2>
              {detailLoading ? <div className="mt-5 h-52 animate-pulse rounded-lg bg-canvas" /> : null}
              {!detailLoading && selected ? (
                <>
                  <div className="mt-4 flex items-center gap-3 border-b border-line pb-4">
                    <span className="grid size-11 place-items-center rounded-lg bg-primary-soft text-primary"><UserRound className="size-5" /></span>
                    <div>
                      <p className="text-lg font-bold">{selected.name}{String(selected.id) === sessionUser?.id ? <span className="ml-1 text-xs font-medium text-muted">(나)</span> : null}</p>
                      <StatusBadge status={selected.status} />
                    </div>
                  </div>
                  <dl className="mt-4 space-y-4 text-sm">
                    <div><dt className="text-xs text-muted">이메일</dt><dd className="mt-1 break-all">{selected.email}</dd></div>
                    <div><dt className="text-xs text-muted">전화번호</dt><dd className="mt-1">{selected.phone}</dd></div>
                    <div><dt className="text-xs text-muted">역할</dt><dd className="mt-1">{roleLabel[toRole(selected.role)]}</dd></div>
                    <div><dt className="text-xs text-muted">최근 접속</dt><dd className="mt-1">{formatDateTime(selected.lastLoginAt)}</dd></div>
                  </dl>
                  <div className="mt-5 flex flex-wrap justify-between gap-2 border-t border-line pt-4">
                    <Button tone="ghost" className="h-9" onClick={() => setEditor(selected)}>계정 정보 수정</Button>
                    <Button
                      tone="danger"
                      className="h-9"
                      disabled={String(selected.id) === sessionUser?.id}
                      onClick={() => setDeleteTarget(selected)}
                    >
                      계정 삭제
                    </Button>
                  </div>
                </>
              ) : null}
              {!detailLoading && !selected ? <p className="mt-8 text-center text-sm text-muted">직원을 선택해 주세요.</p> : null}
            </section>
            <section className="flex gap-3 rounded-xl border border-primary/20 bg-primary-soft/60 p-4 text-sm">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="font-semibold text-primary">직원 계정 생성</p>
                <p className="mt-1 text-muted">계정은 최고 관리자만 발급할 수 있습니다. 삭제한 계정은 복구되지 않으므로 신중하게 처리해 주세요.</p>
              </div>
            </section>
          </aside>
        </div>
      )}

      {editor ? (
        <UserEditorModal
          user={editor === "create" ? undefined : editor}
          currentUserId={sessionUser?.id}
          onClose={() => setEditor(null)}
          onSaved={(saved) => {
            if (String(saved.id) === sessionUser?.id) {
              updateSessionUser({ name: saved.name, email: saved.email, role: toRole(saved.role) });
            }
            setEditor(null);
            refresh(saved.id);
            showToast(editor === "create" ? "직원 계정을 등록했습니다." : "계정 정보를 수정했습니다.");
          }}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteConfirmModal
          user={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null);
            setSelectedId(null);
            setSelected(null);
            refresh();
            showToast("직원 계정을 삭제했습니다.");
          }}
        />
      ) : null}
    </div>
  );
}

function UserEditorModal({
  user,
  currentUserId,
  onClose,
  onSaved,
}: {
  user?: UserResponse;
  currentUserId?: string;
  onClose: () => void;
  onSaved: (user: UserResponse) => void;
}) {
  const isSelf = user && String(user.id) === currentUserId;
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [apiError, setApiError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UserFormFields>({
    defaultValues: {
      name: user?.name ?? "",
      email: user?.email ?? "",
      phone: user?.phone ?? "",
      role: user ? toRole(user.role) : "ORDER_MANAGER",
      status: user?.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    },
  });

  return (
    <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-primary-deep/70 p-4" role="dialog" aria-modal="true">
      <form
        className="my-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-white shadow-2xl"
        noValidate
        onSubmit={handleSubmit(async (values) => {
          setApiError("");
          if (!user && !temporaryPassword) {
            setApiError("임시 비밀번호를 발급해 주세요.");
            return;
          }
          try {
            const saved = user
              ? await updateUser(user.id, {
                name: values.name.trim(),
                email: values.email.trim(),
                phone: values.phone.trim(),
                role: toApiRole(isSelf ? toRole(user.role) : values.role),
                status: isSelf ? (user.status as EditableAccountStatus) : values.status,
                temporaryPassword: temporaryPassword || null,
              })
              : await createUser({
                name: values.name.trim(),
                email: values.email.trim(),
                phone: values.phone.trim(),
                role: toApiRole(values.role),
                temporaryPassword,
              });
            onSaved(saved);
          } catch (reason: unknown) {
            setApiError(readApiErrorMessage(reason));
          }
        })}
      >
        <div className="flex items-start justify-between border-b border-line px-7 py-6">
          <div>
            <h2 className="text-xl font-bold">{user ? "계정 정보 수정" : "직원 계정 등록"}</h2>
            <p className="mt-1 text-sm text-muted">최고관리자 · 직원용 사내 계정</p>
          </div>
          <button type="button" className="text-muted hover:text-ink" aria-label="닫기" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="space-y-4 px-7 py-6">
          <FormInput label="이름" error={errors.name?.message} registration={register("name", { required: "이름을 입력해 주세요." })} />
          <FormInput
            label="아이디(이메일)"
            type="email"
            error={errors.email?.message}
            registration={register("email", {
              required: "이메일을 입력해 주세요.",
              pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "올바른 이메일 형식으로 입력해 주세요." },
            })}
          />
          <FormInput
            label="전화번호"
            placeholder="예시)010-1234-5678"
            error={errors.phone?.message}
            registration={register("phone", { required: "전화번호를 입력해 주세요." })}
          />

          <label className="block text-sm font-medium">
            {user ? "임시 비밀번호 재발급" : "임시 비밀번호 발급"} <span className="text-danger">*</span>
            <span className="mt-2 flex rounded-lg border border-line bg-white p-1">
              <input className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none" value={temporaryPassword} readOnly placeholder="임시 비밀번호를 발급받아 사용해 주세요" />
              <button type="button" className="h-9 shrink-0 rounded-md bg-ink px-4 text-sm font-semibold text-white" onClick={() => setTemporaryPassword(generateTemporaryPassword())}>
                임시 비밀번호 발급
              </button>
            </span>
            <span className="mt-1.5 block text-xs font-normal text-muted">발급값은 저장 후 다시 표시되지 않습니다. 직원에게 안전하게 전달해 주세요.</span>
          </label>

          <div className={cn("grid gap-4", user && "sm:grid-cols-2")}>
            <label className="block text-sm font-medium">
              역할 <span className="text-danger">*</span>
              <select className="mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 outline-none focus:border-primary disabled:bg-canvas" disabled={Boolean(isSelf)} {...register("role")}>
                {roles.map((role) => <option key={role} value={role}>{roleLabel[role]}</option>)}
              </select>
            </label>
            {user ? (
              <label className="block text-sm font-medium">
                사용여부
                <select className="mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 outline-none focus:border-primary disabled:bg-canvas" disabled={Boolean(isSelf)} {...register("status")}>
                  <option value="ACTIVE">사용</option>
                  <option value="INACTIVE">비활성</option>
                </select>
              </label>
            ) : null}
          </div>
          {isSelf ? <p className="text-xs text-muted">자기 계정의 역할과 상태는 이 화면에서 변경할 수 없습니다.</p> : null}
          {apiError ? <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-danger">{apiError}</p> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-7 py-5">
          <Button tone="ghost" onClick={onClose}>닫기</Button>
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "저장 중…" : user ? "변경사항 저장" : "계정 등록"}</Button>
        </div>
      </form>
    </div>
  );
}

function FormInput({
  label,
  type = "text",
  placeholder,
  error,
  registration,
}: {
  label: string;
  type?: string;
  placeholder?: string;
  error?: string;
  registration: UseFormRegisterReturn;
}) {
  return (
    <label className="block text-sm font-medium">
      {label} <span className="text-danger">*</span>
      <input
        type={type}
        placeholder={placeholder}
        className={cn("mt-2 h-11 w-full rounded-lg border px-3 outline-none focus:border-primary", error ? "border-danger" : "border-line")}
        {...registration}
      />
      {error ? <span className="mt-1.5 block text-xs text-danger">{error}</span> : null}
    </label>
  );
}

function DeleteConfirmModal({
  user,
  onClose,
  onDeleted,
}: {
  user: UserResponse;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-primary-deep/70 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-xl border border-line bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-bold">{user.name} 계정을 삭제할까요?</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          삭제하면 해당 직원은 로그인할 수 없고 계정 목록에서도 제외됩니다. 이 작업은 되돌릴 수 없습니다.
        </p>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button tone="ghost" onClick={onClose}>취소</Button>
          <Button
            tone="danger"
            disabled={pending}
            onClick={() => {
              setPending(true);
              void deleteUser(user.id).then(onDeleted).catch((reason: unknown) => {
                setError(readApiErrorMessage(reason));
                setPending(false);
              });
            }}
          >
            {pending ? "삭제 중…" : "계정 삭제"}
          </Button>
        </div>
      </div>
    </div>
  );
}
