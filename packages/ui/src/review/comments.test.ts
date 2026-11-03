// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import {
  type ChangeRecord,
  type CommentAnchor,
  type CommentView,
  SpectyData,
} from "../data/records";
import { ReviewComments, selectionAnchor } from "./comments";

class Recording extends SpectyData {
  readonly calls: unknown[][] = [];
  changes(): Promise<readonly ChangeRecord[]> {
    return Promise.resolve([]);
  }
  subscribe(): () => void {
    return () => undefined;
  }
  override addComment(...args: unknown[]): Promise<void> {
    this.calls.push(args);
    return Promise.resolve();
  }
  override editComment(...args: unknown[]): Promise<void> {
    this.calls.push(["editComment", ...args]);
    return Promise.resolve();
  }
  override deleteComment(...args: unknown[]): Promise<void> {
    this.calls.push(["deleteComment", ...args]);
    return Promise.resolve();
  }
}

const COMMENTS: readonly CommentView[] = [
  {
    id: "c2",
    revision: 2,
    anchor: { section: "design", quote: "una línea por materia" },
    author: "Ana Gómez",
    body: "¿No satura?",
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    section: "design",
    resolved: false,
  },
  {
    id: "c1",
    revision: 1,
    anchor: { item: "A3" },
    author: "Ana Gómez",
    body: "Revisa la leyenda.",
    createdAt: new Date(Date.now() - 60 * 60_000).toISOString(),
    resolvedInRevision: 2,
    section: "assumptions",
    resolved: true,
  },
];

@Component({
  imports: [ReviewComments],
  template: `
    <section data-section="design"><p id="design-text">El gráfico dibuja una línea por materia.</p></section>
    <section data-section="goal"><p id="goal-text">Ver la evolución.</p></section>
    <sp-review-comments change="20261020-evolucion-trimestre" [comments]="comments" [editable]="editable()" [selection]="selection()" [(anchor)]="anchor" />
  `,
})
class Host {
  readonly comments = COMMENTS;
  readonly editable = signal(true);
  readonly selection = signal<CommentAnchor | undefined>(undefined);
  readonly anchor = signal<CommentAnchor | undefined>(undefined);
}

