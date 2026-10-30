---
kind: standard
---

# specty check mide la cobertura de las líneas que cambian

## Objetivo

Con `policy.tests: contract`, los tests de cada criterio se escriben antes que el código y quedan bloqueados, pero nada dice si ejecutan el código que el cambio añade: un test puede pasar sin recorrer la mitad de lo nuevo. `specty check` gana el check `diff-coverage`: tras los tests del proyecto, lee el informe de cobertura que dejaron y dice qué parte de las líneas ejecutables que añade el cambio ejecutó algún test, con los tramos sin cubrir como `ruta:línea`.

Lo calcula Specty, sin diff-cover (una herramienta de Python), y vale para cualquier stack: lee los cuatro formatos que producen sus herramientas de cobertura. LCOV (Vitest, Jest, `flutter test --coverage`, cargo-llvm-cov, gcov), Cobertura (coverage.py, coverlet, PHPUnit), JaCoCo (Gradle y Maven) y el perfil de Go (`go test -coverprofile`).

## Fuera de alcance

- Mostrar la cobertura al aceptar el cambio y que este repositorio genere LCOV: van en el cambio siguiente.
- Ejecutar los tests con cobertura por su cuenta: Specty lee el informe que dejan los tests del proyecto.
- Rutas con `**` en `checks.coverage.reports`: solo `*` dentro de un tramo de la ruta.
- La cobertura de ramas: solo cuenta líneas.

## Supuestos

- A1: Las herramientas de cobertura escriben el informe al terminar los tests, así que su fecha de modificación es posterior al inicio de la ejecución de `specty check` que los lanzó.
  - impacto: alto
- A2: Un informe que nombra los archivos con otra raíz (absoluta, de otra carpeta, con el módulo de Go delante o relativa a la carpeta de fuentes de Java) se empareja bien con el archivo del repositorio por el final de su ruta, tomando la coincidencia más larga.
- A3: Una línea que el informe no nombra no es ejecutable (un comentario, una llave, un tipo) o el archivo no se instrumentó, y no cuenta ni como cubierta ni como sin cubrir.

## Criterios de aceptación

- AC1: CUANDO `specty check` ejecuta los tests del proyecto y estos dejan un informe de cobertura en una ruta de `checks.coverage.reports` ENTONCES el check `diff-coverage` sale en el informe con el porcentaje de líneas ejecutables añadidas que ejecutó algún test y, si no son todas, los tramos sin cubrir como `ruta:línea`.
- AC2: CUANDO el informe es LCOV, Cobertura, JaCoCo o un perfil de Go ENTONCES Specty lee qué líneas de cada archivo midió y si algún test las ejecutó, y empareja cada archivo con el del repositorio aunque el informe lo nombre con otra raíz.
- AC3: CUANDO el porcentaje queda por debajo de `checks.coverage.warn` (80 por defecto) ENTONCES `diff-coverage` es un aviso; por debajo de `checks.coverage.error`, si se configura, falla; y si llega a los dos, pasa.
- AC4: CUANDO los tests no corrieron en esa ejecución, como en `task done` con verificación propia, o ningún informe es posterior a su inicio, o el cambio no añade ninguna línea que mida un informe ENTONCES `diff-coverage` no sale en el informe.

## Diseño

