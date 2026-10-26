---
kind: standard
---

# init pregunta primero el idioma

## Objetivo

Hoy `specty init` deduce el idioma de `LANG`, y una terminal con `LANG=C.UTF-8` (la de macOS o la de VS Code) da inglés aunque la persona hable español. Así salen en inglés las preguntas de `init`, la configuración, AGENTS.md y todas las salidas que lee el agente, que a veces acaba respondiendo en inglés. Con una persona en la terminal, `init` pregunta primero en qué idioma trabaja Specty, y lo elegido rige todo lo demás. El bloque de AGENTS.md le pide al agente hablar con el usuario en ese idioma, y `init --language` cambia el idioma de un repositorio ya configurado.

## Fuera de alcance

- Leer el idioma preferido del sistema operativo (como `AppleLanguages` de macOS) cuando `LANG` es `C` o `POSIX`: la pregunta lo resuelve para la persona, y el agente pasa `--language`.
- Traducir lo que ya escribió una persona, como `PRODUCT.md` o las secciones propias de AGENTS.md, al cambiar el idioma.
- Idiomas distintos del español y el inglés.

## Supuestos

- A1: `init` pregunta el idioma solo cuando hay una persona en la terminal, aún no existe `.specty/config.yaml`, no se pasó `--language` y no es `--dry-run`. Con la configuración ya creada, una nueva ejecución conserva su idioma y no pregunta.
  - impacto: alto
- A2: La pregunta va en los dos idiomas a la vez, porque aún no se sabe cuál usar, con el idioma detectado como primera opción.
- A3: Un agente no puede responder preguntas: cuando ejecuta `init`, usa `--language` o el idioma del sistema. La salida que le dice que el repositorio no usa Specty le pide pasar `--language` con el idioma en que le habla el usuario.
- A4: La instrucción de hablar con el usuario en el idioma configurado va al final de la primera línea del bloque de flujo, no en una línea nueva, para que el bloque siga en 15 líneas.
- A5: `init --language` en un repositorio ya configurado con otro idioma cambia solo la línea `language` de `.specty/config.yaml`, sin tocar comentarios ni lo demás, y reescribe los bloques de Specty de AGENTS.md en ese idioma, como ya hace `init` en cada ejecución.
  - impacto: alto
- A6: La salida de `init`, también la palabra `SIGUIENTE`, va en el idioma con el que trabajó, y no en el del sistema.

## Criterios de aceptación

- AC1: CUANDO una persona ejecuta `specty init` en su terminal, sin configuración y sin `--language` ENTONCES la primera pregunta es el idioma, en español y en inglés, con el detectado primero; y la configuración, AGENTS.md, las preguntas siguientes y la salida usan el idioma elegido.
- AC2: CUANDO `init` recibe `--language`, lo ejecuta un agente o es `--dry-run` ENTONCES no pregunta el idioma.
- AC3: CUANDO se ejecuta `specty init --language <idioma>` en un repositorio configurado con otro ENTONCES cambia `language` en `.specty/config.yaml` sin tocar lo demás, reescribe los bloques de Specty de AGENTS.md en ese idioma, y la salida lo dice.
- AC4: CUANDO el agente lee el bloque de flujo de AGENTS.md ENTONCES se le pide hablar con el usuario en el idioma configurado.
- AC5: CUANDO un agente ve que el repositorio aún no usa Specty ENTONCES la salida le pide ejecutar `specty init --language <es|en>` con el idioma en que le habla el usuario.

## Archivos

- modificar packages/core/src/cards/init.ts — la pregunta del idioma, sus opciones y la línea del idioma cambiado
- modificar packages/core/src/cards/next.ts — el repositorio sin Specty pide `--language`
- modificar packages/core/src/cards/index.ts — exportar los textos nuevos
- modificar packages/core/src/agents-md.ts — hablar con el usuario en el idioma configurado
- crear packages/core/test/cards/language.test.ts — los textos del idioma
- modificar packages/cli/src/commands/init.ts — preguntar primero el idioma y salir en el idioma usado
- modificar packages/cli/src/install/project-files.ts — cambiar `language` en una configuración existente
- crear packages/cli/test/init-language.test.ts — la pregunta, cuándo no se hace y el cambio de idioma
- modificar docs/ARCHITECTURE.md — el primer paso de `init`
- modificar docs/formats.md — el bloque de AGENTS.md y la clave `language`

## Tareas

- [ ] T1: Los textos del idioma
  - files: packages/core/src/cards/init.ts, packages/core/src/cards/next.ts, packages/core/src/cards/index.ts, packages/core/src/agents-md.ts, packages/core/test/cards/language.test.ts
  - ac: AC1, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-core typecheck && pnpm --filter @baquia-dev/specty-core test
- [ ] T2: init pregunta primero el idioma y lo cambia con --language
  - files: packages/cli/src/commands/init.ts, packages/cli/src/install/project-files.ts, packages/cli/test/init-language.test.ts, docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC1, AC2, AC3
  - verify: pnpm check
