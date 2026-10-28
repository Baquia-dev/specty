// SPDX-License-Identifier: Apache-2.0
import { mkdir, readdir, rename } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  type CardContext,
  configTemplate,
  type Lang,
  legacyDoneLines,
  legacyMoveBody,
  legacyPlanCard,
  legacyRefusalCard,
  legacyRemovalBody,
  legacyStepQuestion,
  legacyStepTitle,
  type Output,
} from "@baquia-dev/specty-core";
import { parse } from "yaml";
import { exists, isRecord, readText, writeText } from "../io/files";
import type { Git } from "../io/git";
import type { Environment } from "../session";
import { listDir } from "../store/changes";

/**
 * An installation of the legacy, `@barcidev/specty` (ADR 0005), migrated by `init` before it
 * reads the configuration (ARCHITECTURE §14): its `.specty/` moves to `.specty/legacy/`, its
 * configuration is translated, and its git hooks and AGENTS.md blocks go, each step shown to the
 * person and confirmed by them.
 */

const LEGACY = ".specty/legacy";
/** The keys of the legacy's configuration that the new one does not have. */
const LEGACY_KEYS = ["spec_engine", "governance", "scopes"];
/** The legacy's git hook, between its markers. */
const HOOK = /^# >>> specty-hook >>>\n[\s\S]*?^# <<< specty-hook <<<\n?/m;
/** The legacy's blocks carry a hash; the new ones do not. */
const BLOCK =
  /<!-- specty:begin id=([\w-]+) hash=[a-f0-9]+ -->[\s\S]*?<!-- specty:end id=\1 -->\n?/g;

/** A file a step rewrites: what it takes out, and the text it leaves. */
interface Removal {
  readonly path: string;
  readonly lines: readonly string[];
  readonly after: string;
}

interface Plan {
  /** The entries of `.specty/`, by path. */
  readonly moved: readonly string[];
  readonly config: string;
  readonly hooks: readonly Removal[];
  readonly agents: Removal | undefined;
}

export type Migration =
  | { readonly kind: "none" }
  | { readonly kind: "refused"; readonly output: Output }
  | {
      readonly kind: "done";
      readonly done: readonly string[];
      readonly written: readonly string[];
    };

export async function migrateLegacy(options: {
  readonly environment: Environment;
  readonly root: string;
  readonly git: Git;
  readonly cards: CardContext;
  readonly dryRun: boolean;
}): Promise<Migration> {
  const { environment, root, git, cards, dryRun } = options;
  const legacy = await legacyConfig(root);
  if (legacy === undefined) return { kind: "none" };
  const plan = await planOf(root, git, legacy, cards.lang);
  if (dryRun) {
    const hooks = plan.hooks.map((hook) => hook.path);
    return {
      kind: "refused",
      output: legacyPlanCard(
        { moved: plan.moved, hooks, agents: plan.agents !== undefined },
        cards,
      ),
    };
  }
  if (!environment.terminal.interactive) {
    return { kind: "refused", output: legacyRefusalCard("not-interactive", cards) };
  }
  return apply(environment, root, plan, cards);
}

/** The legacy's configuration, when `.specty/config.yaml` is one. */
async function legacyConfig(root: string): Promise<Record<string, unknown> | undefined> {
  const text = await readText(join(root, ".specty/config.yaml"));
  if (text === undefined) return undefined;
  let value: unknown;
  try {
    value = parse(text);
  } catch {
    return undefined;
  }
  return isRecord(value) && LEGACY_KEYS.some((key) => key in value) ? value : undefined;
}

async function planOf(
  root: string,
  git: Git,
  legacy: Readonly<Record<string, unknown>>,
  lang: Lang,
): Promise<Plan> {
  const entries = (await readdir(join(root, ".specty"))).filter((name) => name !== "legacy");
  const agents = await readText(join(root, "AGENTS.md"));
  const blocks = agents === undefined ? [] : [...agents.matchAll(BLOCK)].map((match) => match[0]);
  return {
    moved: entries.toSorted().map((name) => `.specty/${name}`),
    config: translated(legacy, lang),
    hooks: await hookRemovals(root, git),
    agents:
      agents === undefined || blocks.length === 0
        ? undefined
        : {
            path: "AGENTS.md",
            lines: blocks.flatMap((block) => block.trimEnd().split("\n")),
            after: agents.replace(BLOCK, "").replace(/\n{3,}/g, "\n\n"),
          },
  };
}

/** The new configuration: the legacy's language, paths and verification; the rest by default. */
function translated(legacy: Readonly<Record<string, unknown>>, fallback: Lang): string {
  const governance = isRecord(legacy.governance) ? legacy.governance : {};
  const governed = strings(governance.source_paths);
  const ignored = strings(governance.exempt_paths);
  const language = legacy.language;
  return configTemplate({
    lang: language === "es" || language === "en" ? language : fallback,
    verify: verifyOf(legacy.scopes),
    generated: [],
    ...(governed === undefined ? {} : { governed }),
    ...(ignored === undefined ? {} : { ignored }),
  });
}

