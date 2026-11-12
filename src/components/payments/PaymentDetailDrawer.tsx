import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Copy, Info, RefreshCw, X } from "lucide-react";
import { Badge, Button } from "@/components/ui.tsx";
import { apiStatus, readApiErrorMessage } from "@/lib/apiClient.ts";
import {
  accountStatusLabel,
  accountStatusTone,
  bankLabel,
  effectiveAccountStatus,
  formatLocalDateTime,
  formatOffsetDateTime,
  formatPaymentAmount,
  paymentMethodLabel,
  paymentStatusLabel,
  paymentStatusTone,
  paymentTypeLabel,
} from "@/lib/paymentFormatters.ts";
import {
  getPaymentDetail,
  reissueVirtualAccount,
  type PaymentDetail,
  type PaymentIssueResponse,
  type VirtualAccount,
} from "@/lib/paymentApi.ts";
import { useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";

interface PaymentDetailDrawerProps {
  paymentId: number;
  onClose: () => void;
  onChanged: () => Promise<void>;
}

const orderLabels: Record<string, string> = {
  WAITING: "대기",
  CONFIRMED: "생산대기",
  IN_PRODUCTION: "생산중",
  PACKING: "포장중",
  READY_TO_SHIP: "출고대기",
  SHIPPING: "배송중",
  COMPLETED: "완료",
  ON_HOLD: "생산보류",
  CANCELLED: "취소",
};

export function PaymentDetailDrawer({ paymentId, onClose, onChanged }: PaymentDetailDrawerProps) {
  const role = useAuthStore((state) => state.user?.role);
  const showToast = useToastStore((state) => state.show);
  const [detail, setDetail] = useState<PaymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reissuing, setReissuing] = useState(false);
  const [reissueError, setReissueError] = useState("");
  const [reissueResult, setReissueResult] = useState<PaymentIssueResponse | null>(null);
  const reissueLockRef = useRef(false);

  const loadDetail = useCallback(async (preserveCurrent = false) => {
    setLoading(true);
    setError("");
    if (!preserveCurrent) setDetail(null);
    try {
      setDetail(await getPaymentDetail(paymentId));
    } catch (requestError: unknown) {
      setError(readApiErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [paymentId]);

  useEffect(() => {
    void Promise.resolve().then(() => loadDetail());
  }, [loadDetail]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !reissuing) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, reissuing]);

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      showToast(`${label}를 복사했습니다.`);
    } catch {
      showToast("복사하지 못했습니다. 값을 직접 선택해 주세요.");
    }
  }

  async function reissue() {
    if (reissueLockRef.current) return;
    reissueLockRef.current = true;
    setReissuing(true);
    setReissueError("");
    try {
      const result = await reissueVirtualAccount(paymentId);
      setReissueResult(result);
      setConfirmOpen(false);
      showToast("가상계좌를 재발급했습니다.");
      await Promise.allSettled([loadDetail(true), onChanged()]);
    } catch (requestError: unknown) {
      setConfirmOpen(false);
      setReissueError(reissueErrorMessage(requestError));
    } finally {
      reissueLockRef.current = false;
      setReissuing(false);
    }
  }

  const account = reissueResult?.virtualAccount ?? detail?.virtualAccount ?? null;
  const accountStatus = account ? effectiveAccountStatus(account.status) : null;
  const canManage = role === "SUPER_ADMIN" || role === "ORDER_MANAGER";
  const canReissue = Boolean(
    detail?.reissueAvailable
    && detail.payment.paymentMethod === "VA"
    && accountStatus === "EXPIRED"
    && canManage
    && !reissueResult,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-ink/35"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !reissuing) onClose();
      }}
    >
      <aside
        className="h-full w-full overflow-y-auto bg-white shadow-2xl sm:max-w-[420px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-detail-title"
      >
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-line bg-white px-5">
          <h2 id="payment-detail-title" className="text-lg font-semibold">입금상세내역</h2>
          <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-canvas disabled:opacity-40" disabled={reissuing} onClick={onClose} aria-label="닫기">
            <X size={20} />
          </button>
        </header>

        <div className="space-y-4 p-5">
          {loading && !detail ? <DrawerSkeleton /> : null}
          {error && !detail ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p>{error}</p>
              <Button tone="ghost" className="mt-3" onClick={() => void loadDetail()}>다시 시도</Button>
            </div>
          ) : null}

          {detail ? (
            <>
              {reissueResult ? <ReissueSuccess account={reissueResult.virtualAccount} onCopy={copy} /> : null}
              {reissueError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  <p>{reissueError}</p>
                  <button type="button" className="mt-2 font-semibold underline" onClick={() => void loadDetail(true)}>상세 정보 다시 조회</button>
                </div>
              ) : null}

              <DetailSection
                title="수주 정보"
                badge={<Badge className={orderTone(detail.order.orderStatus)}>{orderLabels[detail.order.orderStatus] ?? detail.order.orderStatus}</Badge>}
              >
                <DetailRow label="수주번호" value={detail.order.orderNumber} />
                <DetailRow label="거래처" value={detail.order.clientName} />
                <DetailRow label="수주 총액" value={formatPaymentAmount(detail.order.totalAmount)} />
              </DetailSection>

              <DetailSection
                title="결제건 정보"
                badge={<Badge className={paymentStatusTone(detail.payment.status)}>{paymentStatusLabel(detail.payment.status)}</Badge>}
              >
                <DetailRow label="결제구분" value={paymentTypeLabel(detail.payment.paymentType)} />
                <DetailRow label="결제 예정금액" value={formatPaymentAmount(detail.payment.scheduledAmount)} />
                <DetailRow label="결제상태" value={paymentStatusLabel(detail.payment.status)} />
                <DetailRow label="입금방식" value={paymentMethodLabel(detail.payment.paymentMethod)} />
                <DetailRow label="결제건 생성일" value={formatLocalDateTime(detail.payment.createdAt)} />
              </DetailSection>

              <DetailSection
                title="가상계좌 정보"
                badge={accountStatus ? <Badge className={accountStatusTone(accountStatus)}>{accountStatusLabel(accountStatus)}</Badge> : undefined}
              >
                {account && detail.payment.paymentMethod === "VA" ? (
                  <>
                    <DetailRow label="은행" value={bankLabel(account.bank)} />
                    <DetailRow
                      label="계좌번호"
                      value={<CopyValue value={account.accountNumber} onCopy={() => void copy(account.accountNumber, "계좌번호")} />}
                    />
                    <DetailRow label="예금주" value={account.accountName ?? "-"} />
                    <DetailRow label="입금기한" value={formatOffsetDateTime(account.expiresAt)} />
                    <DetailRow label="계좌 상태" value={accountStatus ? accountStatusLabel(accountStatus) : "-"} />
                    {canReissue ? (
                      <Button className="mt-3 w-full" disabled={reissuing} onClick={() => setConfirmOpen(true)}>
                        <RefreshCw size={16} className={reissuing ? "mr-2 animate-spin" : "mr-2"} />
                        가상계좌 재발급
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <div className="flex items-start gap-2 rounded-lg bg-canvas p-3 text-sm text-muted">
                    <Info size={17} className="mt-0.5 shrink-0" />
                    <p>{detail.payment.paymentMethod === "MD" ? "수동 입금 건으로 가상계좌가 없습니다." : "가상계좌 정보가 없습니다."}</p>
                  </div>
                )}
              </DetailSection>

              <DetailSection title="입금내역">
                <DetailRow label="실제 입금금액" value={formatPaymentAmount(detail.payment.actualPaidAmount)} />
                <DetailRow label="입금완료일" value={formatOffsetDateTime(detail.paymentHistory?.paidAt)} />
                <DetailRow
                  label="PortOne 거래 식별값"
                  value={detail.paymentHistory?.transactionId
                    ? <CopyValue value={detail.paymentHistory.transactionId} onCopy={() => void copy(detail.paymentHistory?.transactionId ?? "", "거래 식별값")} />
                    : "-"}
                />
              </DetailSection>
            </>
          ) : null}
        </div>
      </aside>

      {confirmOpen ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/45 p-4" role="dialog" aria-modal="true" aria-labelledby="reissue-confirm-title">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h3 id="reissue-confirm-title" className="text-lg font-semibold">가상계좌를 재발급할까요?</h3>
            <p className="mt-2 text-sm leading-6 text-muted">기존 계좌는 말소되며 더 이상 입금할 수 없습니다. 새 계좌는 서버에서 발급이 확인된 후 표시됩니다.</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button tone="ghost" disabled={reissuing} onClick={() => setConfirmOpen(false)}>취소</Button>
              <Button disabled={reissuing} onClick={() => void reissue()}>
                {reissuing ? <RefreshCw size={16} className="mr-2 animate-spin" /> : null}
                재발급
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DetailSection({ title, badge, children }: { title: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-line">
      <div className="flex min-h-11 items-center justify-between gap-3 bg-canvas px-4 py-2">
        <h3 className="font-semibold">{title}</h3>
        {badge}
      </div>
      <dl className="divide-y divide-line px-4">{children}</dl>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[118px_minmax(0,1fr)] gap-3 py-3 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-right font-medium break-words text-ink">{value}</dd>
    </div>
  );
}

function CopyValue({ value, onCopy }: { value: string; onCopy: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center justify-end gap-1.5">
      <span className="truncate">{value}</span>
      <button type="button" className="shrink-0 text-muted hover:text-primary" onClick={onCopy} aria-label={`${value} 복사`}>
        <Copy size={15} />
      </button>
    </span>
  );
}

function ReissueSuccess({ account, onCopy }: { account: VirtualAccount; onCopy: (value: string, label: string) => Promise<void> }) {
  const status = effectiveAccountStatus(account.status);
  return (
    <section className="overflow-hidden rounded-xl border border-teal-200 bg-teal-50">
      <div className="flex items-center gap-2 bg-primary px-4 py-3 font-semibold text-white">
        <CheckCircle2 size={19} />
        가상계좌 재발급 완료
      </div>
      <div className="px-4 py-3">
        <p className="text-sm leading-6 text-teal-800">새 가상계좌가 발급되었습니다. 이전 계좌는 자동 말소되어 입금할 수 없습니다.</p>
        <dl className="mt-3 divide-y divide-teal-200">
          <DetailRow label="은행" value={bankLabel(account.bank)} />
          <DetailRow label="계좌번호" value={<CopyValue value={account.accountNumber} onCopy={() => void onCopy(account.accountNumber, "계좌번호")} />} />
          <DetailRow label="예금주" value={account.accountName ?? "-"} />
          <DetailRow label="입금기한" value={formatOffsetDateTime(account.expiresAt)} />
          <DetailRow label="계좌 상태" value={<Badge className={accountStatusTone(status)}>{accountStatusLabel(status)}</Badge>} />
        </dl>
      </div>
    </section>
  );
}

function DrawerSkeleton() {
  return (
    <div className="space-y-4" aria-label="입금 상세 불러오는 중">
      {[1, 2, 3, 4].map((item) => (
        <div key={item} className="h-36 animate-pulse rounded-xl border border-line bg-canvas" />
      ))}
    </div>
  );
}

function orderTone(status: string): string {
  if (status === "COMPLETED") return "bg-emerald-50 text-emerald-700";
  if (status === "CANCELLED") return "bg-slate-100 text-slate-600";
  if (status === "SHIPPING") return "bg-sky-50 text-sky-700";
  if (status === "PACKING" || status === "READY_TO_SHIP") return "bg-violet-50 text-violet-700";
  if (status === "IN_PRODUCTION") return "bg-primary-soft text-primary";
  if (status === "ON_HOLD") return "bg-amber-50 text-amber-800";
  return "bg-slate-100 text-slate-600";
}

function reissueErrorMessage(error: unknown): string {
  const status = apiStatus(error);
  const serverMessage = readApiErrorMessage(error);
  if (status === 404) return "결제 정보를 찾을 수 없습니다. 목록과 상세 정보를 다시 조회해 주세요.";
  if (status === 409) return serverMessage;
  if (status === 400 || status === 401 || status === 403) return serverMessage;
  return "재발급 결과를 확인하지 못했습니다. 성공으로 처리하지 않았습니다. 상세 정보를 다시 조회해 주세요.";
}
