---
kind: standard
---

# specty check avisa de las vulnerabilidades que traen las dependencias del cambio

## Objetivo

El check `dependencies` dice si una dependencia nueva está permitida por la spec, pero no si la versión que entra tiene una vulnerabilidad conocida. `specty check` gana el check `vulnerabilities`: cuando la ejecución toca un lockfile, se lo pasa a OSV-Scanner y falla con cada vulnerabilidad que trae un paquete que el cambio añade o cuya versión cambia. Las que el lockfile ya tenía al empezar no cuentan, porque no son del cambio; con `--all`, el modo de la CI, cuentan todas.

Sigue el mismo patrón que `secrets` (ADR 0012): una herramienta externa, opcional, que trabaja sobre una copia de los archivos tal como los ve el modo, con su propia configuración. Sin OSV-Scanner en el PATH, el check no corre y dice qué instalar.

## Fuera de alcance

- El modo sin red de OSV-Scanner (`--offline-vulnerabilities` con bases descargadas): el check consulta osv.dev, y quien no quiera que salgan los nombres y versiones de sus paquetes lo apaga con `checks.levels`.
- Los manifiestos que OSV-Scanner solo entiende resolviendo dependencias por red (`pom.xml`, `build.gradle`) y los archivos que generan los builds (`package_config.json`, `*.deps.json`): solo lockfiles, más `go.mod` y `requirements.txt`, que ya fijan versiones.
- La línea del paquete dentro del lockfile: el hallazgo nombra el lockfile, el paquete, la versión y la vulnerabilidad.
- Arreglar las vulnerabilidades (`osv-scanner fix`) e instalar OSV-Scanner desde `specty check --install` o `doctor`.
- El adaptador de Opengrep y la prueba de mutation testing, que la misma petición pide: van en cambios propios, después de este.

## Supuestos

- A1: OSV-Scanner 2 acepta `scan source --format json --output-file <informe> --allow-no-lockfiles -L <ruta>…`, reconoce cada lockfile por su nombre, escribe un JSON con `results[].source.path` y `results[].packages[]` (cada uno con `package.name`, `package.version`, `package.ecosystem` y `groups[].ids` y `groups[].max_severity`), y sale con 0 sin vulnerabilidades, con 1 con alguna y con 127 si tiene un error general. Está verificado en el código fuente de la v2.7.0, no con el binario.
  - impacto: alto
- A2: OSV-Scanner aplica el `osv-scanner.toml` que hay en la carpeta de cada lockfile (sus `IgnoredVulns`), así que copiarlo junto al lockfile basta para respetar la configuración del proyecto.
- A3: Una vulnerabilidad es del cambio si el lockfile de después la tiene para un paquete y una versión que el de antes no tenía con esa misma vulnerabilidad; un paquete que no cambió de versión no se reporta aunque se publique hoy una vulnerabilidad suya.

## Criterios de aceptación

- AC1: CUANDO la ejecución toca un lockfile que OSV-Scanner lee (como `pnpm-lock.yaml`, `Cargo.lock` o `go.mod`) y un paquete que el cambio añade o cuya versión cambia tiene una vulnerabilidad conocida ENTONCES `specty check` falla en el check `vulnerabilities` con un hallazgo en ese lockfile que nombra el paquete, su versión, el id de la vulnerabilidad y su gravedad si OSV la da; las vulnerabilidades que el lockfile ya tenía al empezar no salen.
- AC2: CUANDO se ejecuta con `--all` ENTONCES `vulnerabilities` nombra todas las vulnerabilidades conocidas de los lockfiles que git sigue.
- AC3: CUANDO OSV-Scanner corre ENTONCES lo hace sobre una copia de los lockfiles tal como los ve el modo (con `--staged`, lo preparado), fuera del repositorio, y junto a cada uno el `osv-scanner.toml` de su carpeta, de modo que una vulnerabilidad que ese archivo ignora no sale.
- AC4: CUANDO la ejecución no toca ningún lockfile ENTONCES `vulnerabilities` no sale en el informe.
- AC5: CUANDO OSV-Scanner no está en el PATH ENTONCES `vulnerabilities` sale como no ejecutado y el motivo dice que se instale; CUANDO OSV-Scanner falla ENTONCES sale como no ejecutado con su último mensaje como motivo.

## Diseño

