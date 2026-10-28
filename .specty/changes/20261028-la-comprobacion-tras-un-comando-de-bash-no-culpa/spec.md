---
kind: standard
---

# La comprobación tras un comando de Bash no culpa al agente de lo que escribe Specty

## Objetivo

Tras cada comando de Bash, el guard compara la carpeta con la foto de antes y juzga lo que cambió como si lo hubiera escrito el agente. Si mientras tanto otro proceso de Specty escribe el estado del cambio (un `task done` en segundo plano, o el comando de otra sesión), el guard culpa al agente de editar `state.json` y `audit.jsonl`. Ese proceso tiene el bloqueo del cambio mientras corre, así que, mientras lo tenga un proceso vivo, lo que cambie dentro de la carpeta de ese cambio (`.specty/changes/<id>/`) no cuenta. Lo demás se juzga igual que antes.

## Fuera de alcance

- Que un proceso de Specty sin bloqueo (como `specty ui` sin acciones en marcha) deje de contar.
- Las demás herramientas: OpenCode y Cursor no tienen comprobación tras cada comando.

## Supuestos

- A1: Solo cuenta lo que cambia dentro de la carpeta del cambio activo (`.specty/changes/<id>/`). Specty escribe ahí el estado, el registro y las revisiones mientras tiene el bloqueo; el código que hace commit deja de diferir de HEAD y ya no aparece en la foto.
- A2: Si el agente cambiara la carpeta del cambio con un script justo mientras otro proceso de Specty tiene el bloqueo, no se detectaría tras el comando. La comprobación previa de cada comando sigue protegiendo esa carpeta, y la ventana dura lo que dura el comando de Specty.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO durante un comando de Bash cambia algo dentro de la carpeta del cambio activo mientras un proceso vivo de Specty tiene su bloqueo ENTONCES la comprobación posterior no lo cuenta; y sin ese bloqueo, o fuera de esa carpeta, lo juzga igual que antes.

## Archivos

- modificar packages/cli/src/store/lock.ts — `liveHolder`: quién tiene el bloqueo, si su proceso vive
- modificar packages/cli/src/enforce/shell-snapshot.ts — `withoutSpecty`: quitar lo que escribe Specty
- modificar packages/cli/src/enforce/guard.ts — usarlo tras cada comando
- crear packages/cli/test/shell-snapshot.test.ts — de punta a punta con el hook
- modificar docs/ARCHITECTURE.md — §10: lo que no cuenta tras un comando

## Tareas

- [x] T1: Lo que escribe un proceso de Specty con el bloqueo no cuenta tras un comando
  - files: packages/cli/src/store/lock.ts, packages/cli/src/enforce/shell-snapshot.ts, packages/cli/src/enforce/guard.ts, packages/cli/test/shell-snapshot.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/shell-snapshot.test.ts test/enforce.test.ts test/lock.test.ts
  - type: fix
  - notes: documenta en ARCHITECTURE §10 que, mientras un proceso de Specty tiene el bloqueo del cambio, lo que cambia en su carpeta no cuenta.
