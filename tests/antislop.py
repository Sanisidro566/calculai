"""Antislop de CalculAi: revisión estática rápida. Correr ANTES de publicar, junto con smoke.py.

    python3 tests/antislop.py        (desde la carpeta del repositorio; no necesita instalar nada)

Busca lo que no debe pasar nunca: HTML inyectado, eval, enlaces abiertos sin revisar, campos de datos que
se pierden al recargar, versiones del script desalineadas, datos reales en el repositorio, nombres de otras
IA en la app, restos de depuración y frases de relleno en los textos. Termina con «ANTISLOP OK» o con la
lista de fallas (código de salida 1). Los «avisos» no hacen fallar, pero conviene mirarlos.
"""
import os, re, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAILS, WARNS = [], []
def read(p): return open(os.path.join(ROOT, p), encoding='utf-8').read()
def fail(msg): FAILS.append(msg)
def warn(msg): WARNS.append(msg)
def lines_with(src, pat):
    return [i + 1 for i, l in enumerate(src.split('\n')) if re.search(pat, l)]

APP, SYNC, CONN, IDX, SW = read('app.js'), read('calculai-sync.user.js'), read('conector.js'), read('index.html'), read('sw.js')
JS = {'app.js': APP, 'calculai-sync.user.js': SYNC, 'conector.js': CONN, 'sw.js': SW}

# 1. Sintaxis
if shutil.which('node'):
    for f in JS:
        r = subprocess.run(['node', '--check', os.path.join(ROOT, f)], capture_output=True, text=True)
        if r.returncode: fail(f'{f}: error de sintaxis\n{r.stderr.strip()[:400]}')
else:
    warn('node no está instalado: no revisé la sintaxis de los .js')

# 2. Nada de HTML inyectado ni código armado desde texto
for f, src in JS.items():
    for pat, what in [(r'\.innerHTML\s*=(?!\s*\'\')', 'innerHTML con contenido'), (r'insertAdjacentHTML', 'insertAdjacentHTML'), (r'\.outerHTML\s*=', 'outerHTML ='),
                      (r'document\.write\s*\(', 'document.write'), (r'(?<![\w.])eval\s*\(', 'eval('), (r'new Function\s*\(', 'new Function(')]:
        for n in lines_with(src, pat): fail(f'{f}:{n}: {what} (usa h() o textContent)')

# 3. Las clases guardadas siguen aisladas
if re.search(r"sandbox:\s*'[^']*allow-same-origin", APP): fail('app.js: un iframe tiene allow-same-origin (las clases podrían leer los datos y la API key)')
if 'Content-Security-Policy' not in IDX: fail('index.html: falta la política de seguridad (CSP)')

# 4. Enlaces externos solo por openExt (salvo el inicio de sesión de Microsoft)
for n in lines_with(APP, r'window\.open\('):
    l = APP.split('\n')[n - 1]
    if 'function openExt' not in l and "'calculai-ms'" not in l: fail(f'app.js:{n}: window.open directo (usa openExt, que revisa la dirección)')

# 5. Campos de D y P: deben existir en blankData/blankProg o se pierden al recargar
def keys_of(fn):
    m = re.search(r'const ' + fn + r' = \(\) => \(\{(.*?)\}\);', APP)
    return set(re.findall(r'(\w+):', m.group(1))) if m else set()
BD, BP = keys_of('blankData'), keys_of('blankProg')
if not BD or not BP: fail('no encontré blankData/blankProg en app.js')
else:
    for obj, keys in [('D', BD), ('P', BP)]:
        used = set(re.findall(r'(?<![\w.$])' + obj + r'\.([a-zA-Z_]\w*)', APP))
        for k in sorted(used - keys): fail(f'app.js: {obj}.{k} se usa pero no está en blank{"Data" if obj == "D" else "Prog"}() (se perdería al recargar)')

