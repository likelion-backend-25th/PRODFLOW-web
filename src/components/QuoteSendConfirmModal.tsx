import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui.tsx";

export type QuotePdfPreviewStatus = "empty" | "loading" | "error" | "ready";

export function QuoteSendConfirmModal({
  companyName,
  email,
  pdfUrl = null,
  pdfStatus = "empty",
  onClose,
  onSend,
}: {
  companyName: string;
  email: string;
  pdfUrl?: string | null;
  pdfStatus?: QuotePdfPreviewStatus;
  onClose: () => void;
  onSend: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [sending, setSending] = useState(false);
  const sendLinked = false;
  const preview = pdfStatus === "empty" && pdfUrl ? "ready" : pdfStatus;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!sending) onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")]
        .filter((item) => !item.hasAttribute("disabled"));
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [onClose, sending]);

  function confirmSend() {
    if (!sendLinked || sending) return;
    setSending(true);
    onSend();
  }

  function close() {
    if (sending) return;
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <div
        ref={dialogRef}
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quote-send-title"
        tabIndex={-1}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="quote-send-title" className="font-semibold">견적서 미리보기 및 발송 확인</h2>
          <button type="button" className="rounded-lg p-1 text-muted hover:bg-canvas disabled:opacity-40" aria-label="닫기" disabled={sending} onClick={close}><X size={18} /></button>
        </div>
        <div className="grid gap-4 border-b border-line px-5 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(16rem,auto)]">
          <div>
            <p className="text-xs text-muted">거래처명</p>
            <p className="mt-1 font-semibold">{companyName}</p>
          </div>
          <div className="rounded-lg bg-primary-soft px-4 py-3">
            <p className="text-xs font-semibold text-primary">수신 이메일</p>
            <p className="mt-1 break-all text-lg font-semibold text-ink">{email}</p>
          </div>
        </div>
        <div className="min-h-0 flex-1 px-5 py-4">
          <div className="h-[min(60vh,40rem)] overflow-auto rounded-lg border border-dashed border-line bg-canvas" aria-busy={preview === "loading"}>
            {preview === "loading" ? (
              <p className="grid h-full min-h-48 place-items-center px-6 text-sm text-muted">견적서를 불러오는 중입니다.</p>
            ) : null}
            {preview === "error" ? (
              <p className="grid h-full min-h-48 place-items-center px-6 text-sm text-danger">견적서 미리보기를 불러오지 못했습니다.</p>
            ) : null}
            {preview === "empty" ? (
              <p className="grid h-full min-h-48 place-items-center px-6 text-center text-sm text-muted">견적서 PDF 미리보기가 표시될 영역입니다.</p>
            ) : null}
            {preview === "ready" && pdfUrl ? (
              <iframe title="견적서 PDF 미리보기" src={pdfUrl} className="h-full min-h-[40rem] w-full bg-white" />
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
          <p className="text-sm text-muted">위 견적서를 해당 이메일로 발송하시겠습니까?</p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <p id="quote-send-pending" className="text-xs text-muted">발송 기능 연동 예정</p>
            <Button tone="ghost" disabled={sending} onClick={close}>수정</Button>
            <Button disabled={!sendLinked || sending} aria-describedby="quote-send-pending" onClick={confirmSend}>
              {sending ? "발송 중…" : "견적 발송"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
