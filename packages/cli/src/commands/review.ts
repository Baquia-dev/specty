// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  diffReviewPrompt,
  headerOf,
  type Output,
  type ReviewRefusal,
  reviewedCard,
  reviewingNote,
  reviewRefusalCard,
  specReviewPrompt,
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
  const { cards } = session;
  const active = await resolveActive(session);
  const phase = active?.state.phase;
  if (active === undefined || (phase !== "review" && phase !== "acceptance")) {
    const header =
      active === undefined ? headerOf() : headerOf(active.state.id, active.state.phase);
    return reviewRefusalCard({ reason: "not-reviewable" }, header, cards);
  }
  const { state } = active;
  const header = headerOf(state.id, phase);
  const settings = session.config.review;
  if (settings === undefined) return reviewRefusalCard({ reason: "not-configured" }, header, cards);
  const target = phase === "review" ? "spec" : "diff";
  const input = await inputFor(session, active, target);
  if (input.kind === "refused") return reviewRefusalCard(input.refusal, header, cards);
  return runReview(session, active, {
    command: settings.command,
    timeoutSec: settings.timeoutSec,
    target,
    text: input.text,
    header,
  });
}

/** One review to run: its command and time limit, what it reviews and reads, and the card's header. */
interface ReviewRun {
  readonly command: string;
  readonly timeoutSec: number;
  readonly target: "spec" | "diff";
  readonly text: string;
  readonly header: string;
}

/** Runs the reviewer, keeps its answer in the change's `reviews/` and records it in the audit. */
async function runReview(session: Session, active: StoredChange, run: ReviewRun): Promise<Output> {
  const { state } = active;
  const { command, target, header } = run;
  session.environment.io.err(reviewingNote(command, session.lang));
  const started = Date.now();
  const result = await execute(command, [], {
    cwd: session.root,
    shell: true,
    env: session.environment.env,
    input: run.text,
    timeoutMs: run.timeoutSec * 1000,
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
  if (!ok)
    return reviewRefusalCard(
      { reason: "failed", command, code: result.code },
      header,
      session.cards,
    );
  const view = { header, target, command, path: session.paths.relative(path), text } as const;
  return reviewedCard(view, session.cards);
}

type Input =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "refused"; readonly refusal: ReviewRefusal };

/** What the reviewer reads: the spec, or the spec and the diff of the whole change. */
async function inputFor(
  session: Session,
  change: StoredChange,
  target: "spec" | "diff",
): Promise<Input> {
  const spec = await readSpec(change.files);
  if (target === "spec") return { kind: "text", text: specReviewPrompt(spec, session.lang) };
  const diff = await changeDiff(session, change.state.id);
  switch (diff.kind) {
    case "diff":
      return { kind: "text", text: diffReviewPrompt(spec, diff.text, session.lang) };
    case "too-large":
      return { kind: "refused", refusal: { reason: "too-large", range: diff.range } };
    default:
      return { kind: "refused", refusal: { reason: "no-diff" } };
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
