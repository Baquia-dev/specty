// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  blockedCard,
  headerOf,
  type Output,
  reviewedCard,
  specReviewPrompt,
  translator,
} from "@baquia-dev/specty-core";
import { commitState, resolveActive } from "../flow/active";
import { execute } from "../io/exec";
import { writeText } from "../io/files";
import type { Session } from "../session";
import { readSpec } from "../store/changes";

/**
 * `specty review`: passes the spec in review to the command the person set up (ADR 0011) and
 * keeps its answer. It is information: it changes no phase and decides nothing.
 */
export async function review(session: Session): Promise<Output> {
  const t = translator(session.lang);
  const { cards } = session;
  const nextStep = t(
    `sigue con \`${cards.command} next\`.`,
    `go on with \`${cards.command} next\`.`,
  );
  const active = await resolveActive(session);
  if (active === undefined || active.state.phase !== "review") {
    return blockedCard(
      active === undefined ? headerOf() : headerOf(active.state.id, active.state.phase),
      t(
        `La revisión independiente se pide con la spec en revisión, después de \`${cards.command} propose\`.`,
        `The independent review is asked for with the spec in review, after \`${cards.command} propose\`.`,
      ),
      nextStep,
    );
  }
  const { state } = active;
  const header = headerOf(state.id, "review");
  const settings = session.config.review;
  if (settings === undefined) {
    return blockedCard(
      header,
      t(
        "Este proyecto no tiene revisión independiente: la persona la configura con `review.command` en .specty/config.yaml.",
        "This project has no independent review: the person sets it up with `review.command` in .specty/config.yaml.",
      ),
      nextStep,
    );
  }
  const { command } = settings;
  session.environment.io.err(
    `specty: ${t("revisando la spec con", "reviewing the spec with")} \`${command}\`…`,
  );
  const started = Date.now();
  const result = await execute(command, [], {
    cwd: session.root,
    shell: true,
    env: session.environment.env,
    input: specReviewPrompt(await readSpec(active.files), session.lang),
    timeoutMs: settings.timeoutSec * 1000,
  });
  const text = result.stdout.trim();
  const ok = result.code === 0 && text.length > 0;
  const path = join(active.files.dir, "reviews", `spec-r${state.revision}.md`);
  if (ok) await writeText(path, `${text}\n`);
  await commitState(
    session,
    active,
    state,
    "review.completed",
    {
      target: "spec",
      revision: state.revision,
      cmd: command,
      exit: result.code ?? null,
      ms: Date.now() - started,
      ...(ok ? { file: session.paths.relative(path) } : {}),
    },
    "specty",
  );
  if (!ok) {
    return blockedCard(
      header,
      t(
        `La revisión falló (\`${command}\`, código ${result.code ?? "sin código"}).`,
        `The review failed (\`${command}\`, code ${result.code ?? "none"}).`,
      ),
      t(
        `díselo al usuario y sigue con \`${cards.command} next\`: la revisión es opcional.`,
        `tell the user and go on with \`${cards.command} next\`: the review is optional.`,
      ),
    );
  }
  return reviewedCard({ header, command, path: session.paths.relative(path), text }, cards);
}
