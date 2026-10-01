# BRIEF-005 — Housekeeping pre-deploy (`.gitignore` + `package.json`)

- **Dueño:** Claude
- **Estado:** HECHO
- **Prioridad:** P0
- **Creado:** 2026-09-19
- **Cerrado:** 2026-09-19
- **Depende de:** ninguna

## Objetivo

Dejar el repositorio limpio y listo para push a GitHub y deploy a Railway
sin filtrar secretos, sin dependencias muertas, y con versión de Node
pinneada.

## Contexto

Antes de subir a GitHub hay que asegurarse de que:
1. `.env` (que contiene `WHATSAPP_TOKEN`, `DATABASE_URL`, `DASHBOARD_PASSWORD`,
   `APP_SECRET`) nunca llegue al repo.
2. `node_modules/` no se versione.
3. Binarios locales (imágenes en `media/`?) no inflen el repo.
4. Dependencias muertas (`openai` desde el glowdown) se saquen.
5. Node esté pinneado para que Railway use la misma versión que dev.
6. `package-lock.json` se mantenga versionado para builds reproducibles.

## Alcance

**SÍ:**
- Revisar y actualizar `.gitignore`.
- `package.json`: sacar `openai`, agregar `engines.node`, agregar script `db:migrate` (viene de BRIEF-003 — coordinar orden).
- Verificar que `package-lock.json` esté al día tras el `npm uninstall openai`.

**NO:**
- Configurar Railway (BRIEF-007).
- Escribir migraciones (BRIEF-003).
- Cambios de código de negocio.

## Aceptación

- [ ] `.gitignore` incluye al menos:
  ```
  node_modules/
  .env
  .env.local
  *.log
  .DS_Store
  ```
- [ ] `.env` **no** aparece en `git status` (o queda como untracked ignorado).
- [ ] `package.json`:
  - `dependencies` sin `openai`.
  - `engines.node` con `"22.x"` (o la LTS que estemos usando; confirmar con `node -v`).
  - `scripts.db:migrate` presente.
- [ ] `npm install` deja el árbol sin OpenAI (verificar con `npm ls openai` que dice "empty").
- [ ] `package-lock.json` regenerado y versionado.
- [ ] Firma `// [ByClaude]` no aplica (son archivos JSON/dotfiles), pero se agrega entrada en la bitácora.

## Notas técnicas

**Comandos secuenciales:**

```bash
cd cecilia-tedin-bot
npm uninstall openai
```

**`.gitignore` propuesto:**

```
# dependencias
node_modules/

# secrets
.env
.env.*
!.env.example

# logs
*.log
npm-debug.log*

# OS
.DS_Store
Thumbs.db

# editor
.vscode/
.idea/

# temporales
*.tmp
*.bak
```

**Bonus:** crear `.env.example` con las claves esperadas y valores vacíos,
para que quede documentado qué envs pide el proyecto.

## Bloqueos

(Vacío por ahora.)

## Bitácora del brief

- 2026-09-19 — Brief creado por Claude.
- 2026-09-19 — Claude cerró el brief:
  - `.gitignore` endurecido con `.env.*`, `!.env.example`, IDEs, OS files.
  - `openai` ya estaba fuera de `dependencies` (alguien lo desinstaló entre briefs); verificado con `npm ls openai` → "empty".
  - `engines.node` pinneado a `"22.x"` (Node 22 confirmado por el humano).
  - Script `db:migrate` agregado.
  - `.env.example` creado con las 12 claves esperadas + comentarios; incluye
    `APP_SECRET` (que no está aún en `.env` local) para marcar que hay que
    cargarlo antes del deploy (bloqueante para BRIEF-001).
