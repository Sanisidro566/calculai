// ==UserScript==
// @name         Calculai · revisión automática de WebC
// @namespace    https://sanisidro566.github.io/calculai/
// @version      1.2.0
// @description  Cada vez que abres Calculai, revisa WebC (con tu sesión ya iniciada) y trae fechas, avisos y recursos nuevos. No pide ni guarda contraseñas.
// @match        https://sanisidro566.github.io/calculai/*
// @connect      webc.uai.cl
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @run-at       document-idle
// @noframes
// @updateURL    https://sanisidro566.github.io/calculai/calculai-sync.user.js
// @downloadURL  https://sanisidro566.github.io/calculai/calculai-sync.user.js
// ==/UserScript==
/* Cómo funciona
   - Calculai (la página) le pide a este script una revisión al abrirse.
   - El script lee WebC con TU sesión del navegador, igual que el marcador «Enviar a Calculai»
     (mismas páginas y mismas funciones de Moodle), y le entrega los datos a Calculai.
   - Solo lee a fondo los cursos que ya son materias en Calculai (por id de WebC o por código).
     Los demás cursos solo se listan, para que Calculai te pregunte si quieres agregarlos.
   - Los avisos que Calculai ya tiene no se vuelven a abrir. Por eso, desde la segunda vez, es rápido.
   - Si no has iniciado sesión en WebC, se lo avisa a Calculai para que te muestre «Inicia sesión en WebC».
   - Nada se envía a otros servidores. Solo responde a mensajes de la propia página de Calculai.
   Versión 1.1.0: cursos y avisos en paralelo, avisos ya conocidos se saltan, máximo 100 s por revisión.
  Versión 1.1.1: funciona dentro del entorno aislado de Tampermonkey (antes ignoraba el pedido de Calculai)
    y siempre responde, aunque WebC no conteste.
  Versión 1.2.0: cuando eliges archivos en «Crear clases con mi material», trae ese archivo de WebC
    (solo archivos y páginas de un curso: /mod/resource, /mod/page o /pluginfile.php; nada más). */
