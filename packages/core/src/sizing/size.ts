// SPDX-License-Identifier: Apache-2.0
import { isGlob, matchesAny } from "../glob";
import { counted, type Lang } from "../i18n";
import { moduleOf } from "../paths";
import type { ResolvedConfig } from "../schema/config";
import { isGoverned } from "../scope/governed";
import { isLockfile, isManifest } from "../scope/lockfiles";
import { isTestFile } from "../scope/tests";
import type { FileAction, FileEntry, Spec } from "../spec/model";

export type SizeLevel = "S" | "M" | "L" | "XL";

export const SIZE_LEVELS: readonly SizeLevel[] = ["S", "M", "L", "XL"];

/** Facts only the CLI can compute from the repository; all optional. */
export interface RepoSignals {
  /** How many files import each path. */
  readonly fanIn?: Readonly<Record<string, number>>;
  /** Modules (as returned by `moduleOf`) without tests today. */
  readonly modulesWithoutTests?: readonly string[];
  /** Repository paths each glob of the Files section matches today. */
  readonly globMatches?: Readonly<Record<string, readonly string[]>>;
  /** Paths of the Files section, or matches of its globs, generated or binary by their content. */
  readonly generated?: readonly string[];
}

export interface SizeSignals {
  readonly files: Readonly<Record<FileAction, number>>;
  /**
   * Every hand-written file, with a glob counted as its current matches plus one: what is not
   * governed, generated, a lockfile or binary adds nothing.
   */
  readonly fileCount: number;
  /** The non-test files among them: what the split and quick limits count. */
  readonly codeFiles: number;
  /** Modules of the hand-written non-test files: documentation and generated paths add none. */
  readonly modules: readonly string[];
  readonly sensitive: readonly string[];
  readonly manifests: readonly string[];
  readonly tasks: number;
  readonly highFanIn: readonly string[];
  readonly modulesWithoutTests: readonly string[];
}

export type SizeReason =
  | {
      readonly code: "files" | "modules" | "sensitive" | "tasks" | "fan-in";
      readonly count: number;
    }
  | { readonly code: "dependencies" }
  | { readonly code: "no-tests"; readonly modules: readonly string[] }
  /** The model's `estimate`: `+1` applies, `-1` is shown as not applied. */
  | { readonly code: "adjusted"; readonly adjust: -1 | 1; readonly reason: string };

export interface SizeResult {
  readonly level: SizeLevel;
  readonly baseLevel: SizeLevel;
  readonly score: number;
  readonly adjust: -1 | 0 | 1;
  readonly reasons: readonly SizeReason[];
  readonly signals: SizeSignals;
}

const HIGH_FAN_IN = 10;
const TASKS_WITHOUT_WEIGHT = 3;

export function collectSignals(
  spec: Spec,
  config: ResolvedConfig,
  repo: RepoSignals = {},
): SizeSignals {
  const entries = spec.sections.files?.items ?? [];
  const paths = [
    ...new Set(
      entries.flatMap((entry) =>
        entry.from === undefined ? [entry.path] : [entry.from, entry.path],
      ),
    ),
  ];
  const handWritten = handWrittenIn(config, repo);
  const units = unitsOf(entries, repo, handWritten);
  const actions = [...units.values()];
  const count = (action: FileAction): number => actions.filter((other) => other === action).length;
  // Tests mirror their modules and manifests already weigh as dependencies: neither adds a module.
  const code = paths.filter((path) => !isTestFile(path) && !isManifest(path) && handWritten(path));
  const modules = [...new Set(code.map(moduleOf))].toSorted();
  return {
    files: {
      create: count("create"),
      modify: count("modify"),
      delete: count("delete"),
      rename: count("rename"),
    },
    fileCount: units.size,
    codeFiles: [...units.keys()].filter((path) => !isTestFile(path)).length,
    modules,
    sensitive: paths.filter((path) => matchesAny(path, config.sensitive)),
    manifests: paths.filter(isManifest),
    tasks: spec.sections.tasks?.items.length ?? 0,
    highFanIn: paths.filter((path) => (repo.fanIn?.[path] ?? 0) >= HIGH_FAN_IN),
    modulesWithoutTests: (repo.modulesWithoutTests ?? []).filter((module) =>
      modules.includes(module),
    ),
  };
}

/**
 * Only hand-written code weighs, as in max-lines: governed, and neither generated, a lockfile nor
 * binary. An ignored folder a glob fills with generated icons must not make a change XL.
 */
function handWrittenIn(config: ResolvedConfig, repo: RepoSignals): (path: string) => boolean {
  const generated = new Set(repo.generated);
  return (path) =>
    isGoverned(path, config) &&
    !matchesAny(path, config.scope.generated) &&
    !isLockfile(path) &&
    !generated.has(path);
}

