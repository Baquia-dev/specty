// SPDX-License-Identifier: Apache-2.0
import { fullVerificationWaitNote } from "@baquia-dev/specty-core";
import type { Session } from "../session";
import { lockFullVerification } from "../store/lock";

/** How often a full verification waiting for its turn looks again. */
const POLL_MS = 2000;

/**
 * Runs `run`, a full verification with `command`, on this session's turn: one at a time in the
 * clone. While another session's live process holds the turn, it says who, once, and waits, up to
 * `verify.timeoutSec`, after which it runs anyway. The turn is freed when it ends, also on failure.
 */
export async function oneAtATime<T>(
  session: Session,
  command: string,
  run: () => Promise<T>,
  options: { readonly pollMs?: number } = {},
): Promise<T> {
  const holder = {
    pid: process.pid,
    command,
    folder: session.root,
    at: session.environment.now().toISOString(),
  };
  const deadline = Date.now() + session.config.verify.timeoutSec * 1000;
  let said = false;
  for (;;) {
    const lock = await lockFullVerification(session.git, holder);
    if (lock.kind === "taken") {
      try {
        return await run();
      } finally {
        await lock.release();
      }
    }
    if (!said) session.environment.io.err(fullVerificationWaitNote(lock.holder, session.lang));
    said = true;
    if (Date.now() >= deadline) return run();
    await new Promise((done) => setTimeout(done, options.pollMs ?? POLL_MS));
  }
}
