---
kind: standard
---

# Al proponer, Specty avisa de los archivos que usan lo que cambia la spec

## Objetivo

Tercer punto acordado. En el archivo de este repositorio, 12 de las 38 peticiones de alcance se podían prever con el grafo de imports: el índice que reexporta lo que se toca, o quien usa una función que cambia. Cada una costó una vuelta: parar la tarea, pedir el archivo y esperar la decisión.

Al proponer, Specty busca qué archivos del repositorio importan los que la spec modifica, borra o mueve y no están en ella, y los nombra en la salida. Así el agente decide, antes de aprobar, si los incluye.

No usa tree-sitter, porque no aportaría lo que falta. Specty ya lee los imports de ocho lenguajes con sus escáneres de capas; en TypeScript y JavaScript falta resolver cada import a su archivo, no leerlo. Además, sus gramáticas triplicarían el paquete de la CLI: hoy pesa 1,7 MB, y solo las de TS/JS suman unos 3,5 MB.

## Fuera de alcance

- Quien usa lo que cambia a través de un índice que lo reexporta: el aviso nombra el índice.
- Que el chequeo de capas lea TS/JS con este escáner en lugar de dependency-cruiser.
- Bloquear la propuesta: es solo un aviso.

## Supuestos

- A1: Los paquetes del workspace declaran su entrada en `exports` o `main` de su `package.json`, como los de este repositorio.
- A2: Leer y escanear los archivos del repositorio al proponer tarda poco; este tiene unos 800 archivos de TypeScript.

## Criterios de aceptación

- AC1: CUANDO `specty propose` recibe una spec que modifica, borra o mueve un archivo que importan otros archivos del repositorio que no están en ella ENTONCES la salida los nombra en «LO USAN FUERA DE LA SPEC»: una línea por archivo, con como mucho cinco de sus importadores y cuántos más.
- AC2: CUANDO el archivo es de TypeScript o JavaScript ENTONCES cuentan `import … from`, `import "…"`, `export … from`, `import()` y `require()`. Las rutas relativas se resuelven con su extensión o sin ella, con `.js` por `.ts` y con la carpeta por su `index`, y los paquetes del workspace por su `exports` o su `main`.
- AC3: CUANDO el archivo es de un lenguaje que ya leen los escáneres de capas (Dart, Python, Go, Rust, Java, Kotlin, PHP o C#) ENTONCES sus importadores cuentan igual.
- AC4: CUANDO todos sus importadores están en la spec, el archivo se crea o la propuesta es el cierre ENTONCES no se nombra, y sin nada que nombrar no hay bloque.

## Diseño

- Core, `checks/imports-script.ts`, puro: `scriptImports(path, text, project)`.
  - Busca con expresiones regulares las cinco formas de import.
  - `ScriptProject` trae los archivos del repositorio y los paquetes del workspace, cada uno con su nombre y sus entradas por subruta.
  - Un import relativo que no se resuelve no cuenta; uno de fuera del workspace es un paquete.
- Core, `cards/impact.ts`: título y línea, en español y en inglés.
- CLI:
  - `check/layer-scanners.ts`: `scannedImports` toma solo lo que usa del contexto (`session` y `read`).
  - `flow/impact.ts`:
    - las rutas de la spec que se modifican, se borran o se mueven (su origen);
    - los archivos del repositorio (`git.files()`), leídos una vez;
    - TS/JS con `scriptImports`, con los paquetes de los `package.json` del repositorio, y los demás lenguajes con `scannedImports`;
    - los importadores de cada ruta que no están en la spec.
  - `commands/propose.ts`: el bloque tras el de archivos compartidos, salvo en el cierre.
- ARCHITECTURE: el aviso de `propose`.

## Archivos

- crear packages/core/src/checks/imports-script.ts — el escáner de TypeScript y JavaScript
- modificar packages/core/src/index.ts — lo exporta
- crear packages/core/test/checks/imports-script.test.ts — AC2
- crear packages/core/src/cards/impact.ts — el título y la línea del aviso
- modificar packages/core/src/cards/index.ts — los exporta
- crear packages/cli/src/flow/impact.ts — los importadores de lo que cambia
- modificar packages/cli/src/check/layer-scanners.ts — `scannedImports` con lo que usa del contexto
- modificar packages/cli/src/commands/propose.ts — el bloque en la salida
- crear packages/cli/test/impact.test.ts — AC1, AC3 y AC4
- modificar docs/ARCHITECTURE.md — el aviso al proponer

## Tareas

- [ ] T1: El core lee los imports de TypeScript y JavaScript, y tiene los textos del aviso
  - files: packages/core/test/checks/imports-script.test.ts, packages/core/src/checks/imports-script.ts, packages/core/src/index.ts, packages/core/src/cards/impact.ts, packages/core/src/cards/index.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/imports-script.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint && pnpm knip
- [ ] T2: Al proponer, Specty nombra los archivos que usan lo que cambia la spec
  - files: packages/cli/test/impact.test.ts, packages/cli/src/flow/impact.ts, packages/cli/src/check/layer-scanners.ts, packages/cli/src/commands/propose.ts
  - ac: AC1, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/impact.test.ts test/propose.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint && pnpm knip
- [ ] T3: ARCHITECTURE cuenta el aviso
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: En un repositorio grande, leer todos los archivos retrasa `propose`. Mitigación: solo se leen los archivos de los lenguajes con escáner, una vez, y en este repositorio se mide el tiempo.
- R2: Un import que el escáner no entiende (alias de `tsconfig`, rutas generadas) deja fuera a un importador. Mitigación: es un aviso; si falta alguno, el guard sigue pidiendo la ampliación como hasta ahora.
