---
kind: standard
follows:
  - 20261026-las-capas-en-python-go-y-rust
---

# Las capas en Java, Kotlin y PHP

## Objetivo

La verificación `layers` vigila también los imports de Java, Kotlin y PHP, con escáneres propios del core y sin herramientas, como ya hace en Dart, Python, Go y Rust. Es la segunda parte del quinto corte del plan para los stacks más populares.

## Fuera de alcance

- C#, en la tercera parte.
- Los nombres totalmente cualificados escritos en el código sin `import` o `use`, y los imports que se resuelven por reflexión.
- La autocarga de PHP que no sea PSR-4 (`classmap`, `files`).

## Supuestos

- A1: En Java y Kotlin cuentan `import a.b.C` (con o sin `;` y alias, también `import static` y el comodín `a.b.*`). Los paquetes del proyecto salen de las carpetas que tienen archivos `.java` o `.kt`: un import es del proyecto cuando sus primeros nombres, al menos dos, terminan la ruta de una de esas carpetas, y su destino es un archivo de esa carpeta. Si no, es el paquete con su nombre completo (`org.springframework.web.bind.annotation.RestController`), que los globs de `forbiddenPackages` cubren con `org.springframework.*`.
  - impacto: alto
- A2: En PHP cuentan los `use` de nivel superior, antes de la primera clase, interfaz, trait o enum (los de dentro son traits), también `use function`, `use const` y los grupos `use A\{B, C}`, por su prefijo común. Un nombre es del proyecto cuando un prefijo de `autoload.psr-4` o `autoload-dev.psr-4` de `composer.json` lo cubre, y su destino es el archivo que da PSR-4. Si no, es el paquete con sus `\` como `/` (`Illuminate/Support/Facades/DB`), para que los globs funcionen igual (`Illuminate/**`).
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO un archivo de Java, Kotlin o PHP de una capa importa otra capa que no está en su `may`, o un paquete de sus `forbiddenPackages` ENTONCES `layers` falla con su ruta y la línea del import.
- AC2: CUANDO el import va a la misma capa, a un archivo sin capa, a un paquete permitido, a uno de la biblioteca estándar (`java.util.List`) o ya estaba ENTONCES no falla; un `use` de trait dentro de una clase no es un import.
- AC3: CUANDO se leen las guías ENTONCES `layers` dice cómo se leen los imports de Java, Kotlin y PHP y cómo se nombran sus paquetes.

## Archivos

- crear packages/core/src/checks/imports-jvm.ts — el escáner de Java y Kotlin y el índice de sus paquetes
- crear packages/core/src/checks/imports-php.ts — el escáner de PHP con PSR-4
- modificar packages/core/src/index.ts — exportarlos
- modificar packages/core/test/checks/imports.test.ts — sus casos
- modificar packages/cli/src/check/layer-scanners.ts — sus escáneres, con el índice de paquetes y el PSR-4 de composer
- modificar packages/cli/src/check/layers.ts — Java, Kotlin y PHP entre los lenguajes de la verificación
- modificar packages/cli/test/check-layers-scanned.test.ts — la verificación en Java y PHP
- modificar docs/checks.md — `layers` en estos lenguajes
- modificar docs/checks.en.md — lo mismo, en inglés
- modificar docs/formats.md — sus escáneres

## Tareas

- [x] T1: Los escáneres de Java, Kotlin y PHP en el core
  - files: packages/core/src/checks/imports-jvm.ts, packages/core/src/checks/imports-php.ts, packages/core/src/index.ts, packages/core/test/checks/imports.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/imports.test.ts
- [x] T2: La verificación con sus escáneres
  - files: packages/cli/src/check/layer-scanners.ts, packages/cli/src/check/layers.ts, packages/cli/test/check-layers-scanned.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-layers-scanned.test.ts test/check-layers.test.ts test/check-layers-dart.test.ts
- [x] T3: Las capas en las guías y en formats
  - files: docs/checks.md, docs/checks.en.md, docs/formats.md
  - ac: AC3
  - verify: pnpm check
  - type: docs

## Cierre

### Resumen

`layers` vigila Java, Kotlin y PHP con escáneres propios del core.
- Java y Kotlin: un índice de las carpetas que tienen archivos `.java` o `.kt` decide qué import es del proyecto. Cuentan los `import static`, los comodines y los alias.
- PHP: el PSR-4 de `composer.json` (`autoload` y `autoload-dev`) decide qué `use` es del proyecto. Cuentan solo los de antes de la primera clase, con `function`, `const` y grupos.

Los paquetes externos se llaman por su nombre completo: en Java y Kotlin con puntos, y en PHP con `/` en lugar de `\`. Las guías y `formats.md` lo explican.

### Desviaciones

- Las dos expresiones regulares de la primera versión fallaban:
  - en JVM, el comodín perdía el `*`;
  - en PHP, el grupo `use A\{…}` no casaba.

  Los tests las cazaron y se corrigieron antes de completar T1.

### Decisiones

- Un import de JVM es del proyecto solo si coinciden al menos dos nombres. Así `java.util.List` no se confunde con la carpeta `src/main/java`.
- En PHP gana el prefijo PSR-4 más largo, como en el autoloader de Composer. Si un prefijo lista varias carpetas, cuenta la primera.
- El nombre de un paquete PHP usa `/`, para que los globs de `forbiddenPackages` funcionen igual que en los demás lenguajes.

### Pendientes

- S5c: C#, por un índice de namespaces.
