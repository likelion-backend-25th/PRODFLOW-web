import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui.tsx";
import { readApiErrorMessage } from "@/lib/apiClient.ts";
import { localDateTime, todayISO } from "@/lib/dates.ts";
import { formatWon } from "@/lib/money.ts";
import {
  getOrder,
  getOrderPayments,
  sendPaymentNotification,
  type OrderDetail,
  type OrderPayments,
  type PaymentNotificationResult,
} from "@/lib/orderApi.ts";

interface Props {
  orderId: number;
  onClose: () => void;
  onComplete: () => Promise<void>;
}

interface NotificationSnapshot {
  order: OrderDetail;
  payments: OrderPayments;
}

export function PaymentNotificationModal({ orderId, onClose, onComplete }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  const requestId = useRef(crypto.randomUUID());
  const [snapshot, setSnapshot] = useState<NotificationSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PaymentNotificationResult | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    let ignore = false;
    Promise.all([getOrder(orderId), getOrderPayments(orderId)])
      .then(([order, payments]) => {
        if (!ignore) {
          setSnapshot({ order, payments });
          setLoading(false);
        }
      })
      .catch((failure: unknown) => {
        if (!ignore) {
          setError(readApiErrorMessage(failure));
          setLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, [orderId, reload]);

  function retryLoad() {
    setError("");
    setLoading(true);
    setReload((value) => value + 1);
  }

  async function send() {
    if (!snapshot || busy.current) {
      return;
    }
    busy.current = true;
    setSending(true);
    setError("");
    try {
      const response = await sendPaymentNotification(snapshot.order, snapshot.payments, requestId.current);
      setResult(response);
      // 확정 실패 응답만 새 요청으로 재시도한다. 네트워크 오류는 같은 요청 ID를 유지한다.
      if (response.status === "FAILED" || response.status === "ISSUE_UNCERTAIN") {
        requestId.current = crypto.randomUUID();
      }
      try {
        await onComplete();
      } catch {
        setError("발송 결과는 아래와 같습니다. 상세 정보를 새로고침하지 못했습니다.");
      }
    } catch (failure: unknown) {
      setError(readApiErrorMessage(failure));
    } finally {
      busy.current = false;
      setSending(false);
    }
  }

  const order = snapshot?.order;
  const account = snapshot?.payments.payments
    .find((payment) => payment.paymentType === "DEPOSIT")?.virtualAccount;
  const isSent = result?.status === "SENT";
  const isPending = result?.status === "PROCESSING" || result?.status === "SENDING";
  const canSend = order?.status === "WAITING"
    && order.depositDueDate != null
    && order.depositDueDate >= todayISO()
    && !snapshot?.payments.payments.some(
      (payment) => payment.paymentType === "DEPOSIT" && payment.status === "PAID",
    );

  return (
    <dialog
      ref={dialog}
      aria-labelledby="payment-notification-title"
      onCancel={(event) => {
        if (busy.current) {
          event.preventDefault();
        } else {
          onClose();
        }
      }}
      className="m-auto max-h-[90vh] w-[min(900px,95vw)] overflow-y-auto rounded-xl border border-line bg-white p-6 text-ink backdrop:bg-black/40"
    >
      <h2 id="payment-notification-title" className="text-xl font-semibold">
        가상계좌 발급 및 결제정보 발송
      </h2>
      {loading ? <p className="mt-4" role="status">수주 및 결제정보를 조회하고 있습니다.</p> : null}
      {error ? <p className="mt-4 text-danger" role="alert">{error}</p> : null}
      {!loading && !snapshot ? (
        <Button className="mt-4" onClick={retryLoad}>다시 조회</Button>
      ) : null}
      {order && snapshot ? (
        <div className="mt-4 space-y-4">
          <dl className="space-y-1 text-sm">
            <div>
              <dt className="inline">수주번호: </dt>
              <dd className="inline">{order.orderNo}</dd>
            </div>
            <div>
              <dt className="inline">거래처: </dt>
              <dd className="inline">{order.client.companyName}</dd>
            </div>
            <div>
              <dt className="inline">수신 이메일: </dt>
              <dd className="inline">{order.client.email}</dd>
            </div>
          </dl>
          <p className="text-sm text-muted">단가는 부가세 {order.vatIncluded ? "포함" : "별도"} 금액입니다.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="p-2">품목</th>
                  <th className="p-2 text-right">수량</th>
                  <th className="p-2 text-right">단가</th>
                  <th className="p-2 text-right">공급가액</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id} className="border-b border-line">
                    <td className="p-2">{item.productName}</td>
                    <td className="p-2 text-right">{item.quantity.toLocaleString("ko-KR")}개</td>
                    <td className="p-2 text-right">{formatWon(item.unitPrice)}</td>
                    <td className="p-2 text-right">{formatWon(item.supplyAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="space-y-2 rounded-lg bg-primary-soft p-4 text-sm">
            <div className="flex justify-between">
              <dt>공급가액 합계</dt><dd>{formatWon(order.supplyAmount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>부가세</dt><dd>{formatWon(order.vatAmount)}</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>수주 총액</dt><dd>{formatWon(order.totalAmount)}</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>이번 계약금 청구액</dt><dd>{formatWon(snapshot.payments.depositAmount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>계약금 마감일</dt><dd>{order.depositDueDate}</dd>
            </div>
          </dl>
          {account ? (
            <div className="text-sm">
              <p>기존 계좌: {account.bank ?? account.bankCode} {account.accountNumber} ({account.status})</p>
              <p>예금주: {account.accountName || "-"}</p>
              <p>계좌 만료일시: {account.expiresAt ? localDateTime(account.expiresAt) : "-"}</p>
            </div>
          ) : <p className="text-sm text-muted">발송 시 가상계좌가 발급됩니다.</p>}
          <p className="text-sm text-muted">
            계좌 만료일과 관계없이 계약금 마감일까지 입금해야 합니다. 이메일은 위 수신처로 발송됩니다.
          </p>
          {!canSend ? (
            <p className="text-sm text-danger">현재 수주 상태 또는 계약금 마감일을 확인해주세요. 발송할 수 없습니다.</p>
          ) : null}
        </div>
      ) : null}
      {result ? <p className="mt-4 text-sm" role="status">{result.message}</p> : null}
      <div className="mt-6 flex justify-end gap-2">
        <Button tone="ghost" disabled={sending} onClick={onClose}>{isSent ? "닫기" : "취소"}</Button>
        {!isSent ? (
          <Button disabled={!snapshot || loading || sending || isPending || !canSend} onClick={() => void send()}>
            {sending ? "발급 및 발송 중..." : "발송"}
          </Button>
        ) : null}
      </div>
    </dialog>
  );
}
