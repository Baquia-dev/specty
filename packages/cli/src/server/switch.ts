// SPDX-License-Identifier: Apache-2.0
import { isRecord } from "../io/files";
import type { Session } from "../session";
import { switchLog, turnSwitch } from "../store/switch";
import type { Answer } from "./config";
import type { Context } from "./context";

const PATH = "/api/switch";

/**
 * `GET /api/switch`: Specty's switch as the UI shows it (formats §1): its state, who changed it
 * last and when, and its log, the most recent first. On, without who nor when, while the log is
 * empty.
 */
export async function switchView(session: Session) {
  const log = await switchLog(session.git);
  const [last] = log;
  return last === undefined ? { on: true, log } : { ...last, log };
}

/**
 * `POST /api/switch` with `{ on }`: the person turns Specty off or on from the UI, as git's
 * `user.name`, and gets the new view. The state it already has adds no line. `act` already
 * refused it on a read-only server and without the token; none for any other path.
 */
export async function switchPost(
  context: Context,
  pathname: string,
  body: unknown,
): Promise<Answer | undefined> {
  if (pathname !== PATH) return undefined;
  const on = isRecord(body) ? body.on : undefined;
  if (typeof on !== "boolean") return { status: 400, body: { error: "bad request" } };
  const { session } = context;
  return context.serial(async () => {
    const by = (await session.git.config("user.name")) ?? "unknown";
    await turnSwitch(session.git, { on, by, at: session.environment.now().toISOString() });
    return { status: 200, body: await switchView(session) };
  });
}
