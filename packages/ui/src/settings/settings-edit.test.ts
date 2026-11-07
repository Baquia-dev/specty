// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_CONFIG, defaultGlossary, resolveConfig } from "@baquia-dev/specty-core";
import { optionName, SETTINGS, type Setting, settingText } from "@baquia-dev/specty-core/light";
import type { DiffPart } from "../data/records";
import type { ConfigRecord } from "../data/source";
import {
  applyEdits,
  changeLines,
  type Drafts,
  draftOf,
  editsOf,
  fieldsOf,
  fieldText,
  resetDraft,
  type SettingField,
  withDraft,
} from "./settings-edit";

/** A project in Spanish with its own task verification, a longer limit, tests as contract, a size and a coverage of its own. */
const INPUT = {
  version: 1,
  language: "es",
  verify: { default: "pnpm test", timeoutSec: 2000 },
  policy: { tests: "contract" },
  size: { M: 12 },
  checks: { coverage: { warn: 70, error: 50 }, levels: { "max-lines": "warn", todo: "off" } },
};

/** What the server gives for a valid `input`: what Specty uses, and the defaults in Spanish. */
function valid(input: Readonly<Record<string, unknown>>): ConfigRecord {
  const result = resolveConfig(input);
  if (!result.ok) throw new Error("the sample is not valid");
  return {
    input,
    config: result.config,
    defaults: { ...DEFAULT_CONFIG, glossary: defaultGlossary("es") },
    issues: [],
  };
}

const RECORD = valid(INPUT);
const NONE: Drafts = new Map();

function setting(key: string): Setting {
  const found = SETTINGS.find((candidate) => candidate.key === key);
  if (found === undefined) throw new Error(`no setting ${key}`);
  return found;
}

/** The field of a setting at `path`, with dots. */
function field(path: string): SettingField {
  for (const candidate of SETTINGS) {
    const found = fieldsOf(candidate, RECORD).find((each) => each.path.join(".") === path);
    if (found !== undefined) return found;
  }
  throw new Error(`no field ${path}`);
}

/** A diff as one text: `+added+`, `-removed-`, the rest as it is. */
function marked(parts: readonly DiffPart[] | undefined): string | undefined {
  return parts
    ?.map(({ text, change }) =>
      change === "added" ? `+${text}+` : change === "removed" ? `-${text}-` : text,
    )
    .join("");
}

