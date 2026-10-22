// SPDX-License-Identifier: Apache-2.0
import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { parseChangeState, parseSpec } from "@baquia-dev/specty-core";
import { ChangesStore, DERIVER } from "./changes-store";
import { answer } from "./derive.worker";
import { FixtureData, sampleRecords } from "./fixtures";
import type { ChangeRecord as ChangeRecordForTest } from "./records";
import { type ChangeRecord, SpectyData } from "./records";
import { deriveViews } from "./views";

/** jsdom has no Worker: derive in the same thread, as the worker would. */
const IN_THREAD = {
  provide: DERIVER,
  useValue: (records: readonly ChangeRecordForTest[]) => Promise.resolve(deriveViews(records)),
};

/** `inThread: false` keeps the real deriver, which uses a Worker. */
function setup(inThread = true) {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: SpectyData, useClass: FixtureData }, ...(inThread ? [IN_THREAD] : [])],
  });
  const fixtures = TestBed.inject(SpectyData) as FixtureData;
  const store = TestBed.inject(ChangesStore);
  return { fixtures, store, settle: () => settled(store) };
}

/** Until the store stops loading: the derivation chunk loads on demand, so it takes a while. */
async function settled(store: ChangesStore): Promise<void> {
  for (let round = 0; round < 100; round++) {
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve));
    if (!store.views.isLoading()) return;
  }
}

describe("sample data", () => {
  it("is valid for core: states pass and specs parse without errors (AC9)", () => {
    for (const record of sampleRecords(Date.now())) {
      expect(parseChangeState(record.state).ok, record.state.id).toBe(true);
      const errors = parseSpec(record.spec).diagnostics.filter((d) => d.severity === "error");
      expect(errors, record.state.id).toEqual([]);
    }
  });
});

describe("ChangesStore", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    Reflect.deleteProperty(globalThis, "Worker");
  });

  it("groups decisions (oldest first), work in progress and recent changes", async () => {
    const { store, settle } = setup();
    expect(store.views.isLoading()).toBe(true);
    await settle();
    expect(store.decisions().map((view) => view.decision)).toEqual([
      "acceptance",
      "closing",
      "review",
      "scope",
    ]);
    expect(
      store
        .active()
        .map((view) => view.phase)
        .toSorted(),
    ).toEqual(["draft", "implementing"]);
    expect(store.recent().map((view) => view.phase)).toEqual(["done", "cancelled"]);
  });

  it("updates live when the source changes (AC5)", async () => {
    const { fixtures, store, settle } = setup();
    await settle();
    fixtures.approveSpec();
    fixtures.approveScope();
    await settle();
    expect(store.decisions().map((view) => view.decision)).toEqual(["acceptance", "closing"]);
    fixtures.finishTask();
    fixtures.finishTask();
    await settle();
    // Login finishes its last task, and so does the PDF export once its scope was approved.
    expect(store.decisions().filter((view) => view.decision === "acceptance")).toHaveLength(3);
  });

  it("reports a failing source and recovers (AC6)", async () => {
    const { fixtures, store, settle } = setup();
    await settle();
    fixtures.toggleOutage();
    await settle();
    expect(store.views.error()).toBeDefined();
    fixtures.toggleOutage();
    await settle();
    expect(store.views.error()).toBeUndefined();
    expect(store.all()).toHaveLength(8);
  });

  it("derives through a web worker when there is one (AC10)", async () => {
    const posted: number[] = [];
    class FakeWorker extends EventTarget {
      postMessage(request: Parameters<typeof answer>[0]) {
        posted.push(request.id);
        queueMicrotask(() =>
          this.dispatchEvent(new MessageEvent("message", { data: answer(request) })),
        );
      }
      terminate() {}
    }
    Object.assign(globalThis, { Worker: FakeWorker });
    const { store, settle } = setup(false);
    await settle();
    expect(posted).toEqual([0]);
    expect(store.all()).toHaveLength(8);
  });

  it("says so when there are no web workers and no deriver was given", async () => {
    const { store, settle } = setup(false);
    await settle();
    expect(String(store.views.error())).toContain("no Web Workers");
  });

  it("finds a change by id", async () => {
    const { store, settle } = setup();
    await settle();
    const found = store.byId(signal("20261021-login-google"));
    expect(found()?.title).toBe("Login con Google");
  });

  it("works with any source that keeps the contract (AC7)", async () => {
    class OneChange extends SpectyData {
      changes(): Promise<readonly ChangeRecord[]> {
        return Promise.resolve(sampleRecords(Date.now()).slice(0, 1));
      }
      subscribe(): () => void {
        return () => undefined;
      }
    }
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: SpectyData, useClass: OneChange }, IN_THREAD],
    });
    const store = TestBed.inject(ChangesStore);
    await settled(store);
    expect(store.all().map((view) => view.decision)).toEqual(["review"]);
  });
});
