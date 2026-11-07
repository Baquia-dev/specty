// SPDX-License-Identifier: Apache-2.0
import {
  type ConfigIssue,
  DEFAULT_CONFIG,
  defaultGlossary,
  LANGS,
  type ResolvedConfig,
  resolveConfig,
} from "@baquia-dev/specty-core";
import { type ConfigEdit, settingOf } from "@baquia-dev/specty-core/light";
import { parse } from "yaml";
import { type ConfigRefusal, checkConfig, configBlocked, saveConfig } from "../flow/config-save";
import { isRecord, readText } from "../io/files";
import type { Session } from "../session";
import type { Context } from "./context";

// `.specty/config.yaml` in the local server (ARCHITECTURE §15): what the page «Configuración»
// reads, and the person's check and save of their edits.

/**
 * `GET /api/config`: `.specty/config.yaml` as YAML reads it (`input`, none when it is not YAML),
 * what Specty uses with every default when it is valid (`config`), the defaults, with the glossary
 * of the file's language, the validator's issues, each at its key, and, when it cannot be saved
 * now, why (`blocked`). It reads the file again on each request: the person may have changed it
 * since the server started.
 */
export async function configView(session: Session) {
  const blocked = await configBlocked(session);
  const why = blocked === undefined ? {} : { blocked };
  const text = (await readText(session.paths.config)) ?? "";
  let input: unknown;
  try {
    input = parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { defaults: DEFAULT_CONFIG, issues: [{ path: "", message }], ...why };
  }
  const result = resolveConfig(input);
  const issues: readonly ConfigIssue[] = result.ok ? [] : result.issues;
  return {
    input,
    ...(result.ok ? { config: result.config } : {}),
    defaults: defaultsIn(input),
    issues,
    ...why,
  };
}

/** The defaults of a configuration: those of `DEFAULT_CONFIG`, with the glossary of its language. */
function defaultsIn(input: unknown): ResolvedConfig {
  const language = isRecord(input) ? input.language : undefined;
  const lang = LANGS.find((known) => known === language) ?? DEFAULT_CONFIG.language;
  return { ...DEFAULT_CONFIG, glossary: defaultGlossary(lang) };
}

/** An answer of the server: its status and its JSON body. */
export interface Answer {
  readonly status: number;
  readonly body: unknown;
}

/**
 * The person's `POST /api/config/check` (200 with the issues and the changes, writing nothing)
 * and `POST /api/config` (200 with the commit and the changes; 409 with why not, as `error` and
 * its data), both with `{ edits }`: 400 when an edit's path falls in no setting the UI saves.
 * Saving waits in the actions' queue. Nothing for any other path.
 */
export async function configPost(
  context: Context,
  pathname: string,
  body: unknown,
): Promise<Answer | undefined> {
  if (pathname !== "/api/config" && pathname !== "/api/config/check") return undefined;
  const edits = editsIn(body);
  if (edits === undefined) return { status: 400, body: { error: "bad request" } };
  if (pathname === "/api/config/check") {
    return { status: 200, body: await checkConfig(context.session, edits) };
  }
  const saved = await context.serial(() => saveConfig(context.session, edits));
  if (saved.ok) return { status: 200, body: { commit: saved.commit, changes: saved.changes } };
  return { status: 409, body: refusalBody(saved.refusal) };
}

/** The body of a refused save: why, as `error`, with its data. */
function refusalBody(refusal: ConfigRefusal) {
  const { kind, ...data } = refusal;
  return { error: kind, ...data };
}

/** The edits of a body: each a path of keys to a setting the UI saves, with its value or none. */
function editsIn(body: unknown): readonly ConfigEdit[] | undefined {
  const edits = isRecord(body) ? body.edits : undefined;
  if (!Array.isArray(edits)) return undefined;
  const read = edits.map(editOf);
  return read.every((edit) => edit !== undefined) ? read : undefined;
}

function editOf(edit: unknown): ConfigEdit | undefined {
  if (!isRecord(edit) || !Array.isArray(edit.path)) return undefined;
  const path = edit.path.filter((key) => typeof key === "string");
  if (path.length !== edit.path.length || settingOf(path) === undefined) return undefined;
  return edit.value === undefined ? { path } : { path, value: edit.value };
}
