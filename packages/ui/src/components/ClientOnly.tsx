"use client";

import { useHydrated } from "@/hooks/useHydrated";

export default function ClientOnly({ children }: { children: React.ReactNode }) {
  const mounted = useHydrated();

  if (!mounted) return null;
  return <>{children}</>;
}
