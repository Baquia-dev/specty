// SPDX-License-Identifier: Apache-2.0
import type { MemoryEntry, StatusEntry } from "@baquia-dev/specty-core";
import type { MemoryItem } from "./memory-view";

/** The page's translator: the Spanish and the English text, and it picks one. */
type Translate = (es: string, en: string) => string;

/** Under an entry: who proposed to drop it and why, or who took it, its quote and its origin. */
export function entryLine(item: MemoryItem, entry: MemoryEntry, t: Translate): string {
  if (item.kind === "proposal" && entry.drop !== undefined)
    return t(
      `Propuesta para descartar por ${entry.drop.by}: «${entry.drop.reason}»`,
      `Proposed to drop by ${entry.drop.by}: “${entry.drop.reason}”`,
    );
  const by = entry.origin.by === "person" ? t("la persona", "the person") : entry.origin.by;
  const closed =
    item.kind !== "closed"
      ? []
      : [entry.status === "done" ? t("hecha", "done") : t("descartada", "dropped")];
  return [
    ...closed,
    ...(entry.taken === undefined
      ? []
      : [t(`tomada por ${entry.taken.change}`, `taken by ${entry.taken.change}`)]),
    ...(entry.quote === undefined ? [] : [`«${entry.quote}»`]),
    ...(entry.origin.change === undefined ? [] : [entry.origin.change]),
    by,
    entry.created.slice(0, 10),
    ...waitsFor(entry, t),
  ].join(" · ");
}

/** What an entry waits or waited for: a reminder's day or change, and the paths it is about. */
function waitsFor(entry: MemoryEntry, t: Translate): string[] {
  return [
    ...(entry.due === undefined ? [] : [t(`desde ${entry.due}`, `from ${entry.due}`)]),
    ...(entry.onClose === undefined
      ? []
      : [t(`al cerrar ${entry.onClose}`, `when ${entry.onClose} closes`)]),
    ...(entry.paths === undefined ? [] : [`${t("en", "in")} ${entry.paths.join(", ")}`]),
  ];
}

/**
 * Under a change: its id and kind, who it waits for, who holds it or that it is orphaned, and the
 * messages waiting for its session.
 */
export function changeLine(change: StatusEntry, t: Translate): string {
  const waits = {
    agent: t("espera al agente", "waits for the agent"),
    human: t("espera tu decisión", "waits for your decision"),
    nobody: "—",
  }[change.waitingFor];
  return [`${change.id} · ${change.kind}`, waits, heldBy(change, t), ...messages(change, t)].join(
    " · ",
  );
}

/** How many messages wait for the change's session; nothing without any. */
function messages(change: StatusEntry, t: Translate): string[] {
  const count = change.messages ?? 0;
  if (count === 0) return [];
  return [
    count === 1
      ? t("1 mensaje espera", "1 message waiting")
      : t(`${count} mensajes esperan`, `${count} messages waiting`),
  ];
}

function heldBy(change: StatusEntry, t: Translate): string {
  const { holder } = change;
  if (holder === undefined)
    return change.orphan === true
      ? t("ninguna sesión lo lleva", "no session holds it")
      : t("sin sesión conocida", "no session seen");
  return t(
    `lo lleva ${holder.tool}, ${ago(holder.ago, t)}`,
    `held by ${holder.tool}, ${ago(holder.ago, t)}`,
  );
}

/** How long ago, from minutes: under a minute, minutes, hours up to two days, then days. */
export function ago(minutes: number, t: Translate): string {
  if (minutes < 1) return t("ahora mismo", "just now");
  const [count, unit] =
    minutes < 60
      ? [Math.floor(minutes), "min"]
      : minutes < 48 * 60
        ? [Math.floor(minutes / 60), "h"]
        : [Math.floor(minutes / (24 * 60)), "d"];
  return t(`hace ${count} ${unit}`, `${count} ${unit} ago`);
}
