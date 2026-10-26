// SPDX-License-Identifier: Apache-2.0
import { parse as parseYaml } from "yaml";
import * as z from "zod";
import type { Lang } from "../i18n";
import { CHANGE_ID } from "../ids";
import { type Diagnostic, diagnostic } from "./diagnostics";
import { CHANGE_KINDS, type ChangeKind, EFFORT_LEVELS, type Frontmatter } from "./model";

const ChangeId = z.string().regex(CHANGE_ID);

const FrontmatterSchema = z.strictObject({
  kind: z.enum(["quick", "standard", "spike", "retro", "epic"]),
  epic: ChangeId.optional(),
  slice: z
    .string()
    .regex(/^C[1-9]\d*$/)
    .optional(),
  follows: z.array(ChangeId).optional(),
  dependsOn: z.array(ChangeId).optional(),
  allowedDependencies: z.array(z.string().min(1)).optional(),
  timebox: z.string().min(1).optional(),
  estimate: z
    .strictObject({
      adjust: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
      reason: z.string().min(1),
    })
    .optional(),
  effort: z.strictObject({ review: z.enum(EFFORT_LEVELS), reason: z.string().min(1) }).optional(),
});

export interface FrontmatterResult {
  readonly frontmatter: Frontmatter;
  readonly diagnostics: readonly Diagnostic[];
}

const FALLBACK: Frontmatter = { kind: "standard", follows: [], dependsOn: [] };

export function readFrontmatter(
  raw: string | undefined,
  line: number | undefined,
  lang: Lang,
): FrontmatterResult {
  if (raw === undefined) {
    return {
      frontmatter: FALLBACK,
      diagnostics: [diagnostic(lang, { code: "frontmatter-missing", line: 1 })],
    };
  }
  const loaded = loadYaml(raw);
  if (!loaded.ok) {
    return { frontmatter: FALLBACK, diagnostics: [invalid(lang, loaded.error, line)] };
  }
  const parsed = FrontmatterSchema.safeParse(loaded.value ?? {});
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.map(String).join(".") || "frontmatter"}: ${issue.message}`)
      .join("; ");
    return {
      frontmatter: { ...FALLBACK, kind: kindOf(loaded.value) },
      diagnostics: [invalid(lang, detail, line)],
    };
  }
  const data = parsed.data;
  return {
    frontmatter: {
      kind: data.kind,
      ...(data.epic !== undefined ? { epic: data.epic } : {}),
      ...(data.slice !== undefined ? { slice: data.slice } : {}),
      follows: data.follows ?? [],
      dependsOn: data.dependsOn ?? [],
      ...(data.allowedDependencies !== undefined && data.allowedDependencies.length > 0
        ? { allowedDependencies: data.allowedDependencies }
        : {}),
      ...(data.timebox !== undefined ? { timebox: data.timebox } : {}),
      ...(data.estimate !== undefined
        ? { estimate: { adjust: data.estimate.adjust, reason: data.estimate.reason } }
        : {}),
      ...(data.effort !== undefined
        ? { effort: { review: data.effort.review, reason: data.effort.reason } }
        : {}),
    },
    diagnostics: [],
  };
}

type Loaded =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: string };

function loadYaml(raw: string): Loaded {
  try {
    const value: unknown = parseYaml(raw);
    return { ok: true, value };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message.split("\n")[0] ?? message };
  }
}

function invalid(lang: Lang, detail: string, line: number | undefined): Diagnostic {
  return diagnostic(lang, { code: "frontmatter-invalid", params: { detail }, line });
}

/** Recovers a valid kind from an otherwise invalid frontmatter, so parsing can continue. */
function kindOf(value: unknown): ChangeKind {
  const kind =
    typeof value === "object" && value !== null && "kind" in value ? value.kind : undefined;
  return CHANGE_KINDS.find((candidate) => candidate === kind) ?? "standard";
}
