// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  blockedCard,
  diffReviewPrompt,
  headerOf,
  type Output,
  reviewedCard,
  specReviewPrompt,
  translator,
} from "@baquia-dev/specty-core";
import { commitState, resolveActive } from "../flow/active";
import { dataOf, readAudit } from "../flow/carried";
import { execute } from "../io/exec";
import { writeText } from "../io/files";
import { changeDiff } from "../server/diff";
import type { Session } from "../session";
import { readSpec, type StoredChange } from "../store/changes";

/**
 * `specty review`: passes the spec in review, or the result in acceptance, to the command the
 * person set up (ADR 0011) and keeps its answer. It is information: it changes no phase.
 */
export async function review(session: Session): Promise<Output> {
  const t = translator(session.lang);
  const { cards } = session;
  const nextStep = t(
    `sigue con \`${cards.command} next\`.`,
    `go on with \`${cards.command} next\`.`,
  );
  const active = await resolveActive(session);
  const phase = active?.state.phase;
  if (active === undefined || (phase !== "review" && phase !== "acceptance")) {
    return blockedCard(
      active === undefined ? headerOf() : headerOf(active.state.id, active.state.phase),
      t(
        `La revisión independiente se pide con la spec en revisión, después de \`${cards.command} propose\`, o con el resultado en aceptación.`,
        `The independent review is asked for with the spec in review, after \`${cards.command} propose\`, or with the result in acceptance.`,
      ),
      nextStep,
    );
  }
  const { state } = active;
  const header = headerOf(state.id, phase);
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
  const target = phase === "review" ? "spec" : "diff";
  const input = await inputFor(session, active, target);
  if (input.kind === "refused") return blockedCard(header, input.reason, nextStep);
  const { command } = settings;
  session.environment.io.err(`specty: ${t("revisando con", "reviewing with")} \`${command}\`…`);
  const started = Date.now();
  const result = await execute(command, [], {
    cwd: session.root,
    shell: true,
    env: session.environment.env,
    input: input.text,
    timeoutMs: settings.timeoutSec * 1000,
  });
  const text = result.stdout.trim();
  const ok = result.code === 0 && text.length > 0;
  const path = join(active.files.dir, "reviews", await fileName(active, target));
  if (ok) await writeText(path, `${text}\n`);
  await commitState(
    session,
    active,
    state,
    "review.completed",
    {
      target,
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
  const view = { header, target, command, path: session.paths.relative(path), text } as const;
  return reviewedCard(view, cards);
}

type Input =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "refused"; readonly reason: string };

/** What the reviewer reads: the spec, or the spec and the diff of the whole change. */
async function inputFor(
  session: Session,
  change: StoredChange,
  target: "spec" | "diff",
): Promise<Input> {
  const t = translator(session.lang);
  const spec = await readSpec(change.files);
  if (target === "spec") return { kind: "text", text: specReviewPrompt(spec, session.lang) };
  const diff = await changeDiff(session, change.state.id);
  switch (diff.kind) {
    case "diff":
      return { kind: "text", text: diffReviewPrompt(spec, diff.text, session.lang) };
    case "too-large":
      return {
        kind: "refused",
        reason: t(
          `El diff del cambio es demasiado grande para revisarlo entero (${diff.range}).`,
          `The change's diff is too large to review whole (${diff.range}).`,
        ),
      };
    default:
      return {
        kind: "refused",
        reason: t("El cambio no tiene un diff que revisar.", "The change has no diff to review."),
      };
  }
}

/** `spec-r<revision>.md`, or `diff-<n>.md` for the n-th review of the result. */
async function fileName(change: StoredChange, target: "spec" | "diff"): Promise<string> {
  if (target === "spec") return `spec-r${change.state.revision}.md`;
  const audit = await readAudit(change.files);
  const done = audit.filter(
    (entry) => entry.event === "review.completed" && dataOf(entry).target === "diff",
  ).length;
  return `diff-${done + 1}.md`;
}
