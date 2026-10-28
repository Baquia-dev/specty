---
kind: standard
follows:
  - 20261028-el-vocabulario-del-dominio-llega-con-las-tarjeta
---

# init crea el glosario con pistas y doctor avisa mientras solo las tenga

## Objetivo

Las tarjetas ya traen las definiciones del glosario del dominio, pero ningún proyecto lo tiene si nadie lo crea a mano. Con este cambio, `specty init` crea el glosario con las pistas de su formato, como hace con las secciones de AGENTS.md, y `specty doctor` avisa mientras siga sin ningún término. Es el AC15 de la épica «Tests como contrato y vocabulario del dominio», que quedó fuera del corte C5 por tamaño.

## Fuera de alcance

- Que el SIGUIENTE de `init` pida completar el glosario, como pide completar «Mapa» y «Convenciones».
- Que `uninstall` borre el glosario: es un archivo del proyecto, como PRODUCT.md.
- Un glosario para el propio repositorio de Specty.

## Supuestos

- A1: `init` crea el glosario en cualquier proyecto en el que falte el archivo, nuevo o existente, como hace con AGENTS.md. Si el archivo ya existe, no lo toca, aunque solo tenga las pistas.
  - impacto: alto
- A2: El glosario nuevo tiene un título y, dentro de un comentario HTML, el formato de una línea y un ejemplo, en el idioma del proyecto. Como el comentario no cuenta, no define ningún término y las tarjetas no cambian.
- A3: `doctor` avisa solo cuando el archivo existe y no define ningún término. Si no existe, no dice nada, porque el proyecto puede no querer glosario. El aviso no pone `doctor` en rojo, como el de las secciones de AGENTS.md.
- A4: La ruta es la de C5: la clave `glossary`, o por defecto `docs/dominio.md` en español y `docs/domain.md` en inglés.

## Criterios de aceptación

- AC1: CUANDO `specty init` prepara un proyecto, nuevo o existente, sin el archivo del glosario ENTONCES lo crea en su ruta con un título y las pistas del formato en un comentario, en el idioma del proyecto, dice que lo creó y lo incluye en el commit de `init`.
- AC2: CUANDO el glosario ya existe ENTONCES `init` no lo toca y no lo menciona, aunque solo tenga las pistas.
- AC3: CUANDO el glosario existe y no define ningún término ENTONCES `specty doctor` avisa, sin ponerse en rojo, de que el glosario no define ningún término y de cómo se escribe uno; y cuando define alguno, o no existe, no avisa.
- AC4: CUANDO se leen docs/formats.md y docs/ARCHITECTURE.md ENTONCES dicen que `init` crea el glosario con pistas y que `doctor` avisa mientras no define ningún término.
  - test: manual

## Diseño

- `glossaryTemplate(lang)` en `core/src/glossary.ts`, junto a `parseGlossary`: el título y las pistas, en los dos idiomas.
- `writeGlossary(root, path, lang, files)` en `install/project-files.ts`, junto a `writeAgentsMd`: escribe la plantilla con `InstallFiles` si el archivo no existe y dice si lo creó. `init` lo llama tras AGENTS.md, añade su línea (`glossaryLine` en `cards/init.ts`) y la ruta a lo que entra en su commit.
- `doctorWarnings` (`commands/doctor.ts`) lee el glosario y, si existe y `parseGlossary` no da ningún término, añade la línea `empty-glossary` (`cards/doctor.ts`).
- `init-commit.test.ts` fija la lista exacta de lo que entra en el commit de `init`. Ahora lleva también el glosario, porque eso es lo que pide AC1.

## Archivos

- modificar packages/core/src/glossary.ts — `glossaryTemplate`
- modificar packages/core/src/index.ts — exportarla
- modificar packages/core/src/cards/init.ts — la línea del glosario creado
- modificar packages/core/src/cards/doctor.ts — el aviso del glosario sin términos
- modificar packages/cli/src/install/project-files.ts — `writeGlossary`
- modificar packages/cli/src/commands/init.ts — escribirlo, decirlo e incluirlo en el commit
- modificar packages/cli/src/commands/doctor.ts — el aviso
- modificar packages/cli/test/init-commit.test.ts — el commit de `init` lleva también el glosario
- crear packages/cli/test/glossary-setup.test.ts — `init` y `doctor` de punta a punta
- modificar docs/formats.md — §6: `init` crea el glosario
- modificar docs/ARCHITECTURE.md — §14: lo que crea `init` y el aviso de `doctor`

## Tareas

- [x] T1: Los textos del glosario nuevo, de init y de doctor
  - files: packages/core/src/glossary.ts, packages/core/src/index.ts, packages/core/src/cards/init.ts, packages/core/src/cards/doctor.ts
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/glossary.test.ts test/cards
- [x] T2: init crea el glosario y doctor avisa mientras no define términos
  - files: packages/cli/src/install/project-files.ts, packages/cli/src/commands/init.ts, packages/cli/src/commands/doctor.ts, packages/cli/test/init-commit.test.ts, packages/cli/test/glossary-setup.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/glossary-setup.test.ts test/init-commit.test.ts test/init-reversible.test.ts test/doctor-enter.test.ts
  - notes: documenta en docs/formats.md §6 y ARCHITECTURE §14.

## Riesgos

- R1: Volver a ejecutar `init` en un repositorio existente le añade un archivo nuevo en `docs/`. Mitigación: solo si falta, entra en el commit de `init` con su recibo y `init` lo dice.
