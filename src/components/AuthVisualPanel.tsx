import { ChevronRight, Layers3 } from "lucide-react";

const STEPS = ["수주", "생산", "배송", "기록"];

export function AuthVisualPanel() {
  return (
    <section className="relative hidden min-h-screen overflow-hidden bg-primary-deep lg:block">
      <img src="/login-panel.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-primary-deep/55" />
      <div className="relative flex h-full min-h-screen flex-col justify-between px-10 py-8 text-white xl:px-12">
        <div className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-lg border border-white/30 bg-white/10">
            <Layers3 size={15} />
          </span>
          <span className="text-base font-semibold tracking-wide">PRODFLOW</span>
        </div>
        <div className="mt-auto mb-14 max-w-md">
          <p className="flex items-center gap-3 text-xs tracking-[0.16em] text-white/80">
            <span className="h-px w-8 bg-primary" />
            PRODUCTION, IN FLOW
          </p>
          <h1 className="mt-6 text-4xl leading-tight font-semibold">
            생산의 모든 흐름을,
            <br />
            하나의 기준으로.
          </h1>
          <p className="mt-5 text-sm leading-7 text-white/75">
            수주부터 생산, 배송과 기록까지.
            <br />
            흩어진 업무를 연결하고 더 정확한 운영을 시작하세요.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-2 text-xs">
            {STEPS.map((step, index) => (
              <span key={step} className="flex items-center gap-2">
                <span className="rounded border border-white/25 bg-white/5 px-3 py-2">{step}</span>
                {index < STEPS.length - 1 ? <ChevronRight size={13} className="text-white/60" /> : null}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-white/15 pt-5 text-[11px] text-white/60">
          <span>임직원을 위한 생산 운영 플랫폼</span>
          <span>생산플로우 / 2026</span>
        </div>
      </div>
    </section>
  );
}
