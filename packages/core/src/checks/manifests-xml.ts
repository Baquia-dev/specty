// SPDX-License-Identifier: Apache-2.0
import type { Declared } from "./dependencies";
import { lineAt } from "./manifests-text";

/**
 * Readers of the XML manifests, by their elements: Maven's `pom.xml` and MSBuild's project files
 * and `Directory.Packages.props`. A comment declares nothing; it is blanked out first, keeping
 * every line where it was.
 */

const COMMENT = /<!--[\s\S]*?-->/g;
// What declares no dependency of the project: managed versions, plugins' own and reports'.
const NOT_DEPENDENCIES =
  /<dependencyManagement>[\s\S]*?<\/dependencyManagement>|<build>[\s\S]*?<\/build>|<reporting>[\s\S]*?<\/reporting>/g;

/** Each `<dependency>` of `pom.xml`, as `groupId:artifactId`, on the line of its artifactId. */
export function pom(text: string): Declared[] {
  const visible = blank(blank(text, COMMENT), NOT_DEPENDENCIES);
  return [...visible.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)].flatMap((match) => {
    const body = match[1] ?? "";
    const group = /<groupId>\s*([^<\s]+)\s*<\/groupId>/.exec(body)?.[1];
    const artifact = /<artifactId>\s*([^<\s]+)\s*<\/artifactId>/.exec(body);
    if (group === undefined || artifact?.[1] === undefined) return [];
    const at = match.index + "<dependency>".length + artifact.index;
    return [{ name: `${group}:${artifact[1]}`, line: lineAt(visible, at) }];
  });
}

/** Each `<PackageReference Include="…">` of a `.csproj`, `.fsproj` or `.vbproj`. */
export function msbuildProject(text: string): Declared[] {
  return included(text, /<PackageReference\b[^>]*?\bInclude\s*=\s*"([^"]+)"/g);
}

/** The packages `Directory.Packages.props` makes available to every project. */
export function packagesProps(text: string): Declared[] {
  return included(
    text,
    /<(?:PackageVersion|GlobalPackageReference)\b[^>]*?\bInclude\s*=\s*"([^"]+)"/g,
  );
}

function included(text: string, element: RegExp): Declared[] {
  const visible = blank(text, COMMENT);
  return [...visible.matchAll(element)].flatMap((match) =>
    match[1] === undefined ? [] : [{ name: match[1], line: lineAt(visible, match.index) }],
  );
}

/** `text` with what `pattern` matches turned into spaces, its line breaks kept. */
function blank(text: string, pattern: RegExp): string {
  return text.replace(pattern, (found) => found.replace(/[^\n]/g, " "));
}
