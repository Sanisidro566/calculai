/* Calculai — app de estudio. Funciona en cualquier navegador; los datos viven en este dispositivo. */
'use strict';

/* =========================================================
   UTILIDADES
   ========================================================= */
const $ = s => document.querySelector(s);
function h(tag, attrs, ...kids){
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)){
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)){
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}
function svg(tag, attrs){ const el = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v); return el; }
function rich(s){
  const span = h('span');
  String(s ?? '').split(/(\$[^$]+\$)/).forEach(part => {
    if (part.length > 2 && part[0] === '$' && part.at(-1) === '$'){
      const m = h('span', {class:'m'}); const tex = part.slice(1, -1);
      if (window.katex){ try { katex.render(tex, m, {output:'mathml', throwOnError:false}); } catch { m.textContent = tex; } }
      else { m.textContent = tex; m.className = 'm mono'; }
      span.append(m);
    } else if (part) span.append(part);
  });
  return span;
}
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const diffDays = (a, b) => Math.round((parse(iso(b)) - parse(iso(a))) / 86400000);
const TODAY = parse(iso(new Date()));
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MES_L = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const fmtD = d => `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`;
const cap = s => s.replace(/^./, c => c.toUpperCase());
const uid = (p = 'x') => p + '-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2400); }
const countdown = d => d === 0 ? 'hoy' : d === 1 ? 'mañana' : d < 0 ? 'ya pasó' : `en ${d} días`;
const agoTxt = d => d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`;
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

/* =========================================================
   DATOS (editables por cada persona) Y PROGRESO
   ========================================================= */
const COLORS = ['azul','violeta','naranja','verde','rosa','cian','ambar','gris'];
const KIND = {prueba:{l:'Prueba', i:'■'}, control:{l:'Control', i:'◆'}, entrega:{l:'Entrega', i:'▲'}, proyecto:{l:'Proyecto', i:'●'}, examen:{l:'Examen', i:'★'}, otro:{l:'Otro', i:'○'}};
const SCOPE_LBL = {actual:'Material actual', noconf:'Inclusión no confirmada', hist:'Referencia histórica'};
const SCOPE_W = {actual:1, noconf:.6, hist:.45};
const STATUSES = [
  {k:'pendiente', l:'Pendiente', w:0}, {k:'aprendiendo', l:'Aprendiendo', w:1}, {k:'practicado', l:'Practicado', w:2},
  {k:'repaso', l:'Necesita repaso', w:1}, {k:'dominado', l:'Dominado', w:3}
];
const W = Object.fromEntries(STATUSES.map(s => [s.k, s.w]));
const SL = Object.fromEntries(STATUSES.map(s => [s.k, s.l]));
const INTERVAL = {aprendiendo:1, practicado:3, repaso:1, dominado:7};
const STORE = 'calculai:v1', OLD_STORE = 'cuaderno-web:v1';
const blankData = () => ({v:1, owner:'', subjects:[], events:[], topics:[], items:[], resources:[], news:[], sync:{}});
const blankProg = () => ({status:{}, attempts:[], errors:[], days:{}, sessions:[]});
function normData(d){ const b = blankData(); if (!d || typeof d !== 'object') return b; for (const k of Object.keys(b)) if (d[k] != null && typeof d[k] === typeof b[k]) b[k] = d[k]; return b; }
function normProg(p){ const b = blankProg(); if (!p || typeof p !== 'object') return b; for (const k of Object.keys(b)) if (p[k] != null && typeof p[k] === typeof b[k]) b[k] = p[k]; return b; }
let D = blankData(), P = blankProg(), storageOk = true;
try { const raw = localStorage.getItem(STORE) || localStorage.getItem(OLD_STORE); if (raw){ const j = JSON.parse(raw); D = normData(j.data); P = normProg(j.progress); } } catch { storageOk = false; }
let saveT = null;
function save(){ clearTimeout(saveT); saveT = setTimeout(() => {
  P.attempts = P.attempts.slice(-800); P.sessions = P.sessions.slice(-400); P.errors = P.errors.slice(-400);
  try { localStorage.setItem(STORE, JSON.stringify({data:D, progress:P, savedAt:new Date().toISOString()})); storageOk = true; } catch { storageOk = false; }
  syncBadge();
}, 300); }

const S = id => D.subjects.find(s => s.id === id) || {id, name:'(materia borrada)', short:'?', code:'', color:'gris', note:''};
const scs = sid => `--sc:var(--c-${S(sid).color || 'gris'})`;
const topic = id => D.topics.find(t => t.id === id);
const topicsOf = sid => D.topics.filter(t => t.subj === sid);
const exams = () => D.events.filter(e => e.date && (e.kind === 'prueba' || e.kind === 'control' || e.kind === 'examen')).sort((a, b) => a.date.localeCompare(b.date));
const lastEvalDate = () => { const e = exams(); return e.length ? parse(e.at(-1).date) : addDays(TODAY, 30); };

const st = id => P.status[id]?.s || 'pendiente';
function setStatus(id, s){ P.status[id] = {s, at:iso(TODAY)}; save(); }
function nextReview(id){ const e = P.status[id]; if (!e || !INTERVAL[e.s]) return null; return addDays(parse(e.at), INTERVAL[e.s]); }
const isDue = id => { const n = nextReview(id); return n && n <= TODAY; };
function evidence(tid){ const a = P.attempts.filter(x => D.items.find(i => i.id === x.item)?.topic === tid); const ok = a.filter(x => x.ok).length; return {n:a.length, ok, pct:a.length ? Math.round(100 * ok / a.length) : null}; }

/* =========================================================
   MOTOR «¿QUÉ HAGO AHORA?» — siempre explica por qué
   ========================================================= */
function nextExam(sid, from = TODAY){ return exams().filter(e => e.subj === sid && !(e.topics && e.topics.length) && parse(e.date) >= from)[0]; }
function examFor(t){ if (t.exam){ const e = exams().find(x => x.id === t.exam && parse(x.date) >= TODAY); if (e) return e; } return nextExam(t.subj); }
function score(t){
  const ex = examFor(t); if (!ex) return {u:0, why:[]};
  const d = Math.max(0, diffDays(TODAY, parse(ex.date)));
  const time = 1 / (1 + d / 4);
  const s = st(t.id);
  let gap = 1 - W[s] / 3; if (s === 'repaso') gap = .85;
  let u = time * gap * (SCOPE_W[t.scope] || 1) * ({1:1.15, 2:1, 3:.85}[t.prio] || 1);
  const why = [`${S(t.subj).short} · ${ex.name} es ${countdown(d)} (${fmtD(parse(ex.date))}).`];
  why.push(s === 'pendiente' ? 'Todavía está Pendiente.' : `Tu autoevaluación: ${SL[s]}.`);
  if (isDue(t.id)){ u += .25 * time; why.push('Le toca repaso según tu última autoevaluación.'); }
  if ((t.pre || []).some(p => W[st(p)] < 2)) u *= .7;
  const unlocks = D.topics.filter(x => (x.pre || []).includes(t.id));
  if (unlocks.length && W[s] < 2) why.push(`Es base de: ${unlocks.map(x => (x.code ? x.code + ' ' : '') + x.title).join(', ')}.`);
  if (t.scope && t.scope !== 'actual') why.push(`Ojo: ${SCOPE_LBL[t.scope].toLowerCase()}.`);
  const ev = evidence(t.id); if (ev.n && ev.pct < 60){ u += .15 * time; why.push(`En práctica llevas ${ev.pct}% de aciertos (${ev.n} intentos).`); }
  return {u, why, ex, d};
}
function ranked(){ return D.topics.map(t => ({t, ...score(t)})).filter(x => x.u > 0 && (st(x.t.id) !== 'dominado' || isDue(x.t.id))).sort((a, b) => b.u - a.u); }
function buildSession(t){
  const s = st(t.id), url = t.url || null;
  const lbl = (t.code ? t.code + ' · ' : '') + t.title;
  if (s === 'pendiente' || s === 'aprendiendo') return [
    {min:5, t:'Calentamiento sin mirar', d:'Escribe en papel lo que ya sabes (o crees saber) del tema. Sirve aunque sea poco.'},
    {min:25, t:'Clase', d:`Lee y rehace los ejemplos de ${lbl}.`, link:url, linkLbl:'Abrir material'},
    {min:15, t:'Práctica', d:'Ejercicios del más fácil al más difícil.', practice:t.id},
    {min:5, t:'Errores', d:'Anota cada error y por qué ocurrió.', go:'errores'},
    {min:5, t:'Autoevaluación', d:'Marca cómo quedó el tema. «Necesita repaso» también es avance.'}
  ];
  return [
    {min:5, t:'Recuperar de memoria', d:'Sin abrir nada: fórmulas, pasos y errores típicos del tema.'},
    {min:10, t:'Repaso rápido', d:'Solo lo que no recordaste.', link:url, linkLbl:'Abrir material'},
    {min:30, t:'Práctica mixta', d:'Ejercicios de este tema y de los anteriores.', practice:t.id},
    {min:10, t:'Errores', d:'Reintenta los errores pendientes de esta materia.', go:'errores'},
    {min:5, t:'Autoevaluación', d:'Actualiza el estado del tema.'}
  ];
}
function daySuggest(d){
  const ex = exams(), evs = ex.filter(e => e.date === iso(d));
  const next = D.subjects.map(s => { const e = ex.filter(x => x.subj === s.id && parse(x.date) > d)[0]; return e ? {s:s.id, e, n:diffDays(d, parse(e.date))} : null; }).filter(Boolean).sort((a, b) => a.n - b.n);
  const tips = [];
  evs.forEach(e => tips.push(`Día de ${S(e.subj).short} · ${e.name}${e.time ? ' (' + e.time + ')' : ''}. Antes: solo resumen de fórmulas y errores peligrosos.`));
  if (next[0]){
    if (next[0].n === 1) tips.push(`Víspera de ${S(next[0].s).short} · ${next[0].e.name}: ensayo o simulacro y repaso de errores. Nada nuevo.`);
    else tips.push(`Foco principal: ${S(next[0].s).short} (${next[0].e.name} en ${next[0].n} días).`);
  }
  if (next[1]) tips.push(`Bloque corto: ${S(next[1].s).short} (${next[1].e.name} en ${next[1].n} días).`);
  return {exams:evs, next, tips};
}

/* =========================================================
   NAVEGACIÓN
   ========================================================= */
const TABS = [{k:'ahora', l:'Ahora'}, {k:'mapa', l:'Mapa'}, {k:'practica', l:'Práctica'}, {k:'errores', l:'Errores'}, {k:'cal', l:'Calendario'}, {k:'biblio', l:'Biblioteca'}, {k:'editar', l:'Editar'}];
let tab = 'ahora', mapSubj = null, planPick = 0, pracFilter = 'todo', selDay = null;
try { const t = sessionStorage.getItem('calculai-tab'); if (t && TABS.some(x => x.k === t)) tab = t; } catch {}
function go(k){ tab = k; try { sessionStorage.setItem('calculai-tab', k); } catch {} render(); window.scrollTo({top:0}); }
function renderTabs(){
  const nav = $('#tabs'); nav.replaceChildren();
  if (!D.subjects.length) return;
  const openErr = P.errors.filter(e => !e.resolved).length;
  TABS.forEach(t => nav.append(h('button', {class:'tab', role:'tab', type:'button', 'aria-selected':String(tab === t.k), onclick:() => go(t.k)}, t.l,
    t.k === 'errores' && openErr ? h('span', {class:'count'}, openErr) : null)));
}
function render(){
  renderTabs();
  const v = $('#view'); v.replaceChildren();
  if (!D.subjects.length && tab !== 'webc'){ vWelcome(v); return; }
  if (tab === 'webc'){ vWebcReview(v); return; }
  ({ahora:vAhora, mapa:vMapa, practica:vPractica, errores:vErrores, cal:vCal, biblio:vBiblio, editar:vEditar})[tab](v);
}
const subjChip = s => h('span', {class:'chip subj-chip', style:scs(s)}, h('span', {class:'dot', style:'background:var(--sc)'}), S(s).short);
const scopeTag = sc => sc ? h('span', {class:`scope ${sc}`}, SCOPE_LBL[sc]) : null;
const extLink = (url, label, cls = 'btn ghost small') => url ? h('a', {class:cls, href:url, target:'_blank', rel:'noopener'}, label, ' ↗') : null;
const verBadge = e => h('span', {class:'ver ' + (e.ver ? 'ok' : 'no'), title:e.src || ''}, e.ver ? '✓ confirmada' : '⚠ sin confirmar');
const kindChip = e => h('span', {class:`kchip k-${e.kind}`}, (KIND[e.kind] || KIND.otro).i + ' ' + (KIND[e.kind] || KIND.otro).l);

/* ---------------- INICIO (sin datos) ---------------- */
function vWelcome(v){
  const file = h('input', {type:'file', accept:'.json,application/json', style:'display:none', onchange:e => importFile(e.target.files[0], true)});
  v.append(h('div', {class:'welcome'},
    h('p', {class:'note', style:'margin:0 0 6px'}, 'calculai · tu plan de estudio'),
    h('h1', null, 'Estudia con un plan, ', h('span', {class:'hl'}, 'no con culpa.')),
    h('p', {class:'muted', style:'font-size:1.05rem'}, 'Agrega tus materias, evaluaciones y temas. Calculai te dice qué estudiar en la próxima hora y por qué, te hace practicar con honestidad y te avisa lo que viene.'),
    h('div', {class:'choices'},
      h('button', {class:'choice', type:'button', onclick:startEmpty}, h('span', {class:'ico'}, '✎'), h('b', null, 'Empezar desde cero'), h('span', null, 'Creo mi primera materia y voy agregando lo demás.')),
      h('button', {class:'choice', type:'button', onclick:() => { D = makeExample(); P = blankProg(); save(); go('ahora'); toast('Cargué un ejemplo: edítalo o bórralo cuando quieras'); }}, h('span', {class:'ico'}, '◎'), h('b', null, 'Ver un ejemplo'), h('span', null, 'Tres materias de muestra para conocer la app. Después lo borras.')),
      h('button', {class:'choice', type:'button', onclick:openWebcHelp}, h('span', {class:'ico'}, '⟳'), h('b', null, 'Conectar con WebC'), h('span', null, 'Trae tus cursos, fechas, recursos y avisos desde WebC (o tu Moodle).')),
      h('button', {class:'choice', type:'button', onclick:() => file.click()}, h('span', {class:'ico'}, '⇪'), h('b', null, 'Abrir un archivo'), h('span', null, 'Un respaldo tuyo o una plantilla que te compartió alguien de tu curso.'))),
    file,
    h('div', {class:'feat'},
      h('div', null, h('b', null, '¿Qué hago ahora?'), 'Un plan de una hora según tus fechas y lo que te falta.'),
      h('div', null, h('b', null, 'Mapa de dominio'), 'Tus temas, sus prerrequisitos y tu estado en cada uno.'),
      h('div', null, h('b', null, 'Práctica honesta'), 'Antes de responder dices qué tan seguro o segura estás. Los «errores peligrosos» se marcan solos.'),
      h('div', null, h('b', null, 'Calendario'), 'Con fechas confirmadas o no, y exportable a Google Calendar.')),
    h('p', {class:'tiny muted', style:'margin-top:22px'}, 'Privacidad: todo se guarda solo en este dispositivo y navegador. Nada se envía a ningún servidor. Usa «Editar → Respaldo» para llevar tus datos a otro equipo.')));
}
function startEmpty(){
  D = blankData(); P = blankProg();
  openForm('Tu primera materia', subjectFields(), {color:'azul'}, vals => { D.subjects.push(subjectFrom(vals)); save(); go('editar'); toast('Listo. Ahora agrega evaluaciones y temas'); });
}

/* ---------------- AHORA ---------------- */
function vAhora(v){
  const hr = new Date().getHours();
  const saludo = hr < 12 ? 'Buenos días' : hr < 20 ? 'Buenas tardes' : 'Buenas noches';
  const upcoming = exams().filter(e => parse(e.date) >= TODAY && diffDays(TODAY, parse(e.date)) <= 31);
  const first = upcoming[0];
  v.append(h('div', {class:'hello'},
    h('div', null, h('h1', null, saludo + (D.owner ? ', ' + D.owner : '') + '. ', h('span', {class:'hl'}, '¿Qué hago ahora?')),
      D.sync && D.sync.webc ? h('p', {class:'tiny muted', style:'margin:2px 0 0'}, `WebC leído ${agoTxt(diffDays(parse(D.sync.webc.at.slice(0, 10)), TODAY))} · `, h('a', {href:'#', onclick:e => { e.preventDefault(); openWebcHelp(); }}, 'actualizar')) : null,
      h('p', null, first ? `Próximos 30 días: ${plural(upcoming.length, 'evaluación', 'evaluaciones')}. La más cercana: ${S(first.subj).short} · ${first.name}, ${countdown(diffDays(TODAY, parse(first.date)))}.` : 'No tienes evaluaciones en los próximos 30 días. Agrégalas en Editar.'))));

  if (upcoming.length){
    const end = addDays(parse(upcoming.at(-1).date), 1), span = Math.max(1, diffDays(TODAY, end));
    const track = h('div', {class:'track', 'aria-hidden':'true'}, h('div', {class:'track-line'}), h('div', {class:'track-today'}, h('span', null, 'hoy')));
    upcoming.forEach((e, i) => {
      const left = (diffDays(TODAY, parse(e.date)) / span) * 100;
      track.append(h('div', {class:`flag ${i % 2 ? 'up' : 'down'}`, style:`left:${left}%;${scs(e.subj)}`}, h('i'),
        h('span', {style:left < 12 ? 'left:-8px;text-align:left' : left > 88 ? 'right:-8px;text-align:right' : ''}, `${S(e.subj).short} ${e.name}`, h('br'), `${parse(e.date).getDate()} ${MESES[parse(e.date).getMonth()]}`)));
    });
    v.append(track);
  }
  const soon = D.events.filter(e => e.date && parse(e.date) >= TODAY && diffDays(TODAY, parse(e.date)) <= 3).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  if (soon.length) v.append(h('section', {class:'urgent'}, h('h3', null, `Próximas 72 horas · ${plural(soon.length, 'pendiente', 'pendientes')}`),
    h('div', {class:'evlist'}, soon.map(e => eventRow(e, true))),
    h('button', {class:'btn ghost small', type:'button', style:'margin-top:8px', onclick:() => go('cal')}, 'Ver calendario completo')));

  const grid = h('div', {class:'grid2'});
  const list = ranked();
  if (list.length){
    const pick = list[planPick % list.length], t = pick.t, steps = buildSession(t);
    const total = steps.reduce((a, s) => a + s.min, 0);
    grid.append(h('section', {class:'card plan', style:scs(t.subj)},
      h('div', {class:'plan-head'},
        h('div', {class:'kicker'}, `La próxima hora · ${total} min`),
        h('h3', null, t.title),
        h('div', {style:'display:flex;gap:6px;flex-wrap:wrap'}, subjChip(t.subj), t.code ? h('span', {class:'chip mono'}, t.code) : null, scopeTag(t.scope)),
        h('ul', {class:'why', 'aria-label':'Por qué este tema'}, pick.why.map(w => h('li', null, w)))),
      h('ol', {class:'steps'}, steps.map(s => h('li', null,
        h('span', {class:'min'}, s.min + "'"),
        h('div', null, h('div', {class:'st-t'}, s.t), h('div', {class:'st-d'}, s.d)),
        s.link ? extLink(s.link, s.linkLbl) : s.go ? h('button', {class:'btn ghost small', type:'button', onclick:() => go(s.go)}, 'Ver') : s.practice && D.items.some(i => i.topic === s.practice) ? h('button', {class:'btn ghost small', type:'button', onclick:() => { pracFilter = s.practice; Q = null; go('practica'); }}, 'Practicar') : h('span')))),
      h('div', {class:'plan-foot'},
        h('button', {class:'btn hlbtn', type:'button', onclick:() => startFocus(t, steps)}, '▶ Empezar sesión'),
        h('button', {class:'btn ghost', type:'button', onclick:() => { planPick++; render(); }}, 'Otra sugerencia'),
        h('span', {class:'tiny muted'}, `Sugerencia ${planPick % list.length + 1} de ${list.length}`))));
  } else {
    grid.append(h('section', {class:'card empty empty-cta'}, h('span', {class:'hand'}, 'Nada urgente por ahora'),
      D.topics.length ? 'Todo dominado o sin evaluaciones próximas. Revisa el calendario.' : 'Agrega temas a tus materias para que pueda armarte un plan.',
      h('button', {class:'btn small', type:'button', onclick:() => go('editar')}, 'Ir a Editar')));
  }
  grid.append(h('section', null,
    upcoming.length ? h('div', {class:'examlist'}, upcoming.slice(0, 6).map(e => {
      const d = diffDays(TODAY, parse(e.date));
      return h('div', {class:'exam', style:scs(e.subj)},
        h('div', {class:'dd'}, h('b', null, d), h('small', null, d === 1 ? 'día' : 'días')),
        h('div', null, h('h4', null, `${S(e.subj).name} · ${e.name}`),
          h('p', null, `${fmtD(parse(e.date))}${e.time ? ' · ' + e.time : e.slot ? ' · ' + e.slot : ''}`),
          h('p', null, verBadge(e), ' ', e.scopeNote ? h('span', {class:'scope noconf'}, e.scopeNote) : null)));
    })) : h('div', {class:'card empty'}, 'Sin evaluaciones en los próximos 30 días.'),
    h('p', {class:'note'}, '«Confirmada» significa que viste la fecha en una fuente oficial del curso. Lo demás aparece como «sin confirmar».')));
  v.append(grid);

  const due = D.topics.filter(t => isDue(t.id));
  v.append(h('div', {class:'sec-title'}, h('h2', null, 'Repasos que vencen'), h('span', {class:'hand'}, due.length ? `${due.length} hoy` : 'nada pendiente')));
  v.append(due.length ? h('div', {class:'duelist'}, due.map(t => h('button', {class:'chip subj-chip', type:'button', style:scs(t.subj) + ';cursor:pointer;min-height:36px', onclick:() => { mapSubj = t.subj; go('mapa'); setTimeout(() => openTopic(t.id), 50); }}, (t.code ? t.code + ' · ' : '') + t.title)))
    : h('p', {class:'muted'}, 'Cuando marques un tema, Calculai calcula cuándo repasarlo: Aprendiendo y Necesita repaso al día siguiente, Practicado a los 3 días, Dominado a los 7.'));

  if (upcoming.length){
    v.append(h('div', {class:'sec-title'}, h('h2', null, 'Preparación por evaluación'), h('span', {class:'hand'}, 'estimación propia, no predice tu nota')));
    v.append(h('div', {class:'readiness'}, upcoming.map(e => {
      const ts = e.topics && e.topics.length ? e.topics.map(topic).filter(Boolean) : topicsOf(e.subj).filter(t => !t.exam);
      if (!ts.length) return h('div', {class:'card ready', style:scs(e.subj)}, h('div', {style:'font-weight:700'}, `${S(e.subj).short} · ${e.name}`), h('p', {class:'tiny muted'}, 'Sin temas asociados todavía.'));
      let num = 0, den = 0; const counts = {};
      ts.forEach(t => { const s = st(t.id); counts[s] = (counts[s] || 0) + 1; const w = SCOPE_W[t.scope] || 1; num += W[s] / 3 * w; den += w; });
      const pct = Math.round(100 * num / den);
      return h('div', {class:'card ready', style:scs(e.subj)},
        h('div', {class:'ready-top'}, h('span', null, h('b', {style:'color:var(--sc)'}, pct + '%')), h('span', {class:'tiny muted'}, countdown(diffDays(TODAY, parse(e.date))))),
        h('div', {style:'font-weight:700'}, `${S(e.subj).short} · ${e.name}`),
        h('div', {class:'meter'}, STATUSES.map(s => counts[s.k] ? h('span', {style:`width:${100 * counts[s.k] / ts.length}%;background:var(--s-${s.k})`, title:`${s.l}: ${counts[s.k]}`}) : null)),
        h('div', {class:'tiny muted', style:'margin-top:6px'}, `${plural(ts.length, 'tema', 'temas')} · ${counts.dominado || 0} dominados · ${counts.pendiente || 0} pendientes`));
    })));
    v.append(h('div', {class:'legend'}, STATUSES.map(s => h('span', null, h('i', {class:'dot', style:`background:var(--s-${s.k})`}), s.l))));
  }
  const wk = addDays(TODAY, -6);
  const att = P.attempts.filter(a => parse(a.at) >= wk), okN = att.filter(a => a.ok).length;
  const mins = P.sessions.filter(s => parse(s.at) >= wk).reduce((a, s) => a + s.min, 0);
  v.append(h('div', {class:'sec-title'}, h('h2', null, 'Últimos 7 días')));
  v.append(h('div', {class:'stats'},
    h('div', {class:'card stat'}, h('b', null, mins), h('span', null, 'minutos en modo enfoque')),
    h('div', {class:'card stat'}, h('b', null, att.length), h('span', null, 'ejercicios respondidos')),
    h('div', {class:'card stat'}, h('b', null, att.length ? Math.round(100 * okN / att.length) + '%' : '—'), h('span', null, 'de aciertos')),
    h('div', {class:'card stat'}, h('b', null, P.errors.filter(e => !e.resolved).length), h('span', null, 'errores por resolver'))));
}

/* ---------------- MAPA ---------------- */
function depthOf(t, memo = {}, seen = new Set()){
  if (memo[t.id] != null) return memo[t.id]; if (seen.has(t.id)) return 0; seen.add(t.id);
  const pre = (t.pre || []).map(topic).filter(p => p && p.subj === t.subj);
  return memo[t.id] = pre.length ? 1 + Math.max(...pre.map(p => depthOf(p, memo, seen))) : 0;
}
let mapRO = null;
function vMapa(v){
  if (!mapSubj || !D.subjects.some(s => s.id === mapSubj)) mapSubj = D.subjects[0].id;
  v.append(h('div', {class:'subj-switch'}, D.subjects.map(s => h('button', {class:'seg', type:'button', style:scs(s.id), 'aria-pressed':String(mapSubj === s.id), onclick:() => { mapSubj = s.id; render(); }}, h('span', {class:'dot', style:'background:var(--sc)'}), s.name))));
  const S0 = S(mapSubj);
  v.append(h('p', {class:'muted', style:'margin:6px 0 0'}, [S0.code, S0.prof].filter(Boolean).join(' · ')));
  if (S0.note) v.append(h('p', {class:'note'}, S0.note));
  const ts = topicsOf(mapSubj);
  if (!ts.length){ v.append(h('div', {class:'card empty empty-cta', style:'margin-top:14px'}, 'Esta materia todavía no tiene temas.', h('button', {class:'btn small', type:'button', onclick:() => openTopicForm(null, mapSubj)}, '+ Agregar tema'))); return; }
  v.append(h('div', {class:'legend'}, STATUSES.map(s => h('span', null, h('i', {class:'dot', style:`background:var(--s-${s.k})`}), s.l)),
    h('span', null, h('span', {class:'scope noconf'}, 'rayado'), ' no confirmado'), h('span', null, h('span', {class:'scope hist'}, 'punteado'), ' histórico')));
  const memo = {}, rows = [];
  ts.forEach(t => { const d = depthOf(t, memo); (rows[d] = rows[d] || []).push(t); });
  const wrap = h('div', {class:'mapwrap', style:scs(mapSubj)});
  const svgEl = svg('svg', {class:'links'}); wrap.append(svgEl);
  rows.filter(Boolean).forEach(r => wrap.append(h('div', {class:'maprow'}, r.sort((a, b) => (a.code || a.title).localeCompare(b.code || b.title)).map(t => {
    const s = st(t.id);
    return h('button', {class:`node ${t.scope || ''}`, type:'button', 'data-id':t.id, style:`--stc:var(--s-${s})`, onclick:() => openTopic(t.id), 'aria-label':`${t.title}, ${SL[s]}`},
      isDue(t.id) ? h('span', {class:'due'}, 'repaso') : null,
      t.code ? h('span', {class:'code'}, t.code) : null, h('span', {class:'nt'}, t.title),
      h('span', {class:'ns'}, h('i', {class:'dot', style:`background:var(--s-${s})`}), SL[s]));
  }))));
  v.append(h('div', {class:'card', style:'margin-top:14px;padding:6px'}, wrap));
  v.append(h('div', {style:'display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px'}, h('button', {class:'btn ghost small', type:'button', onclick:() => openTopicForm(null, mapSubj)}, '+ Agregar tema'),
    h('span', {class:'tiny muted'}, 'Las flechas salen de los prerrequisitos que definas en cada tema.')));
  const draw = () => drawLinks(wrap, svgEl, ts);
  requestAnimationFrame(draw);
  if (mapRO) mapRO.disconnect(); mapRO = new ResizeObserver(draw); mapRO.observe(wrap);
}
function drawLinks(wrap, svgEl, ts){
  svgEl.replaceChildren(); const box = wrap.getBoundingClientRect();
  ts.forEach(t => (t.pre || []).forEach(pid => {
    const a = wrap.querySelector(`[data-id="${pid}"]`), b = wrap.querySelector(`[data-id="${t.id}"]`); if (!a || !b) return;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const x1 = ra.left + ra.width / 2 - box.left, y1 = ra.bottom - box.top, x2 = rb.left + rb.width / 2 - box.left, y2 = rb.top - box.top, my = (y1 + y2) / 2;
    svgEl.append(svg('path', {d:`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`, class:W[st(pid)] >= 2 ? 'ready' : ''}));
  }));
}
function openTopic(id){
  const t = topic(id); if (!t) return;
  const s = st(id), ev = evidence(id), nr = nextReview(id);
  document.querySelectorAll('.node.sel').forEach(n => n.classList.remove('sel'));
  document.querySelector(`.node[data-id="${id}"]`)?.classList.add('sel');
  openDrawer(h('div', {class:'drawer-head', style:scs(t.subj)},
      h('div', {style:'flex:1;min-width:0'}, h('div', {style:'display:flex;gap:6px;flex-wrap:wrap'}, subjChip(t.subj), t.code ? h('span', {class:'chip mono'}, t.code) : null, scopeTag(t.scope)), h('h3', null, t.title)),
      h('button', {class:'iconbtn', type:'button', 'aria-label':'Cerrar', onclick:closeDrawer}, '✕')),
    h('div', {class:'drawer-body'},
      t.url ? h('div', {class:'linkrow'}, extLink(t.url, 'Abrir material', 'btn small')) : h('p', {class:'tiny muted'}, 'Sin enlace de material. Puedes agregarlo editando el tema.'),
      h('h4', null, 'Tu autoevaluación'),
      h('div', {class:'statusbar'}, STATUSES.map(x => h('button', {class:'stbtn', type:'button', style:`--stc:var(--s-${x.k})`, 'aria-pressed':String(s === x.k), onclick:() => { setStatus(id, x.k); toast(`${t.title}: ${x.l}`); render(); openTopic(id); }}, h('i', {class:'dot', style:`background:var(--s-${x.k})`}), x.l))),
      h('p', {class:'tiny muted'}, P.status[id] ? `Marcado el ${fmtD(parse(P.status[id].at))}.` + (nr ? ` Próximo repaso: ${fmtD(nr)}.` : '') : 'Aún no lo marcas.'),
      h('h4', null, 'Evidencia de práctica (separada de tu autoevaluación)'),
      h('div', {class:'evid'}, h('div', {class:'card'}, h('b', null, ev.n), h('span', {class:'tiny muted'}, 'intentos')), h('div', {class:'card'}, h('b', null, ev.pct == null ? '—' : ev.pct + '%'), h('span', {class:'tiny muted'}, 'aciertos'))),
      ev.n && ev.pct < 60 && W[s] >= 2 ? h('p', {class:'note'}, 'Tu autoevaluación dice más que la práctica. ¿Lo pasamos a «Necesita repaso»?') : null,
      h('div', {style:'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px'},
        D.items.some(i => i.topic === id) ? h('button', {class:'btn ghost small', type:'button', onclick:() => { pracFilter = id; Q = null; closeDrawer(); go('practica'); }}, 'Practicar este tema') : null,
        h('button', {class:'btn ghost small', type:'button', onclick:() => openItemForm(null, id)}, '+ Ejercicio'),
        h('button', {class:'btn ghost small', type:'button', onclick:() => openTopicForm(id)}, 'Editar tema')),
      h('h4', null, 'Antes de este tema'),
      (t.pre || []).filter(topic).length ? h('div', {class:'duelist'}, t.pre.map(topic).filter(Boolean).map(pt => h('button', {class:'chip', type:'button', style:'cursor:pointer;min-height:34px', onclick:() => openTopic(pt.id)}, h('i', {class:'dot', style:`background:var(--s-${st(pt.id)})`}), (pt.code ? pt.code + ' ' : '') + pt.title))) : h('p', {class:'tiny muted'}, 'Sin prerrequisitos.')));
}

/* ---------------- PRÁCTICA ---------------- */
let Q = null;
function poolFor(f){ return D.items.filter(i => topic(i.topic) && (f === 'todo' ? true : D.subjects.some(s => s.id === f) ? topic(i.topic).subj === f : i.topic === f)); }
function pickItem(f, exclude){
  const all = poolFor(f); const pool = all.filter(i => i.id !== exclude); if (!pool.length) return all[0];
  const weight = i => { const a = P.attempts.filter(x => x.item === i.id); if (!a.length) return 3; return a.at(-1).ok ? .6 : 2.5; };
  const tot = pool.reduce((s, i) => s + weight(i), 0); let r = Math.random() * tot;
  for (const i of pool){ r -= weight(i); if (r <= 0) return i; } return pool[0];
}
function newQ(item){ Q = item ? {item, order:item.type === 'mc' ? item.opts.map((_, k) => k).sort(() => Math.random() - .5) : null, choice:null, conf:null, checked:false, ok:null, val:''} : null; }
function parseNum(s){ s = String(s).trim().replace(/\s/g, '').replace(',', '.'); const f = s.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/); if (f){ const b = +f[2]; return b ? +f[1] / b : null; } const n = Number(s); return Number.isFinite(n) && s !== '' ? n : null; }
const fmtNum = n => String(Math.round(n * 1e6) / 1e6).replace('.', ',');
function vPractica(v){
  const isTopic = pracFilter !== 'todo' && !D.subjects.some(s => s.id === pracFilter);
  if (isTopic && !topic(pracFilter)) pracFilter = 'todo';
  v.append(h('div', {class:'filterrow'},
    h('button', {class:'seg', type:'button', 'aria-pressed':String(pracFilter === 'todo'), onclick:() => { pracFilter = 'todo'; Q = null; render(); }}, 'Todo'),
    D.subjects.map(s => h('button', {class:'seg', type:'button', style:scs(s.id), 'aria-pressed':String(pracFilter === s.id), onclick:() => { pracFilter = s.id; Q = null; render(); }}, s.short)),
    isTopic && topic(pracFilter) ? h('button', {class:'seg', type:'button', 'aria-pressed':'true', onclick:() => { pracFilter = 'todo'; Q = null; render(); }}, topic(pracFilter).title + ' ✕') : null,
    h('button', {class:'btn ghost small', type:'button', onclick:() => openItemForm(null, isTopic ? pracFilter : null)}, '+ Crear ejercicio')));
  if (!poolFor(pracFilter).length){
    v.append(h('div', {class:'card empty empty-cta', style:'margin-top:18px'}, h('span', {class:'hand'}, 'Aún no hay ejercicios aquí'),
      'Crea tus propias preguntas (alternativas o numéricas) desde las guías o pruebas de tu curso. Puedes escribir fórmulas entre signos $, por ejemplo $\\int x\\,dx$.',
      h('button', {class:'btn small', type:'button', onclick:() => openItemForm(null, isTopic ? pracFilter : null)}, '+ Crear ejercicio')));
    return;
  }
  if (!Q || !poolFor(pracFilter).includes(Q.item)) newQ(pickItem(pracFilter));
  const it = Q.item, t = topic(it.topic);
  const grid = h('div', {class:'prac'});
  const card = h('section', {class:'card qcard', style:scs(t.subj)});
  card.append(h('div', {class:'qmeta'}, subjChip(t.subj), h('span', {class:'chip mono'}, (t.code ? t.code + ' · ' : '') + t.title), t.scope && t.scope !== 'actual' ? scopeTag(t.scope) : null));
  if (it.origin) card.append(h('div', {class:'origin'}, 'Origen: ' + it.origin));
  card.append(h('div', {class:'q'}, rich(it.q)));
  let btn;
  if (it.type === 'mc'){
    card.append(h('div', {class:'opts', role:'group', 'aria-label':'Alternativas'}, Q.order.map((k, idx) => {
      let cls = 'opt'; if (Q.checked){ if (k === it.ans) cls += ' right'; else if (k === Q.choice) cls += ' wrong'; }
      return h('button', {class:cls, type:'button', 'aria-pressed':String(Q.choice === k), disabled:Q.checked || null, onclick:() => { Q.choice = k; render(); }}, h('span', {class:'let'}, 'abcdefgh'[idx]), rich(it.opts[k]));
    })));
  } else {
    card.append(h('input', {class:'numin', inputmode:'decimal', placeholder:'Tu respuesta' + (it.unit ? ` (${it.unit})` : ''), value:Q.val, disabled:Q.checked || null, 'aria-label':'Respuesta numérica',
      oninput:e => { Q.val = e.target.value; btn.disabled = !(Q.val.trim() && Q.conf); }, onkeydown:e => { if (e.key === 'Enter' && !btn.disabled) check(); }}));
  }
  if (!Q.checked) card.append(h('div', {class:'conf'}, h('p', null, 'Antes de comprobar: ¿qué tan segura o seguro estás?'),
    h('div', {class:'confrow'}, [['seguro','Seguro'],['medio','Más o menos'],['adivino','Adivinando']].map(([k, l]) => h('button', {class:'seg', type:'button', 'aria-pressed':String(Q.conf === k), onclick:() => { Q.conf = k; render(); }}, l)))));
  const ready = Q.conf && (it.type === 'mc' ? Q.choice != null : Q.val.trim());
  btn = h('button', {class:'btn', type:'button', disabled:!ready || null, onclick:check}, 'Comprobar');
  if (!Q.checked) card.append(h('div', {style:'margin-top:14px'}, btn));
  if (Q.checked){
    const dang = !Q.ok && Q.conf === 'seguro';
    card.append(h('div', {class:'feedback ' + (Q.ok ? 'ok' : 'bad')},
      h('b', null, Q.ok ? (Q.conf === 'adivino' ? 'Correcto… pero adivinaste: cuenta como no sabido.' : 'Correcto.') : dang ? 'Incorrecto, y estabas seguro: error peligroso.' : 'Incorrecto.'),
      it.type === 'num' && !Q.ok ? h('div', null, 'Respuesta: ', h('span', {class:'mono'}, fmtNum(it.ans) + (it.unit ? ' ' + it.unit : ''))) : null,
      it.ex ? h('div', null, rich(it.ex)) : null,
      !(Q.ok && Q.conf !== 'adivino') ? h('div', {class:'tiny', style:'margin-top:6px'}, 'Quedó en tu banco de errores.') : null));
    card.append(h('div', {style:'margin-top:14px;display:flex;gap:8px;flex-wrap:wrap'},
      h('button', {class:'btn', type:'button', onclick:() => { newQ(pickItem(pracFilter, it.id)); render(); }}, 'Siguiente →'),
      extLink(t.url, 'Ver material'),
      h('button', {class:'btn ghost small', type:'button', onclick:() => openItemForm(it.id)}, 'Editar ejercicio')));
  }
  grid.append(card);
  const A = P.attempts;
  grid.append(h('section', null,
    h('div', {class:'card'},
      h('h3', {class:'display', style:'margin:0 0 4px;font-size:1.1rem'}, 'Calibración'),
      h('p', {class:'tiny muted', style:'margin:0 0 12px'}, 'Compara lo seguro que te sientes con lo que realmente aciertas. Saber qué no sabes también es estudiar bien.'),
      h('div', {class:'calib'}, [['seguro','Seguro'],['medio','Más o menos'],['adivino','Adivinando']].map(([k, l]) => {
        const a = A.filter(x => x.conf === k), p = a.length ? Math.round(100 * a.filter(x => x.ok).length / a.length) : null;
        return h('div', {class:'calrow'}, h('span', null, l), h('div', {class:'calbar'}, h('span', {style:`width:${p || 0}%`})), h('span', {class:'mono tiny'}, p == null ? '—' : p + '%'));
      })), calibMsg(A)),
    h('div', {class:'card', style:'margin-top:12px'},
      h('h3', {class:'display', style:'margin:0 0 6px;font-size:1.1rem'}, 'Cómo funciona'),
      h('ul', {class:'tiny', style:'margin:0;padding-left:18px;color:var(--ink-2)'},
        h('li', null, 'Primero eliges tu confianza y después compruebas.'),
        h('li', null, 'Los ejercicios que fallaste vuelven más seguido.'),
        h('li', null, 'Cada ejercicio puede decir su origen (guía, prueba anterior, creado por ti).'),
        h('li', null, `Tienes ${plural(D.items.length, 'ejercicio', 'ejercicios')} en total.`)))));
  v.append(grid);
  function check(){
    let ok;
    if (it.type === 'mc') ok = Q.choice === it.ans;
    else { const n = parseNum(Q.val); const tol = it.tol != null ? it.tol : .01; ok = n != null && Math.abs(n - it.ans) <= tol * Math.max(1, Math.abs(it.ans)); }
    Q.checked = true; Q.ok = ok;
    const effOk = ok && Q.conf !== 'adivino', yours = it.type === 'mc' ? it.opts[Q.choice] : Q.val;
    P.attempts.push({item:it.id, ok, conf:Q.conf, at:iso(TODAY)});
    if (!effOk){
      const ex = P.errors.find(e => e.item === it.id && !e.resolved);
      if (ex){ ex.yours = yours; ex.conf = Q.conf; ex.at = iso(TODAY); ex.times = (ex.times || 1) + 1; }
      else P.errors.push({id:uid('e'), item:it.id, yours, conf:Q.conf, at:iso(TODAY), cause:'', note:'', resolved:false, times:1});
    } else P.errors.filter(e => e.item === it.id && !e.resolved).forEach(e => { e.resolved = true; e.resolvedAt = iso(TODAY); });
    save(); render();
  }
}
function calibMsg(A){
  const s = A.filter(x => x.conf === 'seguro'); if (s.length < 4) return h('p', {class:'tiny muted', style:'margin:12px 0 0'}, 'Responde unos cuantos más para ver tu patrón.');
  const p = s.filter(x => x.ok).length / s.length;
  return h('p', {class:'note', style:'margin-top:12px'}, p < .8 ? `Cuando te sientes seguro aciertas ${Math.round(p * 100)}%. Revisa primero los «errores peligrosos».` : 'Tu seguridad es confiable. Usa «Más o menos» para decidir qué repasar.');
}

/* ---------------- ERRORES ---------------- */
const CAUSES = [['','¿Por qué fallé?'],['concepto','No entendía el concepto'],['procedimiento','Elegí mal el procedimiento'],['algebra','Error de álgebra o aritmética'],['lectura','Leí mal el enunciado'],['descuido','Descuido (signo, unidad)']];
let errFilter = 'abiertos';
function vErrores(v){
  v.append(h('div', {class:'sec-title'}, h('h2', null, 'Banco de errores'), h('span', {class:'hand'}, 'cada error es un ejercicio gratis')));
  v.append(h('div', {class:'filterrow', style:'margin-top:0'}, [['abiertos','Por resolver'],['peligrosos','Peligrosos'],['resueltos','Resueltos']].map(([k, l]) => h('button', {class:'seg', type:'button', 'aria-pressed':String(errFilter === k), onclick:() => { errFilter = k; render(); }}, l))));
  const E = P.errors.filter(e => D.items.some(i => i.id === e.item));
  const list = E.filter(e => errFilter === 'resueltos' ? e.resolved : errFilter === 'peligrosos' ? !e.resolved && e.conf === 'seguro' : !e.resolved).slice().reverse();
  const byCause = {}; E.filter(e => e.cause).forEach(e => byCause[e.cause] = (byCause[e.cause] || 0) + 1);
  const top = Object.entries(byCause).sort((a, b) => b[1] - a[1])[0];
  if (top) v.append(h('p', {class:'note'}, `Tu causa más frecuente: ${CAUSES.find(c => c[0] === top[0])[1].toLowerCase()} (${top[1]}).`));
  if (!list.length) v.append(h('div', {class:'card empty'}, h('span', {class:'hand'}, errFilter === 'resueltos' ? 'Aún nada resuelto' : 'Sin errores aquí'), 'Los errores de la práctica llegan solos. Se resuelven cuando vuelves a acertar el ejercicio sin adivinar.'));
  const wrap = h('div', {class:'errs'});
  list.forEach(e => {
    const it = D.items.find(i => i.id === e.item), t = topic(it.topic); if (!t) return;
    const right = it.type === 'mc' ? it.opts[it.ans] : fmtNum(it.ans) + (it.unit ? ' ' + it.unit : '');
    wrap.append(h('article', {class:`card err ${e.resolved ? 'done' : ''}`, style:scs(t.subj)},
      h('div', {class:'err-top'}, subjChip(t.subj), h('span', {class:'chip mono'}, t.code || t.title), e.conf === 'seguro' && !e.resolved ? h('span', {class:'chip danger'}, 'peligroso') : null, e.times > 1 ? h('span', {class:'chip'}, `×${e.times}`) : null, h('span', {class:'tiny muted'}, fmtD(parse(e.at)))),
      h('div', null, rich(it.q)),
      h('dl', {class:'ans'}, h('dt', null, 'Tu respuesta'), h('dd', null, rich(e.yours || '—')), h('dt', null, 'Correcta'), h('dd', null, rich(right))),
      e.resolved ? h('p', {class:'tiny muted'}, 'Resuelto el ' + fmtD(parse(e.resolvedAt || e.at))) :
      h('div', {class:'err-tools'},
        h('select', {'aria-label':'Causa del error', onchange:ev => { e.cause = ev.target.value; save(); }}, CAUSES.map(([k, l]) => { const o = h('option', {value:k}, l); if (e.cause === k) o.selected = true; return o; })),
        h('input', {placeholder:'Qué haré distinto la próxima vez', value:e.note || '', 'aria-label':'Nota', onchange:ev => { e.note = ev.target.value; save(); }}),
        h('button', {class:'btn small', type:'button', onclick:() => { pracFilter = it.topic; newQ(it); go('practica'); }}, 'Reintentar'))));
  });
  v.append(wrap);
}

/* ---------------- CALENDARIO ---------------- */
let calView = (window.innerWidth < 640 ? 'agenda' : 'mes'), calMonth = null, calOff = {};
const evOn = e => !calOff[e.subj];
const evWhen = e => e.time || e.slot || 'Todo el día';
function eventsOn(k){ return D.events.filter(e => e.date === k && evOn(e)); }
function whenTxt(e){ const d = diffDays(TODAY, parse(e.date)); return (d === 0 ? 'hoy' : d === 1 ? 'mañana' : d < 0 ? `hace ${-d} días` : `en ${d} días`) + (e.time ? ' · ' + e.time : e.slot ? ' · ' + e.slot.toLowerCase() : ''); }
function eventRow(e, compact){
  return h('div', {class:`evrow ${parse(e.date) < TODAY ? 'past' : ''}`, style:scs(e.subj)},
    h('div', {class:'evdate'}, h('b', null, parse(e.date).getDate()), h('small', null, DIAS[parse(e.date).getDay()].slice(0, 3) + ' ' + MESES[parse(e.date).getMonth()])),
    h('div', {style:'min-width:0'},
      h('div', {class:'evtop'}, kindChip(e), subjChip(e.subj), verBadge(e)),
      h('div', {class:'evname'}, `${S(e.subj).short} · ${e.name}`),
      h('div', {class:'tiny muted'}, whenTxt(e)),
      !compact && e.src ? h('div', {class:'tiny', style:'color:var(--ink-3);margin-top:2px'}, 'Fuente: ' + e.src) : null,
      e.note ? h('div', {class:'tiny note', style:'margin:4px 0 0'}, e.note) : null,
      compact ? null : h('button', {class:'btn ghost small', type:'button', style:'margin-top:6px', onclick:() => openEventForm(e.id)}, 'Editar')));
}
function vCal(v){
  v.append(h('div', {class:'sec-title'}, h('h2', null, 'Calendario'), h('span', {class:'hand'}, '✓ = fecha confirmada en una fuente oficial')));
  v.append(h('div', {class:'calbar-top'},
    h('div', {class:'viewsw', role:'group', 'aria-label':'Vista'}, [['mes','Mes'],['agenda','Agenda']].map(([k, l]) => h('button', {class:'seg', type:'button', 'aria-pressed':String(calView === k), onclick:() => { calView = k; render(); }}, l))),
    h('div', {class:'filters', role:'group', 'aria-label':'Materias'}, D.subjects.map(s => h('button', {class:'seg', type:'button', style:scs(s.id), 'aria-pressed':String(!calOff[s.id]), onclick:() => { calOff[s.id] = !calOff[s.id]; render(); }}, h('span', {class:'dot', style:'background:var(--sc)'}), s.short))),
    h('div', {style:'display:flex;gap:6px;flex-wrap:wrap'},
      h('button', {class:'btn ghost small', type:'button', onclick:() => openEventForm(null)}, '+ Evento'),
      h('button', {class:'btn small', type:'button', onclick:exportICS}, '⇩ Calendario (.ics)'),
      h('button', {class:'btn ghost small', type:'button', onclick:exportCSV, title:'Formato CSV de Google Calendar'}, 'CSV'))));
  v.append(h('div', {class:'legend', style:'margin:8px 0 0'}, Object.entries(KIND).filter(([k]) => k !== 'otro').map(([k, o]) => h('span', null, h('span', {class:`kchip k-${k}`}, o.i + ' ' + o.l))),
    h('span', null, h('span', {class:'ver ok'}, '✓'), ' confirmada'), h('span', null, h('span', {class:'ver no'}, '⚠'), ' sin confirmar')));
  if (calView === 'mes') vMonth(v); else vAgenda(v);
  const und = D.events.filter(e => !e.date && evOn(e));
  if (und.length) v.append(h('div', {class:'card', style:'margin-top:14px'}, h('b', null, 'Sin fecha todavía'), und.map(e => h('div', {class:'tiny', style:'margin-top:6px'}, kindChip(e), ' ', `${S(e.subj).short} · ${e.name}${e.note ? ' — ' + e.note : ''}`))));
  v.append(h('p', {class:'note'}, 'El archivo .ics se importa en Google Calendar, Apple Calendar u Outlook. Las barras de color de cada día sugieren en qué materia enfocarte.'));
}
function vMonth(v){
  if (!calMonth) calMonth = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  v.append(h('div', {class:'monthnav'},
    h('button', {class:'iconbtn', type:'button', 'aria-label':'Mes anterior', onclick:() => { calMonth = new Date(y, m - 1, 1); render(); }}, '‹'),
    h('h3', {class:'display', style:'margin:0;font-size:1.25rem'}, `${cap(MES_L[m])} ${y}`),
    h('button', {class:'iconbtn', type:'button', 'aria-label':'Mes siguiente', onclick:() => { calMonth = new Date(y, m + 1, 1); render(); }}, '›'),
    h('button', {class:'btn ghost small', type:'button', onclick:() => { calMonth = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1); selDay = iso(TODAY); render(); }}, 'Hoy')));
  const first = new Date(y, m, 1), start = addDays(first, -((first.getDay() + 6) % 7));
  const lastDay = new Date(y, m + 1, 0), end = addDays(lastDay, 6 - ((lastDay.getDay() + 6) % 7));
  const lastEval = lastEvalDate();
  const g = h('div', {class:'mgrid'}, ['lun','mar','mié','jue','vie','sáb','dom'].map(x => h('div', {class:'dow'}, x)));
  if (!selDay) selDay = iso(TODAY);
  for (let d = new Date(start); d <= end; d = addDays(d, 1)){
    const k = iso(d), out = d.getMonth() !== m, past = d < TODAY, evs = eventsOn(k), sug = daySuggest(d);
    const bar = (!past && d <= lastEval) ? sug.next.filter(b => !calOff[b.s]).slice(0, 2) : [];
    g.append(h('button', {class:`mday ${out ? 'out' : ''} ${past ? 'past' : ''} ${k === iso(TODAY) ? 'today' : ''} ${selDay === k ? 'sel' : ''}`, type:'button',
        'aria-label':`${fmtD(d)}${evs.length ? ', ' + evs.length + ' evento(s)' : ''}`, onclick:() => { selDay = k; render(); }},
      h('span', {class:'mnum'}, d.getDate()),
      P.days[k] ? h('span', {class:'tick', 'aria-label':'hecho'}, '✓') : null,
      h('span', {class:'mevs'}, evs.map(e => h('span', {class:`mev k-${e.kind} ${e.ver ? '' : 'unver'}`, style:scs(e.subj), title:`${S(e.subj).short} · ${e.name} · ${evWhen(e)}`},
        h('span', {class:'mev-t'}, `${(KIND[e.kind] || KIND.otro).i} ${e.time ? e.time.slice(0, 5) + ' ' : ''}${S(e.subj).short} ${e.name}`)))),
      bar.length ? h('span', {class:'focusbar', title:'Foco sugerido'}, bar.map((b, i) => h('span', {style:`width:${i ? 35 : 65}%;background:var(--c-${S(b.s).color})`}))) : null));
  }
  v.append(h('div', {class:'card', style:'padding:10px;margin-top:10px'}, g));
  dayDetail(v);
}
function dayDetail(v){
  const sd = parse(selDay), evs = eventsOn(selDay), sug = daySuggest(sd), lastEval = lastEvalDate();
  v.append(h('section', {class:'card daydetail'},
    h('h3', {class:'display', style:'margin:0 0 8px;font-size:1.2rem'}, cap(fmtD(sd))),
    evs.length ? h('div', {class:'evlist'}, evs.map(e => eventRow(e))) : h('p', {class:'muted tiny', style:'margin:0 0 8px'}, 'Sin evaluaciones ni entregas este día.'),
    sd >= TODAY && sd <= lastEval && sug.tips.length ? h('div', null, h('b', {class:'tiny', style:'text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3)'}, 'Foco de estudio sugerido'),
      h('ul', {style:'margin:4px 0 12px;padding-left:18px'}, sug.tips.map(x => h('li', null, x)))) : null,
    h('div', {style:'display:flex;gap:12px;flex-wrap:wrap;align-items:center'},
      sd >= TODAY ? h('label', {class:'chk'}, h('input', {type:'checkbox', checked:P.days[selDay] || null, onchange:e => { if (e.target.checked) P.days[selDay] = true; else delete P.days[selDay]; save(); render(); }}), 'Cumplí el plan de este día') : null,
      h('button', {class:'btn ghost small', type:'button', onclick:() => openEventForm(null, selDay)}, '+ Evento este día'))));
}
function vAgenda(v){
  const from = addDays(TODAY, -((TODAY.getDay() + 6) % 7));
  const evs = D.events.filter(e => e.date && evOn(e) && parse(e.date) >= from).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  if (!evs.length){ v.append(h('div', {class:'card empty empty-cta', style:'margin-top:14px'}, 'No hay eventos próximos.', h('button', {class:'btn small', type:'button', onclick:() => openEventForm(null)}, '+ Agregar evento'))); return; }
  let wk = null, box = null; const wrap = h('div', {class:'agenda'});
  evs.forEach(e => {
    const d = parse(e.date), ws = iso(addDays(d, -((d.getDay() + 6) % 7)));
    if (ws !== wk){ wk = ws; const wd = parse(ws), rel = diffDays(from, wd) / 7;
      box = h('div', {class:'agweek'}, h('div', {class:'agwh'}, rel === 0 ? 'Esta semana' : rel === 1 ? 'Próxima semana' : `Semana del ${wd.getDate()} de ${MES_L[wd.getMonth()]}`)); wrap.append(box); }
    box.append(eventRow(e));
  });
  v.append(wrap);
}
/* Exportación */
function download(filename, text, type){
  const blob = new Blob([text], {type}); const url = URL.createObjectURL(blob);
  const a = h('a', {href:url, download:filename, style:'display:none'}); document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
}
function evTimes(e){
  const t = (e.time || '').match(/\d{1,2}:\d{2}/g); if (!t) return null;
  const toMin = s => { const [H, M] = s.split(':').map(Number); return H * 60 + M; };
  let s = toMin(t[0]), en = t[1] ? toMin(t[1]) : null;
  if (en == null){ if (e.kind === 'entrega'){ en = s; s = s - 30; } else en = s + 90; }
  return {s, en};
}
const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
function icsFold(line){ const out = []; let l = line; while (l.length > 74){ out.push(l.slice(0, 74)); l = ' ' + l.slice(74); } out.push(l); return out.join('\r\n'); }
function evDesc(e){ return `${(KIND[e.kind] || KIND.otro).l} · ${S(e.subj).name}${S(e.subj).code ? ' (' + S(e.subj).code + ')' : ''}. ${e.ver ? 'Fecha confirmada' : 'Fecha SIN confirmar'}${e.src ? ' — ' + e.src : ''}.${e.slot ? ' Horario: ' + e.slot + '.' : ''}${e.note ? ' ' + e.note : ''}`; }
function exportICS(){
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ymd = s => s.replace(/-/g, '');
  const hm = m => pad(Math.floor(m / 60)) + pad(m % 60) + '00';
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Calculai//Estudio//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Calculai — evaluaciones'];
  D.events.filter(e => e.date && evOn(e)).forEach(e => {
    L.push('BEGIN:VEVENT', `UID:${e.id}@calculai`, `DTSTAMP:${stamp}`);
    const tt = evTimes(e);
    if (tt){ L.push(`DTSTART:${ymd(e.date)}T${hm(tt.s)}`, `DTEND:${ymd(e.date)}T${hm(tt.en)}`); }
    else { L.push(`DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${ymd(iso(addDays(parse(e.date), 1)))}`); }
    L.push(icsFold(`SUMMARY:${icsEsc(`[${S(e.subj).short}] ${e.name}`)}`), icsFold(`DESCRIPTION:${icsEsc(evDesc(e))}`));
    if (['prueba', 'control', 'examen', 'entrega', 'proyecto'].includes(e.kind)) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(e.name)}`, 'TRIGGER:-P1D', 'END:VALARM');
    L.push('END:VEVENT');
  });
  L.push('END:VCALENDAR');
  download('calculai-evaluaciones.ics', L.join('\r\n') + '\r\n', 'text/calendar');
  toast('Descargado. En Google Calendar: Configuración → Importar');
}
function exportCSV(){
  const cell = s => { s = String(s ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const ampm = m => { let H = Math.floor(m / 60), M = m % 60; const ap = H >= 12 ? 'PM' : 'AM'; H = H % 12 || 12; return `${H}:${pad(M)} ${ap}`; };
  const rows = [['Subject','Start Date','Start Time','End Date','End Time','All Day Event','Description','Location','Private']];
  D.events.filter(e => e.date && evOn(e)).forEach(e => {
    const [Y, Mo, Dd] = e.date.split('-'), date = `${Mo}/${Dd}/${Y}`, tt = evTimes(e);
    rows.push([`[${S(e.subj).short}] ${e.name}`, date, tt ? ampm(tt.s) : '', date, tt ? ampm(tt.en) : '', tt ? 'False' : 'True', evDesc(e), '', 'True']);
  });
  download('calculai-evaluaciones.csv', rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n', 'text/csv');
  toast('CSV descargado');
}

/* ---------------- BIBLIOTECA ---------------- */
const LIBRARY = [
  {area:'Cálculo', t:'Active Calculus — Single Variable (2.ª ed.)', lic:'CC BY-SA 4.0', ai:'ok', n:'Inglés; versión en español «Cálculo activo» en LibreTexts.', u:'https://activecalculus.org/'},
  {area:'Cálculo', t:'CLP-1 y CLP-2 (UBC) + libros de problemas', lic:'CC BY-NC-SA 4.0', ai:'ok', n:'Pistas, respuestas y soluciones completas.', u:'https://personal.math.ubc.ca/~CLP/'},
  {area:'Cálculo', t:'APEX Calculus', lic:'CC BY-NC 4.0', ai:'ok', n:'Respuestas a ejercicios impares.', u:'https://opentext.uleth.ca/calculus.html'},
  {area:'Cálculo', t:'Strang, Calculus (MIT OCW)', lic:'CC BY-NC-SA 4.0', ai:'cond', n:'Material de MIT OpenCourseWare.', u:'https://ocw.mit.edu/'},
  {area:'Álgebra lineal', t:'Elementos de álgebra lineal para ingenieros (UPM, 2025)', lic:'CC BY 4.0', ai:'ok', n:'Escrito en español.', u:'https://oa.upm.es/90391/'},
  {area:'Álgebra lineal', t:'Kuttler, A First Course in Linear Algebra (Lyryx)', lic:'CC BY 4.0', ai:'ok', n:'Versión en español en LibreTexts.', u:'https://lyryx.com/first-course-linear-algebra/'},
  {area:'Álgebra lineal', t:'Nicholson, Linear Algebra with Applications (Lyryx)', lic:'CC BY-NC-SA 4.0', ai:'ok', n:'Cobertura amplia; incluye cadenas de Markov (§2.9).', u:'https://lyryx.com/linear-algebra-applications/'},
  {area:'Álgebra lineal', t:'Interactive Linear Algebra (Georgia Tech)', lic:'GFDL 1.2+', ai:'ok', n:'Versión en español en LibreTexts.', u:'https://textbooks.math.gatech.edu/ila/'},
  {area:'Física', t:'Crowell, Light and Matter', lic:'CC BY-SA 3.0', ai:'ok', n:'Serie completa de física introductoria.', u:'https://www.lightandmatter.com/'},
  {area:'Física', t:'MIT OCW 8.01SC Classical Mechanics', lic:'CC BY-NC-SA 4.0', ai:'cond', n:'Videos y notas por semana (Dourmashkin).', u:'https://ocw.mit.edu/courses/8-01sc-classical-mechanics-fall-2016/'}
];
function vBiblio(v){
  const news = (D.news || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (news.length){
    v.append(h('div', {class:'sec-title'}, h('h2', null, 'Avisos de WebC'), h('span', {class:'hand'}, D.sync && D.sync.webc ? 'leídos el ' + fmtD(parse(D.sync.webc.at.slice(0, 10))) : '')));
    v.append(h('div', {class:'newslist'}, news.slice(0, 30).map(n => h('details', {class:'news', style:scs(n.subj)}, h('summary', null, subjChip(n.subj), h('b', null, n.title), h('small', {class:'muted'}, [n.author, n.date ? fmtD(parse(n.date)) : ''].filter(Boolean).join(' · '))),
      h('div', {class:'newsbody'}, n.text), n.url ? h('a', {class:'tiny', href:n.url, target:'_blank', rel:'noopener'}, 'Ver en WebC ↗') : null))));
  }
  v.append(h('div', {class:'sec-title'}, h('h2', null, 'Tu material'), h('span', {class:'hand'}, 'lo del curso manda')));
  D.subjects.forEach(s => {
    const ts = topicsOf(s.id).filter(t => t.url), rs = D.resources.filter(r => r.subj === s.id);
    v.append(h('h3', {class:'display', style:'margin:18px 0 0;font-size:1rem;color:var(--ink-2)'}, s.name));
    if (!ts.length && !rs.length){ v.append(h('p', {class:'tiny muted'}, 'Sin enlaces todavía. Agrega el enlace del material en cada tema, o recursos en Editar.')); return; }
    v.append(h('div', {class:'mine'},
      ts.sort((a, b) => (a.code || a.title).localeCompare(b.code || b.title)).map(t => h('a', {class:'res', style:scs(s.id), href:t.url, target:'_blank', rel:'noopener'}, h('i', {class:'dot', style:`background:var(--s-${st(t.id)})`}), h('span', null, h('b', null, (t.code ? t.code + ' · ' : '') + t.title), h('small', null, SCOPE_LBL[t.scope] || 'Tema')))),
      rs.map(r => h('a', {class:'res', style:scs(s.id), href:r.url || '#', target:'_blank', rel:'noopener'}, h('span', {style:'font-size:1.1rem'}, '◆'), h('span', null, h('b', null, r.title), h('small', null, r.kind || 'Recurso'))))));
  });
  v.append(h('div', {class:'sec-title'}, h('h2', null, 'Libros abiertos para complementar'), h('span', {class:'hand'}, 'gratis y con licencia abierta')));
  v.append(h('p', {class:'muted tiny'}, 'Licencias revisadas en octubre de 2026. «IA» indica si la fuente oficial pone restricciones a usarlos con inteligencia artificial.'));
  const AI = {ok:['IA: sin restricción','ai-ok'], cond:['IA: con condiciones','ai-cond'], no:['IA: prohibida','ai-no']};
  [...new Set(LIBRARY.map(b => b.area))].forEach(a => {
    v.append(h('h3', {class:'display', style:'margin:18px 0 0;font-size:1rem;color:var(--ink-2)'}, a));
    v.append(h('div', {class:'lib'}, LIBRARY.filter(b => b.area === a).map(b => h('article', {class:'card book'},
      h('h4', null, b.t), h('div', {class:'lic'}, h('span', {class:'chip mono'}, b.lic), h('span', {class:'chip ' + AI[b.ai][1]}, AI[b.ai][0])),
      h('p', {class:'tiny muted', style:'margin:0'}, b.n), h('a', {class:'tiny', href:b.u, target:'_blank', rel:'noopener'}, b.u.replace(/^https?:\/\//, '').replace(/\/$/, '') + ' ↗')))));
  });
  v.append(h('div', {class:'card warn', style:'margin-top:16px'}, h('b', null, 'OpenStax: '), 'gratis para leer, pero sus prefacios actuales prohíben usarlo con IA generativa sin permiso escrito.'));
}

/* =========================================================
   EDITAR: materias, evaluaciones, temas, ejercicios, recursos
   ========================================================= */
function openDrawer(...kids){ const d = $('#drawer'); d.replaceChildren(...kids); d.classList.add('open'); d.setAttribute('aria-hidden', 'false'); $('#scrim').classList.add('on'); setTimeout(() => d.querySelector('input,select,textarea,button')?.focus(), 60); }
function closeDrawer(){ const d = $('#drawer'); d.classList.remove('open', 'wide'); d.setAttribute('aria-hidden', 'true'); $('#scrim').classList.remove('on'); document.querySelectorAll('.node.sel').forEach(n => n.classList.remove('sel')); }
/* Formulario genérico */
function openForm(title, fields, init, onSave, onDelete){
  const vals = {...init};
  const form = h('form', {class:'form', onsubmit:e => { e.preventDefault();
    for (const f of fields) if (f.required && !String(vals[f.k] ?? '').trim()){ toast(`Falta: ${f.label}`); return; }
    try { onSave(vals); } catch { return; } closeDrawer(); render(); }});
  fields.forEach(f => {
    if (f.show && !f.show(vals)) return;
    let input;
    if (f.type === 'textarea') input = h('textarea', {value:vals[f.k] ?? '', placeholder:f.ph || '', oninput:e => vals[f.k] = e.target.value});
    else if (f.type === 'select') { input = h('select', {onchange:e => { vals[f.k] = e.target.value; if (f.rerender) redraw(); }}, (typeof f.options === 'function' ? f.options(vals) : f.options).map(([k, l]) => { const o = h('option', {value:k}, l); if (String(vals[f.k] ?? '') === String(k)) o.selected = true; return o; })); if (vals[f.k] == null && input.options.length) vals[f.k] = input.value; }
    else if (f.type === 'checkbox') return form.append(h('label', {class:'chk'}, h('input', {type:'checkbox', checked:vals[f.k] || null, onchange:e => vals[f.k] = e.target.checked}), f.label, f.help ? h('small', {class:'tiny muted', style:'font-weight:400'}, ' — ' + f.help) : null));
    else if (f.type === 'color') input = h('div', {class:'swatches', role:'group', 'aria-label':f.label}, COLORS.map(c => h('button', {class:'sw', type:'button', style:`--sc:var(--c-${c})`, 'aria-label':c, 'aria-pressed':String(vals[f.k] === c), onclick:e => { vals[f.k] = c; e.currentTarget.parentElement.querySelectorAll('.sw').forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget))); }})));
    else if (f.type === 'multi'){ const opts = typeof f.options === 'function' ? f.options(vals) : f.options; vals[f.k] = vals[f.k] || [];
      input = opts.length ? h('div', {class:'checks'}, opts.map(([k, l]) => h('label', null, h('input', {type:'checkbox', checked:vals[f.k].includes(k) || null, onchange:e => { vals[f.k] = e.target.checked ? [...new Set([...vals[f.k], k])] : vals[f.k].filter(x => x !== k); }}), l))) : h('small', null, f.empty || 'No hay opciones todavía.'); }
    else input = h('input', {type:f.type || 'text', value:vals[f.k] ?? '', placeholder:f.ph || '', step:f.step || null, inputmode:f.inputmode || null, oninput:e => vals[f.k] = e.target.value});
    form.append(h('label', {class:'field'}, h('span', null, f.label, f.required ? ' *' : ''), input, f.help ? h('small', null, f.help) : null));
  });
  form.append(h('div', {class:'form-actions'},
    onDelete ? h('button', {class:'btn danger small', type:'button', onclick:() => { if (confirm('¿Seguro? Esto no se puede deshacer.')){ onDelete(); closeDrawer(); render(); } }}, 'Eliminar') : h('span'),
    h('div', {style:'display:flex;gap:8px'}, h('button', {class:'btn ghost small', type:'button', onclick:closeDrawer}, 'Cancelar'), h('button', {class:'btn small', type:'submit'}, 'Guardar'))));
  function redraw(){ openForm(title, fields, vals, onSave, onDelete); }
  $('#drawer').classList.add('wide');
  openDrawer(h('div', {class:'drawer-head'}, h('div', {style:'flex:1'}, h('h3', null, title)), h('button', {class:'iconbtn', type:'button', 'aria-label':'Cerrar', onclick:closeDrawer}, '✕')), h('div', {class:'drawer-body'}, form));
}
const subjOpts = () => D.subjects.map(s => [s.id, s.name]);
function subjectFields(){ return [
  {k:'name', label:'Nombre de la materia', required:true, ph:'Cálculo Integral'},
  {k:'short', label:'Nombre corto', ph:'Cálculo', help:'Se usa en chips y en el calendario.'},
  {k:'code', label:'Sigla o código', ph:'MAT106'},
  {k:'color', label:'Color', type:'color'},
  {k:'prof', label:'Profesor o sección', ph:'Prof. … · sección 7'},
  {k:'note', label:'Nota (alcance, temario, avisos)', type:'textarea', ph:'Ej.: sin temario oficial todavía.'}]; }
function subjectFrom(v, id){ return {id:id || uid('s'), name:v.name.trim(), short:(v.short || v.name).trim().slice(0, 18), code:(v.code || '').trim(), color:v.color || 'azul', prof:(v.prof || '').trim(), note:(v.note || '').trim()}; }
function openSubjectForm(id){
  const s = id ? D.subjects.find(x => x.id === id) : null;
  openForm(s ? 'Editar materia' : 'Nueva materia', subjectFields(), s ? {...s} : {color:COLORS[D.subjects.length % COLORS.length]},
    v => { const n = subjectFrom(v, s?.id); if (s) Object.assign(s, n); else D.subjects.push(n); save(); toast('Materia guardada'); },
    s ? () => { const tids = topicsOf(s.id).map(t => t.id); D.topics = D.topics.filter(t => t.subj !== s.id); D.items = D.items.filter(i => !tids.includes(i.topic)); D.events = D.events.filter(e => e.subj !== s.id); D.resources = D.resources.filter(r => r.subj !== s.id); D.subjects = D.subjects.filter(x => x.id !== s.id); save(); } : null);
}
function openEventForm(id, date){
  const e = id ? D.events.find(x => x.id === id) : null;
  if (!D.subjects.length) return toast('Primero crea una materia');
  openForm(e ? 'Editar evento' : 'Nuevo evento', [
    {k:'subj', label:'Materia', type:'select', options:subjOpts, rerender:true},
    {k:'kind', label:'Tipo', type:'select', options:Object.entries(KIND).map(([k, o]) => [k, o.l])},
    {k:'name', label:'Nombre', required:true, ph:'Prueba 2'},
    {k:'date', label:'Fecha', type:'date', help:'Déjala vacía si aún no hay fecha.'},
    {k:'time', label:'Hora', ph:'18:00 o 18:00–20:00', help:'Opcional. Para entregas, la hora de cierre.'},
    {k:'slot', label:'Horario en texto', ph:'Módulo de cátedra', help:'Si no sabes la hora exacta.'},
    {k:'ver', label:'Fecha confirmada en una fuente oficial', type:'checkbox'},
    {k:'src', label:'Fuente', ph:'Aviso del profesor, 8 oct · programa del curso'},
    {k:'topics', label:'Evalúa solo estos temas (opcional)', type:'multi', options:v => topicsOf(v.subj).map(t => [t.id, (t.code ? t.code + ' ' : '') + t.title]), empty:'Esta materia no tiene temas todavía.', help:'Si no marcas ninguno, cuenta para todos los temas de la materia.'},
    {k:'scopeNote', label:'Nota sobre el alcance', ph:'Temario no publicado'},
    {k:'note', label:'Nota', type:'textarea'}],
    e ? {...e, topics:[...(e.topics || [])]} : {subj:D.subjects[0].id, kind:'prueba', date:date || '', ver:false},
    v => { const n = {id:e?.id || uid('ev'), subj:v.subj, kind:v.kind, name:v.name.trim(), date:v.date || null, time:(v.time || '').trim(), slot:(v.slot || '').trim(), ver:!!v.ver, src:(v.src || '').trim(), topics:(v.topics || []).filter(t => topic(t)?.subj === v.subj), scopeNote:(v.scopeNote || '').trim(), note:(v.note || '').trim()};
      if (e) Object.assign(e, n); else D.events.push(n);
      D.topics.forEach(t => { if (t.exam === n.id && !n.topics.includes(t.id)) delete t.exam; });
      n.topics.forEach(tid => { const t = topic(tid); if (t) t.exam = n.id; });
      save(); toast('Evento guardado'); },
    e ? () => { D.events = D.events.filter(x => x.id !== e.id); D.topics.forEach(t => { if (t.exam === e.id) delete t.exam; }); save(); } : null);
}
function openTopicForm(id, subj){
  const t = id ? topic(id) : null;
  if (!D.subjects.length) return toast('Primero crea una materia');
  openForm(t ? 'Editar tema' : 'Nuevo tema', [
    {k:'subj', label:'Materia', type:'select', options:subjOpts, rerender:true},
    {k:'title', label:'Título', required:true, ph:'Fracciones parciales'},
    {k:'code', label:'Código corto', ph:'C06', help:'Opcional: número de clase o unidad.'},
    {k:'url', label:'Enlace al material', type:'url', ph:'https://…', help:'Tu apunte, una clase, un video, un libro abierto…'},
    {k:'pre', label:'Prerrequisitos', type:'multi', options:v => topicsOf(v.subj).filter(x => x.id !== t?.id).map(x => [x.id, (x.code ? x.code + ' ' : '') + x.title]), empty:'Aún no hay otros temas en esta materia.'},
    {k:'scope', label:'Alcance', type:'select', options:[['actual','Material actual'],['noconf','Inclusión no confirmada'],['hist','Referencia histórica']]},
    {k:'prio', label:'Prioridad', type:'select', options:[['2','Normal'],['1','Alta'],['3','Baja']]}],
    t ? {...t, pre:[...(t.pre || [])], prio:String(t.prio || 2)} : {subj:subj || mapSubj || D.subjects[0].id, scope:'actual', prio:'2'},
    v => { const n = {id:t?.id || uid('t'), subj:v.subj, title:v.title.trim(), code:(v.code || '').trim(), url:(v.url || '').trim(), pre:(v.pre || []).filter(p => topic(p)?.subj === v.subj), scope:v.scope || 'actual', prio:Number(v.prio) || 2};
      if (t){ if (t.exam) n.exam = t.exam; Object.assign(t, n); } else D.topics.push(n); save(); toast('Tema guardado'); },
    t ? () => { D.topics = D.topics.filter(x => x.id !== t.id); D.topics.forEach(x => x.pre = (x.pre || []).filter(p => p !== t.id)); D.items = D.items.filter(i => i.topic !== t.id); D.events.forEach(e => e.topics = (e.topics || []).filter(x => x !== t.id)); delete P.status[t.id]; save(); } : null);
}
function openItemForm(id, tid){
  const it = id ? D.items.find(x => x.id === id) : null;
  if (!D.topics.length) return toast('Primero crea un tema');
  const topicOpts = () => D.topics.map(t => [t.id, `${S(t.subj).short} · ${(t.code ? t.code + ' ' : '') + t.title}`]);
  openForm(it ? 'Editar ejercicio' : 'Nuevo ejercicio', [
    {k:'topic', label:'Tema', type:'select', options:topicOpts},
    {k:'type', label:'Tipo de respuesta', type:'select', options:[['mc','Alternativas'],['num','Numérica']], rerender:true},
    {k:'q', label:'Enunciado', type:'textarea', required:true, help:'Fórmulas entre signos $, por ejemplo: $\\frac{1}{2}mv^2$.'},
    {k:'optsText', label:'Alternativas (una por línea)', type:'textarea', show:v => v.type === 'mc', help:'La correcta se indica abajo.'},
    {k:'ansIdx', label:'Número de la alternativa correcta', type:'number', show:v => v.type === 'mc', ph:'1'},
    {k:'ans', label:'Respuesta numérica', show:v => v.type === 'num', inputmode:'decimal', ph:'7 · 1/6 · -0,5'},
    {k:'tolPct', label:'Tolerancia (%)', type:'number', show:v => v.type === 'num', ph:'1'},
    {k:'unit', label:'Unidad', show:v => v.type === 'num', ph:'m/s²'},
    {k:'ex', label:'Explicación (se muestra al comprobar)', type:'textarea'},
    {k:'origin', label:'Origen', ph:'Guía 7, problema 2.1 · prueba 2025 · creado por mí'}],
    it ? {...it, optsText:(it.opts || []).join('\n'), ansIdx:it.type === 'mc' ? it.ans + 1 : '', ans:it.type === 'num' ? String(it.ans).replace('.', ',') : '', tolPct:it.tol != null ? it.tol * 100 : 1} : {topic:tid || D.topics[0].id, type:'mc', tolPct:1},
    v => {
      const n = {id:it?.id || uid('q'), topic:v.topic, type:v.type, q:v.q.trim(), ex:(v.ex || '').trim(), origin:(v.origin || '').trim()};
      if (v.type === 'mc'){ const opts = String(v.optsText || '').split('\n').map(x => x.trim()).filter(Boolean); const k = Number(v.ansIdx) - 1;
        if (opts.length < 2 || !(k >= 0 && k < opts.length)){ toast('Necesitas al menos 2 alternativas y el número de la correcta'); throw new Error('val'); }
        Object.assign(n, {opts, ans:k}); }
      else { const a = parseNum(v.ans); if (a == null){ toast('La respuesta numérica no es válida'); throw new Error('val'); } Object.assign(n, {ans:a, tol:Math.max(0, Number(v.tolPct) || 0) / 100, unit:(v.unit || '').trim()}); }
      if (it){ Object.keys(it).forEach(k => delete it[k]); Object.assign(it, n); } else D.items.push(n);
      Q = null; save(); toast('Ejercicio guardado'); },
    it ? () => { D.items = D.items.filter(x => x.id !== it.id); Q = null; save(); } : null);
}
function openResourceForm(id){
  const r = id ? D.resources.find(x => x.id === id) : null;
  if (!D.subjects.length) return toast('Primero crea una materia');
  openForm(r ? 'Editar recurso' : 'Nuevo recurso', [
    {k:'subj', label:'Materia', type:'select', options:subjOpts},
    {k:'title', label:'Título', required:true, ph:'Formulario general'},
    {k:'kind', label:'Tipo', ph:'Formulario · guía · simulacro · video'},
    {k:'url', label:'Enlace', type:'url', ph:'https://…'}],
    r ? {...r} : {subj:D.subjects[0].id},
    v => { const n = {id:r?.id || uid('r'), subj:v.subj, title:v.title.trim(), kind:(v.kind || '').trim(), url:(v.url || '').trim()}; if (r) Object.assign(r, n); else D.resources.push(n); save(); toast('Recurso guardado'); },
    r ? () => { D.resources = D.resources.filter(x => x.id !== r.id); save(); } : null);
}
function vEditar(v){
  v.append(h('div', {class:'sec-title'}, h('h2', null, 'Editar'), h('span', {class:'hand'}, 'tu Calculai, a tu medida')));
  v.append(h('label', {class:'field', style:'max-width:360px'}, h('span', null, '¿Cómo te llamo?'), h('input', {type:'text', value:D.owner || '', placeholder:'Tu nombre (opcional)', onchange:e => { D.owner = e.target.value.trim().slice(0, 30); save(); }})));
  const sec = (title, addLbl, onAdd, rows, emptyTxt) => v.append(h('section', {class:'edit-sec'},
    h('div', {style:'display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap'}, h('h3', {class:'display', style:'margin:0;font-size:1.15rem'}, title), h('button', {class:'btn small', type:'button', onclick:onAdd}, addLbl)),
    rows.length ? h('div', {class:'edit-list'}, rows) : h('p', {class:'tiny muted'}, emptyTxt)));
  const row = (style, title, sub, onEdit) => h('div', {class:'edit-row', style}, h('div', {class:'info'}, h('b', null, title), h('small', null, sub)), h('button', {class:'btn ghost small', type:'button', onclick:onEdit}, 'Editar'));
  sec('Materias', '+ Materia', () => openSubjectForm(null), D.subjects.map(s => row(scs(s.id), s.name, [s.code, s.prof, plural(topicsOf(s.id).length, 'tema', 'temas')].filter(Boolean).join(' · '), () => openSubjectForm(s.id))), 'Sin materias.');
  sec('Evaluaciones y entregas', '+ Evento', () => openEventForm(null), D.events.slice().sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')).map(e => row(scs(e.subj), `${S(e.subj).short} · ${e.name}`, `${(KIND[e.kind] || KIND.otro).l} · ${e.date ? fmtD(parse(e.date)) : 'sin fecha'}${e.time ? ' · ' + e.time : ''} · ${e.ver ? 'confirmada' : 'sin confirmar'}`, () => openEventForm(e.id))), 'Sin eventos.');
  sec('Temas', '+ Tema', () => openTopicForm(null), D.subjects.flatMap(s => topicsOf(s.id).sort((a, b) => (a.code || a.title).localeCompare(b.code || b.title)).map(t => row(scs(s.id), (t.code ? t.code + ' · ' : '') + t.title, `${s.short} · ${SCOPE_LBL[t.scope] || ''}${t.url ? ' · con enlace' : ''} · ${plural(D.items.filter(i => i.topic === t.id).length, 'ejercicio', 'ejercicios')}`, () => openTopicForm(t.id)))), 'Sin temas.');
  sec('Ejercicios', '+ Ejercicio', () => openItemForm(null), D.items.map(i => { const t = topic(i.topic); return t ? row(scs(t.subj), String(i.q).replace(/\$[^$]*\$/g, '[fórmula]').slice(0, 90), `${S(t.subj).short} · ${t.title} · ${i.type === 'mc' ? 'alternativas' : 'numérica'}`, () => openItemForm(i.id)) : null; }).filter(Boolean), 'Sin ejercicios. Crea preguntas desde tus guías o pruebas anteriores.');
  sec('Recursos', '+ Recurso', () => openResourceForm(null), D.resources.map(r => row(scs(r.subj), r.title, `${S(r.subj).short}${r.kind ? ' · ' + r.kind : ''}`, () => openResourceForm(r.id))), 'Formularios, guías, simulacros, videos…');

  v.append(webcCard());
  const file = h('input', {type:'file', accept:'.json,application/json', style:'display:none', onchange:e => importFile(e.target.files[0], false)});
  v.append(h('section', {class:'edit-sec card'},
    h('h3', {class:'display', style:'margin:0 0 6px;font-size:1.15rem'}, 'Respaldo y compartir'),
    h('p', {class:'tiny muted', style:'margin:0 0 10px'}, storageOk ? 'Tus datos se guardan automáticamente en este navegador. Descarga un respaldo de vez en cuando, o para pasarlos a otro equipo.' : '⚠ Este navegador no está guardando datos (¿modo incógnito?). Descarga un respaldo antes de cerrar.'),
    h('div', {style:'display:flex;gap:8px;flex-wrap:wrap'},
      h('button', {class:'btn small', type:'button', onclick:() => download(`calculai-respaldo-${iso(TODAY)}.json`, JSON.stringify({app:'calculai', v:1, data:D, progress:P}, null, 1), 'application/json')}, '⇩ Respaldo completo'),
      h('button', {class:'btn ghost small', type:'button', onclick:() => download(`calculai-plantilla-${iso(TODAY)}.json`, JSON.stringify({app:'calculai', v:1, data:{...D, owner:''}}, null, 1), 'application/json'), title:'Materias, fechas, temas y ejercicios, sin tu progreso'}, '⇩ Plantilla para compartir'),
      h('button', {class:'btn ghost small', type:'button', onclick:() => file.click()}, '⇪ Abrir archivo'), file,
      h('button', {class:'btn ghost small', type:'button', onclick:shareToDevice, title:'Envía tu respaldo al celular u otro equipo'}, '📱 Pasar a otro dispositivo'),
      h('button', {class:'btn danger small', type:'button', onclick:() => { if (confirm('¿Borrar todos los datos de este navegador? Descarga antes un respaldo si los quieres.')){ D = blankData(); P = blankProg(); save(); tab = 'ahora'; render(); } }}, 'Borrar todo')),
    h('p', {class:'tiny muted', style:'margin:10px 0 0'}, 'La plantilla no incluye tu progreso: sirve para que alguien de tu curso parta con las mismas materias, fechas y ejercicios.')));
}
function importFile(f, fromWelcome){
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const j = JSON.parse(r.result);
      if (j && j.type === 'calculai-webc' && Array.isArray(j.courses)){ receiveWebc(j); return; }
      if (!j || !j.data || !Array.isArray(j.data.subjects)) throw new Error('formato');
      const nd = normData(j.data);
      if (!fromWelcome && D.subjects.length && !confirm(j.progress ? 'Esto reemplaza tus datos y tu progreso actuales por los del archivo. ¿Continuar?' : 'Esto reemplaza tus materias, fechas, temas y ejercicios por los de la plantilla (tu progreso se mantiene en los temas que coincidan). ¿Continuar?')) return;
      D = nd; if (j.progress) P = normProg(j.progress);
      save(); tab = 'ahora'; render(); toast(j.progress ? 'Respaldo cargado' : 'Plantilla cargada');
    } catch { toast('El archivo no es un respaldo ni una plantilla de Calculai'); }
  };
  r.readAsText(f);
}

/* =========================================================
   MODO ENFOQUE
   ========================================================= */
let F = null, fTimer = null;
function startFocus(t, steps){ F = {t, steps, idx:0, left:steps[0].min * 60, running:true, elapsed:0, end:false}; $('#focus').classList.add('on'); document.body.style.overflow = 'hidden'; clearInterval(fTimer); fTimer = setInterval(tick, 1000); renderFocus(); }
function tick(){ if (!F || !F.running || F.end) return; F.left = Math.max(0, F.left - 1); F.elapsed++; if (F.left === 0){ F.running = false; try { navigator.vibrate && navigator.vibrate(200); } catch {} } renderFocus(); }
function nextStep(){ if (F.idx < F.steps.length - 1){ F.idx++; F.left = F.steps[F.idx].min * 60; F.running = true; } else F.end = true; renderFocus(); }
function endFocus(){ if (F && F.elapsed >= 60){ P.sessions.push({at:iso(TODAY), topic:F.t.id, min:Math.round(F.elapsed / 60)}); save(); } clearInterval(fTimer); F = null; $('#focus').classList.remove('on'); document.body.style.overflow = ''; render(); }
function renderFocus(){
  const el = $('#focus'); if (!F) return;
  const step = F.steps[F.idx], tot = step.min * 60, frac = F.left / tot, C = 2 * Math.PI * 100;
  document.title = F.end ? 'Calculai' : `${pad(Math.floor(F.left / 60))}:${pad(F.left % 60)} · ${step.t}`;
  el.replaceChildren(h('div', {class:'focus-in', style:scs(F.t.subj)},
    h('div', {class:'focus-top'}, h('div', null, subjChip(F.t.subj), ' ', h('b', {class:'display', style:'font-size:1.15rem'}, F.t.title)), h('button', {class:'iconbtn', type:'button', onclick:() => { document.title = 'Calculai'; endFocus(); }, 'aria-label':'Salir del modo enfoque'}, 'Salir ✕')),
    F.end ? h('div', {class:'card endpanel'},
      h('h2', {class:'display', style:'margin:0 0 4px'}, 'Sesión terminada'),
      h('p', {class:'muted', style:'margin:0 0 14px'}, `${plural(Math.round(F.elapsed / 60), 'minuto', 'minutos')} de trabajo. ¿Cómo quedó ${F.t.title}?`),
      h('div', {class:'statusbar'}, STATUSES.filter(x => x.k !== 'pendiente').map(x => h('button', {class:'stbtn', type:'button', style:`--stc:var(--s-${x.k})`, 'aria-pressed':String(st(F.t.id) === x.k), onclick:() => { setStatus(F.t.id, x.k); toast(`${F.t.title}: ${x.l}`); document.title = 'Calculai'; endFocus(); }}, h('i', {class:'dot', style:`background:var(--s-${x.k})`}), x.l))),
      h('p', {class:'note'}, 'Si dudas entre dos estados, elige el más bajo: el repaso llega antes y no pierdes nada.'))
    : h('div', null,
      h('div', {class:'focus-main'},
        h('div', {class:'ring'}, (() => { const s = svg('svg', {viewBox:'0 0 240 240'}); s.append(svg('circle', {class:'bg', cx:120, cy:120, r:100}), svg('circle', {class:'fg', cx:120, cy:120, r:100, 'stroke-dasharray':C, 'stroke-dashoffset':C * (1 - frac)})); return s; })(),
          h('div', {class:'t'}, h('div', null, h('b', null, `${pad(Math.floor(F.left / 60))}:${pad(F.left % 60)}`), h('small', null, F.left === 0 ? '¡paso cumplido!' : F.running ? step.t : 'en pausa')))),
        h('ol', {class:'fsteps'}, F.steps.map((s, i) => h('li', {class:i === F.idx ? 'cur' : i < F.idx ? 'done' : ''},
          h('span', {class:'fs-n'}, i < F.idx ? '✓' : i + 1),
          h('div', {style:'flex:1;min-width:0'}, h('div', {class:'fs-t'}, `${s.t} · ${s.min}'`), i === F.idx ? h('div', {class:'fs-d'}, s.d) : null),
          i === F.idx && s.link ? extLink(s.link, s.linkLbl) : null)))),
      h('div', {class:'focus-ctrl'},
        h('button', {class:'btn ghost', type:'button', onclick:() => { F.running = !F.running; renderFocus(); }}, F.running ? '❚❚ Pausa' : '▶ Reanudar'),
        h('button', {class:F.left === 0 ? 'btn hlbtn' : 'btn', type:'button', onclick:nextStep}, F.idx < F.steps.length - 1 ? 'Siguiente paso →' : 'Terminar sesión')))));
}

/* =========================================================
   BUSCADOR (Ctrl+K)
   ========================================================= */
let palItems = [], palSel = 0;
function palData(){
  const out = D.subjects.length ? TABS.map(t => ({l:'Ir a ' + t.l, k:'Sección', run:() => go(t.k)})) : [];
  D.topics.forEach(t => out.push({l:(t.code ? t.code + ' · ' : '') + t.title, k:S(t.subj).short, dot:`var(--s-${st(t.id)})`, run:() => { mapSubj = t.subj; go('mapa'); setTimeout(() => openTopic(t.id), 60); }}));
  D.resources.filter(r => r.url).forEach(r => out.push({l:r.title, k:S(r.subj).short + ' · abrir ↗', run:() => window.open(r.url, '_blank', 'noopener')}));
  D.subjects.forEach(s => out.push({l:'Practicar ' + s.short, k:'Acción', run:() => { pracFilter = s.id; Q = null; go('practica'); }}));
  out.push({l:'Nuevo evento', k:'Acción', run:() => openEventForm(null)}, {l:'Nuevo tema', k:'Acción', run:() => openTopicForm(null)}, {l:'Nuevo ejercicio', k:'Acción', run:() => openItemForm(null)}, {l:'Cambiar tema claro/oscuro', k:'Acción', run:toggleTheme});
  return out;
}
const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function openPal(){ $('#pal').classList.add('on'); const i = $('#palIn'); i.value = ''; palFilter(''); i.focus(); }
function closePal(){ $('#pal').classList.remove('on'); }
function palFilter(q){ const all = palData(), n = norm(q); palItems = n ? all.filter(x => norm(x.l + ' ' + x.k).includes(n)) : all; palSel = 0; drawPal(); }
function drawPal(){
  $('#palList').replaceChildren(...palItems.slice(0, 40).map((x, i) => h('button', {class:'pal-item', type:'button', role:'option', 'aria-selected':String(i === palSel), onclick:() => { closePal(); x.run(); }},
    x.dot ? h('i', {class:'dot', style:`background:${x.dot}`}) : h('span', {style:'width:9px'}), x.l, h('small', null, x.k))));
  $('#palList').children[palSel]?.scrollIntoView({block:'nearest'});
}

/* =========================================================
   EJEMPLO (fechas relativas a hoy, para que nunca quede viejo)
   ========================================================= */
function makeExample(){
  const d = n => iso(addDays(TODAY, n));
  const x = blankData();
  x.subjects = [
    {id:'s-cal', name:'Cálculo Integral (ejemplo)', short:'Cálculo', code:'MAT-EJ1', color:'azul', prof:'', note:'Datos de ejemplo: edítalos o bórralos en Editar.'},
    {id:'s-alg', name:'Álgebra Lineal (ejemplo)', short:'Álgebra', code:'MAT-EJ2', color:'violeta', prof:'', note:'Datos de ejemplo.'},
    {id:'s-fis', name:'Física I (ejemplo)', short:'Física', code:'FIS-EJ', color:'naranja', prof:'', note:'Datos de ejemplo.'}];
  x.events = [
    {id:'ev-1', subj:'s-alg', kind:'control', name:'Control 2', date:d(3), time:'', slot:'Horario de clase', ver:true, src:'Ejemplo', topics:[], scopeNote:'', note:''},
    {id:'ev-2', subj:'s-fis', kind:'entrega', name:'Informe de laboratorio', date:d(2), time:'22:00', slot:'', ver:true, src:'Ejemplo', topics:[], scopeNote:'', note:''},
    {id:'ev-3', subj:'s-cal', kind:'control', name:'Control 2', date:d(10), time:'', slot:'', ver:false, src:'', topics:[], scopeNote:'Alcance no publicado', note:''},
    {id:'ev-4', subj:'s-fis', kind:'prueba', name:'Prueba 2', date:d(12), time:'09:00', slot:'', ver:true, src:'Ejemplo', topics:[], scopeNote:'', note:''},
    {id:'ev-5', subj:'s-alg', kind:'prueba', name:'Prueba 2', date:d(15), time:'18:00–20:00', slot:'', ver:false, src:'', topics:[], scopeNote:'Sin temario oficial', note:''},
    {id:'ev-6', subj:'s-cal', kind:'prueba', name:'Prueba 2', date:d(22), time:'18:00', slot:'', ver:true, src:'Ejemplo', topics:[], scopeNote:'', note:''}];
  const T = (id, subj, code, title, pre, scope = 'actual') => ({id, subj, code, title, url:'', pre, scope, prio:2});
  x.topics = [
    T('t-c1','s-cal','C1','Integración por partes',[]), T('t-c2','s-cal','C2','Fracciones parciales',[]), T('t-c3','s-cal','C3','Sustitución trigonométrica',[]),
    T('t-c4','s-cal','C4','Elegir la técnica',['t-c1','t-c2','t-c3']), T('t-c5','s-cal','C5','Área entre curvas',[]), T('t-c6','s-cal','C6','Volúmenes: discos y cascarones',['t-c5']),
    T('t-a1','s-alg','A1','Forma escalonada y rango',[]), T('t-a2','s-alg','A2','Matriz inversa',['t-a1']), T('t-a3','s-alg','A3','Determinantes',[]), T('t-a4','s-alg','A4','Subespacios',[]), T('t-a5','s-alg','A5','Base y dimensión',['t-a4'],'noconf'),
    T('t-f1','s-fis','F1','DCL y leyes de Newton',[]), T('t-f2','s-fis','F2','Planos inclinados',['t-f1']), T('t-f3','s-fis','F3','Fricción',['t-f1','t-f2']), T('t-f4','s-fis','F4','Movimiento circular',['t-f1'],'noconf'), T('t-f5','s-fis','F5','Trabajo y energía cinética',['t-f1'],'noconf')];
  const MC = (id, tpc, q, opts, ex) => ({id, topic:tpc, type:'mc', q, opts, ans:0, ex, origin:'Ejercicio de ejemplo'});
  const NUM = (id, tpc, q, ans, tol, unit, ex) => ({id, topic:tpc, type:'num', q, ans, tol, unit, ex, origin:'Ejercicio de ejemplo'});
  x.items = [
    NUM('q1','t-c2','Si $\\dfrac{x+5}{x^2+x-2} = \\dfrac{A}{x-1} + \\dfrac{B}{x+2}$, ¿cuánto vale $A$?', 2, .001, '', '$x+5 = A(x+2) + B(x-1)$. Con $x=1$: $6=3A$, así que $A=2$.'),
    MC('q2','t-c1','$\\displaystyle\\int x\\,e^{x}\\,dx =$', ['$(x-1)e^{x} + C$','$x e^{x} + C$','$(x+1)e^{x} + C$','$\\tfrac{x^2}{2}e^{x} + C$'], 'Con $u=x$ y $dv=e^x dx$: $x e^x - \\int e^x dx = (x-1)e^x + C$.'),
    NUM('q3','t-c5','Área entre $y=x$ e $y=x^2$ para $0\\le x\\le 1$ (puedes escribir una fracción).', 1/6, .002, '', '$\\int_0^1 (x-x^2)\\,dx = \\tfrac12-\\tfrac13 = \\tfrac16$.'),
    NUM('q4','t-a3','Si $A$ es $3\\times3$ y $\\det(A)=5$, ¿cuánto vale $\\det(2A)$?', 40, .001, '', '$\\det(2A)=2^3\\det(A)=40$.'),
    MC('q5','t-a4','¿Es $W=\\{(x,y): x+y=1\\}$ un subespacio de $\\mathbb{R}^2$?', ['No: no contiene al vector cero','Sí: es una recta','Sí: es cerrado bajo la suma','No: tiene infinitos elementos'], '$(0,0)$ no cumple $0+0=1$.'),
    MC('q6','t-f3','Una caja está en reposo en un piso horizontal y nadie la empuja. ¿Cuánto vale la fricción estática?', ['Cero','$\\mu_s N$','$\\mu_k N$','$mg$'], '$f_s \\le \\mu_s N$ es un tope: si nada intenta moverla, vale cero.'),
    MC('q7','t-f2','Un bloque en reposo sobre un plano inclinado de ángulo $\\theta$, sin otras fuerzas. La normal vale:', ['$mg\\cos\\theta$','$mg$','$mg\\sin\\theta$','$mg/\\cos\\theta$'], 'Perpendicular al plano no hay aceleración: $N=mg\\cos\\theta$.'),
    NUM('q8','t-f5','Una fuerza $\\vec F=(4,3)$ N actúa durante $\\Delta\\vec r=(2,-1)$ m. ¿Cuánto trabajo hace (J)?', 5, .01, 'J', '$W=\\vec F\\cdot\\Delta\\vec r=8-3=5$ J.')];
  x.resources = [{id:'r-1', subj:'s-cal', title:'Active Calculus (libro abierto)', kind:'Libro', url:'https://activecalculus.org/'}, {id:'r-2', subj:'s-fis', title:'MIT OCW 8.01SC', kind:'Videos y notas', url:'https://ocw.mit.edu/courses/8-01sc-classical-mechanics-fall-2016/'}];
  return x;
}


/* =========================================================
   CONECTAR CON WEBC / MOODLE
   El conector corre dentro de WebC con tu sesión ya iniciada (inicio con Microsoft incluido):
   Calculai nunca ve ni guarda tu contraseña.
   ========================================================= */
const APP_BASE = location.origin + location.pathname.replace(/[^/]*$/, '');
const BOOKMARKLET = `javascript:(function(){var s=document.createElement('script');s.src='${APP_BASE}conector.js?v='+Date.now();document.body.appendChild(s);})();`;
let pendingWebc = null;
function webcSteps(){
  const bm = h('a', {class:'btn hlbtn', href:BOOKMARKLET, title:'Arrástrame a tu barra de marcadores', onclick:e => { e.preventDefault(); toast('Arrastra este botón a tu barra de marcadores'); }}, '⟳ Enviar a Calculai');
  return h('div', null,
    h('ol', {class:'tiny', style:'padding-left:18px;margin:6px 0 12px;line-height:1.6'},
      h('li', null, h('b', null, 'Guarda el botón amarillo como marcador: '), 'arrástralo a la barra de marcadores de tu navegador (en Chrome: Ctrl+Mayús+B la muestra).'),
      h('li', null, 'Abre ', h('a', {href:'https://webc.uai.cl/my/courses.php', target:'_blank', rel:'noopener'}, 'WebC ↗'), ' e inicia sesión como siempre (con Microsoft).'),
      h('li', null, 'Estando en WebC, toca el marcador «Enviar a Calculai», elige tus cursos y presiona «Enviar».'),
      h('li', null, 'Vuelves aquí, revisas lo que llegó y lo guardas.')),
    h('div', {style:'display:flex;gap:10px;flex-wrap:wrap;align-items:center'}, bm, h('span', {class:'tiny muted'}, '← arrástrame a la barra de marcadores')),
    h('details', {style:'margin-top:12px'}, h('summary', {class:'tiny', style:'cursor:pointer;font-weight:700'}, '¿No puedes arrastrarlo? (por ejemplo, en el celular)'),
      h('p', {class:'tiny muted'}, 'Crea un marcador cualquiera, edítalo y pega este texto como dirección. En el celular, después lo abres escribiendo su nombre en la barra de direcciones mientras estás en WebC. Es más cómodo hacerlo en el computador y luego pasar tus datos con «Pasar a otro dispositivo».'),
      h('div', {style:'display:flex;gap:8px;align-items:center'}, h('input', {type:'text', readonly:true, value:BOOKMARKLET, style:'flex:1;min-width:0;font-family:JetBrains Mono,monospace;font-size:.72rem;border:1px solid var(--line-2);border-radius:8px;padding:6px;background:var(--card-2);color:var(--ink)', onclick:e => e.target.select()}),
        h('button', {class:'btn ghost small', type:'button', onclick:async () => { try { await navigator.clipboard.writeText(BOOKMARKLET); toast('Copiado'); } catch { toast('Selecciona el texto y cópialo'); } }}, 'Copiar'))),
    h('p', {class:'tiny muted', style:'margin-top:12px'}, '¿Por qué así? WebC usa inicio de sesión con Microsoft, así que una app externa no puede entrar por ti con usuario y contraseña. El marcador usa tu sesión ya abierta en WebC: lee lo mismo que tú ves y se lo pasa a Calculai, sin contraseñas y sin servidores intermedios. Funciona también con otros Moodle.'));
}
function webcCard(){
  return h('section', {class:'edit-sec card', style:'border:2px solid var(--ink)'},
    h('h3', {class:'display', style:'margin:0 0 4px;font-size:1.15rem'}, '⟳ Conectar con WebC'),
    h('p', {class:'tiny muted', style:'margin:0 0 6px'}, D.sync && D.sync.webc ? `Última lectura: ${fmtD(parse(D.sync.webc.at.slice(0, 10)))} desde ${D.sync.webc.origin.replace(/^https?:\/\//, '')}. Repite el paso 3 cuando quieras actualizar: no se duplica nada.` : 'Trae tus cursos, las fechas del calendario de WebC, los recursos publicados y los avisos de los profesores.'),
    webcSteps());
}
function openWebcHelp(){
  $('#drawer').classList.add('wide');
  openDrawer(h('div', {class:'drawer-head'}, h('div', {style:'flex:1'}, h('h3', null, 'Conectar con WebC')), h('button', {class:'iconbtn', type:'button', 'aria-label':'Cerrar', onclick:closeDrawer}, '✕')), h('div', {class:'drawer-body'}, webcSteps()));
}
async function shareToDevice(){
  const name = `calculai-respaldo-${iso(TODAY)}.json`, txt = JSON.stringify({app:'calculai', v:1, data:D, progress:P});
  try {
    const f = new File([txt], name, {type:'application/json'});
    if (navigator.canShare && navigator.canShare({files:[f]})){ await navigator.share({files:[f], title:'Mi Calculai', text:'Ábrelo en Calculai → Abrir archivo'}); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  download(name, txt, 'application/json');
  toast('Descargado: envíatelo (correo, WhatsApp, Drive) y ábrelo en Calculai del otro equipo');
}
/* Recepción desde el conector */
window.addEventListener('message', ev => {
  const d = ev.data; if (!d || typeof d !== 'object') return;
  if (d.type === 'calculai-ping' && ev.source){ try { ev.source.postMessage({type:'calculai-ready'}, ev.origin); } catch {} return; }
  if (d.type === 'calculai-webc' && Array.isArray(d.courses)){
    try { ev.source && ev.source.postMessage({type:'calculai-received'}, ev.origin); } catch {}
    d.origin = d.origin || ev.origin; receiveWebc(d);
  }
});
if (window.opener && /[?&]from=webc/.test(location.search)){ try { window.opener.postMessage({type:'calculai-ready'}, '*'); } catch {} }
function receiveWebc(d){ pendingWebc = prepareWebc(d); closeDrawer(); tab = 'webc'; render(); window.scrollTo({top:0}); }

const MONTHS = {ene:0, enero:0, jan:0, feb:1, febrero:1, mar:2, marzo:2, abr:3, abril:3, apr:3, may:4, mayo:4, jun:5, junio:5, jul:6, julio:6, ago:7, agosto:7, aug:7, sep:8, sept:8, set:8, septiembre:8, setiembre:8, oct:9, octubre:9, nov:10, noviembre:10, dic:11, diciembre:11, dec:11};
const DATE_RE = /(?:\b(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+)?\b(\d{1,2})\s*(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sept?|set|oct|nov|dic|jan|apr|aug|dec)\b\.?(?:\s+(?:de\s+|del\s+)?(\d{4}))?/gi;
function kindOf(t){ t = norm(t); if (/examen/.test(t)) return 'examen'; if (/\bprueba|certamen|solemne/.test(t)) return 'prueba'; if (/\bcontrol/.test(t)) return 'control'; if (/proyecto/.test(t)) return 'proyecto'; if (/entrega|plazo|informe|\blab|tarea|buzon|bitacora|cierra/.test(t)) return 'entrega'; return 'otro'; }
function newsDate(n){ if (!n.date) return null; const p = n.date.split('|'); if (p.length < 3) return n.date.slice(0, 10); const m = MONTHS[norm(p[1])]; return m == null ? null : iso(new Date(+p[0], m, +p[2])); }
function extractDates(n){
  const out = [], post = newsDate(n), postD = post ? parse(post) : TODAY;
  const re = new RegExp(DATE_RE.source, 'gi');
  const lines = String(n.text || '').split(/\n+/).map(l => l.trim()).filter(Boolean);
  lines.forEach(line => {
    if (/^de\s+.+\s-\s\w+,\s+\d/.test(line)) return; // cabecera del post
    let m; re.lastIndex = 0;
    while ((m = re.exec(line))){
      const day = +m[1], mon = MONTHS[norm(m[2])]; if (mon == null || day < 1 || day > 31) continue;
      let y = m[3] ? +m[3] : postD.getFullYear(); let d = new Date(y, mon, day);
      if (!m[3] && d < addDays(postD, -60)) d = new Date(y + 1, mon, day);
      const after = line.slice(m.index + m[0].length, m.index + m[0].length + 40), before = line.slice(Math.max(0, m.index - 25), m.index);
      const tm = after.match(/(?:a\s+las\s+|,\s*|\s)(\d{1,2})(?::|\.|h)(\d{2})(?:\s*(?:-|–|a)\s*(\d{1,2})(?::|\.)(\d{2}))?/) || before.match(/(\d{1,2}):(\d{2})\s*$/) || after.match(/a\s+las\s+(\d{1,2})\s*(?:hrs?|horas)/);
      let time = '';
      if (tm){ const H = +tm[1], Mi = tm[2] && tm[2].length === 2 ? tm[2] : '00'; if (H <= 23){ time = `${pad(H)}:${Mi}`; if (tm[3]) time += `–${pad(+tm[3])}:${tm[4]}`; } }
      let name = line.replace(new RegExp(DATE_RE.source, 'gi'), '').replace(/(?:a\s+las\s+)?\d{1,2}[:.h]\d{2}(\s*(hrs?|horas))?/gi, '').replace(/\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/gi, '').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').replace(/^[\s:,.\-–]+|[\s:,.\-–]+$/g, '');
      const kw = line.match(/\b(prueba|control|examen|certamen|solemne|entrega|informe|laboratorio|lab\s?\d*|proyecto|tarea|interrogaci[oó]n|bit[aá]cora)\b[^.,;\n]{0,48}/i);
      if (kw){ let k2 = kw[0].replace(new RegExp(DATE_RE.source, 'gi'), '').replace(/(?:a\s+las\s+)?\d{1,2}[:.h]\d{2}(\s*(hrs?|horas))?/gi, '').replace(/\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/gi, '').replace(/\s+(es|ser[aá]n?|se|queda|qued[oó]|cambia|para|el\s+d[ií]a|hasta|a\s+partir)\b.*$/i, '').replace(/\s{2,}/g, ' ').trim(); if (k2.length >= 3) name = k2.charAt(0).toUpperCase() + k2.slice(1); }
      if (name.length < 3) name = n.title; if (name.length > 70) name = name.slice(0, 67) + '…';
      out.push({date:iso(d), time, kind:kindOf(line + ' ' + (name === n.title ? n.title : '')), name, line:line.slice(0, 220)});
    }
  });
  return out;
}
function cleanEvName(s){ return String(s || '').replace(/^Vencimiento de\s+/i, '').replace(/^La entrega de\s+/i, '').trim(); }
function prepareWebc(d){
  const P2 = {origin:d.origin || '', at:d.at || new Date().toISOString(), courses:[]};
  (d.courses || []).forEach((c, ci) => {
    const byCode = c.code && D.subjects.find(s => s.code && s.code.toUpperCase() === c.code.toUpperCase());
    const byWebc = D.subjects.find(s => s.webc === c.id);
    const byName = D.subjects.find(s => norm(s.name).startsWith(norm(c.name).split(' ')[0]));
    const target = (byWebc || byCode || byName || {}).id || 'new';
    const subjFor = target === 'new' ? null : target;
    const evs = (c.events || []).filter(e => e.ts).map(e => { const dt = new Date(e.ts * 1000); const id = 'cal:' + e.id; const exist = D.events.find(x => x.webc === id);
      return {sel: dt >= addDays(TODAY, -1) || !!exist, id, date:iso(dt), time:`${pad(dt.getHours())}:${pad(dt.getMinutes())}`, name:cleanEvName(e.name), kind:/assign/.test(e.type) ? 'entrega' : /quiz/.test(e.type) ? 'control' : 'entrega', url:e.url || '', exist:!!exist}; });
    const sugg = []; const seen = new Set();
    (c.news || []).forEach(n => extractDates(n).forEach((x, k) => {
      const key = x.date + '|' + norm(x.name); if (seen.has(key)) return; seen.add(key);
      if (parse(x.date) < addDays(TODAY, -1)) return;
      const id = 'news:' + n.id + ':' + x.date + ':' + norm(x.name).slice(0, 20);
      const dup = subjFor && D.events.find(e => e.subj === subjFor && e.date === x.date && (e.webc === id || norm(e.name) === norm(x.name) || e.kind === x.kind));
      const already = D.events.find(e => e.webc === id);
      const calDup = evs.some(e => e.date === x.date && e.kind === x.kind);
      sugg.push({...x, id, newsTitle:n.title, newsUrl:n.url, newsDate:newsDate(n), sel:!already && !dup && !calDup && x.kind !== 'otro', dup:!!(already || dup), calDup});
    }));
    P2.courses.push({c, include:true, target, evs, sugg, addRes:true, addNews:true});
  });
  return P2;
}
function vWebcReview(v){
  const W2 = pendingWebc;
  if (!W2){ tab = 'ahora'; render(); return; }
  v.append(h('div', {class:'sec-title'}, h('h2', null, 'Datos de WebC'), h('span', {class:'hand'}, 'revisa antes de guardar')));
  v.append(h('p', {class:'muted', style:'margin:0'}, `Llegaron desde ${W2.origin.replace(/^https?:\/\//, '')} (${fmtD(parse(W2.at.slice(0, 10)))}). Nada se guarda hasta que presiones «Guardar en Calculai». Al repetir la conexión, lo ya importado se actualiza en vez de duplicarse.`));
  W2.courses.forEach(row => {
    const c = row.c;
    const opts = [['new', '➕ Crear materia nueva'], ...D.subjects.map(s => [s.id, '↔ Unir con «' + s.name + '»'])];
    const sel = h('select', {onchange:e => { row.target = e.target.value; }}, opts.map(([k, l]) => { const o = h('option', {value:k}, l); if (row.target === k) o.selected = true; return o; }));
    const card = h('section', {class:'card', style:'margin-top:16px'},
      h('div', {style:'display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center'},
        h('label', {class:'chk'}, h('input', {type:'checkbox', checked:row.include || null, onchange:e => { row.include = e.target.checked; render(); }}), h('span', null, c.name, ' ', h('small', {class:'muted', style:'font-weight:400'}, [c.code, c.section].filter(Boolean).join(' · ')))),
        row.include ? h('label', {class:'field', style:'min-width:230px'}, sel) : null));
    if (row.include){
      if (row.evs.length) card.append(h('h4', {class:'wh'}, `Fechas del calendario de WebC (${row.evs.length})`), h('div', {class:'wlist'}, row.evs.map(e => h('label', {class:'wrow'},
        h('input', {type:'checkbox', checked:e.sel || null, onchange:ev => e.sel = ev.target.checked}),
        h('span', null, h('b', null, e.name), h('small', null, ` · ${cap(fmtD(parse(e.date)))} · ${e.time}${e.exist ? ' · se actualizará' : ''}`))))));
      card.append(h('h4', {class:'wh'}, `Fechas encontradas en los avisos (${row.sugg.length})`));
      if (!row.sugg.length) card.append(h('p', {class:'tiny muted'}, c.news.length ? 'No encontré fechas futuras en los avisos recientes.' : 'Este curso no tiene un foro de avisos que pueda leer.'));
      else card.append(h('p', {class:'tiny muted', style:'margin:0 0 6px'}, 'Las detecté leyendo el texto de los avisos: revisa nombre, tipo y fecha, y desmarca las que no correspondan.'),
        h('div', {class:'wlist'}, row.sugg.map(x => h('div', {class:'wrow sugg'},
          h('input', {type:'checkbox', checked:x.sel || null, 'aria-label':'Importar', onchange:ev => x.sel = ev.target.checked}),
          h('div', {style:'min-width:0;flex:1'},
            h('div', {class:'srow'},
              h('select', {onchange:ev => x.kind = ev.target.value}, Object.entries(KIND).map(([k, o]) => { const op = h('option', {value:k}, o.l); if (x.kind === k) op.selected = true; return op; })),
              h('input', {type:'text', value:x.name, oninput:ev => x.name = ev.target.value, 'aria-label':'Nombre'}),
              h('input', {type:'date', value:x.date, oninput:ev => x.date = ev.target.value, 'aria-label':'Fecha'}),
              h('input', {type:'text', value:x.time, placeholder:'hora', oninput:ev => x.time = ev.target.value, style:'width:110px', 'aria-label':'Hora'})),
            h('div', {class:'tiny muted', style:'margin-top:4px'}, '«' + x.line + '» — aviso ', x.newsUrl ? h('a', {href:x.newsUrl, target:'_blank', rel:'noopener'}, x.newsTitle) : x.newsTitle, x.dup ? h('b', {style:'color:var(--margin)'}, ' · ya está en tu calendario') : x.calDup ? h('b', {style:'color:var(--margin)'}, ' · parece repetir una fecha del calendario de WebC') : null))))));
      card.append(h('div', {style:'display:flex;gap:16px;flex-wrap:wrap;margin-top:12px'},
        h('label', {class:'chk'}, h('input', {type:'checkbox', checked:row.addRes || null, onchange:e => row.addRes = e.target.checked}), `Agregar ${plural(c.resources.length, 'recurso', 'recursos')} (archivos, guías, enlaces)`),
        h('label', {class:'chk'}, h('input', {type:'checkbox', checked:row.addNews || null, onchange:e => row.addNews = e.target.checked}), `Guardar ${plural(c.news.length, 'aviso', 'avisos')} para leerlos aquí`)));
    }
    v.append(card);
  });
  v.append(h('div', {style:'display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:18px;position:sticky;bottom:12px;background:var(--card);border:1px solid var(--line-2);border-radius:14px;padding:10px 12px;box-shadow:var(--shadow);z-index:5'},
    h('button', {class:'btn hlbtn', type:'button', onclick:applyWebc}, '✓ Guardar en Calculai'),
    h('button', {class:'btn ghost', type:'button', onclick:() => { pendingWebc = null; go(D.subjects.length ? 'ahora' : 'ahora'); }}, 'Cancelar')));
}
function applyWebc(){
  const W2 = pendingWebc; if (!W2) return;
  let nS = 0, nE = 0, nU = 0, nR = 0, nN = 0;
  W2.courses.filter(r => r.include).forEach(row => {
    const c = row.c; let sid = row.target;
    if (sid === 'new'){ sid = uid('s'); D.subjects.push({id:sid, name:c.name, short:c.short || c.name.split(' ')[0], code:c.code || '', color:COLORS[D.subjects.length % COLORS.length], prof:c.section || '', note:'Importada desde WebC.', webc:c.id, url:c.url}); nS++; }
    else { const s = D.subjects.find(x => x.id === sid); if (s){ s.webc = c.id; s.url = s.url || c.url; } }
    row.evs.filter(e => e.sel).forEach(e => {
      const ex = D.events.find(x => x.webc === e.id);
      const n = {subj:sid, kind:e.kind, name:e.name, date:e.date, time:e.time, slot:'', ver:true, src:`WebC · calendario del curso (${fmtD(parse(W2.at.slice(0, 10)))})`, topics:[], scopeNote:'', note:'', webc:e.id, url:e.url};
      if (ex){ Object.assign(ex, n); nU++; } else { D.events.push({id:uid('ev'), ...n}); nE++; }
    });
    row.sugg.filter(x => x.sel && x.date).forEach(x => {
      const ex = D.events.find(e => e.webc === x.id);
      const n = {subj:sid, kind:x.kind, name:x.name.trim() || x.newsTitle, date:x.date, time:(x.time || '').trim(), slot:'', ver:true, src:`WebC · aviso «${x.newsTitle}»${x.newsDate ? ' (' + fmtD(parse(x.newsDate)) + ')' : ''}`, topics:[], scopeNote:'', note:'Fecha leída automáticamente del aviso y revisada por ti al importar.', webc:x.id};
      if (ex){ Object.assign(ex, n); nU++; } else { D.events.push({id:uid('ev'), ...n}); nE++; }
    });
    if (row.addRes) c.resources.forEach(r => { if (!D.resources.some(x => x.url === r.url)){ D.resources.push({id:uid('r'), subj:sid, title:r.name, kind:({resource:'Archivo', url:'Enlace', folder:'Carpeta', page:'Página', assign:'Tarea', quiz:'Cuestionario', book:'Libro'}[r.type] || 'Recurso') + (r.section ? ' · ' + r.section : ''), url:r.url, webc:true}); nR++; } });
    if (row.addNews){ D.news = (D.news || []).filter(n => n.subj !== sid); c.news.forEach(n => D.news.push({id:'n-' + n.id, subj:sid, title:n.title, url:n.url, author:n.author, date:newsDate(n), text:n.text})); nN += c.news.length; }
  });
  D.sync = D.sync || {}; D.sync.webc = {origin:W2.origin, at:W2.at};
  pendingWebc = null; save(); go('ahora');
  toast(`WebC: ${nS} materias nuevas · ${nE} fechas nuevas · ${nU} actualizadas · ${nR} recursos · ${nN} avisos`);
}

/* =========================================================
   TEMA, PWA, ARRANQUE
   ========================================================= */
function toggleTheme(){
  const r = document.documentElement, darkNow = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  r.dataset.theme = darkNow ? 'light' : 'dark'; try { localStorage.setItem('calculai-theme', r.dataset.theme); } catch {}
  const mt = document.querySelector('meta[name=theme-color]'); if (mt) mt.content = r.dataset.theme === 'dark' ? '#0c2140' : '#f5f2e8';
  if (tab === 'mapa') render();
}
function syncBadge(){ const el = $('#sync'); if (!el) return; el.dataset.s = storageOk ? 'local' : 'none'; $('#syncTxt').textContent = storageOk ? 'Guardado en este dispositivo' : 'Sin guardar (descarga un respaldo)'; }
try { const th = localStorage.getItem('calculai-theme'); if (th) document.documentElement.dataset.theme = th; } catch {}
document.addEventListener('DOMContentLoaded', () => {
  $('#todayLbl').textContent = cap(fmtD(TODAY)) + ' · ' + TODAY.getFullYear();
  $('#themeBtn').addEventListener('click', toggleTheme);
  $('#palBtn').addEventListener('click', openPal);
  $('#palIn').addEventListener('input', e => palFilter(e.target.value));
  $('#palIn').addEventListener('keydown', e => {
    if (e.key === 'ArrowDown'){ palSel = Math.min(palItems.length - 1, palSel + 1); drawPal(); e.preventDefault(); }
    else if (e.key === 'ArrowUp'){ palSel = Math.max(0, palSel - 1); drawPal(); e.preventDefault(); }
    else if (e.key === 'Enter' && palItems[palSel]){ const x = palItems[palSel]; closePal(); x.run(); }
  });
  $('#pal').addEventListener('click', e => { if (e.target.id === 'pal') closePal(); });
  $('#scrim').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'){ e.preventDefault(); $('#pal').classList.contains('on') ? closePal() : openPal(); }
    else if (e.key === 'Escape'){ if ($('#pal').classList.contains('on')) closePal(); else if ($('#drawer').classList.contains('open')) closeDrawer(); }
  });
  let deferred = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('#installBtn').hidden = false; });
  $('#installBtn').addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; $('#installBtn').hidden = true; });
  syncBadge(); render();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
});
