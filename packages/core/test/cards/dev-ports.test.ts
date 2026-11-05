// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  messageLeftCard,
  renderText,
  resolveConfig,
  withDevPorts,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

describe("the development ports of a change's folder", () => {
  it("AC1: adds them to a card, in Spanish and in English", () => {
    const card = messageLeftCard("20261105-a", "Hola.", ES);
    const es = renderText(withDevPorts(card, [4201, 5174], "es"), "es");
    expect(es).toContain(
      "Puertos de desarrollo de esta carpeta: 4201, 5174. Arranca aquí los servidores de desarrollo con ellos, para no chocar con los de otras carpetas.",
    );
    const en = renderText(
      withDevPorts(messageLeftCard("20261105-a", "Hi.", EN), [4201], "en"),
      "en",
    );
    expect(en).toContain(
      "Development ports of this folder: 4201. Start this folder's development servers on them, so they do not clash with other folders'.",
    );
  });

  it("AC4: leaves the card as it is without ports, and takes dev.ports only as a list of ports", () => {
    const card = messageLeftCard("20261105-a", "Hola.", ES);
    expect(withDevPorts(card, [], "es")).toBe(card);
    const dev = (value: unknown) => {
      const result = resolveConfig({ version: 1, dev: value });
      return result.ok ? result.config.dev : undefined;
    };
    expect(dev({ ports: [4200, 5173] })).toEqual({ ports: [4200, 5173] });
    expect(dev(undefined)).toEqual({ ports: [] });
    expect(dev({ ports: "4200" })).toBeUndefined();
    expect(dev({ ports: [0] })).toBeUndefined();
    expect(dev({ ports: [70_000] })).toBeUndefined();
    expect(dev({ ports: [4200.5] })).toBeUndefined();
  });
});