async function render() {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  const source = new Recording();
  TestBed.configureTestingModule({ providers: [{ provide: SpectyData, useValue: source }] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  };
  return { fixture, element, source, settle, host: fixture.componentInstance };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

function select(node: Node, from: number, to: Node = node, end = to.textContent?.length ?? 0) {
  const range = document.createRange();
  range.setStart(node, from);
  range.setEnd(to, end);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

describe("ReviewComments", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("lists comments with anchor, author, time and revision; resolved ones dimmed (AC6)", async () => {
    const { element } = await render();
    const [open, done] = [...element.querySelectorAll("[data-comment]")];
    expect(text(open)).toContain("Diseño: «una línea por materia»");
    expect(text(open)).toContain("Ana Gómez · hace 5 min · en la revisión 2");
    expect(text(done)).toContain("Sobre A3");
    expect(text(done)).toContain("resuelto en la 2");
    expect(done?.className).toContain("opacity-60");
    expect(text(element.querySelector("h2"))).toContain("Comentarios 1");
  });

  it("comments on the item it was given, and needs some text (AC6)", async () => {
    const { fixture, element, source, settle, host } = await render();
    host.anchor.set({ item: "AC3" });
    await fixture.whenStable();
    expect(text(element.querySelector("[data-target]"))).toBe("Sobre AC3");
    const send = () =>
      [...element.querySelectorAll<HTMLButtonElement>("form sp-button button")].at(-1);
    expect(send()?.disabled).toBe(true);
    const field = element.querySelector<HTMLTextAreaElement>("form textarea");
    if (field === null) throw new Error("no field");
    field.value = " ¿Cuánto es rápido? ";
    field.dispatchEvent(new Event("input"));
    await fixture.whenStable();
    send()?.click();
    await settle();
    expect(source.calls).toEqual([
      ["20261020-evolucion-trimestre", { item: "AC3" }, "¿Cuánto es rápido?"],
    ]);
    expect(host.anchor()).toBeUndefined();
  });

  it("offers the selected quote, and cancels (AC6)", async () => {
    const { fixture, element, host } = await render();
    host.selection.set({ section: "design", quote: "una línea por materia" });
    await fixture.whenStable();
    element.querySelector<HTMLButtonElement>("sp-button button")?.click();
    await fixture.whenStable();
    expect(text(element.querySelector("[data-target]"))).toBe("Diseño: «una línea por materia»");
    element.querySelector<HTMLButtonElement>("form sp-button button")?.click();
    await fixture.whenStable();
    expect(host.anchor()).toBeUndefined();
  });

  it("is read-only outside review (AC8)", async () => {
    const { fixture, element, host } = await render();
    host.editable.set(false);
    host.anchor.set({ item: "A1" });
    await fixture.whenStable();
    expect(element.querySelector("form")).toBeNull();
    expect(element.querySelectorAll("[data-comment]")).toHaveLength(2);
  });

  it("AC1: shows edit and delete options for unresolved comments, but not resolved ones", async () => {
    const { element } = await render();
    const open = element.querySelector("[data-comment=c2]");
    const done = element.querySelector("[data-comment=c1]");
    expect(open?.querySelector("[data-action=edit]")).not.toBeNull();
    expect(open?.querySelector("[data-action=delete]")).not.toBeNull();
    expect(done?.querySelector("[data-action=edit]")).toBeNull();
    expect(done?.querySelector("[data-action=delete]")).toBeNull();
  });

  it("AC2: editing comment text updates it via editComment", async () => {
    const { element, source, fixture, settle } = await render();
    const open = element.querySelector("[data-comment=c2]");
    open?.querySelector<HTMLButtonElement>("[data-action=edit] button")?.click();
    await fixture.whenStable();
    const input = element.querySelector<HTMLTextAreaElement>("[data-comment=c2] form textarea");
    if (input === null) throw new Error("no edit field");
    input.value = " ¿No satura la vista? ";
    input.dispatchEvent(new Event("input"));
    await fixture.whenStable();
    element
      .querySelector<HTMLButtonElement>("[data-comment=c2] form sp-button[data-action=save] button")
      ?.click();
    await settle();
    expect(source.calls).toContainEqual([
      "editComment",
      "20261020-evolucion-trimestre",
      "c2",
      "¿No satura la vista?",
    ]);
  });

  it("AC3: deleting comment calls deleteComment", async () => {
    const { element, source, settle } = await render();
    const open = element.querySelector("[data-comment=c2]");
    open?.querySelector<HTMLButtonElement>("[data-action=delete] button")?.click();
    await settle();
    expect(source.calls).toContainEqual(["deleteComment", "20261020-evolucion-trimestre", "c2"]);
  });

  it("AC5: shows loading state on comment action buttons while requests are running", async () => {
    let resolveEdit!: () => void;
    const pendingEdit = new Promise<void>((res) => {
      resolveEdit = res;
    });
    const { element, source, fixture, settle } = await render();
    source.editComment = () => pendingEdit;
    const open = element.querySelector("[data-comment=c2]");
    open?.querySelector<HTMLButtonElement>("[data-action=edit] button")?.click();
    await fixture.whenStable();
    const saveBtn = element.querySelector<HTMLButtonElement>(
      "[data-comment=c2] form sp-button[data-action=save] button",
    );
    saveBtn?.click();
    await fixture.whenStable();
    expect(saveBtn?.getAttribute("aria-busy")).toBe("true");
    expect(saveBtn?.disabled).toBe(true);
    expect(saveBtn?.querySelector(".animate-spin")).not.toBeNull();
    resolveEdit();
    await settle();
  });
});

describe("selectionAnchor", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("anchors a selection inside one section only (AC6)", async () => {
    const { element } = await render();
    const design = element.querySelector("#design-text")?.firstChild;
    const goal = element.querySelector("#goal-text")?.firstChild;
    if (!design || !goal) throw new Error("no text");
    select(design, design.textContent?.indexOf("una") ?? 0);
    expect(selectionAnchor(element)).toEqual({
      section: "design",
      quote: "una línea por materia.",
    });
    select(design, 0, goal, 3);
    expect(selectionAnchor(element)).toBeUndefined();
    document.getSelection()?.removeAllRanges();
    expect(selectionAnchor(element)).toBeUndefined();
    select(design, 0);
    expect(selectionAnchor(document.createElement("div"))).toBeUndefined();
  });
});