- Core, puro:
  - `checks/coverage-reports.ts`: `parseCoverage(text, root)` reconoce el formato por su contenido y devuelve, por archivo, cada línea medida con si algún test la ejecutó.
    - LCOV: `SF:` y `DA:línea,veces`.
    - Cobertura: `<source>` y `<class filename>` con sus `<line number hits>`.
    - JaCoCo: `<package name>`, `<sourcefile name>` y `<line nr ci>`; cubierta si `ci` es mayor que 0.
    - Perfil de Go: cada bloque `archivo:l1.c1,l2.c2 sentencias veces` marca sus líneas; una línea está cubierta si algún bloque que la incluye corrió.
    - Las rutas absolutas dentro de `root` pasan a relativas.
  - `checks/coverage.ts`: `changedCoverage(reports, changed)` junta los informes (una línea cubierta en uno cuenta como cubierta) y, por cada archivo de la ejecución con sus líneas añadidas (todas si es nuevo o con `--all`), cuenta las líneas medidas y las cubiertas, y agrupa las no cubiertas en tramos seguidos.
    - Empareja por ruta igual o por el final de la ruta en un límite de tramo, en los dos sentidos, y se queda con la coincidencia más larga.
  - `schema/checks.ts`: `checks.coverage` con `reports` (rutas con `*`), `warn` (80) y `error` (opcional), porcentajes de 0 a 100.
    - Rutas por defecto: `coverage/lcov.info`, `*/coverage/lcov.info`, `*/*/coverage/lcov.info`, `lcov.info`, `coverage.xml`, `coverage/cobertura-coverage.xml`, `target/site/jacoco/jacoco.xml`, `build/reports/jacoco/test/jacocoTestReport.xml`, `*/build/reports/jacoco/test/jacocoTestReport.xml` y `coverage.out`.
- CLI:
  - `check/provider.ts`: `CheckContext.started`, la hora de inicio de la ejecución, y `CheckDefinition.after`: un check que lee lo que dejan los demás corre cuando han terminado.
  - `check/files.ts`: pone `started`.
  - `check/coverage.ts`: el check `diff-coverage` (`after`).
    - Expande las rutas de `checks.coverage.reports` (`*` dentro de un tramo, con `readdir`) y lee solo los informes modificados desde `started`.
    - Sin ninguno, o sin líneas medidas, `inapplicable`.
    - Con el porcentaje por debajo de `warn`, sus hallazgos son avisos; por debajo de `error`, fallos.
    - Primero va una línea con el porcentaje y el umbral, y después un hallazgo por tramo sin cubrir.
  - `check/common.ts`: lo añade a los checks comunes.

## Archivos

- crear packages/core/src/checks/coverage-reports.ts — los cuatro formatos de informe
- crear packages/core/src/checks/coverage.ts — la cobertura de las líneas que cambian
- modificar packages/core/src/schema/checks.ts — `checks.coverage`
- modificar packages/core/src/index.ts — exporta lo nuevo
- crear packages/core/test/checks/coverage.test.ts — AC2 y el cálculo de AC1
- crear packages/cli/src/check/coverage.ts — el check `diff-coverage`
- modificar packages/cli/src/check/provider.ts — `started` y `after`
- modificar packages/cli/src/check/files.ts — pone `started`
- modificar packages/cli/src/check/common.ts — añade el check
- crear packages/cli/test/check-coverage.test.ts — AC1, AC3 y AC4
- modificar docs/checks.md — el check nuevo
- modificar docs/checks.en.md — el check nuevo, en inglés
- modificar docs/formats.md — `checks.coverage` y el check en la lista
- modificar docs/ARCHITECTURE.md — el check en la lista de `specty check`

## Tareas

- [x] T1: El core lee los informes de cobertura y calcula la de las líneas que cambian
  - files: packages/core/test/checks/coverage.test.ts, packages/core/src/checks/coverage-reports.ts, packages/core/src/checks/coverage.ts, packages/core/src/schema/checks.ts, packages/core/src/index.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/coverage.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint && pnpm knip
- [x] T2: specty check mide la cobertura de las líneas que cambian
  - files: packages/cli/test/check-coverage.test.ts, packages/cli/src/check/coverage.ts, packages/cli/src/check/provider.ts, packages/cli/src/check/files.ts, packages/cli/src/check/common.ts
  - ac: AC1, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-coverage.test.ts test/check-commands.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint && pnpm knip
- [ ] T3: La documentación cuenta el check
  - files: docs/checks.md, docs/checks.en.md, docs/formats.md, docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Un informe viejo que alguien tocó durante la ejecución contaría como nuevo — solo se leen los modificados desde el inicio, y con `--verbose` se ve cuáles.
- R2: En un monorepo con varios informes, el mismo archivo puede salir en dos — una línea cubierta en cualquiera cuenta como cubierta.
