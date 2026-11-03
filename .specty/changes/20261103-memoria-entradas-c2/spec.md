---
kind: standard
epic: 20261030-memoria-de-specty
slice: C2
---

# Las entradas de la memoria se anotan y se listan desde cualquier carpeta

## Objetivo

Hoy lo que un agente deja pendiente vive en el chat o en su memoria privada, y se pierde con `/clear` o con otra sesión. Con este corte nace la memoria duradera de Specty: `specty memory add` anota pendientes, mejoras, recordatorios y decisiones en la rama propia `specty-memory`, y `specty memory` los lista al instante desde cualquier carpeta del clon. Un recordatorio se marca hecho con `specty memory done`, y una decisión siempre lleva la cita literal de la persona.

## Fuera de alcance

- Mostrar las entradas al empezar cada sesión: la tarjeta de inicio y la de `next` sin cambio, los recordatorios en «TE TOCA» de `status` y la línea del bloque de flujo de AGENTS.md. Van en el cambio que sigue a este y completa el corte (AC4 de la épica). Una sesión ligada a la épica solo entra en sus cortes, así que el corte va primero.
- Tomar una entrada con `new --resolves`, cosechar los «Pendientes» del cierre y descartar con `memory drop`: C3. El guard que impide a los agentes escribir la rama con git también va en C3, porque es allí donde descartar pasa a ser solo de la persona.
- Avisar al anotar de una entrada parecida: C4, que trae la comparación de textos (A6 de la épica).
- Editar, reordenar o borrar entradas, y subir la rama al remoto.

## Supuestos

- A1: Specty escribe la rama solo con la fontanería de git: `hash-object`, `mktree`, `commit-tree` y `update-ref` con el valor anterior. Ese `update-ref` es atómico: falla si otra sesión escribió antes, y Specty relee la rama y lo intenta de nuevo, hasta 10 veces. Por eso no hace falta el lock que preveía la épica: nada se pierde sin él.
  - impacto: alto
- A2: El siguiente id de un prefijo es el mayor de los archivos `entries/` de la rama más uno. `P` es para pendientes, mejoras y recordatorios, y `D` para decisiones. Ninguna entrada se borra, así que un id nunca se reutiliza.
- A3: El origen de una entrada es el cambio abierto de la carpeta desde la que se anota, si lo hay, y quién la anota: el agente que Specty detecta, `agent` si no lo reconoce, o `person` desde la terminal de la persona.
- A4: Specty solo escribe entradas válidas. Una que no se puede leer, como una editada a mano, no se lista, pero su id sigue contando.
- A5: El `README.md` de la rama se regenera en cada escritura, en el idioma de `config.yaml`. Las entradas no se traducen.
- A6: `commit-tree` no ejecuta los hooks de git, así que los commits de la memoria no necesitan recibo.
- A7: Leer las entradas de golpe con `git cat-file --batch` exige contar bytes. Hoy `execute` decodifica cada trozo de la salida por separado y puede romper un carácter de varios bytes partido entre dos trozos. Este cambio lo corrige para toda la salida.

## Criterios de aceptación

- AC1: CUANDO un agente o la persona ejecuta `specty memory add "<texto>"` en una carpeta del clon ENTONCES la entrada queda en la rama `specty-memory` como `entries/<id>.md`. Lleva un id nuevo (`P1`, `P2`…), su tipo (`pending` por defecto, o `improvement`, `reminder` o `decision` con `--kind`), su origen (el cambio abierto de esa carpeta, si lo hay, y quién la anota) y la fecha. Ninguna carpeta del clon cambia sus archivos ni su rama.
- AC2: CUANDO se anota una entrada en una carpeta ENTONCES `specty memory`, ejecutado en otra carpeta del clon, la lista en ese momento por fecha, con su id, su tipo, su texto y su origen, y `--json` trae las entradas en `entries`. Las hechas solo salen con `--all`.
- AC3: CUANDO se anota una decisión (`--kind decision`) ENTONCES su id empieza por `D` y lleva la cita literal de la persona de `--quote`. Sin `--quote`, Specty no anota nada y dice cómo dar la cita.
- AC4: CUANDO alguien ejecuta `specty memory done <id>` sobre un recordatorio abierto ENTONCES el recordatorio queda hecho, con quién y cuándo, y `specty memory` deja de listarlo. Sobre un pendiente, una mejora o una decisión, o sobre un id que no existe, no cambia nada y dice por qué.
- AC5: CUANDO varias sesiones anotan entradas a la vez ENTONCES todas quedan en la rama, cada una con un id distinto.
- AC6: CUANDO una operación cambia la rama ENTONCES es un commit de Specty en `specty-memory` con `Specty-Memory: <id>` y, si los hay, `Specty-Change` y `Specty-Agent`. Su `README.md` es el índice de las entradas abiertas por tipo, en el idioma del proyecto.
- AC7: CUANDO `config.yaml` da `memory.branch` ENTONCES la memoria vive en esa rama. Tiene que ser un nombre de rama válido fuera de `specty/`, y sin él vale `specty-memory`.
- AC8: CUANDO un comando escribe un carácter de varios bytes partido entre dos trozos de su salida ENTONCES Specty lo lee entero.

## Diseño