# 6. Versión del script alineada con la app
v_script = re.search(r'@version\s+(\S+)', SYNC); v_inner = re.search(r"var VERSION = '([^']+)'", SYNC); v_app = re.search(r"const SCRIPT_V = '([^']+)'", APP)
if not (v_script and v_inner and v_app) or len({v_script.group(1), v_inner.group(1), v_app.group(1)}) != 1:
    fail(f'versiones del script desalineadas: @version={v_script and v_script.group(1)}, VERSION={v_inner and v_inner.group(1)}, SCRIPT_V={v_app and v_app.group(1)}')
if not re.search(r'@connect\s+webc\.uai\.cl\s*$', SYNC, re.M) or re.search(r'@connect\s+\*', SYNC): fail('calculai-sync.user.js: @connect debe ser solo webc.uai.cl')

# 7. Archivos del modo sin internet
core = re.search(r'const CORE = \[(.*?)\]', SW)
for f in re.findall(r"'([^']+)'", core.group(1) if core else ''):
    if f != './' and not os.path.exists(os.path.join(ROOT, f)): fail(f'sw.js: CORE incluye {f}, que no existe')

# 8. El índice de app.js apunta a funciones que existen
idx = APP.split('REGLAS QUE NO SE ROMPEN')[0]
for name in sorted(set(re.findall(r'\b([a-z][A-Za-z]{1,})\(', idx))):
    if not re.search(r'(function\s+' + name + r'\b|const\s+' + name + r'\s*=|let\s+' + name + r'\b)', APP): fail(f'app.js: el índice menciona {name}(), que no existe')

# 9. Nada de datos reales en el repositorio (es público)
tracked = subprocess.run(['git', 'ls-files'], cwd=ROOT, capture_output=True, text=True).stdout.split() if shutil.which('git') else []
for f in tracked:
    if f.startswith('vendor/') or not re.search(r'\.(js|py|md|html|json|css|webmanifest)$', f): continue
    src = read(f)
    for m in re.finditer(r'[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}\b', src):
        if not re.search(r'(noreply|example|ejemplo|a@b|anthropic\.com)', m.group(0)) and not m.group(0).endswith(('.js', '.png', '.svg')): fail(f'{f}: parece un correo real ({m.group(0)})')
    for m in re.finditer(r'claude\.ai/artifact/([A-Za-z0-9_-]{16,})', src): fail(f'{f}: enlace real a una clase de claude.ai ({m.group(1)[:6]}…)')

# 10. Textos de la app: sin nombres de otras IA ni restos de depuración
for f, src in [('app.js', APP), ('index.html', IDX)]:
    for n in lines_with(src, r'\b(ChatGPT|Copilot|Bard|Gemini)\b'): fail(f'{f}:{n}: nombra otra IA en la app')
for f, src in JS.items():
    for n in lines_with(src, r'\bconsole\.(log|debug)\(|\bdebugger\b'): fail(f'{f}:{n}: resto de depuración (console.log/debugger)')

# 11. Avisos de estilo (no hacen fallar)
SLOP = r'(¡Claro|Sin duda|En resumen,|potencia(r|rá) tu|desbloquea|lleva tu .* al siguiente nivel|experiencia fluida|revolucion|increíble|sumérgete|en el mundo de)'
for n in lines_with(APP, SLOP): warn(f'app.js:{n}: frase de relleno en un texto')
for n in lines_with(APP, r"['`][^'`]*\busted\b"): warn(f'app.js:{n}: «usted» en un texto (la app trata de tú)')
for f, src in JS.items():
    for n in lines_with(src, r'\b(TODO|FIXME|XXX)\b'): warn(f'{f}:{n}: pendiente marcado en el código')

for w in WARNS: print('  aviso: ' + w)
print('\nANTISLOP OK' if not FAILS else f'\n{len(FAILS)} FALLA(S):\n- ' + '\n- '.join(FAILS))
sys.exit(1 if FAILS else 0)
