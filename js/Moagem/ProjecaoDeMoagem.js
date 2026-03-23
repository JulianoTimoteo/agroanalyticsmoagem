// ============================================================
// js/Moagem/ProjecaoDeMoagem.js
// Responsabilidade: Calcular e renderizar a Projeção de Moagem
//   — Previsão 24h (t), badge meta/abaixo, diferença vs. meta
// ============================================================
// ⚠️ DEPENDÊNCIA CRUZADA
// Depende de: app.js (chama init/update com analysisResult)
// Interage com: AcumuladoEProgresso.js (escuta 'metaMoagemChanged')
// Se alterar lógica de projecaoMoagem no DataAnalyzer, revisar aqui
// ============================================================

let _lastAnalysis = null;

/**
 * Inicializa o bloco Projeção de Moagem.
 * Escuta mudanças de meta para recalcular.
 * @param {Object} analysisResult
 */
function initProjecaoDeMoagem(analysisResult) {
    _listenMetaChanges();
    updateProjecaoDeMoagem(analysisResult);
}

/**
 * Atualiza a projeção com novo analysisResult.
 * @param {Object} analysisResult
 */
function updateProjecaoDeMoagem(analysisResult) {
    if (!analysisResult) return;
    _lastAnalysis = analysisResult;
    _render(analysisResult);
}

// ─────────────────────────────────
// PRIVADO
// ─────────────────────────────────

function _listenMetaChanges() {
    document.addEventListener('metaMoagemChanged', () => {
        if (_lastAnalysis) _render(_lastAnalysis);
    });
}

function _render(r) {
    const forecast   = _getForecast(r);
    const meta       = parseFloat(localStorage.getItem('metaMoagem') || '18500');
    const diff       = forecast - meta;
    const isAbove    = diff >= 0;
    const COLOR_OK   = '#40800c';
    const COLOR_NOK  = '#FF2E63';
    const activeColor = isAbove ? COLOR_OK : COLOR_NOK;

    // Valor principal
    const elVal = document.getElementById('moagemForecast');
    if (elVal) {
        elVal.textContent = _fmtTon(forecast) + ' t';
        elVal.style.setProperty('color', activeColor, 'important');
    }

    // Badge status
    const elBadge = document.getElementById('moagemStatus');
    if (elBadge) {
        elBadge.textContent = isAbove ? '✓ Bater a meta' : '✗ Abaixo da meta';
        elBadge.style.color            = activeColor;
        elBadge.style.borderColor      = activeColor;
        elBadge.style.backgroundColor  = isAbove
            ? 'rgba(64,128,12,0.1)' : 'rgba(255,46,99,0.1)';
    }

    // Diferença
    const elDiff = document.getElementById('forecastDiff');
    if (elDiff) {
        const sign = isAbove ? '+' : '';
        elDiff.textContent = `${sign}${_fmtTon(diff)} t vs. meta`;
        elDiff.style.color = activeColor;
    }

    // Barra de progresso da projeção
    const pct = meta > 0 ? Math.min((forecast / meta) * 100, 120) : 0;
    _setBar('projecaoProgress', pct);
}

/**
 * ✅ CORRIGIDO: extrai o forecast usando _toNum para evitar valores absurdos.
 *
 * Fórmula de fallback:
 *   projeção = (acumuladoDia / horasDecorridasAgro) × 24
 *
 * Dia agrícola começa às 06:00. Se agora são 14:00, decorreram 8h.
 * Se acumulado = 6.000 t em 8h → projeção = (6000/8)×24 = 18.000 t. ✅
 */
function _getForecast(r) {
    // Prioridade 1: campo já calculado pelo DataAnalyzer
    if (r.projecaoMoagem && r.projecaoMoagem.forecast > 0) {
        const v = _toNum(r.projecaoMoagem.forecast);
        if (v > 0) return v;
    }

    // Prioridade 2: campos alternativos
    for (const campo of ['moagemForecast', 'forecast']) {
        const v = _toNum(r[campo]);
        if (v > 0) return v;
    }

    // Prioridade 3: calcula a partir do acumulado do dia
    const acum = _toNum(r.totalPesoLiquido || r.moagemAcumulado || 0);
    if (acum > 0) {
        const now   = new Date();
        const hora  = now.getHours() + now.getMinutes() / 60;
        // Horas decorridas desde 06:00 (dia agrícola)
        const horasAgro = ((hora - 6 + 24) % 24) || 1;
        return (acum / horasAgro) * 24;
    }

    return 0;
}

function _setBar(id, pct) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.width = `${Math.min(pct, 100)}%`;
    if (pct >= 100)     el.style.background = 'linear-gradient(90deg, #40800c, #6abf2e)';
    else if (pct >= 80) el.style.background = 'linear-gradient(90deg, #FFB800, #ffd700)';
    else                el.style.background = 'linear-gradient(90deg, #FF2E63, #ff6b8a)';
}

function _fmtTon(val) {
    const n = _toNum(val);
    if (typeof Utils !== 'undefined') return Utils.formatNumber(n);
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * ✅ PARSER BLINDADO — mesmo padrão de AcumuladoEProgresso.js
 * Garante que "18.750,50" → 18750.5 e não 1875050.
 */
function _toNum(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return isNaN(v) ? 0 : v;
    let s = String(v).trim().replace(/[^\d,.-]/g, '');
    if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
    s = s.replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
}

// Expõe globalmente para compatibilidade com scripts não-module
window.ProjecaoDeMoagem = { init: initProjecaoDeMoagem, update: updateProjecaoDeMoagem };
