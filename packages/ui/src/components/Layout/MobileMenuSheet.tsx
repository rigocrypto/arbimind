"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/config/nav";

export function MobileMenuSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const pathname = usePathname();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        className="absolute inset-0 bg-black/60"
        onClick={() => onOpenChange(false)}
        aria-label="Close menu"
      />

      <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl border border-white/10 bg-[#0b1220] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-white/80">Navigation</div>
          <button
            onClick={() => onOpenChange(false)}
            className="px-3 py-1 rounded-md bg-white/10 text-sm text-white/80"
          >
            Close
          </button>
        </div>

        <div className="grid gap-1 pb-2">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => onOpenChange(false)}
                className={[
                  "px-3 py-3 rounded-lg text-sm transition",
                  active
                    ? "bg-white/10 text-white"
                    : "text-white/70 hover:bg-white/5 hover:text-white",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
