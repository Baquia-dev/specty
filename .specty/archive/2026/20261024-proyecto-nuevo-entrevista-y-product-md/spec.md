---
kind: standard
---

# Proyecto nuevo: entrevista y PRODUCT.md

## Objetivo

ARCHITECTURE §14 prevé un camino para los proyectos nuevos que no existe: hoy `init` trata un repositorio vacío como cualquier otro, y nadie pregunta qué se va a construir antes del primer cambio. Ahora `init` reconoce un proyecto nuevo y, si no hay `PRODUCT.md`, lo crea. Si lo ejecuta una persona en su terminal, le hace la entrevista breve de §14 (qué, para quién, alcance del MVP, fuera de alcance, stack o «recomiéndame», despliegue y restricciones) y escribe sus respuestas. Si lo ejecuta un agente, deja las preguntas en el archivo y su SIGUIENTE le pide hacerlas en el chat. Es la primera parte del flujo de §14; el primer cambio de esqueleto va en el cambio siguiente.

## Fuera de alcance

- El primer cambio de esqueleto (`bootstrap`): el cambio siguiente.
- Recomendar un stack: «recomiéndame» queda escrito en `PRODUCT.md`, y lo decide la spec del primer cambio.
- Volver a preguntar si `PRODUCT.md` ya existe, o tocarlo.

## Supuestos

- A1: Un proyecto es nuevo si la detección no encuentra ningún stack y el repositorio no tiene código gobernado salvo metadatos (`.gitignore`, `.gitattributes`, `.editorconfig` y los archivos de licencia), sin mirar ningún lenguaje en concreto.
  - impacto: alto
- A2: La entrevista son siete preguntas de texto libre, en el idioma de la configuración, y una respuesta vacía deja en su sección la pregunta como comentario para completarla después.
- A3: `PRODUCT.md` va en el commit de `init` junto a sus otros archivos, y no es código gobernado (`**/*.md` está en `ignored`), así que el agente puede completarlo después sin spec.
- A4: Si el agente ejecuta `init`, no hay a quién preguntar en la terminal: escribe el esqueleto con las preguntas y su SIGUIENTE le pide hacerlas en el chat, completar `PRODUCT.md` y crear el primer cambio.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO una persona ejecuta `specty init` en su terminal en un proyecto nuevo sin `PRODUCT.md` ENTONCES le hace las siete preguntas y escribe `PRODUCT.md` con una sección por pregunta y su respuesta.
- AC2: CUANDO lo ejecuta un agente ENTONCES escribe `PRODUCT.md` con las secciones y las preguntas como comentarios, y su SIGUIENTE le pide preguntar al usuario, completarlo y crear el primer cambio.
- AC3: CUANDO el repositorio ya tiene código gobernado, o la detección encuentra un stack, o ya existe `PRODUCT.md` ENTONCES `init` no pregunta ni escribe `PRODUCT.md`, como hoy.
- AC4: CUANDO `init` escribe `PRODUCT.md` ENTONCES entra en su commit y en `--dry-run` aparece como «crear PRODUCT.md».

## Diseño

- `install/product.ts` (nuevo):
  - `isNewProject(detection, files)` aplica A1;
  - `PRODUCT_QUESTIONS` son las siete preguntas (es y en);
  - `interview(terminal, lang)` las hace;
  - `renderProduct(name, lang, answers)` escribe el archivo;
  - `newProjectNext(lang, interactive)` da el SIGUIENTE.
- `commands/init.ts`: antes de escribir nada, mira si el proyecto es nuevo con los archivos de git; si lo es y no hay `PRODUCT.md`, pregunta (con terminal) y lo escribe a través de `InstallFiles`, lo añade a su commit y usa el SIGUIENTE de proyecto nuevo.

## Archivos

- crear packages/cli/src/install/product.ts — proyecto nuevo, entrevista y `PRODUCT.md`
- modificar packages/cli/src/commands/init.ts — la entrevista y `PRODUCT.md` en un proyecto nuevo
- crear packages/cli/test/new-project.test.ts — persona, agente y proyecto que no es nuevo
- modificar docs/ARCHITECTURE.md — lo que ya hace el proyecto nuevo (§14)

## Tareas

- [x] T1: `init` entrevista y escribe `PRODUCT.md` en un proyecto nuevo
  - files: packages/cli/src/install/product.ts, packages/cli/src/commands/init.ts, packages/cli/test/new-project.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm check
  - type: feat

## Riesgos

- R1: Tomar por nuevo un proyecto que no lo es y preguntar de más — solo con ningún stack detectado y sin código gobernado (A1), y nunca si ya hay `PRODUCT.md`.
- R2: Una entrevista larga que frene el primer uso — son siete preguntas que se pueden dejar en blanco, y quedan como comentario para después.

## Cierre

### Resumen

`init` reconoce un proyecto nuevo (`install/product.ts`): la detección no encuentra ningún stack y no hay código gobernado salvo metadatos del repositorio y los archivos de los agentes, que salen de la tabla de capacidades. Si no hay `PRODUCT.md`, lo crea con una sección por cada pregunta de §14 y lo incluye en su commit. Con una persona en la terminal, le hace las siete preguntas y escribe sus respuestas, con la pregunta como comentario donde la dejó en blanco; su SIGUIENTE le pide al agente el primer cambio. Si lo ejecuta un agente, deja las preguntas como comentarios, y su SIGUIENTE le pide hacerlas en el chat, completar `PRODUCT.md` y crear el primer cambio. `--dry-run` lo planea sin preguntar. Un repositorio con código, con un stack detectado o con un `PRODUCT.md` sigue como antes.

### Desviaciones

- **Ninguna respecto al plan.**

### Decisiones

- **Los archivos de los agentes salen de `AGENT_CAPABILITIES`:** un `.claude/` o un `.cursor/` de antes no hacen que el proyecto deje de ser nuevo, y no hay una segunda lista que mantener.
- **Con `--dry-run` no se pregunta nada,** aunque haya una persona en la terminal: se planea el archivo con las preguntas.

### Pendientes

- **`commands/init.ts` tiene 307 líneas de código** y `task done` avisa. Propuesta para dividirlo por responsabilidad: la instalación de cada agente con sus líneas de salida (Claude Code, Cursor, Codex, OpenCode y los avisos de herramientas sin hooks) a `install/agents-step.ts`, y la salida de `--dry-run` (`planned`) junto a `install/files.ts`. Pendiente de que la persona lo decida.
- **El primer cambio de esqueleto** (`bootstrap`, §14): el cambio siguiente.
