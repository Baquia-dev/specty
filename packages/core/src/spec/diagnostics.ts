// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import type { MessageCatalog, MessageParams } from "./catalog";
import { MESSAGES_EN } from "./messages.en";
import { MESSAGES_ES } from "./messages.es";

export type { MessageCatalog, MessageParams } from "./catalog";

export type DiagnosticCode =
  | "frontmatter-missing"
  | "frontmatter-unclosed"
  | "frontmatter-invalid"
  | "comment-unclosed"
  | "title-missing"
  | "title-duplicate"
  | "text-outside-section"
  | "section-unknown"
  | "section-duplicate"
  | "section-required"
  | "section-not-allowed"
  | "section-empty"
  | "line-invalid"
  | "fence-not-allowed"
  | "item-invalid"
  | "item-prefix"
  | "item-duplicate"
  | "item-none-mixed"
  | "field-unknown"
  | "field-duplicate"
  | "field-invalid"
  | "path-invalid"
  | "file-action-unknown"
  | "file-duplicate"
  | "file-rename-target"
  | "task-files-missing"
  | "task-file-undeclared"
  | "task-ac-missing"
  | "task-ac-none-not-allowed"
  | "reference-unknown"
  | "criterion-uncovered"
  | "task-verify-missing"
  | "slice-cycle"
  | "quick-limits"
  | "split-required"
  | "done-task-changed"
  | "closing-outside"
  | "closing-premature"
  | "closing-incomplete"
  | "id-reused"
  | "criterion-vague"
  | "criterion-unstructured"
  | "task-too-large"
  | "task-no-tests"
  | "file-reason-missing"
  | "size-near-split"
  | "possible-new-scope";

export type Severity = "error" | "warning";

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly severity: Severity;
  readonly message: string;
  /** 1-based source line, when known. */
  readonly line?: number;
  /** Item id, section key (`section:goal`) or path the diagnostic is about. */
  readonly target?: string;
}

export interface DiagnosticInput {
  readonly code: DiagnosticCode;
  readonly params?: MessageParams;
  readonly line?: number | undefined;
  readonly target?: string | undefined;
  readonly severity?: Severity;
}

const CATALOGS: Readonly<Record<Lang, MessageCatalog>> = { es: MESSAGES_ES, en: MESSAGES_EN };

const WARNINGS: ReadonlySet<DiagnosticCode> = new Set<DiagnosticCode>([
  "criterion-vague",
  "criterion-unstructured",
  "task-too-large",
  "task-no-tests",
  "file-reason-missing",
  "size-near-split",
  "possible-new-scope",
]);

export function diagnostic(lang: Lang, input: DiagnosticInput): Diagnostic {
  return {
    code: input.code,
    severity: input.severity ?? (WARNINGS.has(input.code) ? "warning" : "error"),
    message: CATALOGS[lang][input.code](input.params ?? {}),
    ...(input.line !== undefined ? { line: input.line } : {}),
    ...(input.target !== undefined ? { target: input.target } : {}),
  };
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((entry) => entry.severity === "error");
}
