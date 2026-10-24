---
kind: standard
---

# El límite de archivos cuenta solo código y expande los globs

## Objetivo

El límite de archivos de una spec (15 en standard, 3 en quick) cuenta solo los archivos de código gobernado, y un glob cuenta sus coincidencias actuales más una, como ya dice formats.md. Hoy cuenta cada entrada de Archivos: los tests y la documentación obligan a dividir cambios cuyo código cabe, y un glob cuenta como un archivo aunque abarque veinte.

## Fuera de alcance

- Cambiar los valores de los límites: siguen en 15 y 3.
- Que la persona apruebe por encima de los límites de división (punto 33 b): irá en otro cambio si lo pide.
- Buscar rutas sensibles entre las coincidencias de un glob: siguen comprobándose sobre el patrón.
- Mostrar en la UI la cuenta de archivos de código: la UI calcula el tamaño sin datos del repositorio y sigue igual.

## Supuestos

- A1: Las coincidencias de un glob son los archivos que git sigue más los no ignorados sin seguir, en la carpeta del cambio cuando se ejecutan `propose` o `approve`; un glob de archivos que aún no existen cuenta solo su «más una».
  - impacto: medio
- A2: El «más una» de un glob cuenta en el límite solo si el propio patrón es código gobernado que no es test (`src/**` sí, `test/**` o `docs/**` no), con las mismas reglas que una ruta.
- A3: Una ruta que aparece explícita y también dentro de un glob cuenta una vez, con la acción de su primera aparición.
- A4: Los manifiestos (`package.json`, `pubspec.yaml`…) cuentan como código en el límite, porque son gobernados y no son tests; ya pesan aparte como dependencias en la puntuación.
- A5: La razón «N archivos» del tamaño, que ven la salida de `propose` y la UI, sigue contando todos los archivos (con los globs expandidos), porque todos pesan en la puntuación; solo el mensaje del límite dice «archivos de código».

## Criterios de aceptación

- AC1: CUANDO una spec standard declara 15 archivos de código y además sus tests y documentación ENTONCES `propose` la acepta, y CUANDO declara 16 archivos de código ENTONCES la rechaza con «16 archivos de código, máximo 15».
- AC2: CUANDO Archivos tiene un glob con N coincidencias en el repositorio ENTONCES el tamaño lo cuenta como N + 1 archivos en la puntuación y, si son código, en el límite; un glob sin coincidencias cuenta 1.
- AC3: CUANDO una spec quick declara 3 archivos de código con sus tests y un documento ENTONCES es válida, y CUANDO declara 4 archivos de código, o un glob que los alcanza ENTONCES `propose` responde «4 archivos de código, máximo 3».
- AC4: CUANDO un cambio está cerca del límite de archivos ENTONCES el aviso de «cerca del umbral de división» también cuenta solo archivos de código.
- AC5: CUANDO alguien lee ARCHITECTURE §11 y formats.md ENTONCES encuentra qué cuenta en el límite de archivos y cómo cuenta un glob.

## Diseño

- `sizing/size.ts`: `RepoSignals.globMatches` (patrón → rutas del repositorio que coinciden). `collectSignals` expande cada entrada en unidades (la ruta, o las coincidencias del glob más el propio patrón), sin repetir rutas, y de ellas salen los archivos por acción, `fileCount` y un nuevo `codeFiles` (gobernados y no tests).
- `validate/limits.ts`: la métrica `files` del límite y del aviso usa `codeFiles`, y el texto dice «archivos de código».
- `validate/structure.ts`: el carril quick cuenta `codeFiles` con los mismos datos del repositorio.
- CLI: `Git.files()` lista lo seguido y lo no ignorado sin seguir (`git ls-files --cached --others --exclude-standard`), y `analyzeChange` calcula `globMatches` solo si la spec tiene globs. Core sigue sin IO.

## Archivos

- modificar packages/core/src/sizing/size.ts — globs expandidos y la cuenta de archivos de código
- modificar packages/core/src/validate/limits.ts — el límite y el aviso cuentan archivos de código
- modificar packages/core/src/validate/structure.ts — el carril quick cuenta archivos de código
- modificar packages/core/test/sizing/sizing.test.ts — unidades, globs y archivos de código
- modificar packages/core/test/validate/quality.test.ts — límite de división con tests y documentación
- modificar packages/core/test/validate/structure.test.ts — límite de quick con tests, documentación y globs
- modificar packages/cli/src/io/git.ts — listar los archivos del repositorio
- modificar packages/cli/src/flow/analysis.ts — las coincidencias de los globs de la spec
- crear packages/cli/test/sizing.test.ts — `propose` con globs en un repositorio real
- modificar docs/ARCHITECTURE.md — §11: qué cuenta en el límite de archivos
- modificar docs/formats.md — §1 y §6: el límite cuenta código y cómo cuenta un glob

## Tareas

- [x] T1: El tamaño expande los globs y el límite cuenta solo código
  - files: packages/core/src/sizing/size.ts, packages/core/src/validate/limits.ts, packages/core/test/sizing/sizing.test.ts, packages/core/test/validate/quality.test.ts
  - ac: AC1, AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/sizing test/validate
- [ ] T2: El carril quick cuenta solo código
  - files: packages/core/src/validate/structure.ts, packages/core/test/validate/structure.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/validate
- [ ] T3: La CLI pasa las coincidencias de los globs
  - files: packages/cli/src/io/git.ts, packages/cli/src/flow/analysis.ts, packages/cli/test/sizing.test.ts
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/sizing.test.ts
- [ ] T4: Documentar el límite de archivos
  - files: docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC5
  - verify: pnpm check
  - type: docs

## Riesgos

- R1: Un glob amplio (`src/**`) en un repositorio grande puede disparar el tamaño y obligar a dividir lo que antes pasaba. Mitigación: es lo que formats.md ya promete; el mensaje dice cuántos archivos de código cuenta, y la spec puede listar rutas explícitas.
