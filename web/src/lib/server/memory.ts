import "server-only";
import { LivingBrainClient } from "@living-brain/sdk";
import { getJson, setJson } from "./store";

// ChatAndBuild Living Brain: KRIYA's persistent memory.
// - "market" subject: every market regime the risk engine observed, with the scores it produced.
// - one subject per mandate owner: their objective, every decision Claude made, and its onchain outcome.
// Before each decision the agent RETRIEVES similar past regimes and its own past decisions, and
// CONNECTS them to the current one (Claude cites them in its rationale). Without a key, a local
// fallback keeps the app working (it does not qualify for the ChatAndBuild track).

const KEY = () => process.env.LIVING_BRAIN_API_KEY?.trim();
const BRAIN_NAME = process.env.LIVING_BRAIN_NAME?.trim() || "KRIYA";
export const memoryMode = () => (KEY() ? "living-brain" : "local-fallback");

export type Memory = { title: string; summary: string; similarity: number | null; pageType?: string; slug?: string };
type Subject = "market" | `user:${string}`;

const brains = new Map<string, { client: LivingBrainClient; brainId: string }>();

async function brainFor(subject: Subject) {
  const hit = brains.get(subject);
  if (hit) return hit;
  const client = new LivingBrainClient({ apiKey: KEY()!, subjectId: `kriya:${subject.toLowerCase()}` });
  const existing = (await client.brains.list()) ?? [];
  const brain = existing.find((b) => b.name === BRAIN_NAME) ?? (await client.brains.create({ name: BRAIN_NAME }));
  const entry = { client, brainId: brain.id };
  brains.set(subject, entry);
  return entry;
}

type LocalNote = { title: string; content: string; ts: number };
const localKey = (s: Subject) => `memory-${s.toLowerCase()}`;

export async function remember(subject: Subject, title: string, content: string): Promise<void> {
  try {
    if (!KEY()) {
      const list = (await getJson<LocalNote[]>(localKey(subject))) ?? [];
      list.push({ title, content, ts: Date.now() });
      await setJson(localKey(subject), list.slice(-200));
      return;
    }
    const { client, brainId } = await brainFor(subject);
    await client.captures.capture({ brainId, body: { kind: "note", label: title, content, bucket: "projects" } });
  } catch (err) {
    console.warn("[memory] capture failed:", err instanceof Error ? err.message : err);
  }
}

export async function recall(subject: Subject, query: string, limit = 4): Promise<Memory[]> {
  try {
    if (!KEY()) {
      const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
      return ((await getJson<LocalNote[]>(localKey(subject))) ?? [])
        .map((n) => ({ n, score: words.filter((w) => `${n.title} ${n.content}`.toLowerCase().includes(w)).length }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || b.n.ts - a.n.ts)
        .slice(0, limit)
        .map(({ n }) => ({ title: n.title, summary: n.content.slice(0, 400), similarity: null, pageType: "local" }));
    }
    const { client, brainId } = await brainFor(subject);
    const results = (await client.workspace.searchPages({ brainId, query })) ?? [];
    return results.slice(0, limit).map((r) => ({ title: r.title, summary: r.summary, similarity: r.similarity, pageType: r.pageType, slug: r.slug }));
  } catch (err) {
    console.warn("[memory] search failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

/** Living Brain's synthesized brief of the market memory (last 7 days of captured regimes). */
export async function marketBrief(): Promise<{ title: string; summary: string; body: string } | null> {
  if (!KEY()) return null;
  const { client, brainId } = await brainFor("market");
  const run = await client.brains.runBrief({ brainId });
  if (!run) return null;
  const page = await client.workspace.getPage({ brainId, slug: run.slug });
  return { title: page.title, summary: page.summary, body: page.body };
}
