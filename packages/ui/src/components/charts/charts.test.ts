// SPDX-License-Identifier: Apache-2.0
// The panel's charts (docs/ui.md, «Panel»): columns stacked by series, with their legend, their
// values under the pointer and the focus, the keyboard and the same data in a table.
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { type ChartSeries, ColumnChart } from "./column-chart";

const LANES: readonly ChartSeries[] = [
  { label: "Feature", color: "--color-series-1", values: [2, 0, 1, 0] },
  { label: "Quick", color: "--color-series-2", values: [1, 0, 0, 0] },
  { label: "Épica, spike y manual", color: "--color-series-3", values: [0, 0, 3, 0] },
];

const TASKS: readonly ChartSeries[] = [
  { label: "Tareas", color: "--color-series-1", values: [5, 0, 2, 1] },
];

@Component({
  imports: [ColumnChart],
  template: `
    <sp-column-chart [heading]="heading()" [category]="category()" [labels]="labels" [series]="series()" />
    <button type="button" id="outside">fuera</button>
  `,
})
class Host {
  readonly heading = signal("Cambios cerrados por día, por carril");
  readonly category = signal("Día");
  readonly labels = ["3 nov", "4 nov", "5 nov", "6 nov"];
  readonly series = signal<readonly ChartSeries[]>(LANES);
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
  const chart = () => element.querySelector<HTMLElement>("sp-column-chart");
  const columns = () => [...(chart()?.querySelectorAll<HTMLButtonElement>("[data-column]") ?? [])];
  const tip = () => chart()?.querySelector<HTMLElement>("[data-chart-tip]");
  const tipRows = () =>
    [...(tip()?.querySelectorAll<HTMLElement>("[data-tip-row]") ?? [])].map((row) => text(row));
  const toggle = () => chart()?.querySelector<HTMLButtonElement>("[data-chart-toggle]");
  const press = async (key: string) => {
    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    await fixture.whenStable();
  };
  const settle = () => fixture.whenStable();
  return {
    fixture,
    host: fixture.componentInstance,
    chart,
    columns,
    tip,
    tipRows,
    toggle,
    press,
    settle,
  };
}

