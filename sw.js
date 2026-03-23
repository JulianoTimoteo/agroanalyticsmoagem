// sw.js — AgroAnalytics Service Worker v2.0
// ⚠️ NUNCA REMOVA O SNAPSHOT_CACHE — é o que permite abertura offline instantânea
// Estratégia: Cache-First para shell, Snapshot para dados Firebase

const SHELL_CACHE    = 'agro-shell-v2';
const SNAPSHOT_CACHE = 'agro-snapshot-v1'; // dados Firebase salvos para offline
const CACHE_TIMEOUT  = 3000;

const SHELL_ASSETS = [
    './', './index.html', './app.js',
    './manifest.json',
    './css/base/main.css', './css/base/mobile.css',
    './js/core/intelligent-processor.js',
    './js/core/dataanalyzer.js',
    './js/core/datavisualizer.js',
    './js/core/data-analyzer-kpis.js',
    './js/core/data-analyzer-metas.js',
    './js/core/data-analyzer-rankings.js',
    './js/core/data-analyzer-time.js',
    './js/core/datavalidator.js',
    './js/Moagem/InformativoOperacional.js',
    './js/Moagem/AcumuladoEProgresso.js',
    './js/Moagem/AcumuladoEProgresso_charts.js',
    './js/Moagem/ProjecaoDeMoagem.js',
    './js/Moagem/StatusDaFrota.js',
    './js/Moagem/VisaoHorariaDetalhada_charts.js',
    './js/Consumo/ConsumoPerformance.js',
    './js/VisaoGlobal/VisaoGlobal.js',
    './js/OEE/Oee_analyzer.js',
    './js/OEE/OEE_renderer.js',
    './js/OEE/OEE_unified.js',
    './js/shared/oee-fleet-classifier.js',
    './js/shared/Mobile_revolution.js',
    './js/shared/modtv.js',
    './js/shared/utils.js',
    './js/EntregaHXH/TimelineHXH.js',
    './js/EntregaHXH/ViagensPorHora.js',
    './js/EntregaHXH/PesoPorFrente.js',
    './js/Caminhoes/GraficoRotaCaminhoes.js',
    './js/Caminhoes/RankingCaminhoes.js',
    './js/Colhedoras/GraficoDisponibilidade.js',
    './js/Colhedoras/RankingColhedoras.js',
    './js/FrenteDeTrabalho/FrenteGrid.js',
    './js/Metas/MetasGrid.js',
    './js/Usuarios/FormUsuario.js',
    './js/Usuarios/ListaUsuarios.js',
    './css/Caminhoes/Caminhoes.css',
    './css/Colhedoras/Colhedoras.css',
    './css/Consumo/Consumo.css',
    './css/EntregaHXH/EntregaHXH.css',
    './css/FrenteDeTrabalho/FrenteDeTrabalho.css',
    './css/Metas/Metas.css',
    './css/Moagem/AcumuladoEProgresso.css',
    './css/Moagem/InformativoOperacional.css',
    './css/Moagem/Moagem.css',
    './css/Moagem/ProjecaoDeMoagem.css',
    './css/Moagem/StatusDaFrota.css',
    './css/Moagem/VisaoHorariaDetalhada.css',
    './css/OEE/oee.css',
    './css/Usuarios/Usuarios.css',
    './css/VisaoGlobal/VisaoGlobal.css',
];

// ── INSTALL ───────────────────────────────────────────────────
self.addEventListener('install', event => {
    console.log('[SW] Instalando shell v2...');
    event.waitUntil(
        caches.open(SHELL_CACHE).then(cache =>
            Promise.allSettled(SHELL_ASSETS.map(url =>
                cache.add(url).catch(() => console.warn('[SW] Não cacheado:', url))
            ))
        ).then(() => self.skipWaiting())
    );
});

// ── ACTIVATE ──────────────────────────────────────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== SHELL_CACHE && k !== SNAPSHOT_CACHE)
                    .map(k => { console.log('[SW] Removendo cache antigo:', k); return caches.delete(k); })
            )
        ).then(() => self.clients.claim())
    );
});

// ── FETCH ─────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // APIs externas — não intercepta
    if (url.hostname.includes('google') ||
        url.hostname.includes('firebase') ||
        url.hostname.includes('googleapis') ||
        url.hostname.includes('gstatic') ||
        url.hostname.includes('groq') ||
        url.hostname.includes('cloudflare') ||
        url.protocol === 'chrome-extension:') {
        return;
    }

    // Assets locais: Cache-First
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(response => {
                if (response && response.status === 200 && response.type !== 'opaque') {
                    const cloned = response.clone();
                    caches.open(SHELL_CACHE).then(c => c.put(event.request, cloned));
                }
                return response;
            }).catch(() => {
                if (event.request.mode === 'navigate') return caches.match('./index.html');
            });
        })
    );
});

// ── SNAPSHOT MESSAGE API ───────────────────────────────────────
// O app.js envia mensagens para salvar/carregar snapshot de dados Firebase
self.addEventListener('message', event => {
    const { type, payload, cacheKey } = event.data || {};

    if (type === 'SAVE_SNAPSHOT') {
        // Salva snapshot dos dados Firebase no cache do SW
        // Isso permite carregar offline sem depender do Firebase
        caches.open(SNAPSHOT_CACHE).then(cache => {
            const key = cacheKey || '/agroanalytics-snapshot';
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            const response = new Response(blob, {
                headers: { 'Content-Type': 'application/json', 'X-Cached-At': new Date().toISOString() }
            });
            return cache.put(key, response);
        }).then(() => {
            event.source && event.source.postMessage({ type: 'SNAPSHOT_SAVED', key: cacheKey });
        }).catch(e => console.error('[SW] Erro ao salvar snapshot:', e));
    }

    if (type === 'LOAD_SNAPSHOT') {
        const key = cacheKey || '/agroanalytics-snapshot';
        caches.open(SNAPSHOT_CACHE).then(cache => cache.match(key)).then(response => {
            if (!response) {
                event.source && event.source.postMessage({ type: 'SNAPSHOT_NOT_FOUND', key });
                return;
            }
            response.json().then(data => {
                event.source && event.source.postMessage({ type: 'SNAPSHOT_LOADED', payload: data, key });
            });
        }).catch(e => {
            event.source && event.source.postMessage({ type: 'SNAPSHOT_ERROR', error: String(e) });
        });
    }

    if (type === 'CLEAR_SNAPSHOT') {
        caches.delete(SNAPSHOT_CACHE).then(() => {
            event.source && event.source.postMessage({ type: 'SNAPSHOT_CLEARED' });
        });
    }
});
