// SPDX-License-Identifier: Apache-2.0
import { basename, join, resolve } from "node:path";
import {
  importedLead,
  importedSections,
  importListCard,
  importRefusalCard,
  importRequest,
  type Output,
  withLead,
} from "@baquia-dev/specty-core";
import { type OpenSpecFiles, parseOpenSpec } from "@baquia-dev/specty-exporters";
import type { Command } from "commander";
import { legacyImportable } from "../install/legacy";
import { exists, readText } from "../io/files";
import type { Session } from "../session";
import { listDir } from "../store/changes";
import { newChange } from "./new";

export function importCommand(
  program: Command,
  run: (handler: (session: Session) => Promise<Output>) => () => Promise<void>,
): void {
  program
    .command("import")
    .description("bring an OpenSpec change in as a draft, or list the ones there are")
    .argument("[folder]")
    .action((folder: string | undefined) => run((session) => importChange(session, folder))());
}

/** Where OpenSpec keeps its changes; `archive/` holds the finished ones. */
const CHANGES = "openspec/changes";

/**
 * `specty import [<folder>]` (ARCHITECTURE §6): an OpenSpec change brought in as a draft, created
 * as `new` does with its spec started; the folder stays as it was. Without a folder, the changes
 * that can be brought in.
 */
async function importChange(session: Session, folder: string | undefined): Promise<Output> {
  const { cards } = session;
  if (folder === undefined) {
    const found = [...(await importable(session.root)), ...(await legacyImportable(session.root))];
    return importListCard(found, cards);
  }
  const shown = folder.replace(/\/+$/, "");
  const path = resolve(session.environment.cwd, shown);
  if (!(await exists(path))) return importRefusalCard({ reason: "missing", folder: shown }, cards);
  const files = await openSpecFiles(path);
  if (files === undefined)
    return importRefusalCard({ reason: "no-proposal", folder: shown }, cards);
  const change = parseOpenSpec(files);
  const created = await newChange(session, {
    title: change.title ?? basename(path),
    kind: "standard",
    type: "feat",
    follows: [],
    request: importRequest(shown, session.lang),
    sections: importedSections(change, session.lang),
  });
  if (created.status !== "ok") return created;
  return importedLead(shown, cards).reduceRight((card, line) => withLead(line, card), created);
}

/** The folders of `openspec/changes/` with a proposal, the archive left out. */
async function importable(root: string): Promise<string[]> {
  const names = (await listDir(join(root, CHANGES))).filter((name) => name !== "archive");
  const found = await Promise.all(
    names.map(async (name) =>
      (await exists(join(root, CHANGES, name, "proposal.md"))) ? [name] : [],
    ),
  );
  return found.flat().map((name) => `${CHANGES}/${name}`);
}

/** The text of an OpenSpec change folder's files; none without `proposal.md`. */
async function openSpecFiles(path: string): Promise<OpenSpecFiles | undefined> {
  const proposal = await readText(join(path, "proposal.md"));
  if (proposal === undefined) return undefined;
  const [tasks, design] = await Promise.all([
    readText(join(path, "tasks.md")),
    readText(join(path, "design.md")),
  ]);
  const capabilities = await listDir(join(path, "specs"));
  const texts = await Promise.all(
    capabilities.map((capability) => readText(join(path, "specs", capability, "spec.md"))),
  );
  return {
    proposal,
    ...(tasks === undefined ? {} : { tasks }),
    ...(design === undefined ? {} : { design }),
    specs: capabilities.flatMap((capability, index) => {
      const text = texts[index];
      return text === undefined ? [] : [{ capability, text }];
    }),
  };
}
