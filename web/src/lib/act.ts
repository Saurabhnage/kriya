// Which act of the demo story the mandate is in, derived purely from state so it is right
// after a refresh, for any viewer, whoever clicked what.

export type Act = 1 | 2 | 3 | 4 | 5 | "done";

export type ActInput = {
  mandateExists: boolean;
  allocated: boolean;
  violated: boolean;
  pendingViolated: boolean;
  guardrailShown: boolean;
  feedMatchesOnchain: boolean;
  lastExecutionTs: number | null;
  lastRiskChangeTs: number | null;
};

export const ACTS: { id: Act; label: string; next: string }[] = [
  { id: 1, label: "Program", next: "Program a mandate" },
  { id: 2, label: "Decide", next: "Preview decision, then Run loop" },
  { id: 3, label: "Guard", next: "Guardrail test" },
  { id: 4, label: "Reality", next: "Spike Strategy B → 48" },
  { id: 5, label: "Rebalance", next: "Run loop" },
  { id: "done", label: "Done", next: "Reset feed to replay" },
];

export function deriveAct(i: ActInput): Act {
  if (!i.mandateExists) return 1;
  if (!i.allocated) return 2;
  if (i.violated || i.pendingViolated) return 5;
  if (!i.guardrailShown) return 3;
  if (
    i.feedMatchesOnchain &&
    i.lastRiskChangeTs !== null &&
    i.lastExecutionTs !== null &&
    i.lastExecutionTs > i.lastRiskChangeTs
  ) {
    return "done";
  }
  return 4;
}
