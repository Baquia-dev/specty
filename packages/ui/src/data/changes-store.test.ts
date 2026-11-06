// SPDX-License-Identifier: Apache-2.0
// One change by its id in the store: among the loaded ones or, when the Inbox has not loaded it,
// asked to the source by its id.
import { type Signal, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import type { ChangeState } from "@baquia-dev/specty-core";
import { ChangesStore, DERIVER } from "./changes-store";
import { sampleRecords } from "./fixtures";
import { type ChangeRecord, SpectyData } from "./records";
import { deriveViews } from "./views";

const EPIC = "20261101-bandeja-por-paginas";
const SLICE = "20261102-cambio-sin-cargar";
const UNKNOWN = "20990101-no-existe";

/** The first sample change as `id`, of `kind`, in `phase`, with `spec`. */
function made(
  id: string,
  kind: ChangeState["kind"],
  phase: ChangeState["phase"],
  spec: string,
): ChangeRecord {
  const [sample] = sampleRecords(Date.now());
  if (sample === undefined) throw new Error("no sample change");
  return { ...sample, spec, state: { ...sample.state, id, kind, phase, branch: `specty/${id}` } };
}

const RECORDS = [
  made(EPIC, "epic", "implementing", "---\nkind: epic\n---\n\n# La Bandeja por páginas\n"),
  made(
    SLICE,
    "standard",
    "done",
    `---\nkind: standard\nepic: ${EPIC}\nslice: C3\n---\n\n# Un cambio sin cargar\n`,
  ),
];

/** A source that lists only the epic, as one paging the finished changes: the slice comes by its id. */
class Paged extends SpectyData {
  readonly asked: string[] = [];
  failing = false;
  /** Reading the list fails, as when the server answers 500. */
  listFailing = false;
  /** A change the source does not have a moment, as one whose folder is being archived. */
  hidden: string | undefined;
  private readonly listeners = new Set<() => void>();

  changes(): Promise<readonly ChangeRecord[]> {
    if (this.listFailing) return Promise.reject(new Error("El servidor no responde (simulado)."));
    return Promise.resolve(RECORDS.slice(0, 1));
  }

  override change(id: string): Promise<ChangeRecord | undefined> {
    this.asked.push(id);
    if (this.failing) return Promise.reject(new Error("El servidor no responde (simulado)."));
    if (id === this.hidden) return Promise.resolve(undefined);
    return Promise.resolve(RECORDS.find((record) => record.state.id === id));
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Says something changed, as the local server's events do. */
  tell(): void {
    for (const listener of this.listeners) listener();
  }
}

function setup() {
  const source = new Paged();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: SpectyData, useValue: source },
      {
        provide: DERIVER,
        useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
      },
    ],
  });
  const store = TestBed.inject(ChangesStore);
  const find = (id: string | Signal<string>) =>
    TestBed.runInInjectionContext(() => store.byId(typeof id === "string" ? signal(id) : id));
  return { source, store, find };
}

/** Lets the store load its list and the source answer. */
async function settle(): Promise<void> {
  for (let round = 0; round < 20; round++) {
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve));
  }
}

describe("a change by its id in the store", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: asks the source for a change the Inbox has not loaded, with its epic's title", async () => {
    const { source, find } = setup();
    const found = find(SLICE);
    await settle();
    expect(found.view()?.title).toBe("Un cambio sin cargar");
    expect(found.view()?.phase).toBe("done");
    expect(found.view()?.epic?.title).toBe("La Bandeja por páginas");
    expect(found.missing()).toBe(false);
    expect(source.asked).toEqual([SLICE]);
    // Each time the source says something changed, it is asked again, as the list is read again.
    source.tell();
    await settle();
    expect(source.asked).toEqual([SLICE, SLICE]);
    expect(found.view()?.title).toBe("Un cambio sin cargar");
  });

  it("AC4: does not ask the source for a change the Inbox has loaded", async () => {
    const { source, find } = setup();
    const found = find(EPIC);
    await settle();
    expect(found.view()?.title).toBe("La Bandeja por páginas");
    expect(found.missing()).toBe(false);
    expect(source.asked).toEqual([]);
  });

  it("AC2: says a change does not exist only once the source does not have it either", async () => {
    const { source, find } = setup();
    const found = find(UNKNOWN);
    expect(found.missing()).toBe(false);
    await settle();
    expect([found.view(), found.missing(), source.asked]).toEqual([undefined, true, [UNKNOWN]]);
  });

  it("AC2: says it does not exist, too, when the source fails to look for it", async () => {
    const { source, find } = setup();
    source.failing = true;
    const found = find(SLICE);
    await settle();
    expect([found.view(), found.missing()]).toEqual([undefined, true]);
  });
});

describe("what the store keeps when a read fails", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: keeps the changes it listed, and each of them, when reading the list again fails", async () => {
    const { source, store, find } = setup();
    const found = find(EPIC);
    await settle();
    source.listFailing = true;
    source.tell();
    await settle();
    expect(store.views.error()).toBeDefined();
    expect(store.listed().map((view) => view.id)).toEqual([EPIC]);
    expect([found.view()?.title, found.missing()]).toEqual(["La Bandeja por páginas", false]);
  });

  it("AC1: keeps a change it found when the source fails or misses it, but not for another id", async () => {
    const { source, find } = setup();
    const id = signal(SLICE);
    const found = find(id);
    await settle();
    expect(found.view()?.title).toBe("Un cambio sin cargar");
    source.failing = true;
    source.tell();
    await settle();
    expect([found.view()?.title, found.missing()]).toEqual(["Un cambio sin cargar", false]);
    // Gone a moment, as while its folder is archived: what was read stays.
    source.failing = false;
    source.hidden = SLICE;
    source.tell();
    await settle();
    expect([found.view()?.title, found.missing()]).toEqual(["Un cambio sin cargar", false]);
    // An id never found still does not exist, even right after another one was shown.
    id.set(UNKNOWN);
    await settle();
    expect([found.view(), found.missing()]).toEqual([undefined, true]);
  });
});
