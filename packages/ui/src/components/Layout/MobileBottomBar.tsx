"use client";

import { useState } from "react";
import { MobileMenuSheet } from "./MobileMenuSheet";

export function MobileBottomBar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#0b1220]/90 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="h-14 px-4 flex items-center justify-between">
          <button
            onClick={() => setOpen(true)}
            className="h-10 w-10 grid place-items-center rounded-md hover:bg-white/5"
            aria-label="Open menu"
          >
            <div className="space-y-1.5">
              <span className="block h-0.5 w-5 bg-white/80" />
              <span className="block h-0.5 w-5 bg-white/80" />
              <span className="block h-0.5 w-5 bg-white/80" />
            </div>
          </button>

          {/* optional center: status */}
          <div className="text-xs text-white/70">Menu</div>

          {/* optional right: quick action placeholder */}
          <div className="w-10" />
        </div>
      </div>

      <MobileMenuSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
