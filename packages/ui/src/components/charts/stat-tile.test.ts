// SPDX-License-Identifier: Apache-2.0
// A figure of the panel with its minigraph (docs/ui.md, «Panel»): its value, its change and, under
// them, a line with its value in each day or week, broken where one has none, with its values
// under the pointer and the focus.
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { type StatDelta, StatTile, type StatTrend } from "./stat-tile";

const DAYS = ["1 nov", "2 nov", "3 nov", "4 nov", "5 nov", "6 nov", "7 nov"];

/** Two days with a value, a gap, a value alone, a gap and two more: the last one is 2. */
const GAPS: StatTrend = {
  heading: "Cambios cerrados por día",
  labels: DAYS,
  values: [1, 3, null, 2, null, 0, 2],
  format: (value) => String(value),
};

const DELTA: StatDelta = { tone: "good", mark: "▲ 25 %", text: "frente a los 7 días anteriores" };

@Component({
  imports: [StatTile],
  template: `
    <sp-stat-tile [label]="label()" value="8" [delta]="delta()" [note]="note()" [trend]="trend()" />
    <button type="button" id="outside">fuera</button>
  `,
})
class Host {
  readonly label = signal("Cambios cerrados");
  readonly delta = signal<StatDelta | undefined>(DELTA);
  readonly note = signal<string | undefined>("en la memoria");
  readonly trend = signal<StatTrend | undefined>(GAPS);
}

const text = (element: Element | null | undefined) =>
  (element?.textContent ?? "").replace(/\s+/g, " ").trim();

async function render(lang: "es" | "en" = "es") {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.setItem("specty.lang", lang);
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  const tile = () => element.querySelector<HTMLElement>("sp-stat-tile");
  const marks = () => [...(tile()?.querySelectorAll<HTMLButtonElement>("[data-mark]") ?? [])];
  const points = () => [...(tile()?.querySelectorAll<HTMLElement>("[data-point]") ?? [])];
  const tip = () => tile()?.querySelector<HTMLElement>("[data-chart-tip]");
  const tipText = () => ({
    title: text(tip()?.querySelector("[data-tip-title]")),
    rows: [...(tip()?.querySelectorAll("[data-tip-row]") ?? [])].map(text),
  });
  const press = async (key: string) => {
    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    await fixture.whenStable();
  };
  const settle = () => fixture.whenStable();
  return { host: fixture.componentInstance, tile, marks, points, tip, tipText, press, settle };
}

/** Where a point is drawn: its center in % of the width and in px from the top. */
const placeOf = (point: HTMLElement | undefined) => ({
  left: Number.parseFloat(point?.style.left ?? ""),
  top: Number.parseFloat(point?.style.top ?? ""),
});

