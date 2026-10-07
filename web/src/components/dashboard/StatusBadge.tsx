"use client";

import type { StateResponse } from "@/lib/client";
import { statusOf } from "./shared";

export function StatusBadge({ state }: { state: StateResponse }) {
  const st = statusOf(state);
  return (
    // keyed on the status so the flash replays whenever it changes
    <div key={st.key} className={`flash flex items-center gap-2 rounded-full border px-3 py-1 ${st.tone}`} title={st.sub}>
      <span className="text-sm font-bold tracking-wide">{st.label}</span>
      <span className="hidden text-xs text-muted xl:inline">{st.sub}</span>
    </div>
  );
}
