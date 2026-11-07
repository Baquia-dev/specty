// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import * as z from "zod";
import { optionName, SETTING_SECTIONS, SETTINGS, sectionName, settingText } from "../../src/light";
import { ConfigSchema } from "../../src/schema/config";

type Schema = z.core.$ZodType;

/** The schema inside its `optional()` wrappers. */
function unwrapped(schema: Schema): Schema {
  return schema instanceof z.ZodOptional ? unwrapped(schema.unwrap()) : schema;
}

/** Every key of `config.yaml` that holds a value, with dots: what a setting may cover. */
function leaves(schema: Schema, prefix = ""): readonly string[] {
  const inner = unwrapped(schema);
  if (!(inner instanceof z.ZodObject)) return [prefix];
  return Object.entries(inner.shape).flatMap(([key, child]) =>
    leaves(child, prefix === "" ? key : `${prefix}.${key}`),
  );
}

/** The schema of the key `key`, with dots. */
function schemaAt(key: string): Schema | undefined {
  let schema: Schema | undefined = ConfigSchema;
  for (const part of key.split(".")) {
    const inner: Schema | undefined = schema === undefined ? undefined : unwrapped(schema);
    schema = inner instanceof z.ZodObject ? inner.shape[part] : undefined;
  }
  return schema === undefined ? undefined : unwrapped(schema);
}

const KEYS = leaves(ConfigSchema).filter((key) => key !== "version");
const inFile = SETTINGS.filter((setting) => setting.clone !== true);
const covers = (setting: { readonly key: string }, key: string) =>
  key === setting.key || key.startsWith(`${setting.key}.`);
const keysWith = (mark: "permissions" | "command" | "clone" | "soon" | "new") =>
  SETTINGS.filter((setting) => setting[mark] === true).map((setting) => setting.key);

describe("the settings' catalog", () => {
  it("AC1: covers each key of config.yaml with exactly one setting, and names no other key", () => {
    for (const key of KEYS) {
      expect(
        inFile.filter((setting) => covers(setting, key)).map((setting) => setting.key),
        key,
      ).toHaveLength(1);
    }
    for (const setting of inFile) {
      expect(
        KEYS.some((key) => covers(setting, key)),
        setting.key,
      ).toBe(true);
    }
    expect(new Set(SETTINGS.map((setting) => setting.key)).size).toBe(SETTINGS.length);
  });

  it("AC1: groups the settings by section, in the page's order, and adds delegated mode", () => {
    expect(SETTING_SECTIONS).toEqual([
      "flow",
      "verify",
      "git",
      "review",
      "scope",
      "size",
      "lines",
      "checks",
      "team",
      "memory",
      "dev",
      "ui",
      "effort",
      "glossary",
    ]);
    const order = SETTINGS.map((setting) => SETTING_SECTIONS.indexOf(setting.section));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual(order.toSorted((a, b) => a - b));
    for (const section of SETTING_SECTIONS) {
      expect(SETTINGS.some((setting) => setting.section === section)).toBe(true);
    }
    expect(SETTINGS.filter((setting) => setting.clone === true)).toEqual([
      expect.objectContaining({ key: "specty delegate", section: "flow", kind: "toggle" }),
    ]);
  });

  it("AC1: offers the schema's options for each choice", () => {
    const choices = SETTINGS.filter((setting) => setting.kind === "choice");
    expect(choices.map((setting) => setting.key)).toEqual(
      expect.arrayContaining(["language", "mode", "policy.tests", "git.flow", "scope.autoApprove"]),
    );
    for (const setting of choices) {
      const schema = schemaAt(setting.key);
      expect(schema instanceof z.ZodEnum, setting.key).toBe(true);
      if (schema instanceof z.ZodEnum) expect(setting.options, setting.key).toEqual(schema.options);
    }
  });

  it("AC2: marks what affects permissions, runs a command, lives in the clone or has no effect yet", () => {
    expect(keysWith("permissions")).toEqual([
      "policy.tests",
      "specty delegate",
      "governed",
      "ignored",
      "sensitive",
      "scope.implicitTests",
      "scope.generated",
      "scope.autoApprove",
      "checks.levels",
    ]);
    expect(keysWith("command")).toEqual([
      "verify.default",
      "verify.full",
      "verify.quick",
      "verify.units",
      "git.setup",
      "git.afterLanding",
      "review.command",
      "checks.generators",
      "checks.commands",
    ]);
    expect(keysWith("clone")).toEqual(["specty delegate"]);
    expect(keysWith("soon")).toEqual([
      "team.approvers",
      "team.requirePrReview",
      "ui.port",
      "ui.requireUserPresence",
      "effort",
    ]);
    expect(keysWith("new")).toEqual([]);
  });

  it("AC5: names and describes each setting, section and option in Spanish and in English", () => {
    for (const setting of SETTINGS) {
      const es = settingText(setting.key, "es");
      const en = settingText(setting.key, "en");
      for (const text of [es.name, es.description, en.name, en.description]) {
        expect(text.trim(), setting.key).not.toBe("");
      }
      expect(es.description, setting.key).not.toBe(en.description);
      for (const option of setting.options ?? []) {
        expect(optionName(setting.key, option, "es").trim(), option).not.toBe("");
        expect(optionName(setting.key, option, "en").trim(), option).not.toBe("");
      }
    }
    expect(settingText("verify.timeoutSec", "es").name).not.toBe(
      settingText("verify.timeoutSec", "en").name,
    );
    expect(SETTING_SECTIONS.map((section) => sectionName(section, "es"))).toEqual([
      "Flujo",
      "Verificación",
      "Git",
      "Revisión independiente",
      "Alcance",
      "Tamaño y cortes",
      "Líneas de código",
      "Verificaciones de calidad",
      "Equipo",
      "Memoria",
      "Desarrollo",
      "Interfaz",
      "Esfuerzo por herramienta",
      "Glosario",
    ]);
    expect(sectionName("verify", "en")).toBe("Verification");
    expect(optionName("policy.tests", "contract", "es")).toBe("Contrato");
    expect(optionName("policy.tests", "contract", "en")).toBe("Contract");
  });
});
