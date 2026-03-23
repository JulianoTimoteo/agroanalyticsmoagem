// ============================================================
// js/Caminhoes/RankingCaminhoes.js — Redesign v2
// Horizontal bar style matching colhedoras tab
// ⚠️ Prefixo 31 = próprio, 91 = terceiro
// ============================================================

function initRankingCaminhoes(r) { updateRankingCaminhoes(r); }

function updateRankingCaminhoes(r) {
    if (!r) return;
    _renderBars('topFrotasProprias',  r.topFrotasProprias,  '#40800c', r.data);  // verde próprios
    _renderBars('topFrotasTerceiros', r.topFrotasTerceiros, '#FF8C00', r.data);  // laranja terceiros
    _renderMetricasGerais(r);
}

function _renderBars(containerId, items, accentColor, rawData) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';

    if (!items || items.length === 0) {
        el.innerHTML = `<div style="color:rgba(255,255,255,0.3);font-size:0.78rem;padding:12px 0;text-align:center;">Sem dados disponíveis</div>`;
        return;
    }

    const maxVal = Math.max(...items.map(i => i.value || i.peso || 0), 1);
    const rankClasses = ['colh-rank-1','colh-rank-2','colh-rank-3','colh-rank-n','colh-rank-n'];

    items.slice(0, 5).forEach((item, i) => {
        const peso    = item.value || item.peso || 0;
        const code    = _safe(item.name || item.codigo || '—');
        const viagens = item.viagens || item.count || 0;
        const dist    = _getDistMedia(item, rawData);
        const pct     = maxVal > 0 ? (peso / maxVal) * 100 : 0;
        const opacity = 1 - i * 0.12;

        const div = document.createElement('div');
        div.className = 'cam-bar-item';
        div.innerHTML = `
            <div class="cam-bar-meta">
                <div style="display:flex;align-items:center;gap:7px;min-width:0;flex:1;">
                    <span class="colh-rank-badge ${rankClasses[i] || 'colh-rank-n'}">${i+1}</span>
                    <div style="min-width:0;">
                        <div class="cam-bar-name" title="${code}" style="max-width:none;overflow:visible;white-space:nowrap;">${code}</div>
                        <div style="font-size:0.64rem;color:rgba(255,255,255,0.38);margin-top:1px;">
                            ${viagens > 0 ? viagens + ' viagens' : ''}${dist > 0 ? ' · ' + dist.toFixed(1) + ' km' : ''}
                        </div>
                    </div>
                </div>
                <span class="cam-bar-val">${_fmtTon(peso)} t</span>
            </div>
            <div class="cam-bar-track">
                <div class="cam-bar-fill" style="width:${pct.toFixed(1)}%;background:${accentColor};opacity:${opacity};"></div>
            </div>
        `;
        el.appendChild(div);
    });
}

function _getDistMedia(item, rawData) {
    if (item.distMedia || item.distancia) return parseFloat(item.distMedia || item.distancia) || 0;
    if (!rawData || !rawData.length) return 0;
    const code = String(item.name || item.codigo || '');
    const rows  = rawData.filter(r => String(r.frota || '').trim() === code && parseFloat(r.distancia || 0) > 0);
    if (!rows.length) return 0;
    const sum = rows.reduce((s, r) => s + (parseFloat(r.distancia) || 0), 0);
    return sum / rows.length;
}

function _renderMetricasGerais(r) {
    const ids = {
        'frotaRegistrada': r.frotaMotrizDistinta || (r.fleetStatus && r.fleetStatus.registrada) || 0,
        'frotaAtivas':     (r.fleetStatus && r.fleetStatus.ativas) || 0,
        'totalViagens':    r.totalViagens || 0,
    };
    Object.entries(ids).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el && val > 0) el.textContent = val;
    });
}

function _fmtTon(val) {
    const n = typeof val === 'number' ? val : parseFloat(val) || 0;
    // Nunca abreviar — sempre número completo com exatamente 2 casas decimais
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _safe(t) {
    return String(t || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

window.RankingCaminhoes = { init: initRankingCaminhoes, update: updateRankingCaminhoes };
