// SPDX-License-Identifier: Apache-2.0
import type { ImportedChange } from "@baquia-dev/specty-core";

/**
 * OpenSpec's change folder read back (formats.md §10): the inverse of the exporter, from the text
 * of its files to what the change says. Core's cards turn it into a spec's sections.
 */

/** The text of each file of an OpenSpec change folder. */
export interface OpenSpecFiles {
  readonly proposal: string;
  readonly tasks?: string;
  readonly design?: string;
  /** Each `specs/<capability>/spec.md`. */
  readonly specs: readonly { readonly capability: string; readonly text: string }[];
}

interface Part {
  readonly heading: string;
  readonly body: string;
}

type Scenario = ImportedChange["scenarios"][number];

export function parseOpenSpec(files: OpenSpecFiles): ImportedChange {
  const proposal = proposalOf(files.proposal);
  const tasks = tasksOf(files.tasks ?? "");
  const specs = files.specs.map((spec) => specOf(spec.capability, spec.text));
  const design = files.design === undefined ? "" : withoutTitle(files.design).body;
  return {
    ...proposal,
    ...(design === "" ? {} : { design }),
    scenarios: specs.flatMap((spec) => spec.scenarios),
    loose: specs.flatMap((spec) => spec.loose),
    removed: specs.flatMap((spec) => spec.removed),
    ...tasks,
  };
}

/** The text cut at its headings of `level`: what comes before the first, then each one's. */
function partsOf(text: string, level: number): Part[] {
  const marker = `${"#".repeat(level)} `;
  const parts: { heading: string; lines: string[] }[] = [{ heading: "", lines: [] }];
  for (const line of text.split("\n")) {
    if (line.startsWith(marker))
      parts.push({ heading: line.slice(marker.length).trim(), lines: [] });
    else parts[parts.length - 1]?.lines.push(line);
  }
  return parts
    .map((part) => ({ heading: part.heading, body: part.lines.join("\n").trim() }))
    .filter((part, index) => index > 0 || part.body !== "");
}

/** The `#` title, if the text starts with one, and the rest. */
function withoutTitle(text: string): { readonly title?: string; readonly body: string } {
  const lines = text.trim().split("\n");
  const first = lines[0] ?? "";
  if (!first.startsWith("# ")) return { body: text.trim() };
  const title = first
    .slice(2)
    .replace(/^(change|proposal):\s*/i, "")
    .trim();
  return { title, body: lines.slice(1).join("\n").trim() };
}

/** Why, What Changes and Out of Scope; any other part of the proposal, as it is. */
function proposalOf(
  text: string,
): Pick<ImportedChange, "title" | "why" | "whatChanges" | "outOfScope" | "other"> {
  const { title, body } = withoutTitle(text);
  const parts = partsOf(body, 2);
  const named = (name: string) => parts.find((part) => part.heading.toLowerCase() === name)?.body;
  const known = ["why", "what changes", "out of scope"];
  const why = named("why");
  const whatChanges = named("what changes");
  const outOfScope = named("out of scope");
  return {
    ...(title === undefined ? {} : { title }),
    ...(why === undefined ? {} : { why }),
    ...(whatChanges === undefined ? {} : { whatChanges }),
    ...(outOfScope === undefined ? {} : { outOfScope }),
    other: parts.filter((part) => !known.includes(part.heading.toLowerCase())),
  };
}

/** The checkboxes of `tasks.md`, without their numbering: those to do and those done. */
function tasksOf(text: string): Pick<ImportedChange, "pending" | "done"> {
  const tasks = text.split("\n").flatMap((line) => {
    const [, mark, title] = /^\s*- \[([ xX])\]\s+(.*)$/.exec(line) ?? [];
    if (mark === undefined || title === undefined) return [];
    return [{ done: mark !== " ", title: title.replace(/^\d+(\.\d+)*\.?\s+/, "").trim() }];
  });
  return {
    pending: tasks.filter((task) => !task.done).map((task) => task.title),
    done: tasks.filter((task) => task.done).map((task) => task.title),
  };
}

/** A capability's delta: the scenarios that make criteria, what does not, and what it removes. */
function specOf(
  capability: string,
  text: string,
): Pick<ImportedChange, "scenarios" | "loose" | "removed"> {
  const scenarios: Scenario[] = [];
  const loose: string[] = [];
  const removed: string[] = [];
  for (const delta of partsOf(text, 2)) {
    for (const requirement of partsOf(delta.body, 3)) {
      const name = requirement.heading.replace(/^requirement:\s*/i, "");
      if (requirement.heading === "") continue;
      if (/^removed/i.test(delta.heading)) {
        removed.push(`${capability}: ${name}`);
        continue;
      }
      const read = requirementOf(`${capability}: ${name}`, requirement.body);
      scenarios.push(...read.scenarios);
      loose.push(...read.loose);
    }
  }
  return { scenarios, loose, removed };
}

/** A requirement's scenarios; a scenario without WHEN and THEN, or no scenario, stays as text. */
function requirementOf(
  label: string,
  body: string,
): { readonly scenarios: Scenario[]; readonly loose: string[] } {
  const parts = partsOf(body, 4);
  const statement = parts.find((part) => part.heading === "")?.body ?? "";
  const cases = parts.filter((part) => part.heading !== "");
  if (cases.length === 0) return { scenarios: [], loose: [`${label} — ${statement}`] };
  const scenarios: Scenario[] = [];
  const loose: string[] = [];
  for (const scenario of cases) {
    const clauses = clausesOf(scenario.body);
    const { given, when, outcome } = clauses;
    if (when !== undefined && outcome !== undefined) {
      scenarios.push({ ...(given === undefined ? {} : { given }), when, outcome });
    } else {
      const name = scenario.heading.replace(/^scenario:\s*/i, "");
      loose.push(`${label} — ${name}: ${clauses.text}`);
    }
  }
  return { scenarios, loose };
}

/** The GIVEN, WHEN and THEN of a scenario, each AND joined to the one before, and all as text. */
function clausesOf(body: string): {
  readonly given?: string;
  readonly when?: string;
  readonly outcome?: string;
  readonly text: string;
} {
  const clauses: { key: "given" | "when" | "then"; text: string }[] = [];
  for (const line of body.split("\n")) {
    const [, key, text] = /^\s*-\s*\*\*(GIVEN|WHEN|THEN|AND)\*\*\s*(.*)$/i.exec(line) ?? [];
    if (key === undefined || text === undefined) continue;
    const last = clauses[clauses.length - 1];
    if (key.toUpperCase() === "AND" && last !== undefined) last.text = `${last.text} and ${text}`;
    else if (key.toUpperCase() !== "AND") clauses.push({ key: lower(key), text });
  }
  const found = (key: "given" | "when" | "then") => clauses.find((clause) => clause.key === key);
  const [given, when, then] = [found("given"), found("when"), found("then")];
  return {
    ...(given === undefined ? {} : { given: given.text }),
    ...(when === undefined ? {} : { when: when.text }),
    ...(then === undefined ? {} : { outcome: then.text }),
    text: clauses.map((clause) => `${clause.key.toUpperCase()} ${clause.text}`).join(" "),
  };
}

function lower(key: string): "given" | "when" | "then" {
  const value = key.toLowerCase();
  return value === "given" || value === "when" ? value : "then";
}