- Core:
  - `memory/entries.ts`: el modelo `MemoryEntry`.
    - Campos: `id`, `kind`, `status` y `created`; `origin` con `change?` y `by`; `quote?`; `closed?` con `at` y `by`.
    - `status` admite los estados de la épica: `open`, `taken`, `done`, `drop-proposed` y `dropped`. Este corte solo escribe `open` y `done`, así C3 no cambia el formato.
    - `parseEntry` y `serializeEntry` pasan del markdown con frontmatter YAML al modelo y vuelven: el cuerpo es el texto, y el esquema de zod exige `quote` en una decisión.
    - `nextEntryId` da el siguiente id por prefijo, y `parseEntryId` acepta `p3` o `P3`.
  - `cards/memory.ts`: las tarjetas en español e inglés.
    - La lista, con `entries` como dato para `--json`.
    - Las de anotada y hecha, y las negativas: texto vacío, decisión sin cita, id desconocido y hecho que no es un recordatorio.
    - El `README.md` de la rama y el asunto de cada commit (`memoria: anota P3`, `memory: add P3`).
  - `schema/memory.ts`: `memory.branch`, con `isBranchName` (que `branches.ts` pasa a exportar) y sin el prefijo `specty/`.
- CLI:
  - `store/memory.ts`:
    - `readMemory` lee la punta de la rama con `rev-parse`, sus archivos con `ls-tree -r -z` y todos los blobs con un solo `cat-file --batch`, cortado por tamaños en bytes.
    - `writeMemory(git, branch, change)` aplica un cambio sobre lo leído y reintenta si `update-ref <ref> <nueva> <anterior>` falla: la anterior es vacía si la rama aún no existe.
      - Cada intento escribe el blob de la entrada y el del README con `hash-object -w --stdin`, el árbol de `entries/` y el raíz con `mktree`, y el commit con `commit-tree`, hijo de la punta anterior.
  - `commands/memory.ts`: `memory [--all]`, `memory add <texto> [--kind] [--quote]` y `memory done <id>`, y su registro `memoryCommand`, que `program.ts` llama.
  - `io/exec.ts`: la salida se decodifica con `setEncoding("utf8")`, que no parte caracteres.
- Documentación:
  - `docs/formats.md`:
    - §1: la rama y sus archivos, con el formato de una entrada.
    - §6: `memory.branch`.
    - §7: los commits de la memoria.
  - `docs/dominio.md`: «Memoria de Specty» y «Entrada de la memoria».
  - `docs/ARCHITECTURE.md` §6: el comando `memory`.

## Archivos

- crear packages/core/src/memory/entries.ts — el modelo de una entrada, sus ids y su markdown
- crear packages/core/src/cards/memory.ts — tarjetas de `memory`, el README de la rama y el asunto de sus commits
- modificar packages/core/src/index.ts — exportar el modelo de las entradas
- modificar packages/core/src/cards/index.ts — exportar las tarjetas de la memoria
- crear packages/core/test/memory/entries.test.ts — el markdown de ida y vuelta, los ids, el README y las tarjetas
- modificar packages/core/src/schema/memory.ts — `memory.branch`
- modificar packages/core/src/branches.ts — exportar `isBranchName`
- modificar packages/core/test/schema/memory.test.ts — `memory.branch` por defecto, dado e inválido
- modificar packages/cli/src/io/exec.ts — decodificar la salida sin partir caracteres
- modificar packages/cli/test/exec.test.ts — un carácter partido entre dos trozos
- crear packages/cli/src/store/memory.ts — leer y escribir la rama con la fontanería de git
- crear packages/cli/src/commands/memory.ts — `memory`, `memory add` y `memory done`
- modificar packages/cli/src/program.ts — registrar `memory`
- crear packages/cli/test/memory.test.ts — los comandos de punta a punta, en dos carpetas y a la vez
- modificar docs/formats.md — la rama, las entradas, `memory.branch` y sus commits
- modificar docs/dominio.md — «Memoria de Specty» y «Entrada de la memoria»
- modificar docs/ARCHITECTURE.md — el comando `memory` en §6

## Tareas

- [x] T1: El modelo de una entrada y sus tarjetas, en core
  - files: packages/core/src/memory/entries.ts, packages/core/src/cards/memory.ts, packages/core/src/index.ts, packages/core/src/cards/index.ts, packages/core/test/memory/entries.test.ts
  - ac: AC1, AC3, AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/memory/entries.test.ts
- [ ] T2: La rama de la memoria en la configuración
  - files: packages/core/src/schema/memory.ts, packages/core/src/branches.ts, packages/core/test/schema/memory.test.ts, docs/formats.md
  - ac: AC7
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/schema/memory.test.ts
- [ ] T3: La salida de un comando sin caracteres partidos
  - files: packages/cli/src/io/exec.ts, packages/cli/test/exec.test.ts
  - ac: AC8
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/exec.test.ts
- [ ] T4: Anotar y listar entradas en la rama desde cualquier carpeta
  - files: packages/cli/src/store/memory.ts, packages/cli/src/commands/memory.ts, packages/cli/src/program.ts, packages/cli/test/memory.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/memory.test.ts -t "AC1|AC2|AC5|AC6|AC7"
- [ ] T5: Decisiones con su cita y recordatorios hechos
  - files: packages/cli/src/store/memory.ts, packages/cli/src/commands/memory.ts, packages/cli/test/memory.test.ts, docs/dominio.md
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/memory.test.ts

## Riesgos

- R1: Dos sesiones escriben la rama a la vez — `update-ref` con el valor anterior hace perder a una, que relee y reintenta. AC5 lo prueba con cuatro escrituras simultáneas.
- R2: Leer muchas entradas cuesta un proceso por entrada — se leen todas con un solo `cat-file --batch`, así que listar cuesta tres procesos de git, haya las que haya.
- R3: La rama no tiene historia común con el código, y alguien podría sacarla a una carpeta o fusionarla — Specty nunca la saca a una carpeta, y su nombre queda fuera de `specty/`, donde `status` y `prune` buscan cambios.
