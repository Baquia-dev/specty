// SPDX-License-Identifier: Apache-2.0
import {
  blockedCard,
  type ChangedFile,
  type ChangeState,
  type FileEntry,
  headerOf,
  isGoverned,
  makeChangeId,
  moduleOf,
  type Output,
  parseSpec,
  retroCreatedCard,
  type Spec,
  serializeSpec,
  shortHash,
  specHash,
  specTemplate,
  translator,
} from "@baquia-dev/specty-core";
import { commitState, isFinished } from "../flow/active";
import { finishRetro } from "../flow/finish";
import { writeText } from "../io/files";
import type { Session } from "../session";
import { initialState, loadChange, readSpec, type StoredChange } from "../store/changes";
import { readPointer, writePointer } from "../store/local";
import { changeFiles } from "../store/paths";
import { propose } from "./propose";

/**
 * `specty retro`: documents governed changes that are already staged. The agent writes the
 * spec; with `--minimal` (if enabled) the person writes a one-line reason instead.
 */
export async function retro(session: Session, minimal: boolean): Promise<Output> {
  const t = translator(session.lang);
  const { cards } = session;
  const current = await readPointer(session.git, "retro");
  const existing = current === undefined ? undefined : await loadChange(session.paths, current);
  if (existing !== undefined && !isFinished(existing.state)) {
    return blockedCard(
      headerOf(existing.state.id, existing.state.phase),
      t(
        `Ya hay una retro en curso: ${existing.state.id}.`,
        `A retro is already in progress: ${existing.state.id}.`,
      ),
      t(`ejecuta \`${cards.command} next\`.`, `run \`${cards.command} next\`.`),
    );
  }
  const staged = (await session.git.staged()).filter(
    (file) =>
      !file.path.startsWith(".specty/") &&
      (isGoverned(file.path, session.config) ||
        (file.from !== undefined && isGoverned(file.from, session.config))),
  );
  if (staged.length === 0) {
    return blockedCard(
      headerOf(),
      t("No hay código gobernado preparado.", "There is no staged governed code."),
      t(
        `prepara los cambios con \`git add\` y vuelve a ejecutar \`${cards.command} retro\`.`,
        `stage the changes with \`git add\` and run \`${cards.command} retro\` again.`,
      ),
    );
  }
  if (minimal) return minimalRetro(session, staged);
  const change = await createRetro(session, staged);
  return retroCreatedCard(
    headerOf(change.state.id, "draft"),
    session.paths.relative(change.files.spec),
    staged.map((file) => file.path),
    cards,
  );
}

async function createRetro(
  session: Session,
  staged: readonly ChangedFile[],
): Promise<StoredChange> {
  const t = translator(session.lang);
  const tree = await session.git.writeTree();
  const modules = [...new Set(staged.map((file) => moduleOf(file.path)))].join(", ");
  const id = makeChangeId(session.environment.now(), `retro ${shortHash(tree)}`);
  const files = changeFiles(session.paths.changeDir(id));
  await writeText(
    files.spec,
    specTemplate({
      kind: "retro",
      lang: session.lang,
      title: t(`Cambios manuales en ${modules}`, `Manual changes in ${modules}`),
      files: staged.map(entryOf),
    }),
  );
  const state = initialState({ id, kind: "retro", baseCommit: await session.git.head() });
  await writePointer(session.git, "retro", id);
  return commitState(session, { files, state, archived: false }, state, "change.created", {
    kind: "retro",
    tree,
  });
}

async function minimalRetro(session: Session, staged: readonly ChangedFile[]): Promise<Output> {
  const t = translator(session.lang);
  const { terminal } = session.environment;
  if (!terminal.interactive || session.config.retro.mode !== "minimal") {
    return blockedCard(
      headerOf(),
      t(
        "El modo minimal no está activado (retro.mode: minimal) o no hay una persona en la terminal.",
        "Minimal mode is not enabled (retro.mode: minimal) or there is no person at the terminal.",
      ),
      t(
        "pídele a tu agente: «Documenta los cambios preparados con specty retro».",
        'ask your agent: "Document the staged changes with specty retro".',
      ),
    );
  }
  const reason = (
    await terminal.ask(t("¿Por qué hiciste estos cambios?", "Why did you make these changes?"))
  )?.trim();
  if (reason === undefined || reason.length === 0) {
    return blockedCard(
      headerOf(),
      t("Sin motivo no hay retro.", "No reason, no retro."),
      t(
        `vuelve a ejecutar \`${session.cards.command} retro --minimal\`.`,
        `run \`${session.cards.command} retro --minimal\` again.`,
      ),
    );
  }
  const change = await createRetro(session, staged);
  const spec: Spec = {
    language: session.lang,
    title: parseSpec(await readSpec(change.files)).spec.title,
    frontmatter: { kind: "retro", follows: [], dependsOn: [] },
    sections: {
      goal: reason,
      reason,
      files: { none: false, items: staged.map(entryOf) },
      risks: { none: true, items: [] },
    },
  };
  await writeText(change.files.spec, serializeSpec(spec));
  const proposed = await propose(session);
  if (proposed.status !== "ok") return proposed;
  const reloaded = await loadChange(session.paths, change.state.id);
  if (reloaded === undefined) return proposed;
  const approved: ChangeState = {
    ...reloaded.state,
    approved: {
      revision: reloaded.state.revision,
      hash: specHash(spec),
      at: session.environment.now().toISOString(),
      by: (await session.git.config("user.name")) ?? "unknown",
      channel: "tty",
    },
  };
  return retroDone(session, await finishRetro(session, reloaded, approved));
}

/** The retro is documented: the person repeats their commit. */
export function retroDone(session: Session, change: StoredChange): Output {
  const t = translator(session.lang);
  return {
    status: "ok",
    header: headerOf(change.state.id, "done"),
    blocks: [
      {
        lines: [
          t(
            "Cambios documentados y preparados junto a tu commit.",
            "Changes documented and staged with your commit.",
          ),
        ],
      },
    ],
    next: t("vuelve a ejecutar `git commit`.", "run `git commit` again."),
  };
}

function entryOf(file: ChangedFile): FileEntry {
  switch (file.status) {
    case "added":
      return { action: "create", path: file.path };
    case "deleted":
      return { action: "delete", path: file.path };
    case "renamed":
      return file.from === undefined
        ? { action: "create", path: file.path }
        : { action: "rename", path: file.path, from: file.from };
    case "modified":
      return { action: "modify", path: file.path };
  }
}