- `packages/cli/src/check/vulnerabilities.ts`: el check `vulnerabilities`.
  - Los lockfiles, por nombre en cualquier carpeta: `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `pubspec.lock`, `poetry.lock`, `uv.lock`, `pdm.lock`, `Pipfile.lock`, `pylock.toml`, `requirements.txt`, `go.mod`, `Cargo.lock`, `Gemfile.lock`, `gems.locked`, `composer.lock`, `mix.lock`, `packages.lock.json`, `packages.config`, `gradle.lockfile`, `buildscript-gradle.lockfile`, `conan.lock`, `renv.lock`, `cabal.project.freeze` y `stack.yaml.lock`, más `gradle/verification-metadata.xml`. Sin ninguno entre los archivos de la ejecución, `inapplicable`.
  - En una carpeta temporal, `after/` con el texto de cada lockfile según `context.read` y `before/` con el de `context.before`, cuando lo hay; en las dos, el `osv-scanner.toml` de la carpeta de cada lockfile, leído del disco.
  - Ejecuta `osv-scanner scan source --format json --output-file <informe> --allow-no-lockfiles -L <ruta>…` en cada carpeta, con el entorno de la sesión y el límite `verify.timeoutSec`; `before/` solo si tiene algún lockfile.
  - Con 0 o 1 lee el informe. Con 127 pregunta `osv-scanner --version`: si tampoco arranca, no está instalado y el check no corre con el aviso de instalarlo; si arranca, el error es de OSV-Scanner y el check no corre con su último mensaje. Con cualquier otro código, lo mismo que este último.
  - Del informe saca, por paquete y grupo, la clave `lockfile|ecosistema|nombre|versión|id` (el primer id del grupo) y la gravedad (`max_severity`). Los hallazgos son las claves de después que no están en las de antes, en el orden del informe y sin repetir; el mensaje es `<paquete> <versión>: <id>`, con `(gravedad <n>)` si la hay.
- `packages/cli/src/check/common.ts`: añade `vulnerabilities` a los checks comunes, después de `secrets`.
- Tests: un OSV-Scanner falso, como los escáneres falsos del test de `secrets`, que lee líneas `nombre@versión` de cada lockfile, conoce una tabla fija de vulnerabilidades, respeta los ids que nombre el `osv-scanner.toml` de al lado y registra cómo se le llamó.
- Los ejemplos por stack apagan `vulnerabilities` (el de Go cambia `go.mod`), para que un OSV-Scanner instalado no consulte la red en los tests; y el test de las guías lo cuenta entre los checks que su ejemplo no muestra, como `secrets`.

## Archivos

- crear packages/cli/src/check/vulnerabilities.ts — el check `vulnerabilities` con OSV-Scanner
- modificar packages/cli/src/check/common.ts — añade el check a los comunes
- crear packages/cli/test/check-vulnerabilities.test.ts — AC1 a AC5 con un OSV-Scanner falso
- modificar packages/cli/test/stack-dialect.ts — los ejemplos por stack apagan `vulnerabilities`
- modificar packages/cli/test/check-docs.test.ts — añade `vulnerabilities` a los checks que su ejemplo no muestra
- modificar docs/checks.md — el check nuevo
- modificar docs/checks.en.md — el check nuevo, en inglés
- modificar docs/formats.md — el check en la lista de §6
- modificar docs/ARCHITECTURE.md — el check en la lista de `specty check`

## Tareas

- [ ] T1: specty check avisa de las vulnerabilidades con OSV-Scanner
  - files: packages/cli/test/check-vulnerabilities.test.ts, packages/cli/src/check/vulnerabilities.ts, packages/cli/src/check/common.ts
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-vulnerabilities.test.ts test/check-secrets.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint && pnpm knip
- [ ] T2: Los ejemplos por stack y el test de las guías cuentan con vulnerabilities
  - files: packages/cli/test/stack-dialect.ts, packages/cli/test/check-docs.test.ts
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-docs.test.ts test/check-examples-native.test.ts && pnpm lint
  - type: test
- [ ] T3: La documentación cuenta el check
  - files: docs/checks.md, docs/checks.en.md, docs/formats.md, docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: osv.dev lento o caído haría esperar a cada `task done` que toque un lockfile — el límite es `verify.timeoutSec`, y al agotarse el check sale como no ejecutado, sin bloquear.
- R2: Una vulnerabilidad sin versión arreglada bloquearía el cambio que la trae — se ignora con `IgnoredVulns` en `osv-scanner.toml`, que el check respeta, o se baja el check a `warn`.
- R3: Los tests que ya tocan un lockfile y comprueban el resumen exacto de `specty check` verían un check más, como no ejecutado — se corre la suite completa del CLI antes de aceptar.
