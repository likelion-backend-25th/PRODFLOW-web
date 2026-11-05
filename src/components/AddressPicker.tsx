import { MapPin } from "lucide-react";
import { useState } from "react";
import { sampleAddresses } from "@/lib/addresses.ts";
import { Button } from "@/components/ui.tsx";

export function AddressPicker({ label, value, onChange, compact }: { label: string; value: string; onChange: (value: string) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <span className={compact ? "mb-1 block text-sm font-medium text-ink" : "mb-1 block text-sm text-muted"}>{label}</span>
      {compact ? (
        <div className="relative">
          <input readOnly value={value} placeholder="주소 검색으로 선택" className="h-10 w-full cursor-pointer rounded-lg border border-line bg-white px-3 pr-9 text-sm" onClick={() => setOpen((current) => !current)} />
          <button type="button" aria-label="주소 검색" className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted hover:bg-canvas" onClick={() => setOpen((current) => !current)}>
            <MapPin size={15} />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input readOnly value={value} placeholder="주소 검색으로 선택" className="h-10 w-full rounded-lg border border-line bg-white px-3" />
          <Button tone="ghost" className="shrink-0 whitespace-nowrap" onClick={() => setOpen((current) => !current)}>
            주소 검색
          </Button>
        </div>
      )}
      {open ? (
        <ul className="mt-2 rounded-lg border border-line bg-white">
          {sampleAddresses.map((item) => (
            <li key={item.road}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left hover:bg-primary-soft"
                onClick={() => {
                  onChange(item.road);
                  setOpen(false);
                }}
              >
                {item.road}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