/**
 * The hand-written files a change touches, with the action of the first entry that names each:
 * a glob counts as its current matches plus one (formats.md §1), a path listed twice, once.
 */
function unitsOf(
  entries: readonly FileEntry[],
  repo: RepoSignals,
  handWritten: (path: string) => boolean,
): ReadonlyMap<string, FileAction> {
  const units = new Map<string, FileAction>();
  for (const entry of entries) {
    const matches = isGlob(entry.path) ? (repo.globMatches?.[entry.path] ?? []) : [];
    for (const unit of [...matches, entry.path]) {
      if (!units.has(unit) && handWritten(unit)) units.set(unit, entry.action);
    }
  }
  return units;
}

/** Deterministic size of a change; the model may raise it one level through `estimate`. */
export function computeSize(
  spec: Spec,
  config: ResolvedConfig,
  repo: RepoSignals = {},
): SizeResult {
  const signals = collectSignals(spec, config, repo);
  const { files } = signals;
  const score =
    files.create +
    files.modify +
    2 * (files.delete + files.rename) +
    2 * Math.max(0, signals.modules.length - 1) +
    3 * signals.sensitive.length +
    (signals.manifests.length > 0 ? 2 : 0) +
    Math.max(0, signals.tasks - TASKS_WITHOUT_WEIGHT) +
    signals.highFanIn.length +
    2 * signals.modulesWithoutTests.length;
  const baseLevel = levelFor(score, config.size);
  const estimate = spec.frontmatter.estimate;
  // The model may only raise the size: lowering it could dodge the split of an XL change.
  const adjust = estimate?.adjust === 1 ? 1 : 0;
  const when = (condition: boolean, reason: SizeReason): SizeReason[] =>
    condition ? [reason] : [];
  const reasons: SizeReason[] = [
    { code: "files", count: signals.fileCount },
    ...when(signals.modules.length > 1, { code: "modules", count: signals.modules.length }),
    ...when(signals.sensitive.length > 0, { code: "sensitive", count: signals.sensitive.length }),
    ...when(signals.manifests.length > 0, { code: "dependencies" }),
    ...when(signals.tasks > TASKS_WITHOUT_WEIGHT, { code: "tasks", count: signals.tasks }),
    ...when(signals.highFanIn.length > 0, { code: "fan-in", count: signals.highFanIn.length }),
    ...when(signals.modulesWithoutTests.length > 0, {
      code: "no-tests",
      modules: signals.modulesWithoutTests,
    }),
    ...(estimate !== undefined && estimate.adjust !== 0
      ? [{ code: "adjusted", adjust: estimate.adjust, reason: estimate.reason } as const]
      : []),
  ];
  return { level: shift(baseLevel, adjust), baseLevel, score, adjust, reasons, signals };
}

export function formatSizeReason(reason: SizeReason, lang: Lang): string {
  const es = lang === "es";
  switch (reason.code) {
    case "files":
      return es
        ? counted(reason.count, "archivo", "archivos")
        : counted(reason.count, "file", "files");
    case "modules":
      return es
        ? counted(reason.count, "módulo", "módulos")
        : counted(reason.count, "module", "modules");
    case "sensitive":
      return es
        ? counted(reason.count, "ruta sensible", "rutas sensibles")
        : counted(reason.count, "sensitive path", "sensitive paths");
    case "tasks":
      return es ? counted(reason.count, "tarea", "tareas") : counted(reason.count, "task", "tasks");
    case "fan-in":
      return es
        ? counted(reason.count, "archivo muy importado", "archivos muy importados")
        : counted(reason.count, "widely imported file", "widely imported files");
    case "dependencies":
      return es ? "cambia dependencias" : "changes dependencies";
    case "no-tests":
      return `${es ? "sin tests en" : "no tests in"} ${reason.modules.join(", ")}`;
    case "adjusted":
      if (reason.adjust < 0) {
        return es
          ? "ajuste del modelo (-1) sin aplicar: el tamaño solo puede subir"
          : "model adjustment (-1) not applied: the size can only go up";
      }
      return `${es ? "ajuste del modelo" : "model adjustment"} (+1): ${reason.reason}`;
  }
}

function levelFor(score: number, thresholds: ResolvedConfig["size"]): SizeLevel {
  if (score <= thresholds.S) return "S";
  if (score <= thresholds.M) return "M";
  if (score <= thresholds.L) return "L";
  return "XL";
}

function shift(level: SizeLevel, adjust: -1 | 0 | 1): SizeLevel {
  const index = Math.min(SIZE_LEVELS.length - 1, Math.max(0, SIZE_LEVELS.indexOf(level) + adjust));
  return SIZE_LEVELS[index] ?? level;
}
