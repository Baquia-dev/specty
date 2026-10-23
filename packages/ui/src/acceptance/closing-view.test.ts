// SPDX-License-Identifier: Apache-2.0
import { Component, input } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import type { ClosingParts } from "../data/closing";
import { sampleRecords } from "../data/fixtures";
import type { ChangeView } from "../data/records";
import { deriveViews } from "../data/views";
import { ClosingView } from "./closing-view";

const found = deriveViews(sampleRecords(Date.now())).find(
  (item) => item.id === "20261017-recordatorios-correo",
);
if (found?.closing === undefined) throw new Error("no sample closing");
/** The closing the agent sent, waiting for the person. */
const SENT: ChangeView = found;
const CLOSING: ClosingParts = found.closing;
const { decision: _sent, ...WRITING } = SENT;

@Component({
  imports: [ClosingView],
  template: `<sp-closing-view [change]="change()" />`,
})
class Host {
  readonly change = input.required<ChangeView>();
}

async function render(change: ChangeView, lang = "es") {
  localStorage.setItem("specty.lang", lang);
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(Host);
  fixture.componentRef.setInput("change", change);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  const text = (selector: string) =>
    element.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const parts = () =>
    [...element.querySelectorAll<HTMLElement>("[data-part]")].map((part) => ({
      key: part.getAttribute("data-part"),
      title: part.querySelector("h3")?.textContent?.trim(),
    }));
  return { element, text, parts };
}

describe("Closing view", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("shows the closing the agent sent, part by part (AC1)", async () => {
    const { element, text, parts } = await render(SENT);
    expect(element.querySelector("section")?.getAttribute("aria-labelledby")).toBe(
      "acceptance-closing",
    );
    expect(text("#acceptance-closing")).toBe("Cierre");
    expect(text("[data-meta]")).toBe("por confirmar");
    expect(parts()).toEqual([
      { key: "summary", title: "Resumen" },
      { key: "deviations", title: "Desviaciones" },
      { key: "decisions", title: "Decisiones" },
      { key: "pending", title: "Pendientes" },
    ]);
    // Each part is the agent's markdown: lists stay lists, bold stays bold.
    const pending = element.querySelector("[data-part=pending]");
    expect(pending?.querySelectorAll("li")).toHaveLength(2);
    expect(pending?.querySelector("strong")?.textContent).toBe("La plantilla en inglés:");
    expect(element.querySelector("[data-writing]")).toBeNull();
  });

  it("says the agent is writing it until it is sent (AC2)", async () => {
    const { element, text } = await render(WRITING);
    expect(text("[data-meta]")).toBe("en redacción");
    expect(text("[data-writing]")).toContain("El agente redacta el cierre");
    expect(element.querySelector("[data-part]")).toBeNull();
  });

  it("leaves out empty parts, and puts what fits none last, with no title", async () => {
    const closing = { ...CLOSING, summary: "Hecho.", deviations: "", other: "Una nota suelta." };
    const { parts, text } = await render({ ...SENT, closing });
    expect(parts().map((part) => part.key)).toEqual(["summary", "decisions", "pending", "other"]);
    expect(parts().at(-1)?.title).toBeUndefined();
    expect(text("[data-part=other]")).toBe("Una nota suelta.");
  });

  it("stays to read once the change is done, in English too", async () => {
    const { decision: _done, ...rest } = SENT;
    const { text, parts } = await render({ ...rest, phase: "done" }, "en");
    expect(text("#acceptance-closing")).toBe("Closing");
    expect(text("[data-meta]")).toBe("confirmed");
    expect(parts().map((part) => part.title)).toEqual([
      "Summary",
      "Deviations",
      "Decisions",
      "Follow-ups",
    ]);
  });
});
