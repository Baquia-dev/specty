// SPDX-License-Identifier: Apache-2.0
import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { ChangesStore, DERIVER } from "./changes-store";
import { answer } from "./derive.worker";
import { FixtureData, REVIEWER, sampleRecords } from "./fixtures";
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

// The sample data itself is checked in sample-specs.test.ts.
describe("FixtureData actions", () => {
  const REVIEW = "20261020-evolucion-trimestre";
  const PDF = "20261019-boletines-pdf";

  afterEach(() => TestBed.resetTestingModule());

  it("starts with a review that only waits for decisions, with two comments", async () => {
    const { store, settle } = setup();
    await settle();
    const review = store.all().find((view) => view.id === REVIEW)?.review;
    expect(review?.errors).toEqual([]);
    expect(review?.comments.map((comment) => comment.section)).toEqual(["assumptions", "design"]);
    // "rápido" is vague, and the criterion lacks CUANDO … ENTONCES.
    expect(review?.criteria.find((criterion) => criterion.id === "AC3")?.warnings.length).toBe(2);
    expect(review?.design).toContain("```dart");
  });

  it("decides assumptions and adds comments, live (AC2, AC6)", async () => {
    const { fixtures, store, settle } = setup();
    await settle();
    await fixtures.decideAssumption(REVIEW, "A2", "rejected", "Son periodos del colegio.");
    await fixtures.addComment(REVIEW, { item: "AC3" }, "¿Cuánto es rápido?");
    await settle();
    const view = store.all().find((change) => change.id === REVIEW);
    expect(view?.review.assumptions.find((item) => item.id === "A2")).toMatchObject({
      decision: "rejected",
      comment: "Son periodos del colegio.",
    });
    expect(view?.highImpactPending).toBe(0);
    expect(view?.review.comments.at(-1)).toMatchObject({
      id: "c3",
      author: "Ana Gómez",
      body: "¿Cuánto es rápido?",
      section: "criteria",
      revision: 2,
    });
  });

  it("keeps the work in progress: times, commits, attempts and a failure's last lines", async () => {
    const { store, settle } = setup();
    await settle();
    const progress = store.all().find((change) => change.id === PDF)?.progress;
    const [first, second, third] = progress?.tasks ?? [];
    expect(first).toMatchObject({ status: "done", commit: "a1b2c3d", attempts: 1 });
    expect(first?.verification).toMatchObject({ passed: true, ms: 18_000, output: [] });
    expect(second).toMatchObject({ status: "done", commit: "7e4f9a0", attempts: 2 });
    expect(third).toMatchObject({ status: "active", attempts: 1 });
    expect(third?.verification?.passed).toBe(false);
    expect(third?.verification?.output.at(-1)).toBe("00:07 +6 -1: Some tests failed.");
    expect(third?.scopeRequests.map((request) => request.id)).toEqual(["S1"]);
  });

  it("decides scope requests: an approval widens the task, a rejection keeps the reason (AC3, AC4)", async () => {
    const { fixtures, store, settle } = setup();
    await settle();
    const scope = () => {
      const record = sampleRecords(0).find((item) => item.state.id === PDF);
      return record?.state.pending.scopeRequests[0];
    };
    expect(scope()?.id).toBe("S1");
    await fixtures.decideScope(PDF, "S1", "rejected", "Usa el maquetador del boletín.");
    await settle();
    let view = store.all().find((change) => change.id === PDF);
    expect(view?.decision).toBeUndefined();
    expect(view?.progress.tasks[2]?.scopeRequests).toEqual([]);
    // Already decided: the source explains it instead of deciding twice.
    await expect(fixtures.decideScope(PDF, "S1", "approved")).rejects.toMatchObject({
      text: { es: "La solicitud S1 ya no está pendiente." },
    });

    // A fresh source, approving this time: the path enters the task's scope, and it is logged.
    const fresh = setup();
    await fresh.settle();
    fresh.fixtures.approveScope();
    await fresh.settle();
    view = fresh.store.all().find((change) => change.id === PDF);
    expect(view?.decision).toBeUndefined();
    const records = await fresh.fixtures.changes();
    const record = records.find((item) => item.state.id === PDF);
    const asked = scope()?.task ?? "";
    expect(record?.state.tasks[asked]?.scopeExtra).toEqual(["lib/shared/pdf/layout.dart"]);
    expect(record?.audit?.at(-1)).toMatchObject({
      actor: "human",
      event: "scope.decided",
      data: { request: "S1", decision: "approved" },
    });
  });

  it("approves only the revision shown, and the change moves on (AC7)", async () => {
    const { fixtures, store, settle } = setup();
    await settle();
    await expect(fixtures.approve(REVIEW, 1)).rejects.toMatchObject({
      text: { es: expect.stringContaining("revisión 2") },
    });
    await fixtures.requestChanges(REVIEW);
    await settle();
    // Noted as the server does: the change now waits for the agent's next revision (AC4).
    const asked = store.all().find((change) => change.id === REVIEW);
    expect([asked?.decision, asked?.changesRequested?.revision]).toEqual([undefined, 2]);
    await fixtures.approve(REVIEW, 2);
    await settle();
    const view = store.all().find((change) => change.id === REVIEW);
    expect(view?.phase).toBe("implementing");
    await expect(fixtures.addComment("20990101-nada", { item: "A1" }, "x")).rejects.toMatchObject({
      text: { en: "There is no change 20990101-nada." },
    });
    // Nothing to ask for outside review, or with nothing open (AC4).
    await expect(fixtures.requestChanges(REVIEW)).rejects.toMatchObject({
      text: { es: "No hay comentarios sin resolver ni supuestos rechazados que pedir." },
    });
  });

  it("AC3: brings a change in testing with its red tests, and approving them locks them", async () => {
    const { fixtures, store, settle } = setup();
    await settle();
    const id = "20261022-avisos-calificaciones";
    const view = () => store.all().find((change) => change.id === id);
    const files = ["test/grades/grade_notice_test.dart", "test/grades/notice_view_test.dart"];
    expect([view()?.phase, view()?.decision, view()?.tests?.files]).toEqual([
      "testing",
      "tests",
      files,
    ]);
    expect(view()?.tests?.red).toEqual([{ cmd: "flutter test test/grades", exit: 1 }]);
    await fixtures.approve(id, 1);
    await settle();
    expect([view()?.phase, view()?.decision]).toEqual(["implementing", undefined]);
    expect(view()?.lockedTests?.map((test) => test.path)).toEqual(files.toSorted());
    const record = (await fixtures.changes()).find((item) => item.state.id === id);
    expect(record?.audit?.at(-1)).toMatchObject({
      actor: "human",
      event: "tests.approved",
      data: { channel: "ui" },
    });
    expect(record?.state.testsSubmittedAt).toBeUndefined();
  });

  it("AC3: gives the change in acceptance the tests of its criteria", async () => {
    const { store, settle } = setup();
    await settle();
    const view = store.all().find((change) => change.id === "20261018-asistencia-curso");
    expect(view?.criteriaTests?.map((item) => [item.id, item.tests.length])).toEqual([
      ["AC1", 2],
      ["AC2", 1],
    ]);
  });

  it("confirms only a closing the agent sent, and the change is done (AC3)", async () => {
    const { fixtures, store, settle } = setup();
    const [mail, panel] = ["20261017-recordatorios-correo", "20261018-asistencia-curso"];
    const refused = (es: string) => ({ text: { es: expect.stringContaining(es) } });
    await expect(fixtures.confirmClosing(PDF)).rejects.toMatchObject(refused("no espera"));
    await fixtures.decideResult(panel, { kind: "accept" });
    await expect(fixtures.confirmClosing(panel)).rejects.toMatchObject(refused("aún no"));
    await fixtures.confirmClosing(mail);
    await settle();
    const view = store.all().find((change) => change.id === mail);
    expect(view?.phase).toBe("done");
    expect(view?.closing?.pending).toContain("La plantilla en inglés");
    const closed = (await fixtures.changes()).find((item) => item.state.id === mail);
    expect(closed?.audit?.at(-1)).toMatchObject({ actor: "human", event: "change.closed" });
  });

  it("switches delegated mode and tells the subscribers (AC3)", async () => {
    const { fixtures } = setup();
    const heard = vi.fn();
    fixtures.subscribe(heard);
    expect(await fixtures.delegation()).toMatchObject({ on: false });
    await fixtures.setDelegation(true);
    expect(await fixtures.delegation()).toMatchObject({ on: true, by: REVIEWER });
    expect((await fixtures.delegation()).warning.es[0]).toContain("Con el modo delegado");
    await fixtures.setDelegation(false);
    expect((await fixtures.delegation()).on).toBe(false);
    expect(heard).toHaveBeenCalledTimes(2);
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
      "review",
      "tests",
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
    // The first review is approved; the revised one and the tests sent still wait.
    expect(store.decisions().map((view) => view.decision)).toEqual([
      "acceptance",
      "closing",
      "review",
      "tests",
    ]);
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
    expect(store.all()).toHaveLength(10);
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
    expect(store.all()).toHaveLength(10);
  });

  it("AC4: derives in the main thread when there are no web workers and no deriver was given", async () => {
    const { store, settle } = setup(false);
    await settle();
    expect(store.views.error()).toBeUndefined();
    expect(store.all()).toHaveLength(10);
  });

  it("AC4: derives in the main thread when creating the worker fails, as a sandbox's CSP makes it", async () => {
    class RefusedWorker {
      constructor() {
        throw new Error("Refused to create a worker: it violates the Content Security Policy.");
      }
    }
    Object.assign(globalThis, { Worker: RefusedWorker });
    const { store, settle } = setup(false);
    await settle();
    expect(store.views.error()).toBeUndefined();
    expect(store.all()).toHaveLength(10);
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
