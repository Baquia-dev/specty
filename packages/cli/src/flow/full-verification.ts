// SPDX-License-Identifier: Apache-2.0
import {
  fullVerificationWaitNote,
  type ResolvedConfig,
  type VerifyUnit,
} from "@baquia-dev/specty-core";
import type { Session } from "../session";
import {
  holdsFullVerification,
  liveHolder,
  lockFullVerification,
  onFullVerificationTurn,
} from "../store/lock";
import { joinTurnQueue } from "../store/turn-queue";
import { inSlots } from "../store/verify-slots";
import type { Integration } from "./integrate";

/** The id under which `liveHolder` finds the full verification's turn. */
const FULL_VERIFICATION = "full-verification";

/**
 * The command of the full verification: `verify.full` or, with `verify.units`, the commands of
 * every unit joined with `&&`, which do the same; none without either.
 */
export function fullCommand(config: Pick<ResolvedConfig, "verify">): string | undefined {
  const { units, full } = config.verify;
  return units === undefined ? full : unitsCommand(units);
}

/** The commands of `units` joined with `&&`: in order, and the first that fails stops the rest. */
export const unitsCommand = (units: readonly VerifyUnit[]): string =>
  units.map(({ command }) => command).join(" && ");

/**
 * Runs `run`, a full verification with `command`, on this session's turn and with every one of
 * the clone's verification places (`inSlots`): no other verification runs meanwhile, and those
 * under way end first. What runs inside the holder of the turn, as the verification of a
 * closing's incorporation, only waits for the places.
 */
export function oneAtATime<T>(
  session: Session,
  command: string,
  run: () => Promise<T>,
  options: { readonly pollMs?: number } = {},
): Promise<T> {
  const everyPlace = () => inSlots(session, Number.POSITIVE_INFINITY, command, run, options);
  return onTurn(session, command, everyPlace, options);
}

/**
 * Runs `run` on this session's turn of the full verification: one at a time in the clone, in
 * order of arrival. It waits in the turn's queue while another session's live process holds the
 * turn or arrived first, says once who holds it and how many wait ahead, and never runs without
 * the turn: the holder's own command ends by `verify.timeoutSec`. It looks again every
 * `internal.waits.verifyIntervalMs` (`pollMs`, in tests). What runs inside the holder
 * runs at once; another part of the same process, as an action of the UI's server while it
 * verifies another change, waits as another session would. The turn is freed when it ends, also
 * on failure.
 */
async function onTurn<T>(
  session: Session,
  command: string,
  run: () => Promise<T>,
  options: { readonly pollMs?: number },
): Promise<T> {
  if (await holdsFullVerification(session.git)) return run();
  const holder = {
    pid: process.pid,
    command,
    folder: session.root,
    at: session.environment.now().toISOString(),
  };
  const pollMs = options.pollMs ?? session.config.internal.waits.verifyIntervalMs;
  const { queueStaleSec } = session.config.internal.waits;
  const place = await joinTurnQueue(session.git, holder, { staleSec: queueStaleSec, pollMs });
  let said = false;
  try {
    for (;;) {
      const ahead = await place.ahead();
      const lock = ahead === 0 ? await lockFullVerification(session.git, holder) : undefined;
      if (lock?.kind === "taken") {
        await place.leave();
        try {
          return await onFullVerificationTurn(session.git, run);
        } finally {
          await lock.release();
        }
      }
      const current = lock?.holder ?? (await liveHolder(session.git, FULL_VERIFICATION));
      if (!said && current !== undefined) {
        session.environment.io.err(fullVerificationWaitNote(current, session.lang, ahead));
        said = true;
      }
      await new Promise((done) => setTimeout(done, pollMs));
    }
  } finally {
    await place.leave();
  }
}

/**
 * Runs `run`, which incorporates main into the change and lands it there, on the full
 * verification's turn, held from before the merge until main moved: no other session lands
 * meanwhile and leaves this merge behind. The verification inside gets the same turn, as it runs
 * inside its holder, and takes the places only while it runs: the landing does not hold them.
 * Without a landing (`plan`) or a full verification, it runs at once.
 */
export function landingTurn<T>(
  session: Session,
  plan: Integration | undefined,
  run: () => Promise<T>,
): Promise<T> {
  const command = fullCommand(session.config) ?? session.config.verify.default;
  return plan === undefined || command === undefined ? run() : onTurn(session, command, run, {});
}
