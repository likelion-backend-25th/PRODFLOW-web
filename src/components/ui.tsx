import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn.ts";

export function Button({
  tone = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "ghost" | "danger" }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-lg px-4 font-semibold disabled:opacity-40",
        tone === "primary" && "bg-primary text-white",
        tone === "ghost" && "border border-line bg-white text-ink",
        tone === "danger" && "bg-danger text-white",
        className,
      )}
      {...props}
    />
  );
}

export const TextField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: string; icon?: ReactNode }>(
  function TextField({ label, className, icon, ...props }, ref) {
    return (
      <label className="block text-sm">
        <span className="mb-1 block text-muted">{label}</span>
        <span className="relative block">
          {icon ? <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">{icon}</span> : null}
          <input ref={ref} className={cn("h-10 w-full rounded-lg border border-line bg-white px-3", icon && "pl-9", className)} {...props} />
        </span>
      </label>
    );
  },
);

export function SelectField({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <select className="h-10 w-full rounded-lg border border-line bg-white px-3" {...props}>
        {children}
      </select>
    </label>
  );
}

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold", className)}>{children}</span>;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-xl border border-line bg-white p-5", className)}>{children}</section>;
}

export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {action}
    </div>
  );
}

export const tableClass = "w-full text-left [&_tbody_tr]:border-b [&_tbody_tr]:border-line [&_tbody_tr:last-child]:border-0 [&_tbody_tr:hover]:bg-primary-soft/40 [&_td]:px-4 [&_td]:py-3 [&_th]:px-4 [&_th]:py-3 [&_th]:font-medium";
