---
kind: standard
follows:
  - 20261025-el-paquete-de-exportadores-openspec-spec-kit-y-k
---

# specty export: OpenSpec, Spec Kit y Kiro

## Objetivo

El paquete `packages/exporters` ya convierte una spec en los archivos de OpenSpec, Spec Kit y Kiro, pero nada lo usa. ARCHITECTURE §6 describe `specty export <id> --to openspec|speckit|kiro`. Ahora el comando existe: escribe los archivos del formato elegido para el cambio activo o el que se nombra, y dice cuáles escribió.

## Fuera de alcance

- Importar desde esos formatos.
- Exportar varios cambios a la vez.

## Supuestos

- A1: Por defecto, los archivos van a `.specty/exports/<formato>/`, fuera del código gobernado, con la estructura del formato dentro; así exportar no ensucia el árbol de trabajo. Con `--out <carpeta>` van donde diga la persona, también a la raíz del repositorio con `--out .`.
- A2: El contexto del export sale del cambio: su id y su rama del estado, y la fecha y la petición literal de `change.created`.
- A3: `export` solo escribe archivos de exportación, nunca la spec ni el estado, así que también lo puede ejecutar el agente.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty export <id> --to openspec|speckit|kiro` ENTONCES escribe los archivos de ese formato en `.specty/exports/<formato>/` y los lista.
- AC2: CUANDO se añade `--out <carpeta>` ENTONCES los escribe allí, con la misma estructura.
- AC3: CUANDO falta el formato o no lo conoce, o el cambio no está, ENTONCES lo rechaza diciendo por qué y sin escribir nada; sin id, exporta el cambio activo.
- AC4: CUANDO alguien lee ARCHITECTURE ENTONCES `export` aparece como implementado, con dónde escribe.

## Archivos

- crear packages/cli/src/commands/export.ts — el comando, registrado desde su módulo
- modificar packages/cli/src/program.ts — registrarlo
- modificar packages/cli/package.json — depender de `@baquia-dev/specty-exporters`
- modificar pnpm-lock.yaml — la dependencia nueva
- crear packages/cli/test/export.test.ts — de punta a punta
- modificar docs/ARCHITECTURE.md — §6

## Tareas

- [x] T1: El comando export
  - files: packages/cli/src/commands/export.ts, packages/cli/src/program.ts, packages/cli/package.json, pnpm-lock.yaml, packages/cli/test/export.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm check

## Cierre

### Resumen

`specty export [<id>] --to openspec|speckit|kiro [--out <carpeta>]` escribe la spec del cambio activo, o del que se nombra, en el formato elegido, y lista los archivos. Por defecto van a `.specty/exports/<formato>/`, fuera del código gobernado, con la estructura del formato dentro; con `--out`, donde diga la persona. El contexto (id, rama, fecha y petición literal) sale del estado y de `change.created`. Un formato que falta o que no existe, o un cambio que no está, se rechaza sin escribir nada. La CLI depende ahora de `@baquia-dev/specty-exporters`, y el comando se registra desde su módulo.

### Desviaciones

- Ninguna.

### Decisiones

- La carpeta por defecto no es el repositorio: escribir allí ensuciaría el árbol de trabajo con código gobernado, y el siguiente `specty new` lo rechazaría.
- La primera verificación de la tarea falló por un test de la UI que se pasó de tiempo con la carga de la máquina en 80, ajeno a este cambio; con la carga por debajo de 20, pasó.

### Pendientes

- `packages/cli/src/program.ts` está en 307 líneas de código: su división por grupos de comandos va en el punto de deuda.
