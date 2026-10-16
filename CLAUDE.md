# Instrucciones para editar CalculAi

App de estudio estática (GitHub Pages), en español, sin servidor. Lee `ARQUITECTURA.md` antes de cambiar algo.

- **Ubica antes de editar.** `app.js` tiene un índice al inicio y secciones con títulos (`/* ===== NOMBRE =====`, `/* ---------- Vista: … ---------- */`). Busca la función con grep y cambia solo esa.
- **No reescribas archivos completos** ni muevas secciones si no te lo piden. Usa ediciones puntuales.
- **Invariantes:**
  - La sincronización con WebC/Outlook no toca `D.topics`, `D.items`, `P` ni las clases de IndexedDB.
  - Un campo nuevo en D o P va primero en `blankData`/`blankProg`.
  - Las clases interactivas se muestran en un iframe `sandbox` sin `allow-same-origin`.
  - Todo enlace o recuadro pasa por `urlOk` (dentro de `h()`) y `openExt`: nunca `window.open` ni `href` directos con datos del usuario.
  - Nada de `innerHTML`, `eval` ni `new Function`: el DOM se arma con `h()`.
  - Si una clase necesita otro sitio externo, hay que sumarlo a la CSP de `index.html` (las clases la heredan).
- **Textos de la interfaz:** español de Chile, claros y sin jerga técnica. No mencionar otras IA por nombre en la app.
- **Privacidad:** el repositorio es público. Nunca agregues datos reales, clases, nombres de profesores ni exportaciones de WebC. Nada de servidores intermedios ni de pedir contraseñas.
- **Verificar siempre antes de publicar:** `python3 tests/antislop.py && python3 tests/smoke.py` (el primero revisa sintaxis, seguridad, campos de datos, versiones y datos reales; el segundo prueba la app en Chromium). Luego sube `CACHE` en `sw.js` y, si cambiaste el script, `@version` + `VERSION` + `SCRIPT_V`.
- **Publicar** (commit + push a `main`) solo cuando la dueña lo pida o lo apruebe.