(function(){
  'use strict';
  var VERSION = '1.2.0';
  /* Ajustes de velocidad */
  var PAR_COURSES = 3;      // cursos leídos a la vez
  var PAR_NEWS = 3;         // avisos leídos a la vez dentro de un curso
  var MAX_NEWS = 6;         // avisos recientes que se miran por curso
  var REQ_TIMEOUT = 20000;  // máximo por página (ms)
  var TOTAL_LIMIT = 100000; // máximo para toda la revisión (ms): después entrega lo que alcanzó
  var gmx = (typeof GM_xmlhttpRequest === 'function') ? GM_xmlhttpRequest : (typeof GM !== 'undefined' && GM.xmlHttpRequest) ? GM.xmlHttpRequest : null;
  var ORIGIN = location.origin;
  function post(msg){ window.postMessage(msg, ORIGIN); }
  if (!gmx){ post({type:'calculai-agent-hello', v:VERSION, ok:false, why:'Tu gestor de scripts no permite leer otras páginas (falta GM_xmlhttpRequest).'}); return; }

  function req(method, url, body, headers){
    return new Promise(function(resolve, reject){
      gmx({method:method, url:url, data:body, headers:headers || {}, anonymous:false, withCredentials:true, timeout:REQ_TIMEOUT,
        onload:function(r){ resolve({status:r.status, url:r.finalUrl || url, text:r.responseText || ''}); },
        onerror:function(){ reject(new Error('red')); }, ontimeout:function(){ reject(new Error('tiempo')); }});
    });
  }
  function htmlDoc(t){ return new DOMParser().parseFromString(t, 'text/html'); }

  var busy = false;
  window.addEventListener('message', function(ev){
    /* Solo mensajes de la propia página de Calculai. No se compara ev.source con window: en Tampermonkey
       `window` es un envoltorio de la ventana real y esa comparación descartaba todos los pedidos. */
    if (ev.origin !== ORIGIN || !ev.data || typeof ev.data !== 'object') return;
    if (ev.data.type === 'calculai-agent-ping') post({type:'calculai-agent-hello', v:VERSION, ok:true});
    if (ev.data.type === 'calculai-file-request' && typeof ev.data.id === 'string' && typeof ev.data.url === 'string'){
      var fid = ev.data.id.slice(0, 40);
      fileQueue = fileQueue.then(function(){ return getFile(ev.data.url); }).then(function(f){
        post({type:'calculai-file', id:fid, ok:true, name:f.name, ctype:f.ctype, buf:f.buf});
      }, function(e){ post({type:'calculai-file', id:fid, ok:false, msg:String(e && e.message || e)}); });
    }
    if (ev.data.type === 'calculai-sync-request' && !busy){
      busy = true;
      /* Plazo duro: pase lo que pase con WebC, Calculai recibe una respuesta. */
      var hard = new Promise(function(_, reject){ setTimeout(function(){ reject(new Error('WebC tardó demasiado en responder')); }, TOTAL_LIMIT + 25000); });
      Promise.race([run(ev.data), hard]).catch(function(e){ post({type:'calculai-sync-status', state:'error', msg:String(e && e.message || e)}); }).then(function(){ busy = false; });
    }
  });
  post({type:'calculai-agent-hello', v:VERSION, ok:true});

  /* --- Archivos para «Crear clases con mi material» --- */
  var fileQueue = Promise.resolve(), FILE_MAX = 30e6;
  var hosts = {'webc.uai.cl':1};
  function fileUrlOk(u){
    try { u = new URL(u); } catch (e) { return false; }
    return u.protocol === 'https:' && hosts[u.hostname] && (/^\/mod\/(resource|page)\/view\.php$/.test(u.pathname) && /^\?id=\d+(&redirect=1)?$/.test(u.search) || /^\/pluginfile\.php\//.test(u.pathname));
  }
  function bin(url){
    return new Promise(function(resolve, reject){
      gmx({method:'GET', url:url, responseType:'arraybuffer', anonymous:false, withCredentials:true, timeout:90000,
        onload:function(r){ resolve({status:r.status, url:r.finalUrl || url, headers:r.responseHeaders || '', buf:r.response}); },
        onerror:function(){ reject(new Error('sin conexión con WebC')); }, ontimeout:function(){ reject(new Error('WebC tardó demasiado')); }});
    });
  }
  function header(h, k){ var m = h.match(new RegExp('^' + k + ':\\s*(.+)$', 'im')); return m ? m[1].trim() : ''; }
  function fileName(r){
    var cd = header(r.headers, 'content-disposition'), m = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i);
    try { return decodeURIComponent(m ? m[1] : (new URL(r.url).pathname.split('/').pop() || 'archivo')); } catch (e) { return 'archivo'; }
  }
  function getFile(url, hop){
    if (!fileUrlOk(url)) return Promise.reject(new Error('ese enlace no es un archivo de un curso de WebC'));
    if (/\/mod\/resource\//.test(url) && !/redirect=1/.test(url)) url += '&redirect=1';
    return bin(url).then(function(r){
      if (/\/login\//.test(r.url)) throw new Error('tu sesión de WebC se cerró: vuelve a entrar a WebC');
      if (r.status >= 400) throw new Error('WebC respondió ' + r.status);
      if (!r.buf || r.buf.byteLength > FILE_MAX) throw new Error('el archivo es muy grande (máximo 30 MB)');
      var ctype = header(r.headers, 'content-type');
      if (/text\/html/i.test(ctype) && /\/mod\/resource\//.test(url) && !hop){
        /* Algunos recursos muestran una página con el archivo incrustado: se busca el enlace al archivo. */
        var d = htmlDoc(new TextDecoder().decode(r.buf)), a = d.querySelector('#region-main a[href*="/pluginfile.php/"], object[data*="/pluginfile.php/"], iframe[src*="/pluginfile.php/"], a[href*="/pluginfile.php/"]');
        var next = a && (a.getAttribute('href') || a.getAttribute('data') || a.getAttribute('src'));
        if (!next) throw new Error('no encontré el archivo dentro de esa página de WebC');
        return getFile(new URL(next, r.url).href, true);
      }
      return {name:fileName(r), ctype:ctype, buf:r.buf};
    });
  }

  /* Ejecuta fn sobre items con como máximo n a la vez; respeta el orden de los resultados. */
  function pool(items, n, fn){
    var out = new Array(items.length), next = 0;
    function worker(){
      if (next >= items.length) return Promise.resolve();
      var k = next++;
      return Promise.resolve().then(function(){ return fn(items[k], k); }).then(function(r){ out[k] = r; }, function(){ out[k] = null; }).then(worker);
    }
    var ws = []; for (var w = 0; w < Math.min(n, items.length); w++) ws.push(worker());
    return Promise.all(ws).then(function(){ return out; });
  }

  function run(rq){
    var started = Date.now();
    function timeUp(){ return Date.now() - started > TOTAL_LIMIT; }
    var BASE = String(rq.base || 'https://webc.uai.cl').replace(/\/+$/, '');
    if (!/^https:\/\/[^/]+(\/[^?#]*)?$/.test(BASE) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(BASE)) return Promise.reject(new Error('dirección de Moodle no válida'));
    var want = (rq.courses || []).map(Number).filter(Boolean);
    var codes = (rq.codes || []).map(function(c){ return String(c).toUpperCase().replace(/[^A-Z0-9]/g, ''); }).filter(Boolean);
    var known = rq.known || {};
    post({type:'calculai-sync-status', state:'checking', msg:'abriendo WebC'});
    return req('GET', BASE + '/my/').then(function(r){
      var m = r.text.match(/"sesskey":"([^"]+)"/);
      if (r.status >= 400 || /\/login\//.test(r.url) || !m){ post({type:'calculai-sync-status', state:'login', base:BASE}); return; }
      var sesskey = m[1];
      var site = ((htmlDoc(r.text).title || '').split('|').pop() || '').trim();
      function ajax(methodname, args){
        return req('POST', BASE + '/lib/ajax/service.php?sesskey=' + encodeURIComponent(sesskey) + '&info=' + methodname, JSON.stringify([{index:0, methodname:methodname, args:args}]), {'Content-Type':'application/json'})
          .then(function(x){ var j = JSON.parse(x.text); if (!j || !j[0] || j[0].error) throw new Error((j && j[0] && j[0].exception && j[0].exception.errorcode) || 'ajax'); return j[0].data; });
      }
      function page(url){ return req('GET', url).then(function(x){ if (x.status >= 400) throw new Error(x.status); return htmlDoc(x.text); }); }
      post({type:'calculai-sync-status', state:'checking', msg:'leyendo tus cursos'});
      return ajax('core_course_get_enrolled_courses_by_timeline_classification', {classification:'inprogress', limit:0, offset:0, sort:'fullname'}).then(function(d){
        var all = (d.courses || []).filter(function(c){ return courseMeta(c).academic; });
        /* Solo se leen a fondo los cursos que ya son materias en Calculai (por id de WebC o por código). */
        function linked(c){ var mm = courseMeta(c); return want.indexOf(c.id) >= 0 || (!!mm.code && codes.indexOf(mm.code.toUpperCase()) >= 0); }
        var sel = all.filter(linked);
        var unlinked = all.filter(function(c){ return !linked(c); }).map(function(c){ var mm = courseMeta(c); return {id:c.id, name:mm.name, code:mm.code}; });
        return collect(BASE, site, sel, ajax, page, known, timeUp).then(function(payload){ payload.auto = true; payload.unlinked = unlinked; payload.ms = Date.now() - started; post(payload); });
      });
    }, function(e){
      /* WebC no abrió: casi siempre es la sesión cerrada (redirige al inicio de sesión de Microsoft) o falta de conexión. */
      post({type:'calculai-sync-status', state:'login', base:BASE, msg:String(e && e.message || e)});
    });
  }

  /* --- Igual que conector.js: mismas páginas y funciones de Moodle --- */
  var TYPE_WORDS = /\s+(Archivo|URL|Tarea|Foro|Carpeta|Cuestionario|Página|Pagina|Reunión de Zoom|E-Marking|Consulta|Etiqueta|File|Assignment|Forum|Folder|Quiz|Page)$/;
  function cleanName(a){ var inst = a.querySelector('.instancename'); var t = inst ? (inst.childNodes[0] ? inst.childNodes[0].textContent : inst.textContent) : a.textContent; return t.replace(/\s+/g, ' ').trim().replace(TYPE_WORDS, ''); }
  var ROMAN = /^(I|II|III|IV|V|VI|VII|VIII|IX|X)$/;
  function titleCase(s){ return s.toLowerCase().split(' ').map(function(w, i){ var up = w.toUpperCase(); if (ROMAN.test(up)) return up; if (i > 0 && /^(de|del|la|las|el|los|y|e|en|a|para)$/.test(w)) return w; return w.charAt(0).toUpperCase() + w.slice(1); }).join(' '); }
  function courseMeta(c){
    var full = (c.fullname || '').replace(/\s+/g, ' ').trim();
    var base = full.split(/\s+Sec\.|\s+Secci[oó]n|\s+STGO|\s+S-SEM/i)[0].trim();
    var name = base === base.toUpperCase() ? titleCase(base) : base;
    var code = ((c.shortname || '') + ' ' + (c.idnumber || '')).match(/[A-Z]{3,4}\d{3,4}/);
    var sec = full.match(/Sec\.?\s*(\d+)/i);
    return {name:name, short:name.split(' ')[0].slice(0, 18), code:code ? code[0] : '', section:sec ? 'Sección ' + sec[1] : '', academic:!!code};
  }
  function readDiscussion(page, L){
    return page(L.url).then(function(ddoc){
      var text = [], date = null, author = '';
      ddoc.querySelectorAll('article').forEach(function(ar, k){ var tx = ar.textContent || ''; tx = tx.replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim(); text.push(tx); if (k === 0){ var mm = tx.match(/de\s+(.+?)\s+-\s+\w+,\s+(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4}),\s+(\d{1,2}):(\d{2})/); if (mm){ author = mm[1].trim(); date = [mm[4], mm[3], mm[2], mm[5], mm[6]].join('|'); } } });
      return {id:L.id, title:L.title, url:L.url, author:author, date:date, text:text.join('\n\n———\n\n').slice(0, 5000)};
    });
  }
  function collect(BASE, site, courses, ajax, page, known, timeUp){
    var payload = {type:'calculai-webc', v:1, origin:BASE, site:site, at:new Date().toISOString(), courses:[], partial:false};
    var now = Math.floor(Date.now() / 1000), events = {}, done = 0;
    return Promise.all([
      ajax('core_calendar_get_action_events_by_timesort', {timesortfrom:now - 14 * 86400, limitnum:50}).catch(function(){ return {events:[]}; }),
      ajax('core_calendar_get_calendar_upcoming_view', {courseid:1, categoryid:0}).catch(function(){ return {events:[]}; })
    ]).then(function(rs){
      rs.forEach(function(r){ (r.events || []).forEach(function(e){ events[e.id] = e; }); });
      if (courses.length) post({type:'calculai-sync-status', state:'reading', msg:'0/' + courses.length});
      return pool(courses, PAR_COURSES, function(c){
        var m = courseMeta(c), url = BASE + '/course/view.php?id=' + c.id;
        var out = {id:c.id, fullname:c.fullname, shortname:c.shortname, url:url, name:m.name, short:m.short, code:m.code, section:m.section, events:[], resources:[], news:[]};
        Object.keys(events).forEach(function(k){ var e = events[k]; var cid = e.course ? e.course.id : e.courseid; if (cid === c.id) out.events.push({id:e.id, name:e.name, ts:e.timesort || e.timestart, type:e.modulename || e.eventtype || '', url:e.url || (e.action && e.action.url) || ''}); });
        function finish(){ payload.courses.push(out); done++; post({type:'calculai-sync-status', state:'reading', msg:done + '/' + courses.length}); }
        if (timeUp()){ payload.partial = true; finish(); return null; }
        return page(url).then(function(doc){
          var seen = {}, newsUrl = null;
          doc.querySelectorAll('#region-main a[href*="/mod/"], .course-content a[href*="/mod/"]').forEach(function(a){
            var href = new URL(a.getAttribute('href'), url).href; if (seen[href]) return; seen[href] = 1;
            var type = (href.match(/\/mod\/(\w+)\//) || [])[1] || 'otro';
            var name = cleanName(a); if (!name) return;
            var secEl = a.closest('[data-sectionname], li.section, .course-section'), section = '';
            if (secEl){ section = secEl.getAttribute('data-sectionname') || ((secEl.querySelector('.sectionname, h3') || {}).textContent || ''); section = section.replace(/\s+/g, ' ').trim(); }
            if (type === 'forum' && /^(avisos|anuncios|novedades|news|announcements)$/i.test(name) && !newsUrl) newsUrl = href;
            if (['resource','url','folder','page','assign','quiz','book'].indexOf(type) >= 0) out.resources.push({name:name, url:href, type:type, section:section});
          });
          if (!newsUrl) return;
          if (timeUp()){ payload.partial = true; return; }
          return page(newsUrl).then(function(fdoc){
            var links = [], s2 = {};
            fdoc.querySelectorAll('a[href*="discuss.php?d="]').forEach(function(a){ var u = new URL(a.getAttribute('href'), newsUrl).href.split('#')[0]; var t = a.textContent.replace(/\s+/g, ' ').trim(); if (!s2[u] && t && !/^\d+$/.test(t)){ s2[u] = 1; links.push({url:u, title:t, id:(u.match(/d=(\d+)/) || [])[1] || u}); } });
            links = links.slice(0, MAX_NEWS);
            /* Los avisos que Calculai ya tiene no se vuelven a abrir: se mandan solo con su id. */
            var have = (known[c.id] || []).map(String);
            links.forEach(function(L){ if (have.indexOf(String(L.id)) >= 0) out.news.push({id:L.id, title:L.title, url:L.url, known:true}); });
            var toRead = links.filter(function(L){ return have.indexOf(String(L.id)) < 0; });
            return pool(toRead, PAR_NEWS, function(L){ if (timeUp()){ payload.partial = true; return null; } return readDiscussion(page, L); })
              .then(function(rs){ rs.forEach(function(n){ if (n) out.news.push(n); }); });
          });
        }).catch(function(){}).then(finish);
      });
    }).then(function(){ return payload; });
  }
})();
