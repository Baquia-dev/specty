// SPDX-License-Identifier: Apache-2.0
import type { Download } from "./export";

/**
 * Hands the file to the browser, which saves it as a download: the exports of History and of the
 * «Panel» (docs/ui.md, «Exportar»).
 */
export function save(download: Download): void {
  const url = URL.createObjectURL(new Blob([download.content], { type: download.type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = download.name;
  link.click();
  // The download starts from the link; the URL can go once it did.
  setTimeout(() => URL.revokeObjectURL(url));
}
