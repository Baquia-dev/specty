// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import type { OpenChange, StatusRead } from "../src/specty";
import { langOf, statusView } from "../src/view";

const HERE: OpenChange = {
  id: "20261028-saludo",
  phase: "review",
  title: "Saludo personalizado",
  waitingFor: "human",
  current: true,
};

const THERE: OpenChange = {
  id: "20261028-otro",
  phase: "implementing",
  title: "Otro cambio",
  waitingFor: "agent",
  current: false,
  folder: "../repo.worktrees/20261028-otro",
};

function read(changes: readonly OpenChange[]): StatusRead {
  return { kind: "status", status: { changes, delegated: false } };
}

describe("the status bar", () => {
  it("AC1: speaks the language VS Code uses", () => {
    expect(langOf("es")).toBe("es");
    expect(langOf("es-419")).toBe("es");
    expect(langOf("en-us")).toBe("en");
    expect(langOf("pt-br")).toBe("en");
  });

  it("AC1: shows the folder's change, its phase and that it waits for the person", () => {
    const view = statusView(read([HERE, THERE]), "es");
    expect(view.warning).toBe(false);
    expect(view.text).toContain("Revisión");
    expect(view.text).toContain("te espera");
    for (const part of [
      "20261028-saludo",
      "Saludo personalizado",
      "espera a ti",
      "20261028-otro",
      "Otro cambio",
      "espera al agente",
      "../repo.worktrees/20261028-otro",
    ]) {
      expect(view.tooltip).toContain(part);
    }
    const english = statusView(read([HERE]), "en");
    expect(english.text).toContain("Review");
    expect(english.text).toContain("waiting for you");
  });

  it("AC1: names only the phase when the change waits for the agent", () => {
    const view = statusView(read([{ ...HERE, phase: "implementing", waitingFor: "agent" }]), "es");
    expect(view.text).toContain("Implementación");
    expect(view.text).not.toContain("te espera");
  });

  it("AC1: without a change of its own, counts the open ones and those waiting for the person", () => {
    const waiting: OpenChange = { ...THERE, id: "20261028-tercero", waitingFor: "human" };
    const another: OpenChange = { ...THERE, id: "20261028-cuarto", waitingFor: "human" };
    const many = statusView(read([THERE, waiting, another]), "es");
    expect(many.text).toContain("3 cambios abiertos");
    expect(many.text).toContain("2 te esperan");
    expect(many.tooltip).toContain("20261028-cuarto");
    const one = statusView(read([waiting]), "es");
    expect(one.text).toContain("1 cambio abierto");
    expect(one.text).toContain("1 te espera");
    const english = statusView(read([THERE, waiting, another]), "en");
    expect(english.text).toContain("3 open changes");
    expect(english.text).toContain("2 waiting for you");
  });

  it("AC1: says when there is no open change", () => {
    const view = statusView(read([]), "es");
    expect(view.warning).toBe(false);
    expect(view.text).toContain("Specty");
    expect(view.tooltip).toContain("Sin cambios abiertos");
  });

  it("AC4: warns when the command is missing, with how to install it and the setting", () => {
    const view = statusView({ kind: "missing" }, "es");
    expect(view.warning).toBe(true);
    expect(view.text).toContain("$(warning)");
    expect(view.tooltip).toContain("npm install -g @baquia-dev/specty");
    expect(view.tooltip).toContain("specty.path");
  });

  it("AC4: warns when specty does not give the status as data", () => {
    const view = statusView({ kind: "outdated" }, "es");
    expect(view.warning).toBe(true);
    expect(view.tooltip).toContain("npm install -g @baquia-dev/specty@latest");
  });

  it("says why it could not read the status", () => {
    const view = statusView({ kind: "failed", message: "ejecuta `specty init`." }, "es");
    expect(view.warning).toBe(true);
    expect(view.tooltip).toContain("specty init");
  });
});
