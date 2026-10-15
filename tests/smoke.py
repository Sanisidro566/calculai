"""Prueba rápida de Calculai: correr ANTES de publicar cualquier cambio.

    pip install playwright        (Chromium ya instalado, o: playwright install chromium)
    python3 tests/smoke.py        (desde la carpeta del repositorio)

Levanta un servidor local, abre la app en Chromium sin conexión a WebC real y comprueba
lo que no se puede romper. Usa solo datos inventados: nunca pongas aquí datos ni clases reales.
Termina con «TODO OK» o con la lista de fallas (código de salida 1).
"""
import asyncio, json, os, re, socket, subprocess, sys, tempfile, time
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8899
APP = f'http://127.0.0.1:{PORT}/'
FAILS = []

def check(ok, msg):
    print(('  ✓ ' if ok else '  ✗ ') + msg)
    if not ok: FAILS.append(msg)

# ---------- Datos inventados ----------
SEED = r'''() => {
  const iso = d => d.toISOString().slice(0,10);
  const inD = n => { const d = new Date(); d.setDate(d.getDate()+n); return iso(d); };
  const data = {v:1, owner:"Prueba", subjects:[
      {id:"s1", name:"Física de prueba", short:"Física", code:"FIS101", color:"naranja"},
      {id:"s2", name:"Álgebra de prueba", short:"Álgebra", code:"MAT113", color:"violeta", webc:23073}],
    events:[{id:"e1", subj:"s1", kind:"prueba", name:"Prueba 2", date:inD(10), time:"09:00", ver:true, topics:[]}],
    topics:[
      {id:"t1", subj:"s1", code:"F1", title:"Cinemática", scope:"actual", prio:"2", pre:[], content:"# Cinemática\n\n$$x = x_0 + v_0 t$$"},
      {id:"t2", subj:"s1", code:"F2", title:"Newton", scope:"actual", prio:"2", pre:["t1"], url:"https://claude.ai/artifact/PRUEBA-F2"},
      {id:"t3", subj:"s2", code:"A1", title:"Sistemas", scope:"actual", prio:"1", pre:[], url:"https://claude.ai/artifact/PRUEBA-A1"}],
    items:[{id:"q1", topic:"t1", type:"num", q:"¿2+2?", ans:4, tol:.01, unit:"", ex:""}],
    resources:[], news:[], sync:{}};
  localStorage.setItem("calculai:v1", JSON.stringify({data, progress:{status:{}, attempts:[], errors:[], days:{}, sessions:[], dayLoad:{}, lastLesson:""}, savedAt:new Date().toISOString()}));
}'''
LESSON = '<!doctype html><html><head><meta charset="utf-8"><title>Clase</title></head><body><h1>Newton de prueba</h1><div id="status"><button data-s="Practicado">Practicado</button></div><script>document.querySelector("button").onclick=function(){try{localStorage.setItem("F2-status",JSON.stringify("Practicado"))}catch(e){}};</script></body></html>'
PACK = {'app': 'calculai', 'v': 1, 'lessons': [
    {'key': 'https://claude.ai/artifact/PRUEBA-F2', 'code': 'F2', 'title': 'Newton', 'html': LESSON},
    {'key': 'https://claude.ai/artifact/PRUEBA-A1', 'code': 'A1', 'title': 'Sistemas', 'html': LESSON.replace('Newton', 'Sistemas')}]}

# ---------- WebC simulado (lo que respondería Moodle) ----------
NOW = int(time.time())
def webc(method, url, data):
    if url.endswith('/my/'):
        return 200, url, '<html><head><title>Área personal | WebC</title><script>M.cfg = {"sesskey":"abc"};</script></head></html>'
    if 'service.php' in url:
        fn = re.search(r'info=(\w+)', url).group(1)
        if fn == 'core_course_get_enrolled_courses_by_timeline_classification':
            d = {'courses': [{'id': 23482, 'fullname': 'FÍSICA I Sec.3', 'shortname': 'X-FIS101-3'},
                             {'id': 23073, 'fullname': 'ÁLGEBRA LINEAL Sec.8', 'shortname': 'X-MAT113-8'},
                             {'id': 99999, 'fullname': 'CÁLCULO II Sec.2', 'shortname': 'X-MAT114-2'}]}
        elif fn == 'core_calendar_get_action_events_by_timesort':
            d = {'events': [{'id': 7001, 'name': 'Vencimiento de Entrega lab', 'timesort': NOW + 5 * 86400, 'modulename': 'assign', 'course': {'id': 23482}, 'url': 'https://webc.uai.cl/mod/assign/view.php?id=9'}]}
        else:
            d = {'events': []}
        return 200, url, json.dumps([{'error': False, 'data': d}])
    if 'course/view.php?id=23482' in url:
        return 200, url, '<div id="region-main"><li class="section" data-sectionname="General"><a href="https://webc.uai.cl/mod/forum/view.php?id=1"><span class="instancename">Avisos</span></a><a href="https://webc.uai.cl/mod/resource/view.php?id=2"><span class="instancename">Guía 10</span></a></li></div>'
    if 'course/view.php' in url:
        return 200, url, '<div id="region-main"></div>'
    if 'forum/view.php?id=1' in url:
        return 200, url, '<a href="https://webc.uai.cl/mod/forum/discuss.php?d=500">Cambio de fecha</a>'
    if 'discuss.php?d=500' in url:
        return 200, url, '<article>Cambio de fecha\nde Profe - lunes, 12 de octubre de 2026, 10:00\nEl informe se entrega el viernes 30 de octubre a las 22:00.</article>'
    return 404, url, ''

