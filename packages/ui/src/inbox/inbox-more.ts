// SPDX-License-Identifier: Apache-2.0
// The finished changes of the Inbox in pages: asked with its filters, the next page at the end of
// the list or with j, and the counts as the source gives them.
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  PendingTasks,
  untracked,
} from "@angular/core";
import { Button } from "../components/button";
import { ChangesStore } from "../data/changes-store";
import type { FinishedPages, FinishedQuery } from "../data/finished-pages";
import { Preferences } from "../theme/preferences";
import { InboxState } from "./inbox-state";
import type { InboxPhase } from "./inbox-view";

/** How long the search waits for the person to stop typing before asking the source. */
const SEARCH_WAIT_MS = 250;
/** How far below the view the end of the list starts asking the next page. */
const AHEAD = "0px 0px 600px 0px";

/**
 * The end of the Inbox's list while finished changes are left: «Cargar más», and an observer that
 * asks the next page as the end nears the view. Where there is no observer, the button does it.
 */
@Component({
  selector: "sp-inbox-more",
  imports: [Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex justify-center" },
  template: `
    <sp-button size="sm" [loading]="pages.loading()" (pressed)="more()">{{ t()('Cargar más', 'Load more') }}</sp-button>
  `,
})
export class InboxMore {
  protected readonly pages = inject(ChangesStore).pages;
  protected readonly t = inject(Preferences).t;

  constructor() {
    const host: HTMLElement = inject(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof IntersectionObserver === "undefined") return;
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) this.more();
        },
        // The shell's main is what scrolls; outside it, the viewport.
        { root: host.closest("main"), rootMargin: AHEAD },
      );
      observer.observe(host);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected more(): void {
    void this.pages.more();
  }
}

/**
 * Keeps `pages` asked with the Inbox's filters, in the language of the interface: a new phase, sort
 * or language at once, a new search once the person stops typing for 250 ms. The wait is a pending
 * task, so the app is stable only once the page is asked. Runs in an injection context.
 */
export function askWithFilters(pages: FinishedPages): void {
  const state = inject(InboxState);
  const lang = inject(Preferences).lang;
  const tasks = inject(PendingTasks);
  let asked: FinishedQuery | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let waiting: (() => void) | undefined;
  const stop = () => {
    clearTimeout(timer);
    waiting?.();
    waiting = undefined;
  };
  const ask = (query: FinishedQuery) => {
    asked = query;
    untracked(() => void pages.ask(query));
  };
  effect(() => {
    const query = { query: state.query(), phase: state.phase(), sort: state.sort(), lang: lang() };
    stop();
    const typing =
      asked !== undefined &&
      query.query !== asked.query &&
      query.phase === asked.phase &&
      query.sort === asked.sort &&
      query.lang === asked.lang;
    if (!typing) {
      ask(query);
      return;
    }
    waiting = tasks.add();
    timer = setTimeout(() => {
      ask(query);
      stop();
    }, SEARCH_WAIT_MS);
  });
  inject(DestroyRef).onDestroy(stop);
}

/** The phase counts: the open phases from the open changes, the finished ones from the page. */
export function withFinishedCounts(
  open: ReadonlyMap<InboxPhase, number>,
  finished: { readonly done: number; readonly cancelled: number },
): ReadonlyMap<InboxPhase, number> {
  const all = (open.get("all") ?? 0) + finished.done + finished.cancelled;
  return new Map<InboxPhase, number>([
    ...open,
    ["all", all],
    ["done", finished.done],
    ["cancelled", finished.cancelled],
  ]);
}

/** `j` past the last row loaded: the next page and, once it brings rows, `then`, to move on. */
export async function pastTheEnd(pages: FinishedPages, then: () => void): Promise<void> {
  if (pages.complete() || pages.loading()) return;
  const before = pages.views().length;
  await pages.more();
  if (pages.views().length > before) then();
}
