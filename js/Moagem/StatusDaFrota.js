// ============================================================
// js/Moagem/StatusDaFrota.js
// Responsabilidade: Renderizar os cards de Status da Frota
//   (Frota Registrada, Ativas, Parados, Ida, Campo, Volta,
//    Descarga, Fila Externa, Carretas Carregadas)
// ============================================================
// ⚠️ DEPENDÊNCIA CRUZADA
// Depende de: app.js (estado global — chama initStatusDaFrota / updateStatusDaFrota)
// Interage com: InformativoOperacional.js (mesma aba Moagem, dados do mesmo analysisResult)
// Se alterar IDs dos elementos HTML, revisar também index.html
// ============================================================

/** IDs dos elementos DOM que este módulo gerencia */
const FROTA_ELEMENT_IDS = {
    registrada:        'frotaRegistrada',
    ativas:            'frotaAtivas',
    parados:           'frotaParados',
    ida:               'frotaIda',
    campo:             'frotaCampo',
    volta:             'frotaVolta',
    descarga:          'frotaDescarga',
    filaExterna:       'frotaFilaExterna',
    carretasCarregadas:'carretasCarregadas'
};

/**
 * Inicializa o bloco Status da Frota com os dados do analysisResult.
 * @param {Object} analysisResult - Resultado completo do DataAnalyzer.analyzeAll()
 */
function initStatusDaFrota(analysisResult) {
    _injectFrotaStyles();
    if (!analysisResult) return;
    _renderFrotaCards(analysisResult);
}

/**
 * Atualiza o bloco Status da Frota com novos dados.
 * Pode ser chamado em qualquer momento sem reinicializar.
 * @param {Object} analysisResult
 */
function updateStatusDaFrota(analysisResult) {
    if (!analysisResult) return;
    _renderFrotaCards(analysisResult);
}

// ─────────────────────────────────
// PRIVADO
// ─────────────────────────────────

/**
 * ✅ CORREÇÃO: Injeta estilos para que os valores dos cards de frota
 * não quebrem para a segunda linha.
 *
 * O problema era que "63" (Frota Registrada) ficava grande demais e
 * "14 Carretas Carregadas" quebrava.
 *
 * Solução: limitar o font-size dos valores dentro dos fleet-cards e
 * garantir que os labels usem white-space: nowrap quando em linha.
 */
function _injectFrotaStyles() {
    if (document.getElementById('frota-compact-fix')) return;
    const style = document.createElement('style');
    style.id = 'frota-compact-fix';
    style.innerHTML = `
        /* ── Status Frota: cards bem distribuídos e espaçosos ── */
        .fleet-card .card-value,
        .info-compact-card[data-frota] .card-value {
            font-size: clamp(1.2rem, 2.5vw, 2rem) !important;
            line-height: 1.1 !important;
            font-weight: 900 !important;
            white-space: nowrap !important;
        }
        .fleet-card .card-label,
        .info-compact-card[data-frota] .card-label {
            font-size: clamp(0.65rem, 1.2vw, 0.8rem) !important;
            white-space: normal !important;
            text-align: center !important;
            line-height: 1.3 !important;
        }
        /* Cada card ocupa espaço proporcional — sem compressão excessiva */
        .fleet-grid,
        .frota-grid {
            display: grid !important;
            grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)) !important;
            gap: 12px !important;
            width: 100% !important;
        }
        .fleet-card,
        .info-compact-card[data-frota] {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 14px 10px !important;
            min-height: 80px !important;
            border-radius: 10px !important;
        }
        @media (max-width: 600px) {
            .fleet-grid, .frota-grid {
                grid-template-columns: repeat(3, 1fr) !important;
                gap: 8px !important;
            }
        }
    `;
    document.head.appendChild(style);
}

/**
 * Extrai os valores de frota do analysisResult e atualiza o DOM.
 * Suporta múltiplos formatos de propriedade para compatibilidade
 * com diferentes versões do DataAnalyzer.
 */
function _renderFrotaCards(analysisResult) {
    const fleet = analysisResult.fleetStatus
        || analysisResult.statusFrota
        || {};

    const frota = {
        registrada:        _getVal(fleet, ['registrada', 'total', 'frotaRegistrada'], 0),
        ativas:            _getVal(fleet, ['ativas', 'ativas', 'frotaAtivas'], 0),
        parados:           _getVal(fleet, ['parados', 'inativos', 'frotaParados'], 0),
        ida:               _getVal(fleet, ['ida', 'emIda', 'frotaIda'], 0),
        campo:             _getVal(fleet, ['campo', 'emCampo', 'frotaCampo'], 0),
        volta:             _getVal(fleet, ['volta', 'emVolta', 'frotaVolta'], 0),
        descarga:          _getVal(fleet, ['descarga', 'emDescarga', 'frotaDescarga'], 0),
        filaExterna:       _getVal(fleet, ['filaExterna', 'fila', 'fila_externa'], 0),
        carretasCarregadas:_getVal(fleet, ['carretasCarregadas', 'carretas', 'carregadas'], 0)
    };

    // Calcula parados se não vier explícito
    if (frota.parados === 0 && frota.registrada > 0 && frota.ativas > 0) {
        frota.parados = Math.max(0, frota.registrada - frota.ativas);
    }

    // Atualiza DOM
    Object.entries(FROTA_ELEMENT_IDS).forEach(([key, id]) => {
        _setText(id, frota[key] ?? 0);
    });

    // Aplica cor ao card de parados (vermelho se > 0)
    _applyParadosColor(frota.parados);
}

/**
 * Aplica cor vermelha no card de parados quando há frotas paradas.
 */
function _applyParadosColor(qtd) {
    const el = document.getElementById(FROTA_ELEMENT_IDS.parados);
    if (!el) return;
    const card = el.closest('.fleet-card') || el.closest('.info-compact-card') || el.parentElement;
    if (!card) return;
    if (qtd > 0) {
        card.style.borderLeftColor = '#FF2E63';
        el.style.setProperty('color', '#FF2E63', 'important');
    } else {
        card.style.borderLeftColor = '#40800c';
        el.style.setProperty('color', '#40800c', 'important');
    }
}

function _setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function _getVal(obj, keys, fallback) {
    for (const k of keys) {
        if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') {
            return Number(obj[k]) || 0;
        }
    }
    return fallback;
}

// Expõe globalmente para compatibilidade com scripts não-module
window.StatusDaFrota = { init: initStatusDaFrota, update: updateStatusDaFrota };
