// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  antigravityAppRuleWarning,
  antigravityCliInvalidWarning,
  antigravityCliRuleLine,
  antigravityRuleStaysLine,
  type CardContext,
  doctorCard,
  renderText,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };
const FILE = "/home/ana/.gemini/antigravity-cli/settings.json";

describe("what init says about Antigravity's permissions", () => {
  it("AC1: names the rule and the settings of its CLI, in Spanish and in English", () => {
    expect(antigravityCliRuleLine(FILE, "specty", "es")).toBe(
      `Antigravity CLI: regla \`command(specty)\` en ${FILE}, para que los comandos de Specty corran sin preguntar; sirve a todos tus proyectos.`,
    );
    expect(antigravityCliRuleLine(FILE, "specty", "en")).toBe(
      `Antigravity CLI: rule \`command(specty)\` in ${FILE}, so Specty's commands run without asking; it serves all your projects.`,
    );
  });

  it("AC4: says that it leaves settings it cannot edit alone, and the rule to add", () => {
    expect(antigravityCliInvalidWarning(FILE, "specty", "es")).toBe(
      `Antigravity CLI: ${FILE} no es un JSON que Specty pueda editar, así que no lo toca; añade \`command(specty)\` a \`permissions.allow\` para que los comandos de Specty corran sin preguntar.`,
    );
    expect(antigravityCliInvalidWarning(FILE, "specty", "en")).toBe(
      `Antigravity CLI: ${FILE} is not JSON that Specty can edit, so Specty leaves it alone; add \`command(specty)\` to \`permissions.allow\` so Specty's commands run without asking.`,
    );
  });

  it("AC5: tells the person which rule to add in the app, the one of business accounts too", () => {
    expect(antigravityAppRuleWarning("specty", "es")).toBe(
      "Antigravity (app): sus permisos no están en un archivo que Specty pueda editar; añade `command(specty)` a sus reglas de permisos (`unsandboxed(specty)` con una cuenta de empresa) para que los comandos de Specty corran sin preguntar.",
    );
    expect(antigravityAppRuleWarning("specty", "en")).toBe(
      "Antigravity (app): its permissions are not in a file that Specty can edit; add `command(specty)` to its permission rules (`unsandboxed(specty)` with a business account) so Specty's commands run without asking.",
    );
  });
});

describe("doctor and the rule in the settings of Antigravity's CLI", () => {
  it("AC6: confirms the rule, or asks for init when it is missing, in Spanish and in English", () => {
    const ok = {
      ok: [{ code: "antigravity-cli-rule", file: FILE } as const],
      warnings: [],
      problems: [],
    };
    expect(renderText(doctorCard(ok, ES), "es")).toContain(
      `Antigravity CLI: regla de Specty en ${FILE}.`,
    );
    expect(renderText(doctorCard(ok, EN), "en")).toContain(
      `Antigravity CLI: Specty's rule in ${FILE}.`,
    );
    const missing = {
      ok: [],
      warnings: [],
      problems: [{ code: "no-antigravity-cli-rule", file: FILE } as const],
    };
    expect(renderText(doctorCard(missing, ES), "es")).toContain(
      `Antigravity CLI: falta \`command(specty)\` en \`permissions.allow\` de ${FILE}, así que los comandos de Specty piden permiso o fallan en su sandbox; ejecuta \`specty init --tools antigravity\`.`,
    );
    expect(renderText(doctorCard(missing, EN), "en")).toContain(
      `Antigravity CLI: \`command(specty)\` is missing from \`permissions.allow\` in ${FILE}, so Specty's commands ask for permission or fail in its sandbox; run \`specty init --tools antigravity\`.`,
    );
  });
});

describe("uninstall and the rule in the settings of Antigravity's CLI", () => {
  it("AC7: says that the rule stays, that it serves every project, and how to remove it", () => {
    expect(antigravityRuleStaysLine(FILE, "specty", "es")).toBe(
      `Antigravity CLI: la regla \`command(specty)\` sigue en ${FILE}, que sirve a todos tus proyectos; quítala de \`permissions.allow\` si ya no usas Specty.`,
    );
    expect(antigravityRuleStaysLine(FILE, "specty", "en")).toBe(
      `Antigravity CLI: the rule \`command(specty)\` stays in ${FILE}, which serves all your projects; remove it from \`permissions.allow\` if you no longer use Specty.`,
    );
  });
});
