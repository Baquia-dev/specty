// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  blockedCard,
  headerOf,
  type Output,
  parseSpec,
  section,
  translator,
} from "@baquia-dev/specty-core";
import { EXPORT_FORMATS, exportSpec } from "@baquia-dev/specty-exporters";
import type { Command } from "commander";
import type { ReportOutput } from "../check/provider";
import { resolveActive } from "../flow/active";
import { dataOf, readAudit } from "../flow/carried";
import { findChange } from "../flow/find";
import { writeText } from "../io/files";
import type { Session } from "../session";
import { readSpec } from "../store/changes";

/** How each format is called in the output. */
const NAMES = { openspec: "OpenSpec", speckit: "Spec Kit", kiro: "Kiro" } as const;

/**
 * `specty export [<id>] --to <format> [--out <folder>]` (ARCHITECTURE §6, formats.md §10): the
 * change's spec in OpenSpec, Spec Kit or Kiro, written in `.specty/exports/<format>/` unless the
 * person says where. It only writes those files, so the agent may run it too.
 */
async function exportChange(
  session: Session,
  id: string | undefined,
  format: string | undefined,
  out: string | undefined,
): Promise<Output> {
  const t = translator(session.lang);
  const { command } = session.cards;
  const refuse = (reason: string, next: string): Output => ({
    ...blockedCard(headerOf("export"), reason, next),
    status: "invalid",
  });
  const chosen = EXPORT_FORMATS.find((name) => name === format);
  if (chosen === undefined) {
    return refuse(
      format === undefined
        ? t("Falta el formato.", "The format is missing.")
        : t(`No conozco el formato ${format}.`, `I do not know the format ${format}.`),
      t(
        `elige uno: \`${command} export --to openspec\`, \`--to speckit\` o \`--to kiro\`.`,
        `choose one: \`${command} export --to openspec\`, \`--to speckit\` or \`--to kiro\`.`,
      ),
    );
  }
  const change = id === undefined ? await resolveActive(session) : await findChange(session, id);
  if (change === undefined) {
    return refuse(
      id === undefined
        ? t("No hay un cambio activo en esta carpeta.", "There is no active change in this folder.")
        : t(`No hay ningún cambio ${id}.`, `There is no change ${id}.`),
      t(
        `di cuál con \`${command} export <id> --to ${chosen}\`.`,
        `name it with \`${command} export <id> --to ${chosen}\`.`,
      ),
    );
  }
  const { state } = change;
  const spec = parseSpec(await readSpec(change.files), { language: session.lang }).spec;
  const created = (await readAudit(change.files)).find((entry) => entry.event === "change.created");
  const { request } = dataOf(created);
  const files = exportSpec(spec, chosen, {
    id: state.id,
    ...(state.branch === undefined ? {} : { branch: state.branch }),
    ...(typeof created?.ts === "string" ? { created: created.ts.slice(0, 10) } : {}),
    ...(typeof request === "string" ? { request } : {}),
  });
  const folder = resolve(session.root, out ?? join(".specty", "exports", chosen));
  for (const file of files) await writeText(join(folder, file.path), file.content);
  // Inside the repository, relative to its root; outside, whole: a long `../../…` is hard to read.
  const inside = relative(session.root, folder);
  const shown =
    inside === "" ? "." : inside.startsWith("..") || isAbsolute(inside) ? folder : inside;
  return {
    status: "ok",
    header: headerOf("export"),
    blocks: section(t(`EN ${NAMES[chosen]}, EN ${shown}`, `IN ${NAMES[chosen]}, IN ${shown}`), [
      ...files.map((file) => file.path),
    ]),
    next: t(
      "revísalos y cópialos donde los espere la herramienta; con `--out .` se escriben en la raíz del repositorio.",
      "check them and copy them where the tool expects them; with `--out .` they go to the repository's root.",
    ),
  };
}

/** Registers `specty export`; `run` opens the session as for every command. */
export function exportCommand(
  program: Command,
  run: (handler: (session: Session) => Promise<Output | ReportOutput>) => () => Promise<void>,
): void {
  program
    .command("export [id]")
    .description("the spec of a change, the active one by default, in OpenSpec, Spec Kit or Kiro")
    .option("--to <format>", "openspec, speckit or kiro")
    .option("--out <folder>", "where to write the files (default: .specty/exports/<format>)")
    .action((id: string | undefined, options: { to?: string; out?: string }) =>
      run((session) => exportChange(session, id, options.to, options.out))(),
    );
}