describe("the edit model of the settings page", () => {
  it("AC1: gives each setting the UI saves its fields, by the kind of its value", () => {
    expect(fieldsOf(setting("policy.tests"), RECORD)).toEqual([
      { path: ["policy", "tests"], kind: "choice", options: setting("policy.tests").options },
    ]);
    expect(fieldsOf(setting("subagents"), RECORD)).toEqual([
      { path: ["subagents"], kind: "toggle" },
    ]);
    expect(fieldsOf(setting("verify.timeoutSec"), RECORD)).toEqual([
      { path: ["verify", "timeoutSec"], kind: "number", unit: "s" },
    ]);
    expect(fieldsOf(setting("ui.port"), RECORD)).toEqual([
      { path: ["ui", "port"], kind: "number" },
    ]);
    expect(fieldsOf(setting("git.branchPattern"), RECORD)).toEqual([
      { path: ["git", "branchPattern"], kind: "text" },
    ]);
    expect(fieldsOf(setting("verify.default"), RECORD)).toEqual([
      { path: ["verify", "default"], kind: "text" },
    ]);
    expect(fieldsOf(setting("governed"), RECORD)).toEqual([{ path: ["governed"], kind: "lines" }]);
    expect(fieldsOf(setting("dev.ports"), RECORD)).toEqual([
      { path: ["dev", "ports"], kind: "lines", items: "number" },
    ]);
    // A group: a field per key of its default and of the file.
    expect(fieldsOf(setting("size"), RECORD)).toEqual(
      ["S", "M", "L"].map((key) => ({ path: ["size", key], label: key, kind: "number" })),
    );
    expect(fieldsOf(setting("checks.todo"), RECORD)).toEqual([
      { path: ["checks", "todo", "markers"], label: "markers", kind: "lines" },
      { path: ["checks", "todo", "reference"], label: "reference", kind: "text" },
    ]);
    expect(fieldsOf(setting("checks.coverage"), RECORD)).toEqual([
      { path: ["checks", "coverage", "reports"], label: "reports", kind: "lines" },
      { path: ["checks", "coverage", "warn"], label: "warn", kind: "number" },
      { path: ["checks", "coverage", "error"], label: "error", kind: "number" },
    ]);
    // A map, or a group empty by default: one `name: value` per line.
    expect(fieldsOf(setting("checks.levels"), RECORD)).toEqual([
      { path: ["checks", "levels"], kind: "entries" },
    ]);
    expect(fieldsOf(setting("checks.commands"), RECORD)).toEqual([
      { path: ["checks", "commands"], kind: "entries" },
    ]);
    // Not saved from the UI: no field.
    for (const key of [
      "team.approvers",
      "ui.requireUserPresence",
      "effort",
      "guarantee.receipts",
      "specty delegate",
      "verify.units",
      "checks.generators",
      "checks.layers",
      "checks.testTime",
    ]) {
      expect(fieldsOf(setting(key), RECORD), key).toEqual([]);
    }
  });

  it("AC1: shows each field's value of the file, or else its default, as text", () => {
    const text = (path: string) => fieldText(field(path), RECORD, NONE);
    expect(text("verify.timeoutSec")).toBe("2000");
    expect(text("verify.slots")).toBe("2");
    expect(text("verify.quick")).toBe("");
    expect(text("policy.tests")).toBe("contract");
    expect(text("subagents")).toBe("true");
    expect(text("ui.port")).toBe("auto");
    expect(text("governed")).toBe("**");
    expect(text("checks.exclude").startsWith("**/node_modules/**\n**/build/**\n")).toBe(true);
    expect(text("size.S")).toBe("4");
    expect(text("size.M")).toBe("12");
    expect(text("checks.coverage.error")).toBe("50");
    expect(text("checks.levels")).toBe("max-lines: warn\ntodo: off");
    expect(text("checks.commands")).toBe("");
  });

  it("AC1: reads what the person writes in each field as the value of its edit, keeping the text", () => {
    const value = (path: string, text: string) => draftOf(field(path), text).edit;
    expect(value("verify.timeoutSec", " 2400 ")).toEqual({
      path: ["verify", "timeoutSec"],
      value: 2400,
    });
    expect(value("verify.timeoutSec", "mucho").value).toBe("mucho");
    expect(value("lines.fail", "false").value).toBe(false);
    expect(Object.keys(value("verify.timeoutSec", " "))).toEqual(["path"]);
    expect(value("subagents", "false").value).toBe(false);
    expect(value("subagents", "true").value).toBe(true);
    expect(value("policy.tests", "required").value).toBe("required");
    expect(value("verify.default", " pnpm test --run ").value).toBe("pnpm test --run");
    expect(Object.keys(value("git.target", ""))).toEqual(["path"]);
    expect(value("governed", "**\n\n src/** \n").value).toEqual(["**", "src/**"]);
    expect(value("governed", "").value).toEqual([]);
    expect(value("dev.ports", "4200\n5173").value).toEqual([4200, 5173]);
    expect(value("checks.levels", "max-lines: warn\ntodo:off\n").value).toEqual({
      "max-lines": "warn",
      todo: "off",
    });
    expect(value("checks.levels", "").value).toEqual({});
    const typing = draftOf(field("verify.timeoutSec"), "2.");
    expect(typing.text).toBe("2.");
    expect(fieldText(field("verify.timeoutSec"), RECORD, withDraft(NONE, typing))).toBe("2.");
  });

  it("AC7: «Restablecer» drops the setting's edits, removes its key and shows the default", () => {
    let drafts = withDraft(NONE, draftOf(field("size.M"), "14"));
    drafts = withDraft(drafts, draftOf(field("verify.timeoutSec"), "2400"));
    drafts = withDraft(drafts, draftOf(field("verify.timeoutSec"), "2500"));
    expect(editsOf(drafts)).toEqual([
      { path: ["size", "M"], value: 14 },
      { path: ["verify", "timeoutSec"], value: 2500 },
    ]);
    drafts = withDraft(drafts, resetDraft(setting("size")));
    expect(editsOf(drafts)).toEqual([
      { path: ["verify", "timeoutSec"], value: 2500 },
      { path: ["size"] },
    ]);
    expect(Object.keys(editsOf(drafts)[1] ?? {})).toEqual(["path"]);
    expect(fieldText(field("size.M"), RECORD, drafts)).toBe("10");
    expect(fieldText(field("size.S"), RECORD, drafts)).toBe("4");
    drafts = withDraft(drafts, resetDraft(setting("verify.timeoutSec")));
    expect(fieldText(field("verify.timeoutSec"), RECORD, drafts)).toBe("600");
    const after = applyEdits(INPUT, editsOf(drafts));
    expect(after).toEqual({
      version: 1,
      language: "es",
      verify: { default: "pnpm test" },
      policy: { tests: "contract" },
      checks: INPUT.checks,
    });
    expect(INPUT.size).toEqual({ M: 12 });
  });

  it("AC7: applies the edits in their order, adding the maps they need and dropping the ones they empty", () => {
    expect(
      applyEdits(INPUT, [
        { path: ["policy", "tests"] },
        { path: ["size"] },
        { path: ["size", "M"], value: 14 },
        { path: ["git", "target"], value: "develop" },
      ]),
    ).toEqual({
      version: 1,
      language: "es",
      verify: INPUT.verify,
      size: { M: 14 },
      checks: INPUT.checks,
      git: { target: "develop" },
    });
    expect(applyEdits(undefined, [{ path: ["mode"], value: "team" }])).toEqual({ mode: "team" });
  });

  it("AC4: shows each change with its new value, what was added marked and «Antes» only when something was removed", () => {
    const [timeout, added, removed, command, group] = changeLines(
      [
        { key: "verify.timeoutSec", before: 2000, after: 2400 },
        { key: "governed", before: ["**"], after: ["**", "src/**"] },
        { key: "sensitive", before: ["**/auth/**", ".github/**"], after: ["**/auth/**"] },
        { key: "verify.default", before: "pnpm test", after: "pnpm test --run" },
        { key: "size", after: { M: 12 } },
      ],
      RECORD,
      "es",
    );
    expect(timeout?.key).toBe("verify.timeoutSec");
    expect(timeout?.name).toBe(settingText("verify.timeoutSec", "es").name);
    expect(marked(timeout?.text)).toBe("+2400 s+");
    expect(marked(timeout?.before)).toBe("-2000 s-");
    expect(timeout?.reset).toBe(false);
    expect(marked(added?.text)).toBe("**, +src/**+");
    expect(added?.before).toBeUndefined();
    expect(marked(removed?.text)).toBe("**/auth/**");
    expect(marked(removed?.before)).toBe("**/auth/**, -.github/**-");
    expect(command?.setting.command).toBe(true);
    expect(command?.text.map((part) => part.text).join("")).toBe("pnpm test --run");
    expect(marked(command?.text.filter((part) => part.change === "added"))).toContain("--run");
    expect(command?.before).toBeUndefined();
    // A group: the file's keys over its default.
    expect(marked(group?.text)).toBe("S: 4, +M: 12+, L: 18");
    expect(marked(group?.before)).toBe("S: 4, -M: 10-, L: 18");
  });

  it("AC7: a key that leaves the file goes back to its default, and the change says so", () => {
    const [policy] = changeLines([{ key: "scope.autoApprove", before: "none" }], RECORD, "es");
    expect(policy?.reset).toBe(true);
    expect(policy?.setting.permissions).toBe(true);
    expect(marked(policy?.text)).toBe(
      `+${optionName("scope.autoApprove", "tests-and-generated", "es")}+`,
    );
    expect(marked(policy?.before)).toBe(`-${optionName("scope.autoApprove", "none", "es")}-`);
    const [english] = changeLines(
      [{ key: "policy.tests", before: "contract", after: "required" }],
      RECORD,
      "en",
    );
    expect(english?.name).toBe(settingText("policy.tests", "en").name);
    expect(marked(english?.text)).toBe(`+${optionName("policy.tests", "required", "en")}+`);
  });
});
