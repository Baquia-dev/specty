// SPDX-License-Identifier: Apache-2.0
import { CdkConnectedOverlay, CdkOverlayOrigin } from "@angular/cdk/overlay";
import { Component, signal, viewChild } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { followOrigin } from "./overlay-follow";

@Component({
  imports: [CdkConnectedOverlay, CdkOverlayOrigin],
  template: `
    <button type="button" cdkOverlayOrigin #origin="cdkOverlayOrigin">Abrir</button>
    <ng-template cdkConnectedOverlay [cdkConnectedOverlayOrigin]="origin" [cdkConnectedOverlayOpen]="true">
      <div>Panel</div>
    </ng-template>
  `,
})
class Host {
  readonly open = signal(false);
  readonly overlay = viewChild.required(CdkConnectedOverlay);

  constructor() {
    followOrigin(
      () => this.open(),
      () => this.overlay(),
    );
  }
}

describe("followOrigin", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("places the overlay again when it opens and on any scroll while open, and stops after", async () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const host = fixture.componentInstance;
    const place = vi.spyOn(host.overlay().overlayRef, "updatePosition");
    // Closed: nothing follows.
    document.body.dispatchEvent(new Event("scroll"));
    expect(place).not.toHaveBeenCalled();

    host.open.set(true);
    await fixture.whenStable();
    expect(place).toHaveBeenCalledTimes(1);
    // A scroll anywhere (the shell's main does not bubble it) is heard in capture.
    const main = document.createElement("main");
    document.body.append(main);
    main.dispatchEvent(new Event("scroll"));
    expect(place).toHaveBeenCalledTimes(2);

    host.open.set(false);
    await fixture.whenStable();
    main.dispatchEvent(new Event("scroll"));
    expect(place).toHaveBeenCalledTimes(2);
    main.remove();
  });
});
