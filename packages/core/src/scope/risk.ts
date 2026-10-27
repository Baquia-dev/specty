// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import { isTestFile } from "./tests";

/**
 * Known risky content in what a task adds: a small catalog of one-line patterns, tagged with
 * their CWE, plus files that become executable and paths of payments, webhooks or security.
 * They are warnings for the person, so a pattern errs on the side of warning.
 */

export type RiskRule =
  | "tls-disabled"
  | "eval"
  | "python-exec"
  | "deserialization"
  | "shell"
  | "weak-hash"
  | "cors-any"
  | "world-writable"
  | "secret"
  | "html-unescaped"
  | "executable"
  | "risky-path";

export interface RiskFinding {
  readonly path: string;
  readonly rule: RiskRule;
  readonly cwe?: string;
  /** The line in the new version of the file, for content rules. */
  readonly line?: number;
}

interface ContentRule {
  readonly rule: RiskRule;
  readonly cwe: string;
  readonly pattern: RegExp;
  /** File extensions it applies to; all, when absent. */
  readonly extensions?: readonly string[];
}

const CONTENT: readonly ContentRule[] = [
  {
    rule: "tls-disabled",
    cwe: "CWE-295",
    pattern:
      /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0|InsecureSkipVerify\s*:\s*true|\bverify\s*=\s*False\b|_create_unverified_context|CURLOPT_SSL_VERIFYPEER\s*,\s*(?:false|0)\b|badCertificateCallback/,
  },
  { rule: "eval", cwe: "CWE-95", pattern: /\beval\s*\(|\bnew\s+Function\s*\(/ },
  { rule: "python-exec", cwe: "CWE-95", pattern: /\bexec\s*\(/, extensions: ["py"] },
  {
    rule: "deserialization",
    cwe: "CWE-502",
    pattern:
      /\b(?:pickle|marshal|cPickle)\.loads?\s*\(|\byaml\.load\s*\((?![^)]*SafeLoader)|\bMarshal\.load\b|\bunserialize\s*\(|\bObjectInputStream\b/,
  },
  {
    rule: "shell",
    cwe: "CWE-78",
    pattern: /\bshell\s*=\s*True\b|\bshell\s*:\s*true\b|\bos\.system\s*\(|\bshell_exec\s*\(/,
  },
  {
    rule: "weak-hash",
    cwe: "CWE-328",
    pattern:
      /createHash\(\s*['"](?:md5|sha1)['"]|\bhashlib\.(?:md5|sha1)\s*\(|MessageDigest\.getInstance\(\s*"(?:MD5|SHA-?1)"/i,
  },
  {
    rule: "cors-any",
    cwe: "CWE-942",
    pattern:
      /Access-Control-Allow-Origin['"]?\s*[,:]\s*['"]\*['"]|\borigin\s*:\s*(?:['"]\*['"]|true)\b.*\bcredentials\s*:\s*true/,
  },
  {
    rule: "world-writable",
    cwe: "CWE-732",
    pattern: /\bchmod\b.*\b(?:0o?)?777\b|\b0o777\b|\bchmod\s+(?:-R\s+)?[ao]\+w\b/,
  },
  {
    rule: "secret",
    cwe: "CWE-798",
    pattern:
      /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{36}\b|\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  },
  {
    rule: "html-unescaped",
    cwe: "CWE-79",
    pattern:
      /dangerouslySetInnerHTML|\.(?:inner|outer)HTML\s*=|\bbypassSecurityTrust\w*\s*\(|\bv-html\b|\{\{\{|\|\s*safe\b/,
  },
];

/** A path segment, or a file name without its extension, that handles money or security. */
const RISKY_SEGMENT = /^(?:payments?|billing|checkout|webhooks?|security|crypto|secrets?)$/i;

const LABELS: Readonly<Record<RiskRule, readonly [string, string]>> = {
  "tls-disabled": ["desactiva la verificación TLS", "disables TLS verification"],
  eval: ["ejecuta código construido al vuelo (eval)", "runs code built on the fly (eval)"],
  "python-exec": ["ejecuta código con exec", "runs code with exec"],
  deserialization: ["deserializa datos sin validar", "deserializes unchecked data"],
  shell: ["ejecuta comandos a través de la shell", "runs commands through the shell"],
  "weak-hash": ["usa un hash débil (MD5 o SHA-1)", "uses a weak hash (MD5 or SHA-1)"],
  "cors-any": ["abre CORS a cualquier origen", "opens CORS to any origin"],
  "world-writable": ["da permiso de escritura a todos", "makes it writable by everyone"],
  secret: ["parece un secreto en el código", "looks like a secret in the code"],
  "html-unescaped": ["inserta HTML sin escapar", "inserts unescaped HTML"],
  executable: ["pasa a ser ejecutable", "becomes executable"],
  "risky-path": [
    "está en una ruta de pagos, webhooks o seguridad",
    "is in a payments, webhooks or security path",
  ],
};

/** True for a rule of the catalog, such as one read back from the audit. */
export function isRiskRule(value: unknown): value is RiskRule {
  return typeof value === "string" && Object.hasOwn(LABELS, value);
}

export function riskLabel(rule: RiskRule, lang: Lang): string {
  const [es, en] = LABELS[rule];
  return lang === "es" ? es : en;
}

interface FileDiff {
  readonly path: string;
  readonly executable: boolean;
  readonly added: readonly { readonly line: number; readonly text: string }[];
}

/** The risks in what a unified `git diff -U0` adds, sorted by file and line; tests are skipped. */
export function contentRisks(diff: string): readonly RiskFinding[] {
  return filesOf(diff)
    .filter((file) => !isTestFile(file.path))
    .flatMap((file) => [
      ...(file.executable ? [{ path: file.path, rule: "executable" as const }] : []),
      ...(isRiskyPath(file.path) ? [{ path: file.path, rule: "risky-path" as const }] : []),
      ...file.added.flatMap(({ line, text }) =>
        CONTENT.filter((rule) => applies(rule, file.path) && rule.pattern.test(text)).map(
          (rule): RiskFinding => ({ path: file.path, line, rule: rule.rule, cwe: rule.cwe }),
        ),
      ),
    ])
    .toSorted((a, b) => a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0));
}

function filesOf(diff: string): FileDiff[] {
  const walk: DiffWalk = { files: [], current: undefined, inHunk: false, next: 0 };
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      startFile(walk, line);
      continue;
    }
    const file = walk.current;
    if (file === undefined) continue;
    if (walk.inHunk) hunkLine(walk, file, line);
    else headerLine(walk, file, line);
  }
  if (walk.current !== undefined) walk.files.push(walk.current);
  return walk.files;
}

/** A file of the diff being read. */
interface OpenFile {
  path: string;
  executable: boolean;
  readonly added: FileDiff["added"][number][];
}

/** Where a walk of a diff is: the files read, the open one, its hunks and the next added line. */
interface DiffWalk {
  readonly files: FileDiff[];
  current: OpenFile | undefined;
  inHunk: boolean;
  next: number;
}

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)/;

function startFile(walk: DiffWalk, line: string): void {
  if (walk.current !== undefined) walk.files.push(walk.current);
  // Mode-only changes have no `+++` header: the path comes from this line.
  walk.current = { path: line.slice(line.lastIndexOf(" b/") + 3), executable: false, added: [] };
  walk.inHunk = false;
}

/** Before the first hunk: an executable mode, the path of `+++`, and where the hunk starts. */
function headerLine(walk: DiffWalk, file: OpenFile, line: string): void {
  if (/^new (?:file )?mode 100755$/.test(line)) file.executable = true;
  else if (line.startsWith("+++ b/")) file.path = line.slice(6).replace(/\t$/, "");
  const hunk = HUNK.exec(line);
  if (hunk !== null) {
    walk.inHunk = true;
    walk.next = Number(hunk[1]);
  }
}

/** Inside the hunks: where another one starts, an added line with its number, or context. */
function hunkLine(walk: DiffWalk, file: OpenFile, line: string): void {
  if (line.startsWith("@@")) walk.next = Number(HUNK.exec(line)?.[1] ?? walk.next);
  else if (line.startsWith("+")) {
    file.added.push({ line: walk.next, text: line.slice(1) });
    walk.next += 1;
  } else if (line.startsWith(" ")) walk.next += 1;
}

function applies(rule: ContentRule, path: string): boolean {
  if (rule.extensions === undefined) return true;
  const name = path.slice(path.lastIndexOf("/") + 1);
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  return rule.extensions.includes(extension);
}

function isRiskyPath(path: string): boolean {
  const segments = path.split("/");
  const name = segments.at(-1) ?? "";
  const stem = name.includes(".") ? name.slice(0, name.indexOf(".")) : name;
  return [...segments.slice(0, -1), stem].some((segment) => RISKY_SEGMENT.test(segment));
}
