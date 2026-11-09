// SPDX-License-Identifier: Apache-2.0
import { appendFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}

/** Reads a UTF-8 file, or undefined when it does not exist. */
export async function readText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

/** Writes through a temporary file and a rename, so readers never see half a file. */
export async function writeText(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, text, "utf8");
  await replaceFile(temporary, path);
}

/**
 * The waits, in milliseconds, before each new try of a rename that Windows refuses, each twice the
 * last from 50 ms: it does while another handle has the file open for a moment, as the local
 * server reading a live verification or an antivirus looking at a new file.
 */
const RENAME_WAITS = [50, 100, 200, 400, 800] as const;

/** The codes Windows gives a rename while another handle has one of its files open. */
const BUSY_CODES: readonly unknown[] = ["EPERM", "EACCES", "EBUSY"];

/**
 * Renames `from` over `to`. On Windows, a rename refused with EPERM, EACCES or EBUSY is tried again
 * after each of `RENAME_WAITS`, and the last try's error is thrown; elsewhere those errors do not
 * pass, so they come at once, as any other.
 */
export async function replaceFile(
  from: string,
  to: string,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  for (const wait of platform === "win32" ? RENAME_WAITS : []) {
    try {
      return await rename(from, to);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && BUSY_CODES.includes(error.code))) {
        throw error;
      }
    }
    await new Promise((done) => setTimeout(done, wait));
  }
  await rename(from, to);
}

export async function appendLine(path: string, line: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${line}\n`, "utf8");
}

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

export async function move(from: string, to: string): Promise<void> {
  await mkdir(dirname(to), { recursive: true });
  await rename(from, to);
}

export async function remove(path: string): Promise<void> {
  await rm(path, { force: true, recursive: true });
}

/** Parses JSON text into `unknown`; malformed text yields undefined. */
export function parseJson(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    return undefined;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
