// SPDX-License-Identifier: Apache-2.0
import { relative, sep } from "node:path";
import { type ConfigIssue, resolveConfig } from "@baquia-dev/specty-core";
import { type ConfigEdit, type SettingChange, settingChanges } from "@baquia-dev/specty-core/light";
import { parse } from "yaml";
import { readText, writeText } from "../io/files";
import { GitError, gitFailure } from "../io/git";
import { editYaml } from "../io/yaml-edit";
import type { Session } from "../session";
import { lockFullVerification } from "../store/lock";
import { isFinished, resolveActive } from "./active";
import { commitWithReceipt } from "./commits";

// The person saves `.specty/config.yaml` from the UI (formats.md §6 and §7): only the keys they
// changed, in a commit of that file alone with `Specty-Config: true`, which belongs to no change.

/** Why the configuration of this folder cannot be saved now, before anyone edits it. */
export type ConfigBlocked =
  | { readonly kind: "change"; readonly id: string }
  | { readonly kind: "uncommitted" }
  | { readonly kind: "yaml" };

/** Why a save did not happen: blocked, not valid, nothing changed, the turn taken, or git failed. */
export type ConfigRefusal =
  | ConfigBlocked
  | { readonly kind: "invalid"; readonly issues: readonly ConfigIssue[] }
  | { readonly kind: "unchanged" }
  | { readonly kind: "turn"; readonly command: string; readonly folder: string }
  | { readonly kind: "git"; readonly detail: string };

/** What some edits would leave: the validator's issues, and the changes by setting. */
export interface ConfigCheck {
  readonly issues: readonly ConfigIssue[];
  readonly changes: readonly SettingChange[];
}

export type ConfigSaved =
  | { readonly ok: true; readonly commit: string; readonly changes: readonly SettingChange[] }
  | { readonly ok: false; readonly refusal: ConfigRefusal };

/** The edited text with its check; no text when the edits do not apply to the file. */
interface Draft extends ConfigCheck {
  readonly text?: string;
}

/**
 * Why this folder's configuration cannot be saved: a change in progress here (the commit would
 * land on its branch), changes of the file not committed (they would go in Specty's commit), or a
 * file that is not YAML (no key can be found in it). None when it can.
 */
export async function configBlocked(session: Session): Promise<ConfigBlocked | undefined> {
  const active = await resolveActive(session);
  if (active !== undefined && !isFinished(active.state)) {
    return { kind: "change", id: active.state.id };
  }
  const status = await session.git.output(["status", "--porcelain", "--", configPath(session)]);
  if (status.trim() !== "") return { kind: "uncommitted" };
  return readYaml((await readText(session.paths.config)) ?? "").ok ? undefined : { kind: "yaml" };
}

/** What `edits` would leave, without writing anything. */
export async function checkConfig(
  session: Session,
  edits: readonly ConfigEdit[],
): Promise<ConfigCheck> {
  const { issues, changes } = await drafted(session, edits);
  return { issues, changes };
}

/**
 * Saves `edits`: unless blocked, not valid or changing nothing, it takes the landing turn without
 * waiting for it, writes the file and commits it with its receipt. A commit that fails puts the
 * file back as it was.
 */
export async function saveConfig(
  session: Session,
  edits: readonly ConfigEdit[],
): Promise<ConfigSaved> {
  const blocked = await configBlocked(session);
  if (blocked !== undefined) return { ok: false, refusal: blocked };
  const draft = await drafted(session, edits);
  if (draft.issues.length > 0 || draft.text === undefined) {
    return { ok: false, refusal: { kind: "invalid", issues: draft.issues } };
  }
  if (draft.changes.length === 0) return { ok: false, refusal: { kind: "unchanged" } };
  const holder = {
    pid: process.pid,
    command: "config",
    folder: session.root,
    at: session.environment.now().toISOString(),
  };
  const lock = await lockFullVerification(session.git, holder);
  if (lock.kind === "busy") {
    const { command, folder } = lock.holder;
    return { ok: false, refusal: { kind: "turn", command, folder } };
  }
  try {
    return await committed(session, draft.text, draft.changes);
  } finally {
    await lock.release();
  }
}

/** The file as `edits` leave it, with the validator's issues and the changes by setting. */
async function drafted(session: Session, edits: readonly ConfigEdit[]): Promise<Draft> {
  const text = (await readText(session.paths.config)) ?? "";
  const before = readYaml(text);
  if (!before.ok) return { issues: [{ path: "", message: before.message }], changes: [] };
  const edited = editYaml(text, edits);
  if (!edited.ok) return { issues: [edited.issue], changes: [] };
  const after = readYaml(edited.text);
  if (!after.ok) return { issues: [{ path: "", message: after.message }], changes: [] };
  const resolved = resolveConfig(after.value);
  return {
    text: edited.text,
    issues: resolved.ok ? [] : resolved.issues,
    changes: settingChanges(before.value, after.value),
  };
}

/** Writes `text` and commits it alone; on git's failure, the file and the index go back. */
async function committed(
  session: Session,
  text: string,
  changes: readonly SettingChange[],
): Promise<ConfigSaved> {
  const path = configPath(session);
  const original = (await readText(session.paths.config)) ?? "";
  await writeText(session.paths.config, text);
  try {
    const commit = await commitWithReceipt(session, {
      subject: `chore(config): ${changes.map((change) => change.key).join(", ")}`,
      trailers: { "Specty-Config": "true" },
      stage: [[path]],
      only: [path],
      receipt: { change: "", kind: "config" },
    });
    return { ok: true, commit, changes };
  } catch (error) {
    if (!(error instanceof GitError)) throw error;
    await writeText(session.paths.config, original);
    await session.git.run(["reset", "-q", "--", path]);
    return { ok: false, refusal: { kind: "git", detail: gitFailure(error) } };
  }
}

/** `.specty/config.yaml` as git names it, from the repository's root. */
function configPath(session: Session): string {
  return relative(session.git.root, session.paths.config).split(sep).join("/");
}

/** A text as YAML reads it, or YAML's message when it cannot. */
function readYaml(
  text: string,
):
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly message: string } {
  try {
    return { ok: true, value: parse(text) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