describe("the figure with its minigraph", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("shows the figure's label, value, change in its tone and note", async () => {
    const { tile } = await render();
    expect(text(tile()?.querySelector("[data-label]"))).toBe("Cambios cerrados");
    expect(text(tile()?.querySelector("[data-value]"))).toBe("8");
    const delta = tile()?.querySelector<HTMLElement>("[data-delta]");
    expect(delta?.dataset.tone).toBe("good");
    expect(text(delta)).toBe("▲ 25 % frente a los 7 días anteriores");
    expect(text(tile()?.querySelector("[data-note]"))).toBe("en la memoria");
  });

  it("AC2: breaks the line where a day has no value, marks a value alone and the last one", async () => {
    const { tile, marks, points } = await render();
    expect(tile()?.querySelector("[data-trend]")).not.toBeNull();
    // A line per stretch of two days or more: 1–2 nov and 6–7 nov; 4 nov stands alone.
    expect(tile()?.querySelectorAll("[data-line]")).toHaveLength(2);
    expect(marks()).toHaveLength(7);
    expect(points()).toHaveLength(2);
    // Each day in the middle of its band; from the lowest value (0) at the bottom to the highest
    // (3) at the top of 36 px, 6 px inside each edge: 2 is a third of the way down.
    const [alone, last] = points().map(placeOf);
    expect(alone?.left).toBeCloseTo((3.5 / 7) * 100, 3);
    expect(alone?.top).toBeCloseTo(14, 3);
    expect(last?.left).toBeCloseTo((6.5 / 7) * 100, 3);
    expect(last?.top).toBeCloseTo(14, 3);
  });

  it("AC2: draws no line with no value at all, and no minigraph without a trend", async () => {
    const { host, tile, marks, points, settle } = await render();
    host.trend.set({ ...GAPS, values: DAYS.map(() => null) });
    await settle();
    // The space stays, so the row keeps its lines, but nothing is drawn nor explored.
    expect(tile()?.querySelector("[data-trend]")).not.toBeNull();
    expect(tile()?.querySelectorAll("[data-line]")).toHaveLength(0);
    expect(points()).toHaveLength(0);
    expect(marks()).toHaveLength(0);

    // All the values equal: a flat line through the middle.
    host.trend.set({ ...GAPS, values: [4, 4, 4, 4, 4, 4, 4] });
    await settle();
    expect(tile()?.querySelectorAll("[data-line]")).toHaveLength(1);
    expect(placeOf(points()[0]).top).toBeCloseTo(18, 3);

    host.trend.set(undefined);
    host.delta.set(undefined);
    host.note.set(undefined);
    await settle();
    expect(tile()?.querySelector("[data-trend]")).toBeNull();
    expect(tile()?.querySelector("[data-delta]")).toBeNull();
    expect(tile()?.querySelector("[data-note]")).toBeNull();
  });

  it("AC3: gives a day's value and a cursor under the pointer, and hides them when it leaves", async () => {
    const { tile, marks, tip, tipText, points, settle } = await render();
    expect(tip()).toBeFalsy();
    expect(tile()?.querySelector("[data-cursor]")).toBeNull();

    marks()[1]?.dispatchEvent(new PointerEvent("pointerenter"));
    await settle();
    expect(tipText()).toEqual({ title: "2 nov", rows: ["Cambios cerrados 3"] });
    expect(tile()?.querySelector("[data-cursor]")).not.toBeNull();
    // The day under the pointer is marked too, at the top: it is the highest.
    expect(points()).toHaveLength(3);
    expect(
      points()
        .map(placeOf)
        .some((place) => place.top === 6),
    ).toBe(true);

    marks()[2]?.dispatchEvent(new PointerEvent("pointerenter"));
    await settle();
    expect(tipText()).toEqual({ title: "3 nov", rows: ["Cambios cerrados sin datos"] });

    marks()[2]?.dispatchEvent(new PointerEvent("pointerleave"));
    await settle();
    expect(tip()).toBeFalsy();
    expect(tile()?.querySelector("[data-cursor]")).toBeNull();
  });

  it("AC3: is one stop of the tab key, and the arrows, Home and End go through its days, each one saying its value", async () => {
    const { tile, marks, tip, tipText, press, settle } = await render();
    const group = tile()?.querySelector("[role=group]");
    expect(group?.getAttribute("aria-label")).toBe("Cambios cerrados por día");
    expect(marks().map((mark) => mark.tabIndex)).toEqual([0, -1, -1, -1, -1, -1, -1]);
    expect(marks()[0]?.getAttribute("aria-label")).toBe("1 nov: Cambios cerrados 1");
    expect(marks()[2]?.getAttribute("aria-label")).toBe("3 nov: Cambios cerrados sin datos");

    marks()[0]?.focus();
    await settle();
    expect(tipText()).toEqual({ title: "1 nov", rows: ["Cambios cerrados 1"] });

    await press("ArrowRight");
    expect(document.activeElement).toBe(marks()[1]);
    expect(marks().map((mark) => mark.tabIndex)).toEqual([-1, 0, -1, -1, -1, -1, -1]);
    await press("End");
    expect(document.activeElement).toBe(marks()[6]);
    expect(tipText()).toEqual({ title: "7 nov", rows: ["Cambios cerrados 2"] });
    await press("ArrowRight");
    expect(document.activeElement).toBe(marks()[6]);
    await press("ArrowLeft");
    expect(document.activeElement).toBe(marks()[5]);
    await press("Home");
    expect(document.activeElement).toBe(marks()[0]);

    // Leaving it hides the value, and the tab key comes back to the last day with the focus.
    await press("ArrowRight");
    document.querySelector<HTMLElement>("#outside")?.focus();
    await settle();
    expect(tip()).toBeFalsy();
    expect(marks().map((mark) => mark.tabIndex)).toEqual([-1, 0, -1, -1, -1, -1, -1]);
  });

  it("AC7: in English, a day with no value says so in its name and its tooltip", async () => {
    const { host, marks, tipText, settle } = await render("en");
    host.label.set("Changes closed");
    host.trend.set({
      ...GAPS,
      heading: "Changes closed per day",
      labels: ["Nov 1", "Nov 2", "Nov 3", "Nov 4", "Nov 5", "Nov 6", "Nov 7"],
    });
    await settle();
    expect(marks()[2]?.getAttribute("aria-label")).toBe("Nov 3: Changes closed no data");
    marks()[2]?.dispatchEvent(new PointerEvent("pointerenter"));
    await settle();
    expect(tipText()).toEqual({ title: "Nov 3", rows: ["Changes closed no data"] });
  });
});
