// ============================================================
// js/EntregaHXH/TimelineHXH.js
// Responsabilidade: Scroll horizontal de horas (06:00 → 05:59)
//   e filtro global por hora para a aba Entrega HxH
// ============================================================
// ⚠️ DEPENDÊNCIA CRUZADA
// Depende de: app.js (estado global — recebe dados brutos de produção)
// Interage com: ViagensPorHora.js, PesoPorFrente.js
//   Quando a hora muda, dispara evento 'hxhHoraChanged' que
//   ViagensPorHora.js e PesoPorFrente.js escutam
// Se alterar o nome do evento, revisar ViagensPorHora.js e PesoPorFrente.js
// ============================================================

/** Hora selecionada atualmente (null = todas) */
let _horaSelecionada = null;
/** Dados já filtrados para o último dia */
let _rawData = null;
/** Container do scroll */
let _container = null;

/**
 * Inicializa a timeline de horas.
 * @param {Object[]} producaoRows - Todas as linhas do CSV (pode ter vários dias)
 */
function initTimelineHXH(producaoRows) {
    _rawData = _filtrarUltimoDia(producaoRows || []);
    _horaSelecionada = null;
    _buildTimeline();
}

/**
 * Atualiza a timeline com novos dados sem recriar o DOM.
 * @param {Object[]} producaoRows
 */
function updateTimelineHXH(producaoRows) {
    _rawData = _filtrarUltimoDia(producaoRows || []);
    _buildTimeline();
}

/**
 * Retorna a hora atualmente selecionada (0-23) ou null se "todas".
 * @returns {number|null}
 */
function getHoraSelecionada() {
    return _horaSelecionada;
}

// ─────────────────────────────────
// PRIVADO
// ─────────────────────────────────

/**
 * ✅ FILTRO DO ÚLTIMO DIA
 *
 * O CSV consolidado (ex: PRODUCAO_08_2025) tem todos os dias do mês.
 * A aba HxH mostra somente o último dia com dados — ex: 31/08/2025.
 *
 * O rawData filtrado é também o que será enviado no evento 'hxhHoraChanged',
 * garantindo que ViagensPorHora.js e PesoPorFrente.js recebam dados corretos
 * mesmo que também façam o filtro internamente (sem duplo-filtro prejudicial).
 *
 * @param {Object[]} rows
 * @returns {Object[]}
 */
function _filtrarUltimoDia(rows) {
    if (!rows || rows.length === 0) return [];

    /**
     * Retorna o dia agrícola de um registro como string DD/MM/YYYY.
     * PRIORIDADE: campo "Dia Balanca" (já representa o dia agrícola 06:00-05:59).
     * FALLBACK: timestamp parseado com ajuste de janela agrícola.
     */
    const _diaAgricolaStr = (row) => {
        // 1. Dia Balanca é a fonte canônica do dia agrícola
        const diaBalanca = row['Dia Balanca'] || row['dia_balanca'] || row['DIA BALANCA'] || row['diaBal'] || '';
        if (diaBalanca) {
            const s = String(diaBalanca).trim();
            const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (m) return `${m[1].padStart(2,'0')}/${m[2].padStart(2,'0')}/${m[3]}`;
        }

        // 2. item.data injetado pelo IntelligentProcessor
        if (row.data) {
            const s = String(row.data).trim();
            const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (m) return `${m[1].padStart(2,'0')}/${m[2].padStart(2,'0')}/${m[3]}`;
        }

        // 3. timestamp Date com ajuste de janela agrícola (00-05h → dia anterior)
        if (row.timestamp instanceof Date && !isNaN(row.timestamp)) {
            const ts = row.timestamp;
            const ref = new Date(ts);
            if (ts.getHours() < 6) ref.setDate(ref.getDate() - 1);
            return `${String(ref.getDate()).padStart(2,'0')}/${String(ref.getMonth()+1).padStart(2,'0')}/${ref.getFullYear()}`;
        }

        return null;
    };

    // Encontra o dia mais recente
    let maxStr = null;
    rows.forEach(r => {
        const d = _diaAgricolaStr(r);
        if (!d) return;
        // Compara como YYYYMMDD para ordenação correta
        const key = d.slice(6) + d.slice(3,5) + d.slice(0,2);
        if (!maxStr || key > maxStr.key) maxStr = { label: d, key };
    });

    if (!maxStr) return rows;

    const filtradas = rows.filter(r => _diaAgricolaStr(r) === maxStr.label);
    console.log(`[TimelineHXH] Dia agrícola: ${maxStr.label} — ${filtradas.length}/${rows.length} registros`);
    return filtradas.length > 0 ? filtradas : rows;
}




