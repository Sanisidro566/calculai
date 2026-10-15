# Instrucciones para editar Calculai

App de estudio estática (GitHub Pages), en español, sin servidor. Lee `ARQUITECTURA.md` antes de cambiar algo.

- **Ubica antes de editar.** `app.js` tiene un índice al inicio y secciones con títulos (`/* ===== NOMBRE =====`, `/* ---------- Vista: … ---------- */`). Busca la función con grep y cambia solo esa.
- **No reescribas archivos completos** ni muevas secciones si no te lo piden. Usa ediciones puntuales.
- **Invariantes:**
  - La sincronización con WebC/Outlook no toca `D.topics`, `D.items`, `P` ni las clases de IndexedDB.
  - Un campo nuevo en D o P va primero en `blankData`/`blankProg`.
  - Las clases interactivas se muestran en un iframe `sandbox` sin `allow-same-origin`.
- **Textos de la interfaz:** español de Chile, claros y sin jerga técnica. No mencionar otras IA por nombre en la app.
- **Privacidad:** el repositorio es público. Nunca agregues datos reales, clases, nombres de profesores ni exportaciones de WebC. Nada de servidores intermedios ni de pedir contraseñas.
- **Verificar siempre antes de publicar:** `node --check app.js && node --check calculai-sync.user.js && python3 tests/smoke.py`. Luego sube `CACHE` en `sw.js` y, si cambiaste el script, `@version` + `SCRIPT_V`.
- **Publicar** (commit + push a `main`) solo cuando la dueña lo pida o lo apruebe.
