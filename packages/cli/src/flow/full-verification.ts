// SPDX-License-Identifier: Apache-2.0
import { fullVerificationWaitNote } from "@baquia-dev/specty-core";
import type { Session } from "../session";
import { holdsFullVerification, liveHolder, lockFullVerification } from "../store/lock";
import { joinTurnQueue } from "../store/turn-queue";
import type { Integration } from "./integrate";

/** How often a full verification waiting for its turn looks again. */
const POLL_MS = 2000;

/** The id under which `liveHolder` finds the full verification's turn. */
const FULL_VERIFICATION = "full-verification";

/**
 * Runs `run`, a full verification with `command`, on this session's turn: one at a time in the
 * clone, in order of arrival. It waits in the turn's queue while another session's live process
 * holds the turn or arrived first, says once who holds it and how many wait ahead, and never runs
 * without the turn: the holder's own command ends by `verify.timeoutSec`. A process that already
 * holds the turn, as a closing that verifies its incorporation, runs at once. The turn is freed
 * when it ends, also on failure.
 */
export async function oneAtATime<T>(
  session: Session,
  command: string,
  run: () => Promise<T>,
  options: { readonly pollMs?: number } = {},
): Promise<T> {
  if (await holdsFullVerification(session.git)) return run();
  const holder = {
    pid: process.pid,
    command,
    folder: session.root,
    at: session.environment.now().toISOString(),
  };
  const place = await joinTurnQueue(session.git, holder);
  let said = false;
  try {
    for (;;) {
      const ahead = await place.ahead();
      const lock = ahead === 0 ? await lockFullVerification(session.git, holder) : undefined;
      if (lock?.kind === "taken") {
        await place.leave();
        try {
          return await run();
        } finally {
          await lock.release();
        }
      }
      const current = lock?.holder ?? (await liveHolder(session.git, FULL_VERIFICATION));
      if (!said && current !== undefined) {
        session.environment.io.err(fullVerificationWaitNote(current, session.lang, ahead));
        said = true;
      }
      await new Promise((done) => setTimeout(done, options.pollMs ?? POLL_MS));
    }
  } finally {
    await place.leave();
  }
}

/**
 * Runs `run`, which incorporates main into the change and lands it there, on the full
 * verification's turn, held from before the merge until main moved: no other session lands
 * meanwhile and leaves this merge behind. The verification inside gets the same turn, as the lock
 * is this process's. Without a landing (`plan`) or a full verification, it runs at once.
 */
export function landingTurn<T>(
  session: Session,
  plan: Integration | undefined,
  run: () => Promise<T>,
): Promise<T> {
  const command = session.config.verify.full ?? session.config.verify.default;
  return plan === undefined || command === undefined ? run() : oneAtATime(session, command, run);
}
