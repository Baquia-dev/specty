// SPDX-License-Identifier: Apache-2.0
import { Component, signal, type Type } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { type ChangeKind, PHASES, type Phase } from "@baquia-dev/specty-core";
import { PHASE_LABELS } from "../theme/tokens";
import * as badgeModule from "./badge";
import { Badge, PhaseBadge } from "./badge";
import { Card } from "./card";
import { Skeleton } from "./skeleton";

@Component({
  imports: [Badge, PhaseBadge, Card, Skeleton],
  template: `
    @for (phase of phases; track phase) {
      <sp-phase-badge [phase]="phase" />
    }
    <sp-badge>M</sp-badge>
    <sp-card [selected]="selected()">Tarjeta</sp-card>
    <sp-skeleton id="text" [lines]="3" height="12px" width="240px" />
    <sp-skeleton id="quiet" [announce]="false" />
  `,
})
class Host {
  readonly phases: readonly Phase[] = PHASES;
  readonly selected = signal(false);
}

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
  return { fixture, element, host: fixture.componentInstance };
}

describe("PhaseBadge and Badge", () => {
  it("shows icon, name and colors for the eight phases (AC4)", async () => {
    const { element } = await render("en");
    const badges = [...element.querySelectorAll<HTMLElement>("sp-phase-badge")];
    expect(badges).toHaveLength(PHASES.length);
    for (const [index, phase] of PHASES.entries()) {
      const badge = badges[index];
      expect(badge?.dataset.phase).toBe(phase);
      expect(badge?.textContent?.trim()).toBe(PHASE_LABELS[phase].en);
      expect(badge?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
      expect(badge?.style.color).toBe(`var(--color-phase-${phase})`);
      expect(badge?.style.background).toContain(`--color-phase-${phase}-bg`);
    }
    expect(element.querySelector("sp-badge")?.textContent?.trim()).toBe("M");
  });

  it("AC4: names the testing phase «Tests» with its flask icon", async () => {
    const { element } = await render("es");
    const badge = element.querySelector<HTMLElement>('sp-phase-badge[data-phase="testing"]');
    expect(badge?.textContent?.trim()).toBe("Tests");
    expect(badge?.querySelector("svg")?.getAttribute("class")).toContain("flask-conical");
  });

  it("AC2: shows the icon and bilingual label for every change kind and epic slice", async () => {
    const KindBadge = (badgeModule as { KindBadge?: Type<unknown> }).KindBadge;
    expect(KindBadge).toBeDefined();
    if (KindBadge === undefined) return;
    expect(await renderKind(KindBadge, "es", "epic")).toEqual({
      kind: "epic",
      epic: undefined,
      label: "Épica",
      hasIcon: true,
    });
    expect(await renderKind(KindBadge, "en", "epic")).toMatchObject({
      kind: "epic",
      label: "Epic",
    });
    expect(await renderKind(KindBadge, "es", "standard")).toMatchObject({
      kind: "standard",
      label: "Individual",
    });
    expect(await renderKind(KindBadge, "en", "standard")).toMatchObject({
      kind: "standard",
      label: "Standalone",
    });
    expect(await renderKind(KindBadge, "es", "quick")).toMatchObject({
      kind: "quick",
      label: "Quick",
    });
    expect(await renderKind(KindBadge, "es", "retro")).toMatchObject({
      kind: "retro",
      label: "Manual",
    });
    expect(await renderKind(KindBadge, "es", "spike")).toMatchObject({
      kind: "spike",
      label: "Spike",
    });
    const slice = { id: "20261015-panel", title: "Panel académico", slice: "C1" };
    expect(await renderKind(KindBadge, "es", "standard", slice)).toEqual({
      kind: "slice",
      epic: "20261015-panel",
      label: "Corte C1 · Panel académico",
      hasIcon: true,
    });
    expect(await renderKind(KindBadge, "en", "standard", slice)).toMatchObject({
      kind: "slice",
      epic: "20261015-panel",
      label: "Slice C1 · Panel académico",
    });
  });
});

async function renderKind(
  KindBadge: Type<unknown>,
  lang: "es" | "en",
  kind: ChangeKind,
  epic?: { id: string; title: string; slice?: string },
) {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.setItem("specty.lang", lang);
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(KindBadge);
  fixture.componentRef.setInput("kind", kind);
  if (epic !== undefined) fixture.componentRef.setInput("epic", epic);
  await fixture.whenStable();
  const el: HTMLElement = fixture.nativeElement;
  return {
    kind: el.dataset.kind,
    epic: el.dataset.epic,
    label: el.textContent?.trim(),
    hasIcon: el.querySelector("svg") !== null,
  };
}

describe("Card", () => {
  it("shows and announces the selection (AC6)", async () => {
    const { fixture, element, host } = await render();
    const card = element.querySelector("sp-card");
    expect(card?.hasAttribute("aria-current")).toBe(false);
    expect(card?.classList).not.toContain("outline-focus");
    host.selected.set(true);
    await fixture.whenStable();
    // Announced always; highlighted only once the keyboard is in use.
    expect(card?.getAttribute("aria-current")).toBe("true");
    expect(card?.classList).not.toContain("outline-focus");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
    await fixture.whenStable();
    expect(card?.classList).not.toContain("outline-focus");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "j" }));
    await fixture.whenStable();
    expect(card?.classList).toContain("outline-focus");
    // Drawn over the card's own border, not around it.
    expect(card?.classList).toContain("-outline-offset-2");

    document.dispatchEvent(new Event("pointermove"));
    await fixture.whenStable();
    expect(card?.classList).not.toContain("outline-focus");
    expect(card?.getAttribute("aria-current")).toBe("true");
  });
});

describe("Skeleton", () => {
  it("takes the final size, hides its shapes and says loading once (AC8)", async () => {
    const { element } = await render();
    const text = element.querySelector<HTMLElement>("#text");
    const shapes = [...(text?.querySelectorAll<HTMLElement>("[aria-hidden=true]") ?? [])];
    expect(text?.style.width).toBe("240px");
    expect(shapes).toHaveLength(3);
    expect(shapes.map((shape) => shape.style.width)).toEqual(["100%", "100%", "60%"]);
    expect(shapes[0]?.style.height).toBe("12px");
    expect(shapes[0]?.classList).toContain("motion-reduce:animate-none");
    expect(element.querySelectorAll("[role=status]")).toHaveLength(1);
    expect(text?.querySelector("[role=status]")?.textContent?.trim()).toBe("Cargando…");
  });
});
