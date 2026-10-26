// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, join, relative, resolve } from "node:path";
import { exportedCard, exportRefusalCard, type Output, parseSpec } from "@baquia-dev/specty-core";
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
  const { cards } = session;
  const chosen = EXPORT_FORMATS.find((name) => name === format);
  if (chosen === undefined) {
    return exportRefusalCard(
      format === undefined ? { reason: "no-format" } : { reason: "unknown-format", format },
      cards,
    );
  }
  const change = id === undefined ? await resolveActive(session) : await findChange(session, id);
  if (change === undefined) {
    return exportRefusalCard(
      id === undefined
        ? { reason: "no-active", format: chosen }
        : { reason: "no-change", id, format: chosen },
      cards,
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
  return exportedCard(
    NAMES[chosen],
    shown,
    files.map((file) => file.path),
    cards,
  );
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
