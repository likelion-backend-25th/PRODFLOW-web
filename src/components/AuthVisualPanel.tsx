export function AuthVisualPanel() {
  return (
    <section className="relative hidden min-h-dvh bg-[#0f343b] lg:block">
      <img
        src="/login-panel.png"
        alt="PRODFLOW. 생산의 모든 흐름을, 하나의 기준으로."
        className="absolute inset-0 h-full w-full object-cover object-center"
        draggable={false}
      />
    </section>
  );
}
