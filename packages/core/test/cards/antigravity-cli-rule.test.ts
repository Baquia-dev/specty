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
const NODE = "read_file(/home/ana/.nvm/versions/node/v24.16.0)";
const BUNDLE = "read_file(/opt/specty/dist)";
const GIT = "write_file(/home/ana/app/.git)";
/** Specty's rules, as `init` writes them: its command's, then its sandbox's. */
const RULES = ["command(specty)", NODE, BUNDLE, GIT];
const LISTED_ES = `\`command(specty)\`, \`${NODE}\`, \`${BUNDLE}\` y \`${GIT}\``;
const LISTED_EN = `\`command(specty)\`, \`${NODE}\`, \`${BUNDLE}\` and \`${GIT}\``;

describe("what init says about Antigravity's permissions", () => {
  it("AC1: names the settings of its CLI and each rule, for its commands and its sandbox, in Spanish and in English", () => {
    expect(antigravityCliRuleLine(FILE, RULES, "es")).toBe(
      `Antigravity CLI: reglas ${LISTED_ES} en ${FILE}, para que los comandos de Specty corran sin preguntar y dentro de su sandbox; \`write_file\` abre en él el git de este proyecto, y las demás sirven a todos tus proyectos.`,
    );
    expect(antigravityCliRuleLine(FILE, RULES, "en")).toBe(
      `Antigravity CLI: rules ${LISTED_EN} in ${FILE}, so Specty's commands run without asking and inside its sandbox; \`write_file\` opens this project's git in it, and the others serve all your projects.`,
    );
  });

  it("AC3: says that it leaves settings it cannot edit alone, and every rule to add", () => {
    expect(antigravityCliInvalidWarning(FILE, RULES, "es")).toBe(
      `Antigravity CLI: ${FILE} no es un JSON que Specty pueda editar, así que no lo toca; añade ${LISTED_ES} a \`permissions.allow\` para que los comandos de Specty corran sin preguntar y dentro de su sandbox.`,
    );
    expect(antigravityCliInvalidWarning(FILE, RULES, "en")).toBe(
      `Antigravity CLI: ${FILE} is not JSON that Specty can edit, so Specty leaves it alone; add ${LISTED_EN} to \`permissions.allow\` so Specty's commands run without asking and inside its sandbox.`,
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

describe("doctor and the rules in the settings of Antigravity's CLI", () => {
  it("AC4: confirms the rules, or names the missing ones and asks for init, in Spanish and in English", () => {
    const ok = {
      ok: [{ code: "antigravity-cli-rule", file: FILE } as const],
      warnings: [],
      problems: [],
    };
    expect(renderText(doctorCard(ok, ES), "es")).toContain(
      `Antigravity CLI: reglas de Specty en ${FILE}.`,
    );
    expect(renderText(doctorCard(ok, EN), "en")).toContain(
      `Antigravity CLI: Specty's rules in ${FILE}.`,
    );
    const missing = (rules: readonly string[]) => ({
      ok: [],
      warnings: [],
      problems: [{ code: "no-antigravity-cli-rule", file: FILE, missing: rules } as const],
    });
    // One rule missing, as after a new version of node.
    expect(renderText(doctorCard(missing([NODE]), ES), "es")).toContain(
      `Antigravity CLI: falta \`${NODE}\` en \`permissions.allow\` de ${FILE}, así que los comandos de Specty piden permiso o fallan en su sandbox; ejecuta \`specty init --tools antigravity\`.`,
    );
    expect(renderText(doctorCard(missing([NODE]), EN), "en")).toContain(
      `Antigravity CLI: \`${NODE}\` is missing from \`permissions.allow\` in ${FILE}, so Specty's commands ask for permission or fail in its sandbox; run \`specty init --tools antigravity\`.`,
    );
    // All of them.
    expect(renderText(doctorCard(missing(RULES), ES), "es")).toContain(
      `Antigravity CLI: faltan ${LISTED_ES} en \`permissions.allow\` de ${FILE}, así que los comandos de Specty piden permiso o fallan en su sandbox; ejecuta \`specty init --tools antigravity\`.`,
    );
    expect(renderText(doctorCard(missing(RULES), EN), "en")).toContain(
      `Antigravity CLI: ${LISTED_EN} are missing from \`permissions.allow\` in ${FILE}, so Specty's commands ask for permission or fail in its sandbox; run \`specty init --tools antigravity\`.`,
    );
  });
});

describe("uninstall and the rules in the settings of Antigravity's CLI", () => {
  it("AC5: names the rules that stay, says that write_file only serves this project, and how to remove them", () => {
    expect(antigravityRuleStaysLine(FILE, RULES, "es")).toBe(
      `Antigravity CLI: las reglas ${LISTED_ES} siguen en ${FILE}: \`write_file\` solo sirve a este proyecto, y las demás, a todos tus proyectos; quítalas de \`permissions.allow\` si ya no usas Specty.`,
    );
    expect(antigravityRuleStaysLine(FILE, RULES, "en")).toBe(
      `Antigravity CLI: the rules ${LISTED_EN} stay in ${FILE}: \`write_file\` only serves this project, and the others serve all your projects; remove them from \`permissions.allow\` if you no longer use Specty.`,
    );
    // An installation from before the sandbox's rules: only the one of its commands.
    expect(antigravityRuleStaysLine(FILE, ["command(specty)"], "es")).toBe(
      `Antigravity CLI: la regla \`command(specty)\` sigue en ${FILE}, que sirve a todos tus proyectos; quítala de \`permissions.allow\` si ya no usas Specty.`,
    );
    expect(antigravityRuleStaysLine(FILE, ["command(specty)"], "en")).toBe(
      `Antigravity CLI: the rule \`command(specty)\` stays in ${FILE}, which serves all your projects; remove it from \`permissions.allow\` if you no longer use Specty.`,
    );
    // Several rules that every project shares.
    expect(antigravityRuleStaysLine(FILE, ["command(specty)", NODE], "es")).toBe(
      `Antigravity CLI: las reglas \`command(specty)\` y \`${NODE}\` siguen en ${FILE}, que sirven a todos tus proyectos; quítalas de \`permissions.allow\` si ya no usas Specty.`,
    );
    expect(antigravityRuleStaysLine(FILE, ["command(specty)", NODE], "en")).toBe(
      `Antigravity CLI: the rules \`command(specty)\` and \`${NODE}\` stay in ${FILE}, which serve all your projects; remove them from \`permissions.allow\` if you no longer use Specty.`,
    );
    // Only this project's.
    expect(antigravityRuleStaysLine(FILE, [GIT], "es")).toBe(
      `Antigravity CLI: la regla \`${GIT}\` sigue en ${FILE}, que solo sirve a este proyecto; quítala de \`permissions.allow\` si ya no usas Specty.`,
    );
    expect(antigravityRuleStaysLine(FILE, [GIT], "en")).toBe(
      `Antigravity CLI: the rule \`${GIT}\` stays in ${FILE}, which only serves this project; remove it from \`permissions.allow\` if you no longer use Specty.`,
    );
  });
});
