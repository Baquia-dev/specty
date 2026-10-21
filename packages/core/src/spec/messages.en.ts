// SPDX-License-Identifier: Apache-2.0
import { type MessageCatalog, param as v } from "./catalog";

const PATH_PROBLEMS: Readonly<Record<string, string>> = {
  empty: "the path is empty",
  absolute: "use a path relative to the repository root",
  parent: "do not use `..`",
  directory: "for a directory use a glob such as `folder/**`",
};

const COVERED_BY: Readonly<Record<string, string>> = { task: "a task", slice: "a slice" };

export const MESSAGES_EN: MessageCatalog = {
  "frontmatter-missing": () =>
    "Missing frontmatter with `kind` at the top of the file (for example, `kind: standard`).",
  "frontmatter-unclosed": () => "The frontmatter is not closed: add a `---` line after its fields.",
  "frontmatter-invalid": (p) => `Invalid frontmatter: ${v(p, "detail")}.`,
  "title-missing": () => "Missing title: add a `# Title` line before the sections.",
  "title-duplicate": () =>
    "There can be only one `#` title; use `##` for sections and `###` inside them.",
  "text-outside-section": () => "There is text outside a section; move it into a `##` section.",
  "section-unknown": (p) =>
    `Unknown section "${v(p, "heading")}". Valid sections: ${v(p, "valid")}.`,
  "section-duplicate": (p) =>
    `The "${v(p, "section")}" section appears more than once; merge them into one.`,
  "section-required": (p) =>
    `Missing the "${v(p, "section")}" section, required in the ${v(p, "kind")} lane.`,
  "section-not-allowed": (p) =>
    `The "${v(p, "section")}" section is not used in the ${v(p, "kind")} lane; remove it.`,
  "section-empty": (p) =>
    `The "${v(p, "section")}" section is empty; write its content, or \`- None\` if it does not apply.`,
  "line-invalid": (p) =>
    `Invalid line in "${v(p, "section")}": each item starts with \`- \` and its fields are indented below it.`,
  "fence-not-allowed": (p) =>
    `"${v(p, "section")}" does not accept code blocks; move them to the Design section.`,
  "item-invalid": (p) => `Malformed item in "${v(p, "section")}"; expected \`${v(p, "example")}\`.`,
  "item-prefix": (p) =>
    `The id ${v(p, "id")} does not belong in "${v(p, "section")}"; use the ${v(p, "prefix")} prefix.`,
  "item-duplicate": (p) => `The id ${v(p, "id")} is repeated.`,
  "item-none-mixed": (p) => `"None" cannot be combined with other items in "${v(p, "section")}".`,
  "field-unknown": (p) =>
    `Unknown field "${v(p, "field")}" in ${v(p, "id")}. Valid fields: ${v(p, "valid")}.`,
  "field-duplicate": (p) => `The "${v(p, "field")}" field is repeated in ${v(p, "id")}.`,
  "field-invalid": (p) =>
    `Invalid value in ${v(p, "id")} → ${v(p, "field")}: "${v(p, "value")}". Valid values: ${v(p, "valid")}.`,
  "path-invalid": (p) =>
    `Invalid path "${v(p, "path")}": ${PATH_PROBLEMS[v(p, "problem")] ?? v(p, "problem")}.`,
  "file-action-unknown": (p) =>
    `Unknown action "${v(p, "action")}"; use create, modify, delete or rename.`,
  "file-duplicate": (p) => `The path ${v(p, "path")} appears more than once in Files.`,
  "file-rename-target": () => "Missing the rename target; use `rename old -> new`.",
  "task-files-missing": (p) => `${v(p, "id")} has no \`files\`; list the files it may touch.`,
  "task-file-undeclared": (p) =>
    `${v(p, "id")} uses ${v(p, "path")}, which is not in the Files section; add it there or remove it from the task.`,
  "task-ac-missing": (p) =>
    `${v(p, "id")} does not say which criteria it covers (\`ac\`); for refactor, test, docs or chore, use \`ac: —\`.`,
  "task-ac-none-not-allowed": (p) =>
    `${v(p, "id")} can only use \`ac: —\` with \`type\` refactor, test, docs or chore.`,
  "reference-unknown": (p) => `${v(p, "id")} references ${v(p, "ref")}, which does not exist.`,
  "criterion-uncovered": (p) =>
    `Nothing covers ${v(p, "id")}; add it to the \`ac\` of ${COVERED_BY[v(p, "by")] ?? v(p, "by")}.`,
  "task-verify-missing": (p) =>
    `${v(p, "id")} has no \`verify\` and the configuration defines no default verification.`,
  "slice-cycle": (p) => `The slices have circular dependencies: ${v(p, "cycle")}.`,
  "quick-limits": (p) =>
    `The change does not fit the quick lane (${v(p, "detail")}); use \`kind: standard\`.`,
  "split-required": (p) =>
    `The change is too large (${v(p, "detail")}); split it into an epic with vertical slices, or into a spike if the problem is uncertainty.`,
  "done-task-changed": (p) =>
    `${v(p, "id")} is already done and cannot be modified or removed; add a new task.`,
  "closing-outside": (p) =>
    `While closing, only the Closing section can change; ${v(p, "target")} changed.`,
  "closing-premature": () =>
    "The Closing section is written when the change closes; remove it for now.",
  "closing-incomplete": () => "A spike's closing must include `### Findings` and `### Decision`.",
  "id-reused": (p) => `The id ${v(p, "id")} was already used in this change; use ${v(p, "next")}.`,
  "criterion-vague": (p) =>
    `${v(p, "id")} uses vague terms (${v(p, "terms")}); describe an observable outcome.`,
  "criterion-unstructured": (p) => `${v(p, "id")} does not follow the WHEN … THEN … form.`,
  "task-too-large": (p) =>
    `${v(p, "id")} touches ${v(p, "count")} files (recommended: at most ${v(p, "max")}); consider splitting it.`,
  "task-no-tests": (p) => `${v(p, "id")} includes no tests (policy: ${v(p, "policy")}).`,
  "file-reason-missing": (p) => `${v(p, "path")} has no reason; add it after an em dash (—).`,
  "size-near-split": (p) => `The change is close to the split threshold (${v(p, "detail")}).`,
  "possible-new-scope": (p) =>
    `${v(p, "id")} touches ${v(p, "path")}, which was not in the approved files: it may be new scope.`,
};