/** The first scope's commands: its tests by default, and lint, tests and build in full. */
function verifyOf(scopes: unknown): { readonly default?: string; readonly full?: string } {
  const first: unknown = Array.isArray(scopes) ? scopes[0] : undefined;
  const verify = isRecord(first) && isRecord(first.verify) ? first.verify : {};
  const command = (key: string): string[] => {
    const value = verify[key];
    return typeof value === "string" ? [value] : [];
  };
  const [test] = command("test");
  const full = ["lint", "test", "build"].flatMap(command).join(" && ");
  return { ...(test === undefined ? {} : { default: test }), ...(full === "" ? {} : { full }) };
}

function strings(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string")
    ? value
    : undefined;
}

/** The legacy's hook in each of husky's files and git's hooks. */
async function hookRemovals(root: string, git: Git): Promise<Removal[]> {
  const configured = await git.config("core.hooksPath");
  const hooks = configured === undefined ? await git.gitPath("hooks") : join(root, configured);
  const folders = [...new Set([join(root, ".husky"), hooks])];
  const removals = await Promise.all(
    folders.map(async (folder) => {
      const names = await readdir(folder, { withFileTypes: true }).catch(() => []);
      const files = names
        .filter((entry) => entry.isFile())
        .map((entry) => join(folder, entry.name));
      return Promise.all(files.map((file) => hookRemoval(root, file)));
    }),
  );
  return removals.flat().flatMap((removal) => (removal === undefined ? [] : [removal]));
}

async function hookRemoval(root: string, file: string): Promise<Removal | undefined> {
  const text = await readText(file);
  const hook = text === undefined ? undefined : HOOK.exec(text)?.[0];
  if (text === undefined || hook === undefined) return undefined;
  return {
    path: relative(root, file).split("\\").join("/"),
    lines: hook.trimEnd().split("\n"),
    after: text.replace(HOOK, ""),
  };
}

/** Each step, with its note and its question; declining the first one changes nothing. */
async function apply(
  environment: Environment,
  root: string,
  plan: Plan,
  cards: CardContext,
): Promise<Migration> {
  const { terminal } = environment;
  const { lang } = cards;
  terminal.note(legacyStepTitle("move", lang), legacyMoveBody(plan.moved, plan.config, lang));
  if (!(await terminal.confirm(legacyStepQuestion("move", lang)))) {
    return { kind: "refused", output: legacyRefusalCard("declined", cards) };
  }
  const moved = await move(root, plan.moved);
  await writeText(join(root, ".specty/config.yaml"), plan.config);
  const hooks = await removeStep(environment, root, "hooks", plan.hooks, lang);
  const agents = await removeStep(
    environment,
    root,
    "agents",
    plan.agents ? [plan.agents] : [],
    lang,
  );
  const changes = await legacyImportable(root);
  return {
    kind: "done",
    done: legacyDoneLines({ hooks, agents: agents.length > 0, changes }, lang),
    written: [...moved, ".specty/config.yaml", ...hooks, ...agents],
  };
}

/** Moves the entries to `.specty/legacy/`: the paths of their files, before and after. */
async function move(root: string, entries: readonly string[]): Promise<string[]> {
  await mkdir(join(root, LEGACY), { recursive: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const target = entry.replace(/^\.specty\//, `${LEGACY}/`);
    for (const file of await filesUnder(root, entry)) {
      paths.push(file, file.replace(/^\.specty\//, `${LEGACY}/`));
    }
    await rename(join(root, entry), join(root, target));
  }
  return paths;
}

/** The files under `path`, itself if it is one, repository-relative. */
async function filesUnder(root: string, path: string): Promise<string[]> {
  const entries = await readdir(join(root, path), { withFileTypes: true }).catch(() => undefined);
  if (entries === undefined) return [path];
  const nested = await Promise.all(
    entries.map((entry) => filesUnder(root, `${path}/${entry.name}`)),
  );
  return nested.flat();
}

/** A step that takes the legacy's lines out of files, if the person says so: the files changed. */
async function removeStep(
  environment: Environment,
  root: string,
  step: "hooks" | "agents",
  removals: readonly Removal[],
  lang: Lang,
): Promise<string[]> {
  if (removals.length === 0) return [];
  const { terminal } = environment;
  terminal.note(legacyStepTitle(step, lang), legacyRemovalBody(removals));
  if (!(await terminal.confirm(legacyStepQuestion(step, lang)))) return [];
  for (const removal of removals) await writeText(join(root, removal.path), removal.after);
  return removals.map((removal) => removal.path);
}

/** The legacy's changes `specty import` can bring in: those with a proposal. */
export async function legacyImportable(root: string): Promise<string[]> {
  const changes = `${LEGACY}/changes`;
  const names = await listDir(join(root, changes));
  const found = await Promise.all(
    names.map(async (name) =>
      (await exists(join(root, changes, name, "proposal.md"))) ? [name] : [],
    ),
  );
  return found.flat().map((name) => `${changes}/${name}`);
}