describe("the column chart", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: draws a column per label, stacked by series in each one's color, with its legend and axis", async () => {
    const { host, chart, columns, settle } = await render();
    expect(text(chart()?.querySelector("[data-chart-heading]"))).toBe(
      "Cambios cerrados por día, por carril",
    );
    expect(columns()).toHaveLength(4);
    const legend = [...(chart()?.querySelectorAll("[data-legend] li") ?? [])].map(text);
    expect(legend).toEqual(["Feature", "Quick", "Épica, spike y manual"]);
    // A segment for each value above zero, in its series' color: never a hue of its own.
    const fills = [...(chart()?.querySelectorAll<SVGElement>("[data-segment]") ?? [])].map(
      (segment) => segment.style.fill,
    );
    expect(fills.toSorted()).toEqual([
      "var(--color-series-1)",
      "var(--color-series-1)",
      "var(--color-series-2)",
      "var(--color-series-3)",
    ]);
    // Whole numbers on the axis, up to the tallest column (4), and every day under it.
    expect([...(chart()?.querySelectorAll("[data-tick]") ?? [])].map(text)).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
    ]);
    expect([...(chart()?.querySelectorAll("[data-x-label]") ?? [])].map(text)).toEqual(host.labels);

    // One series needs no legend: the heading names it.
    host.series.set(TASKS);
    await settle();
    expect(chart()?.querySelector("[data-legend]")).toBeNull();
    expect(chart()?.querySelectorAll("[data-segment]")).toHaveLength(3);
  });

  it("AC1: gives a column's values per series and their total under the pointer, and hides them when it leaves", async () => {
    const { host, columns, tip, tipRows, settle } = await render();
    expect(tip()).toBeFalsy();
    columns()[0]?.dispatchEvent(new PointerEvent("pointerenter"));
    await settle();
    expect(text(tip()?.querySelector("[data-tip-title]"))).toBe("3 nov");
    expect(tipRows()).toEqual(["Feature 2", "Quick 1", "Épica, spike y manual 0", "Total 3"]);

    columns()[2]?.dispatchEvent(new PointerEvent("pointerenter"));
    await settle();
    expect(text(tip()?.querySelector("[data-tip-title]"))).toBe("5 nov");
    expect(tipRows()).toEqual(["Feature 1", "Quick 0", "Épica, spike y manual 3", "Total 4"]);

    columns()[2]?.dispatchEvent(new PointerEvent("pointerleave"));
    await settle();
    expect(tip()).toBeFalsy();

    // With one series there is no total.
    host.series.set(TASKS);
    await settle();
    columns()[0]?.dispatchEvent(new PointerEvent("pointerenter"));
    await settle();
    expect(tipRows()).toEqual(["Tareas 5"]);
  });

  it("AC5: is one stop of the tab key, and the arrows, Home and End go through its columns, each one saying its values", async () => {
    const { columns, tip, tipRows, press, settle } = await render();
    expect(columns().map((column) => column.tabIndex)).toEqual([0, -1, -1, -1]);
    expect(columns()[0]?.getAttribute("aria-label")).toBe(
      "3 nov: Feature 2; Quick 1; Épica, spike y manual 0; Total 3",
    );
    expect(columns()[1]?.getAttribute("aria-label")).toBe(
      "4 nov: Feature 0; Quick 0; Épica, spike y manual 0; Total 0",
    );

    columns()[0]?.focus();
    await settle();
    expect(text(tip()?.querySelector("[data-tip-title]"))).toBe("3 nov");

    await press("ArrowRight");
    expect(document.activeElement).toBe(columns()[1]);
    expect(columns().map((column) => column.tabIndex)).toEqual([-1, 0, -1, -1]);
    expect(text(tip()?.querySelector("[data-tip-title]"))).toBe("4 nov");

    await press("End");
    expect(document.activeElement).toBe(columns()[3]);
    expect(text(tip()?.querySelector("[data-tip-title]"))).toBe("6 nov");
    // The last column is the end: no wrapping around.
    await press("ArrowRight");
    expect(document.activeElement).toBe(columns()[3]);

    await press("ArrowLeft");
    expect(document.activeElement).toBe(columns()[2]);
    expect(tipRows()).toEqual(["Feature 1", "Quick 0", "Épica, spike y manual 3", "Total 4"]);

    await press("Home");
    expect(document.activeElement).toBe(columns()[0]);
    await press("ArrowLeft");
    expect(document.activeElement).toBe(columns()[0]);

    // Leaving the chart hides the values, and the tab key comes back to the last column.
    await press("ArrowRight");
    document.querySelector<HTMLElement>("#outside")?.focus();
    await settle();
    expect(tip()).toBeFalsy();
    expect(columns().map((column) => column.tabIndex)).toEqual([-1, 0, -1, -1]);
  });

  it("AC4: «Ver tabla» shows the same data in a table, and «Ver gráfica» brings the chart back", async () => {
    const { host, chart, columns, toggle, settle } = await render();
    expect(text(toggle())).toBe("Ver tabla");
    expect(toggle()?.getAttribute("aria-pressed")).toBe("false");

    toggle()?.click();
    await settle();
    const table = chart()?.querySelector("[data-chart-table]");
    expect(columns()).toHaveLength(0);
    expect([...(table?.querySelectorAll("thead th") ?? [])].map(text)).toEqual([
      "Día",
      "Feature",
      "Quick",
      "Épica, spike y manual",
      "Total",
    ]);
    const rows = [...(table?.querySelectorAll("tbody tr") ?? [])].map((row) =>
      [...row.children].map(text),
    );
    expect(rows).toEqual([
      ["3 nov", "2", "1", "0", "3"],
      ["4 nov", "0", "0", "0", "0"],
      ["5 nov", "1", "0", "3", "4"],
      ["6 nov", "0", "0", "0", "0"],
    ]);
    expect(text(toggle())).toBe("Ver gráfica");
    expect(toggle()?.getAttribute("aria-pressed")).toBe("true");

    // One series: its own column, with no total.
    host.series.set(TASKS);
    await settle();
    const single = chart()?.querySelector("[data-chart-table]");
    expect([...(single?.querySelectorAll("thead th") ?? [])].map(text)).toEqual(["Día", "Tareas"]);
    const first = single?.querySelector("tbody tr");
    expect([...(first?.children ?? [])].map(text)).toEqual(["3 nov", "5"]);

    toggle()?.click();
    await settle();
    expect(chart()?.querySelector("[data-chart-table]")).toBeNull();
    expect(columns()).toHaveLength(4);
  });

  it("AC7: in English, the table toggle, the total and the table", async () => {
    const { host, columns, tipRows, toggle, chart, settle } = await render("en");
    host.heading.set("Changes closed per day, by lane");
    host.category.set("Day");
    await settle();
    expect(text(chart()?.querySelector("[data-chart-heading]"))).toBe(
      "Changes closed per day, by lane",
    );
    expect(text(toggle())).toBe("Show table");
    columns()[0]?.dispatchEvent(new PointerEvent("pointerenter"));
    await settle();
    expect(tipRows().at(-1)).toBe("Total 3");

    toggle()?.click();
    await settle();
    expect(text(toggle())).toBe("Show chart");
    expect(text(chart()?.querySelector("[data-chart-table] thead th"))).toBe("Day");
  });
});