/** Gera a sequência agrícola: 06, 07, ..., 23, 00, 01, ..., 05 */
function _horasAgricolas() {
    const horas = [];
    for (let i = 0; i < 24; i++) horas.push((i + 6) % 24);
    return horas;
}

/** Conta viagens por hora para mostrar badge de volume */
function _contarViagensPorHora(rows) {
    const contagem = {};
    rows.forEach(r => {
        const h = _extrairHora(r);
        if (h !== null) contagem[h] = (contagem[h] || 0) + 1;
    });
    return contagem;
}

function _extrairHora(row) {
    const campos = ['hora', 'Hora', 'HORA', 'horaDescarga', 'HoraDescarga', 'dataHora', 'DataHora'];
    for (const c of campos) {
        if (row[c] !== undefined && row[c] !== '') {
            const s = String(row[c]);
            const m = s.match(/(\d{1,2}):(\d{2})/);
            if (m) return parseInt(m[1]);
            const n = parseInt(s);
            if (!isNaN(n) && n >= 0 && n <= 23) return n;
        }
    }
    return null;
}

function _buildTimeline() {
    _container = document.getElementById('hxh-timeline-container')
        || document.getElementById('hxhTimelineContainer')
        || document.getElementById('hxh-timeline')
        || document.querySelector('.hxh-timeline');

    if (!_container) {
        console.warn('[TimelineHXH] Container não encontrado (id: hxhTimelineContainer)');
        return;
    }

    const horas    = _horasAgricolas();
    const contagem = _contarViagensPorHora(_rawData);

    _container.innerHTML = '';
    _container.style.cssText = `
        display: flex;
        overflow-x: auto;
        gap: 6px;
        padding: 8px 4px;
        scrollbar-width: thin;
        -webkit-overflow-scrolling: touch;
    `;

    // Botão "Todas" — mostra total do dia filtrado
    const totalDia = (_rawData || []).length;
    const btnTodas = _createHoraBtn('Todas', null, totalDia, _horaSelecionada === null);
    _container.appendChild(btnTodas);

    horas.forEach(h => {
        const qtd = contagem[h] || 0;
        const btn = _createHoraBtn(_padHora(h), h, qtd, _horaSelecionada === h);
        _container.appendChild(btn);
    });

    // Auto-scroll para a hora selecionada
    if (_horaSelecionada !== null) {
        const active = _container.querySelector('.hxh-hora-btn.active');
        if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
}

function _createHoraBtn(label, hora, qtd, isActive) {
    const btn = document.createElement('button');
    btn.className = `hxh-hora-btn${isActive ? ' active' : ''}`;
    btn.dataset.hora = hora === null ? 'all' : hora;

    btn.style.cssText = `
        flex-shrink: 0;
        padding: 6px 12px;
        border-radius: 20px;
        border: 1px solid ${isActive ? '#2196F3' : 'rgba(255,255,255,0.12)'};
        background: ${isActive ? 'rgba(33,150,243,0.25)' : 'rgba(255,255,255,0.04)'};
        color: ${isActive ? '#2196F3' : 'var(--text, #F0F0F0)'};
        font-size: 0.78rem;
        font-weight: ${isActive ? '700' : '500'};
        cursor: pointer;
        transition: all 0.15s ease;
        white-space: nowrap;
        min-width: 56px;
        text-align: center;
    `;

    btn.innerHTML = `
        <div style="font-weight:700;">${label}</div>
        ${qtd > 0 ? `<div style="font-size:0.65rem;opacity:0.7;">${qtd}x</div>` : ''}
    `;

    btn.addEventListener('click', () => _selecionarHora(hora));
    return btn;
}

function _selecionarHora(hora) {
    _horaSelecionada = hora;
    _buildTimeline();

    // Envia rawData já filtrado pelo último dia para os módulos dependentes
    document.dispatchEvent(new CustomEvent('hxhHoraChanged', {
        detail: { hora, rawData: _rawData }
    }));
}

function _padHora(h) {
    return `${String(h).padStart(2, '0')}:00`;
}

// Expõe globalmente
window.TimelineHXH = { init: initTimelineHXH, update: updateTimelineHXH, getHora: getHoraSelecionada };
