// SPDX-License-Identifier: Apache-2.0
// What the local server answers, as ServerData reads it: the checks of its data and what each
// refusal means, in both languages. Pure.
import type { SessionView } from "@baquia-dev/specty-core/light";
import type { RunRecord } from "./progress";
import type {
  Bilingual,
  ChangeRecord,
  ChangeSummary,
  Delegation,
  MemoryRecord,
  SliceChangeRecord,
} from "./records";
import type { ActionNote, ConfigCheck, ConfigRecord, ConfigSaved, FinishedPage } from "./source";

export const NO_SESSION: Bilingual = {
  es: "Esta pestaña no tiene sesión: abre el enlace que imprime `specty ui`.",
  en: "This tab has no session: open the link that `specty ui` prints.",
};
export const UNEXPECTED: Bilingual = {
  es: "El servidor devolvió datos inesperados.",
  en: "The server returned unexpected data.",
};
export const READ_ONLY: Bilingual = {
  es: "Este servidor es de solo lectura porque lo arrancó el agente: para decidir desde aquí, arráncalo tú con `specty ui` en tu terminal.",
  en: "This server is read only because the agent started it: to decide from here, start it yourself with `specty ui` in your terminal.",
};
export const NO_DIFF: Bilingual = {
  es: "El servidor no tiene diff de esto: aún no hay commits de esta tarea o de este cambio.",
  en: "The server has no diff for this: this task or change has no commits yet.",
};
const NOT_UNDERSTOOD: Bilingual = {
  es: "El servidor no entendió la petición.",
  en: "The server did not understand the request.",
};

/** A status with nothing more to say about it. */
export function answered(status: number): Bilingual {
  return { es: `El servidor respondió ${status}.`, en: `The server answered ${status}.` };
}

/** Why the server refused: the flow's own words (409), or what the status means. */
export async function refusal(response: Response): Promise<Bilingual> {
  const body: unknown = await response.json().catch(() => undefined);
  if (response.status === 409) {
    const said = outputText(body);
    if (said !== undefined) return { es: said, en: said };
  }
  if (response.status === 403) {
    return isObject(body) && body.error === "read-only" ? READ_ONLY : NO_SESSION;
  }
  if (response.status === 400) return NOT_UNDERSTOOD;
  return answered(response.status);
}

/** A diff over the server's limit: the range to see it with git, when the server gave it. */
export function tooLarge(range: unknown): Bilingual {
  const command = typeof range === "string" ? `git diff ${range}` : "git diff";
  return {
    es: `El diff pasa de 512 KB y no cabe aquí: míralo con \`${command}\` en la carpeta del cambio.`,
    en: `The diff is over 512 KB and does not fit here: see it with \`${command}\` in the change's folder.`,
  };
}

/** A command's output as one text: its lines, then its next step, in the repository's language. */
function outputText(body: unknown): string | undefined {
  if (!isObject(body) || !Array.isArray(body.blocks)) return undefined;
  const lines = body.blocks.flatMap((block: unknown) =>
    isObject(block) && Array.isArray(block.lines) ? block.lines.filter(isText) : [],
  );
  const next = typeof body.next === "string" ? body.next : "";
  const step = next === "" ? [] : [`${next.charAt(0).toUpperCase()}${next.slice(1)}`];
  const text = [...lines, ...step].join(" ");
  return text === "" ? undefined : text;
}

/**
 * `GET /api/memory`'s answer: the entries of Specty's memory and the open changes, each with the
 * fields the memory page reads, and the changes the entries came from, each with its title.
 */
export function isMemoryRecord(value: unknown): value is MemoryRecord {
  if (!isObject(value) || !Array.isArray(value.entries) || !Array.isArray(value.changes))
    return false;
  const entry = (item: unknown) =>
    isObject(item) &&
    ["id", "kind", "status", "created", "text"].every((key) => isText(item[key])) &&
    isObject(item.origin);
  const change = (item: unknown) =>
    isObject(item) &&
    ["id", "kind", "phase", "title", "waitingFor"].every((key) => isText(item[key]));
  // Each change of origin has its title at least: one the server does not find, its id.
  const origin = (item: unknown) => isObject(item) && isText(item.title);
  const origins =
    value.origins === undefined ||
    (isObject(value.origins) && Object.values(value.origins).every(origin));
  return value.entries.every(entry) && value.changes.every(change) && origins;
}

/**
 * `GET /api/sessions`' answer: each agent session with the fields the sessions page reads, and
 * its usage, when there is one, with numbers.
 */
export function isSessionList(value: unknown): value is readonly SessionView[] {
  if (!Array.isArray(value)) return false;
  const usage = (item: unknown) =>
    item === undefined ||
    (isObject(item) && typeof item.tokens === "number" && typeof item.cost === "number");
  return value.every(
    (item) =>
      isObject(item) &&
      ["tool", "conversation", "first", "last"].every((key) => isText(item[key])) &&
      typeof item.folder === "string" &&
      typeof item.live === "boolean" &&
      (item.change === undefined || isText(item.change)) &&
      usage(item.usage),
  );
}

