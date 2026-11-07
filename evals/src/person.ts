// SPDX-License-Identifier: Apache-2.0
import { specty } from "./repo";

/**
 * The person of an experiment who decides while the agent runs (ARCHITECTURE §16): with delegated
 * mode off, they approve, accept and close what waits for them, in any folder, from the main one,
 * as `specty status` lists it. Like a person who comes back to the terminal, they decide on a
 * change once it has waited for them `delayMs`, so the agent is already waiting with `specty wait`.
 */

/** What the person reads of each open change in `specty status --json`. */
interface Waiting {
  readonly id: string;
  readonly phase: string;
  readonly waitingFor: string;
  readonly pendingScope: readonly string[];
}

/**
 * The person's decision on a change that waits for them: a scope request, the spec or the tests
 * (`approve`), the result (`accept`) or the closing (`close`); none for another phase.
 */
export function decisionOf(change: Waiting): readonly string[] | undefined {
  const [scope] = change.pendingScope;
  if (scope !== undefined) return ["approve", change.id, "--scope", scope];
  if (change.phase === "review" || change.phase === "testing") return ["approve", change.id];
  if (change.phase === "acceptance") return ["accept", change.id];
  if (change.phase === "closing") return ["close", change.id];
  return undefined;
}

/** The open changes that wait for the person, by `specty --json status` in `root`. */
async function waiting(root: string): Promise<Waiting[]> {
  const { out } = await specty(root, ["--json", "status"]);
  const changes = parsed(out)?.changes;
  return (Array.isArray(changes) ? changes : []).filter(isWaiting);
}

function parsed(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return isObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function isWaiting(value: unknown): value is Waiting {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.phase === "string" &&
    value.waitingFor === "human" &&
    Array.isArray(value.pendingScope) &&
    value.pendingScope.every((scope) => typeof scope === "string")
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface Person {
  /** One look at `now`: the decisions taken, each a command line of `specty`. */
  look(now: number): Promise<readonly (readonly string[])[]>;
}

/**
 * A person at the terminal of `root` who decides on each change once it has waited for them
 * `delayMs`: since the first look that saw it waiting, at the same step.
 */
export function person(root: string, delayMs: number): Person {
  const since = new Map<string, number>();
  return {
    async look(now) {
      const taken: (readonly string[])[] = [];
      for (const change of await waiting(root)) {
        const decision = decisionOf(change);
        if (decision === undefined) continue;
        const key = decision.join(" ");
        const first = since.get(key) ?? now;
        since.set(key, first);
        if (now - first < delayMs) continue;
        await specty(root, decision, { person: true });
        taken.push(decision);
      }
      return taken;
    },
  };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** How long a step waits for the person before they decide it, and how often they look. */
const TIMING = { delayMs: 20_000, intervalMs: 2_000 };

/** The person looks every `intervalMs` while `running()` says the agent runs. */
export async function attend(
  root: string,
  running: () => boolean,
  { delayMs, intervalMs } = TIMING,
): Promise<void> {
  const at = person(root, delayMs);
  while (running()) {
    await at.look(Date.now());
    await sleep(intervalMs);
  }
}
