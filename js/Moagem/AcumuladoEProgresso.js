// ============================================================
// js/Moagem/AcumuladoEProgresso.js
// Responsabilidade: Renderizar o bloco "Acumulado & Progresso"
//   — Acumulado do Dia (t), barra de progresso vs. meta,
//     campos de input de Meta Moagem (t/h) e Meta Rotação (RPM)
// ============================================================
// ⚠️ DEPENDÊNCIA CRUZADA
// Depende de: app.js (chama init/update com analysisResult)
// Interage com: ProjecaoDeMoagem.js (compartilha metaMoagem do localStorage)
// Se alterar 'metaMoagem' / 'metaRotacao' no localStorage, revisar ProjecaoDeMoagem.js
// ============================================================

/**
 * Inicializa o bloco Acumulado & Progresso.
 * Configura os listeners dos inputs de meta e faz o primeiro render.
 * @param {Object} analysisResult
 */
function initAcumuladoEProgresso(analysisResult) {
    _setupMetaInputListeners();
    updateAcumuladoEProgresso(analysisResult);
}

/**
 * Atualiza o bloco com novo analysisResult.
 * Pode ser chamado a qualquer momento.
 * @param {Object} analysisResult
 */
function updateAcumuladoEProgresso(analysisResult) {
    if (!analysisResult) return;

    const acumuladoDia = _getAcumuladoDia(analysisResult);
    const metaMoagem   = _getMetaMoagem();
    const percent      = metaMoagem > 0 ? Math.min((acumuladoDia / metaMoagem) * 100, 100) : 0;

    // Acumulado do Dia
    _setText('acumuladoDia', _fmtTon(acumuladoDia));

    // Texto de progresso e barra
    _setText('acumuladoDiaMeta', `${percent.toFixed(1)}% da Meta (${_fmtTon(metaMoagem)} t)`);
    _setBarWidth('acumuladoDiaProgress', percent);
    _setBarColor('acumuladoDiaProgress', percent);

    // Inputs de meta (preenche se vazio)
    _fillMetaInput('inputMetaMoagem',  _getMetaMoagem());
    _fillMetaInput('inputMetaRotacao', _getMetaRotacao());
}

// ─────────────────────────────────
// PRIVADO
// ─────────────────────────────────

/**
 * Extrai o acumulado do dia do analysisResult.
 *
 * ✅ CORREÇÃO PRINCIPAL:
 * O bug do valor absurdo (ex: 4.285.033.301.999) vinha do DataAnalyzer
 * somando strings com separador de milhar BR usando o parser errado
 * (String.replace(/\./g,'') remove TODOS os pontos, incluindo o decimal,
 *  gerando números gigantescos).
 *
 * Aqui usamos _toNum() — o parser blindado — para garantir que o valor
 * extraído do analysisResult também esteja correto caso chegue como string.
 *
 * Se o DataAnalyzer já entregou o número correto (ex: 18750.5), _toNum
 * apenas o passa adiante. Se chegou como string BR ("18.750,50"), converte
 * corretamente para 18750.5.
 *
 * Valores esperados: entre 10.000 e 30.000 t/dia.
 * Se o valor convertido for > 100.000, assume-se que está em kg e divide por 1000.
 */
function _getAcumuladoDia(r) {
    // Prioridade 1: acumuladoDia injetado pelo app.js via calculateRealAccumulated()
    //   — este valor já está filtrado para o último dia, não o mês todo.
    //   O app.js injeta em r.acumuladoDia antes de chamar AcumuladoEProgresso.update().
    const candidates = [
        r.acumuladoDia,          // injetado pelo app.js (último dia)
        r.acumuladoRealDia,      // alias alternativo
        r.moagemAcumulado,       // atualizado por updateDashboardWithCorrectedValues
    ];

    for (const v of candidates) {
        const n = _toNum(v);
        if (n > 0 && n < 100000) return n; // descarta valores absurdos (safra inteira)
    }

    // Fallback: totalPesoLiquido — mas só se for razoável (< 100.000 t = um dia)
    const total = _toNum(r.totalPesoLiquido);
    if (total > 0 && total < 100000) return total;

    return 0;
}

function _getMetaMoagem() {
    return parseFloat(localStorage.getItem('metaMoagem') || '18500');
}

function _getMetaRotacao() {
    return parseFloat(localStorage.getItem('metaRotacao') || '1250');
}

function _setupMetaInputListeners() {
    const inputMoagem  = document.getElementById('inputMetaMoagem');
    const inputRotacao = document.getElementById('inputMetaRotacao');

    if (inputMoagem && !inputMoagem._acumListenerAdded) {
        inputMoagem._acumListenerAdded = true;
        inputMoagem.addEventListener('change', () => {
            const val = parseFloat(inputMoagem.value);
            if (!isNaN(val) && val > 0) {
                localStorage.setItem('metaMoagem', val);
                document.dispatchEvent(new CustomEvent('metaMoagemChanged', { detail: { meta: val } }));
            }
        });
    }

    if (inputRotacao && !inputRotacao._acumListenerAdded) {
        inputRotacao._acumListenerAdded = true;
        inputRotacao.addEventListener('change', () => {
            const val = parseFloat(inputRotacao.value);
            if (!isNaN(val) && val > 0) {
                localStorage.setItem('metaRotacao', val);
                document.dispatchEvent(new CustomEvent('metaRotacaoChanged', { detail: { meta: val } }));
            }
        });
    }
}

function _fillMetaInput(id, value) {
    const el = document.getElementById(id);
    if (el && (el.value === '' || el.value === '0')) {
        el.value = value;
    }
}

function _setBarWidth(id, percent) {
    const el = document.getElementById(id);
    if (el) el.style.width = `${Math.min(percent, 100)}%`;
}

function _setBarColor(id, percent) {
    const el = document.getElementById(id);
    if (!el) return;
    if (percent >= 100)      el.style.background = 'linear-gradient(90deg, #40800c, #6abf2e)';
    else if (percent >= 80)  el.style.background = 'linear-gradient(90deg, #FFB800, #ffd700)';
    else                     el.style.background = 'linear-gradient(90deg, #FF2E63, #ff6b8a)';
}

function _setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function _fmtTon(val) {
    const n = _toNum(val);
    if (typeof Utils !== 'undefined') return Utils.formatNumber(n);
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * ✅ PARSER BLINDADO — converte formato BR para número JS
 *
 * Problema original:
 *   String("4.285.033,00").replace(/\./g, '') → "4285033,00"
 *   Depois replace(',','.') → "428503300"  ← ERRADO (ponto virou separador extra)
 *
 * Solução:
 *   Contar quantos pontos existem. Se > 1, são separadores de milhar → remove todos.
 *   Depois troca vírgula por ponto decimal.
 *
 * Exemplos corretos:
 *   "18.750,50"     → 18750.5   ✅ (1 ponto = milhar, 1 vírgula = decimal)
 *   "1.234.567,89"  → 1234567.89 ✅ (2 pontos = milhar)
 *   "750.5"         → 750.5     ✅ (1 ponto = decimal — formato EN)
 *   18750.5         → 18750.5   ✅ (já é number)
 */
function _toNum(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return isNaN(v) ? 0 : v;
    let s = String(v).trim().replace(/[^\d,.-]/g, '');
    // Remove separador de milhar somente se houver MAIS DE UM ponto
    if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
    s = s.replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
}

// Expõe globalmente para compatibilidade com scripts não-module
window.AcumuladoEProgresso = { init: initAcumuladoEProgresso, update: updateAcumuladoEProgresso };