/** Why `GET /api/config` says the configuration cannot be saved: its kind, and its data. */
type ConfigBlocked = Readonly<Record<string, unknown>> & { readonly kind: string };

/**
 * `GET /api/config`'s answer: its defaults, its issues with their key, its values if valid and,
 * when it cannot be saved, why, as data the page puts in words (`configReason`).
 */
export function isConfigRecord(
  value: unknown,
): value is Omit<ConfigRecord, "blocked"> & { readonly blocked?: ConfigBlocked } {
  return (
    isObject(value) &&
    isObject(value.defaults) &&
    (value.config === undefined || isObject(value.config)) &&
    Array.isArray(value.issues) &&
    value.issues.every(isIssue) &&
    (value.blocked === undefined || (isObject(value.blocked) && isText(value.blocked.kind)))
  );
}

/** `POST /api/config/check`'s answer: the validator's issues and the changes by setting. */
export function isConfigCheck(value: unknown): value is ConfigCheck {
  return (
    isObject(value) &&
    Array.isArray(value.issues) &&
    value.issues.every(isIssue) &&
    Array.isArray(value.changes) &&
    value.changes.every(isSettingChange)
  );
}

/** `POST /api/config`'s answer: the commit and the changes by setting. */
export function isConfigSaved(value: unknown): value is ConfigSaved {
  return (
    isObject(value) &&
    isText(value.commit) &&
    Array.isArray(value.changes) &&
    value.changes.every(isSettingChange)
  );
}

function isIssue(value: unknown): boolean {
  return isObject(value) && isText(value.path) && isText(value.message);
}

function isSettingChange(value: unknown): boolean {
  return isObject(value) && isText(value.key);
}

const CONFIG = "`.specty/config.yaml`";

/** Each reason not to save the configuration, in words, with the texts of its data. */
const CONFIG_REASONS = new Map<string, (said: (key: string) => string) => Bilingual>([
  [
    "change",
    (said) => ({
      es: `La carpeta de specty ui tiene un cambio en curso (${said("id")}): el commit iría a su rama. Para guardar, arranca specty ui en la carpeta principal.`,
      en: `The specty ui folder has a change in progress (${said("id")}): the commit would go to its branch. To save, start specty ui in the main folder.`,
    }),
  ],
  [
    "uncommitted",
    () => ({
      es: `${CONFIG} tiene cambios sin commit: haz su commit o descártalos para guardar desde aquí.`,
      en: `${CONFIG} has uncommitted changes: commit or discard them to save from here.`,
    }),
  ],
  [
    "yaml",
    () => ({
      es: `${CONFIG} no es YAML: corrígelo en el archivo para guardar desde aquí.`,
      en: `${CONFIG} is not YAML: fix it in the file to save from here.`,
    }),
  ],
  [
    "invalid",
    () => ({
      es: "Algún valor no es válido: corrige los errores que salen junto a su ajuste.",
      en: "A value is not valid: fix the errors shown by its setting.",
    }),
  ],
  [
    "unchanged",
    () => ({
      es: `No hay nada que guardar: ${CONFIG} ya tiene esos valores.`,
      en: `There is nothing to save: ${CONFIG} already has those values.`,
    }),
  ],
  [
    "turn",
    (said) => ({
      es: `Otra sesión tiene el turno de aterrizaje (${said("command")}, en ${said("folder")}): vuelve a guardar cuando termine.`,
      en: `Another session has the landing turn (${said("command")}, in ${said("folder")}): save again when it finishes.`,
    }),
  ],
  [
    "git",
    (said) => ({
      es: `git no pudo hacer el commit: ${said("detail")}`,
      en: `git could not commit: ${said("detail")}`,
    }),
  ],
]);

/**
 * Why the configuration cannot be saved, in words: `blocked` of `GET /api/config` by its `kind`,
 * or a 409 of `POST /api/config` by its `error`, with its data. None for a reason it does not know.
 */
export function configReason(
  kind: unknown,
  data: Readonly<Record<string, unknown>>,
): Bilingual | undefined {
  const words = isText(kind) ? CONFIG_REASONS.get(kind) : undefined;
  return words?.((key) => {
    const value = data[key];
    return isText(value) ? value : "";
  });
}

/** Why `POST /api/config` refused to save (409), in words; a reason it does not know, its status. */
export async function configRefusal(response: Response): Promise<Bilingual> {
  const body: unknown = await response.json().catch(() => undefined);
  const said = isObject(body) ? configReason(body.error, body) : undefined;
  return said ?? answered(response.status);
}

