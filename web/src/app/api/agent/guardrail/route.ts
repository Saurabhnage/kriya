import { guardrailTest } from "@/lib/server/loop";
import { fail, json, parseUser, limited } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const blocked = await limited("guardrail", 3, 60);
  if (blocked) return blocked;
  try {
    return json(await guardrailTest(parseUser((await request.json()).user)));
  } catch (err) {
    return fail(err);
  }
}
