---
kind: standard
---

# Init completa la verificación que falta

## Objetivo

En un repositorio vacío, `init` deja `.specty/config.yaml` sin `verify`, porque no hay nada que detectar. Cuando el primer cambio crea el proyecto (por ejemplo, un manifiesto con su comando de tests), nada lo vuelve a detectar: `init` no toca un `config.yaml` que ya existe, y el agente no puede editarlo porque el guard lo protege. Ahora `init`, si el archivo existe, añade `verify.default` y `verify.full` cuando faltan y la detección los encuentra, sin cambiar nada más del archivo, y lo dice. Y al cerrar un cambio, si con su código Specty detecta comandos de verificación que `config.yaml` no tiene, la salida propone `specty init` en la carpeta principal para añadirlos.

## Fuera de alcance

- Cambiar un valor que ya existe en `config.yaml`, aunque la detección encuentre otro.
- Rellenar otras claves (`governed`, `scope.generated`…): sus valores por defecto ya los aplica el esquema.
- Que `close` escriba `config.yaml` por su cuenta: lo propone, y `init` lo hace.

## Supuestos

- A1: Solo se rellenan `verify.default` y `verify.full`, porque son los únicos valores que salen de la detección y que no tienen un valor por defecto útil; la detección es la misma que usa `init` al crear el archivo, para cualquier lenguaje.
  - impacto: alto
- A2: El archivo se edita con la librería `yaml` sobre su documento, así que se conservan sus comentarios, su orden y lo que la persona escribió.
- A3: `close` y el `accept` de un cambio quick detectan en la carpeta del cambio antes de incorporarlo, porque después la worktree se borra y su contenido es el que llega a la rama destino.

## Criterios de aceptación

- AC1: CUANDO `.specty/config.yaml` existe sin `verify.default` o sin `verify.full`, y la detección los encuentra ENTONCES `init` los añade, dice cuáles, y el resto del archivo queda igual.
- AC2: CUANDO `config.yaml` ya tiene un valor ENTONCES `init` no lo cambia, aunque la detección encuentre otro.
- AC3: CUANDO ni `config.yaml` ni la detección tienen un comando de tests ENTONCES `init` avisa como hoy; si `config.yaml` ya lo tiene, no avisa.
- AC4: CUANDO se cierra un cambio cuyo código hace que Specty detecte una verificación que `config.yaml` no tiene ENTONCES la salida la nombra y propone `specty init` en la carpeta principal; si no hay nada nuevo, no dice nada.

## Diseño

- `install/project-files.ts`: `completeConfig(text, detection)` añade al documento las claves de `verify` que faltan y devuelve el texto y lo añadido.
- `commands/init.ts`: con el archivo existente, escribe el texto completado a través de `InstallFiles` (así lo cubren `--dry-run`, las copias y el commit de `init`), y el aviso de tests mira también la configuración.
- `flow/detected.ts` (nuevo): `verifyHints(session)` compara la detección de la carpeta con `session.config.verify` y devuelve la línea que propone `init`.
- `commands/finish.ts` y `commands/accept.ts` añaden esa línea a la salida del cierre, calculada antes de incorporar.

## Archivos

- modificar packages/cli/src/install/project-files.ts — `completeConfig`
- modificar packages/cli/src/commands/init.ts — completa `config.yaml` si existe
- crear packages/cli/src/flow/detected.ts — la verificación detectada que falta en `config.yaml`
- modificar packages/cli/src/commands/finish.ts — la propuesta al cerrar
- modificar packages/cli/src/commands/accept.ts — la propuesta al cerrar un cambio quick
- crear packages/cli/test/config-fill.test.ts — `init` completa y no pisa; `close` propone
- modificar docs/formats.md — `init` completa `verify` (§6)
- modificar docs/ARCHITECTURE.md — volver a detectar tras el primer cambio (§14)

## Tareas

- [ ] T1: `init` completa `verify` en `config.yaml`
  - files: packages/cli/src/install/project-files.ts, packages/cli/src/commands/init.ts, packages/cli/test/config-fill.test.ts, docs/formats.md
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/config-fill.test.ts test/setup.test.ts test/init-reversible.test.ts
  - type: feat
- [ ] T2: `close` propone `init` cuando detecta verificación nueva
  - files: packages/cli/src/flow/detected.ts, packages/cli/src/commands/finish.ts, packages/cli/src/commands/accept.ts, packages/cli/test/config-fill.test.ts, docs/ARCHITECTURE.md
  - ac: AC4
  - verify: pnpm check
  - type: feat

## Riesgos

- R1: Un comando detectado que no funciona quedaría como verificación — es el mismo que `init` escribe al crear el archivo, la salida lo nombra, y `doctor` comprueba que los comandos citados existen.
- R2: El agente podría provocar un comando de verificación trivial para que `init` lo copie — el manifiesto que lo define es código gobernado, así que pasa por una tarea aprobada y su diff.