/** `GET /api/delegation`'s answer: on or off, who and when, and the warning in both languages. */
export function isDelegation(value: unknown): value is Delegation {
  if (!isObject(value) || typeof value.on !== "boolean" || !isObject(value.warning)) return false;
  const { es, en } = value.warning;
  const optional = (field: unknown) => field === undefined || typeof field === "string";
  return (
    Array.isArray(es) &&
    es.every(isText) &&
    Array.isArray(en) &&
    en.every(isText) &&
    optional(value.by) &&
    optional(value.at)
  );
}

/** A verification the server runs: its command, when it started and its lines so far. */
export function isRun(value: unknown): value is RunRecord {
  return (
    isObject(value) &&
    typeof value.command === "string" &&
    typeof value.startedAt === "string" &&
    Array.isArray(value.output) &&
    value.output.every(isText) &&
    (value.task === undefined || typeof value.task === "string") &&
    (value.stopped === undefined || typeof value.stopped === "boolean")
  );
}

/** A `run` event: the change, and its run, or nothing when it ended; unreadable, undefined. */
export function runEvent(
  data: unknown,
): { readonly change: string; readonly run: RunRecord | undefined } | undefined {
  const told = eventData(data);
  if (!isObject(told) || typeof told.change !== "string") return undefined;
  if (told.run === null) return { change: told.change, run: undefined };
  return isRun(told.run) ? { change: told.change, run: told.run } : undefined;
}

/**
 * An `action` event: the change, the action and the line its command said, without the `specty:`
 * that marks it in the terminal and with a capital; the start and the end bring none. Unreadable,
 * undefined.
 */
export function actionEvent(data: unknown): ActionNote | undefined {
  const told = eventData(data);
  if (!isObject(told) || typeof told.change !== "string" || typeof told.action !== "string")
    return undefined;
  const said = typeof told.note === "string" ? told.note.replace(/^specty:\s*/, "").trim() : "";
  const note = `${said.charAt(0).toUpperCase()}${said.slice(1)}`;
  return { change: told.change, action: told.action, ...(note === "" ? {} : { note }) };
}

/** The JSON of an event's data; anything else, undefined. */
function eventData(data: unknown): unknown {
  if (typeof data !== "string") return undefined;
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}

export function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A text, as the checks of the answers want it. */
export function isText(value: unknown): value is string {
  return typeof value === "string";
}

/** A light check of the answer: the worker parses each spec, and each state is Specty's own file. */
export function isRecords(value: unknown): value is readonly ChangeRecord[] {
  return Array.isArray(value) && value.every(isChangeRecord);
}

/** `GET /api/changes/<id>/slices`'s answer: each slice with the id and the phase of its change. */
export function isSliceChanges(value: unknown): value is readonly SliceChangeRecord[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item: unknown) =>
        isObject(item) && ["slice", "id", "phase"].every((key) => isText(item[key])),
    )
  );
}

/** `GET /api/changes/finished`'s answer: each change's summary, lightly checked, and its numbers. */
export function isFinishedPage(value: unknown): value is FinishedPage {
  if (!isObject(value) || !Array.isArray(value.changes) || !isObject(value.counts)) return false;
  const { counts } = value;
  return (
    value.changes.every(isChangeSummary) &&
    typeof value.total === "number" &&
    typeof value.finished === "number" &&
    typeof counts.done === "number" &&
    typeof counts.cancelled === "number"
  );
}

/** The texts every summary carries. */
const SUMMARY_TEXTS = ["id", "title", "kind", "phase", "phaseSince", "createdAt", "tab"];

/**
 * A light check of a change's summary, as the server gives it: the texts and numbers its row
 * reads, its epic with its id and title, and its size with its level and its reasons.
 */
function isChangeSummary(value: unknown): value is ChangeSummary {
  return (
    isObject(value) &&
    SUMMARY_TEXTS.every((key) => isText(value[key])) &&
    isTaskCount(value.tasks) &&
    (value.epic === undefined || isEpicNamed(value.epic)) &&
    (value.size === undefined || isSized(value.size))
  );
}

/** A summary's tasks: how many are done, of how many. */
function isTaskCount(value: unknown): boolean {
  return isObject(value) && typeof value.done === "number" && typeof value.total === "number";
}

/** A summary's epic: its id and its title. */
function isEpicNamed(value: unknown): boolean {
  return isObject(value) && isText(value.id) && isText(value.title);
}

/** A summary's size: its level and its reasons. */
function isSized(value: unknown): boolean {
  return isObject(value) && isText(value.level) && Array.isArray(value.reasons);
}

/** The same light check, of one change. */
export function isChangeRecord(value: unknown): value is ChangeRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    "spec" in value &&
    typeof value.spec === "string" &&
    "state" in value &&
    typeof value.state === "object" &&
    value.state !== null &&
    "phaseSince" in value &&
    typeof value.phaseSince === "string"
  );
}
