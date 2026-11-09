// SPDX-License-Identifier: Apache-2.0
import type { Session } from "../session";
import { type Lock, lockNewChange } from "../store/lock";

/**
 * The waits, in milliseconds, between the tries of `new`'s turn: from 50 ms, each twice the last
 * up to 1 s, about 60 s in all, more than a slow Windows runner takes to create a change's folder.
 */
const NEW_TURN_WAITS: readonly number[] = Array.from({ length: 64 }, (_, index) =>
  Math.min(50 * 2 ** index, 1000),
);

type Taken = Extract<Lock, { readonly kind: "taken" }>;

/**
 * Runs `run`, the steps of `new` that create a change's folder, its branch and its state, in the
 * turn of `new` on Windows (`lockNewChange`). There, two `new` of one clone at once trip over
 * what they share: git cannot rename `.git/config.lock` while another git has the file open, the
 * git commands that read it meanwhile fail, and one's clean-up looks at `.worktrees/` while the
 * other makes its folder there. A turn another process holds is tried again after each of
 * `waits`; after the last, `run` goes without it, as it did before. Elsewhere `run` goes at once.
 */
export async function onNewTurn<T>(
  session: Session,
  run: () => Promise<T>,
  platform: NodeJS.Platform = process.platform,
  waits: readonly number[] = NEW_TURN_WAITS,
): Promise<T> {
  if (platform !== "win32") return run();
  const turn = await takeTurn(session, waits);
  try {
    return await run();
  } finally {
    await turn?.release();
  }
}

/**
 * The turn of `new`, tried again after each of `waits` while another process holds it or Windows
 * refuses one of its files for a moment; undefined once the waits run out.
 */
async function takeTurn(session: Session, waits: readonly number[]): Promise<Taken | undefined> {
  const holder = {
    pid: process.pid,
    command: "new",
    folder: session.root,
    at: session.environment.now().toISOString(),
  };
  for (const wait of [...waits, undefined]) {
    const lock = await lockNewChange(session.git, holder).catch(() => undefined);
    if (lock?.kind === "taken") return lock;
    if (wait === undefined) return undefined;
    await new Promise((done) => setTimeout(done, wait));
  }
  return undefined;
}