GM_SHIM = "window.GM_xmlhttpRequest = function(o){ window.__gm(o.method, o.url, o.data || '').then(function(r){ o.onload({status:r[0], finalUrl:r[1], responseText:r[2]}); }, function(){ o.onerror && o.onerror(); }); };"

async def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        try: socket.create_connection(('127.0.0.1', PORT), timeout=.2).close(); break
        except OSError: time.sleep(.1)
    pack_file = os.path.join(tempfile.mkdtemp(), 'paquete-prueba.json')
    json.dump(PACK, open(pack_file, 'w'))
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
            await ctx.route(re.compile(r'https://(fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com)/.*'), lambda r: r.abort())
            async def gm(method, url, data): return list(webc(method, url, data))
            await ctx.expose_function('__gm', gm)
            errs = []
            pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(APP); await pg.wait_for_timeout(300)

            print('1. Arranque y pestañas')
            await pg.evaluate(SEED); await pg.reload(); await pg.wait_for_timeout(500)
            for t in ['Ahora', 'Clases', 'Mapa', 'Práctica', 'Errores', 'Calendario', 'Biblioteca', 'Editar']:
                await pg.click(f'.tab:has-text("{t}")'); await pg.wait_for_timeout(150)
            check(not errs, f'todas las pestañas abren sin errores {errs[:2]}')

            print('2. Paquete de clases')
            await pg.click('.tab:has-text("Editar")'); await pg.wait_for_timeout(200)
            async with pg.expect_file_chooser() as fc:
                await pg.click('button:has-text("Cargar paquete de clases")')
            await (await fc.value).set_files(pack_file); await pg.wait_for_timeout(1200)
            check(await pg.evaluate('lessonKeys.size') == 2, 'se guardan las 2 clases del paquete')
            check(await pg.evaluate('D.subjects[0].name') == 'Física de prueba', 'un paquete sin datos no cambia las materias')
            await pg.evaluate("go('clases')"); await pg.wait_for_timeout(200)
            await pg.click('.cl-card:has-text("Newton")'); await pg.wait_for_timeout(800)
            fr = pg.frame_locator('iframe.saved-frame')
            check(await fr.locator('h1').inner_text() == 'Newton de prueba', 'la clase guardada se ve dentro de Calculai')
            iso = await pg.evaluate("(() => { try { document.querySelector('iframe.saved-frame').contentWindow.document; return false; } catch(e){ return true; } })()")
            check(iso, 'la clase está aislada (no puede leer los datos de Calculai)')
            await fr.locator('button').click(); await pg.wait_for_timeout(300)
            check(await pg.evaluate("st('t2')") == 'practicado', '«Mi estado» de la clase actualiza el estado del tema')

            print('3. Revisión automática de WebC (simulada)')
            topics_before = await pg.evaluate('JSON.stringify(D.topics)')
            await pg.evaluate("lessonOpen = null; go('ahora')")
            await pg.add_script_tag(content=GM_SHIM)
            await pg.add_script_tag(content=open(os.path.join(ROOT, 'calculai-sync.user.js'), encoding='utf-8').read())
            await pg.wait_for_timeout(2500)
            strip = await pg.inner_text('#syncStrip')
            check('WebC revisado' in strip, 'la barra muestra «WebC revisado»')
            check(await pg.evaluate("D.subjects.find(s=>s.id==='s1').webc") == 23482, 'la materia se vincula por código (FIS101)')
            check(await pg.evaluate("D.events.some(e=>e.webc==='cal:7001')"), 'la fecha del calendario de WebC se agrega')
            check(await pg.evaluate("D.resources.some(r=>r.title==='Guía 10')"), 'el recurso nuevo se agrega')
            check(await pg.evaluate("D.sync.inbox.length") == 1, 'la fecha encontrada en un aviso queda en «Para revisar»')
            check(await pg.locator('.novedades').count() == 1, 'aparece la tarjeta «Novedades de WebC»')
            check(topics_before == await pg.evaluate('JSON.stringify(D.topics)'), 'la revisión NO toca los temas ni las clases')
            check(await pg.evaluate('lessonKeys.size') == 2, 'las clases guardadas siguen ahí')
            await pg.click('#syncStrip button:has-text("Revisar ahora")'); await pg.wait_for_timeout(2000)
            check(await pg.evaluate("D.events.filter(e=>e.webc==='cal:7001').length") == 1, 'revisar de nuevo no duplica fechas')
            check(await pg.evaluate("(D.news.find(n=>n.id==='n-500')||{}).text?.length > 0"), 'el aviso ya conocido conserva su texto')

            print('4. Recarga y celular')
            await pg.reload(); await pg.wait_for_timeout(800)
            check(await pg.evaluate('lessonKeys.size') == 2 and await pg.evaluate("st('t2')") == 'practicado', 'tras recargar se mantienen clases y progreso')
            await pg.set_viewport_size({'width': 390, 'height': 844}); await pg.wait_for_timeout(300)
            check(not await pg.evaluate('document.documentElement.scrollWidth > innerWidth'), 'sin scroll horizontal en el celular')
            check(not errs, f'sin errores de JavaScript {errs[:3]}')
            await b.close()
    finally:
        srv.terminate()
    print('\nTODO OK' if not FAILS else f'\n{len(FAILS)} FALLA(S):\n- ' + '\n- '.join(FAILS))
    sys.exit(1 if FAILS else 0)

asyncio.run(main())
