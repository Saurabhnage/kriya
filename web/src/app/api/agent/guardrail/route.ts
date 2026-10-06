import { guardrailTest } from "@/lib/server/loop";
import { fail, json, parseUser } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    return json(await guardrailTest(parseUser((await request.json()).user)));
  } catch (err) {
    return fail(err);
  }
}
