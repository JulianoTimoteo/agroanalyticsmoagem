// modtv.js — Modo Apresentação (TV/Quiosque) v2.0
// ⚠️ NUNCA MEXA NA LÓGICA DE FULLSCREEN/REFRESH SEM TESTAR EM TV
// Regra: ao atualizar dados, o modo quiosque NUNCA sai — apenas re-renderiza.
class PresentationManager {
    constructor() {
        this.isPresentationActive = false;
        this.presentationInterval = null;
        this.presentationTabs = [];
        this.currentPresentationTabIndex = 0;
        this.intervalSeconds = 20;
        this.allTabOptions = [
            { id: 'tab-moagem',         label: 'Moagem / Operacional', checked: true  },
            { id: 'tab-visaoglobal',     label: 'Visão Global',         checked: true  },
            { id: 'tab-caminhao',        label: 'Caminhões',            checked: true  },
            { id: 'tab-equipamento',     label: 'Colhedoras',           checked: true  },
            { id: 'tab-frentes',         label: 'Frentes de Trabalho',  checked: true  },
            { id: 'tab-horaria',         label: 'Entrega HxH',          checked: true  },
            { id: 'tab-metas',           label: 'Metas',                checked: true  },
            { id: 'tab-oee-colhedoras',  label: 'OEE Colhedoras',       checked: false },
            { id: 'tab-oee-caminhoes',   label: 'OEE Caminhões',        checked: false },
            { id: 'tab-comparativo-oee', label: 'OEE Comparativo',      checked: false },
            { id: 'tab-consumo',         label: 'Consumo',              checked: false },
        ];
        this.initialize();
    }

    initialize() {
        this._injectTabCheckboxes();
        const timerInput = document.getElementById('presentation-timer');
        if (timerInput) {
            timerInput.addEventListener('change', (e) => {
                this.intervalSeconds = Math.max(5, parseInt(e.target.value) || 20);
                if (this.isPresentationActive) this._restartInterval();
            });
        }
        const btn = document.getElementById('presentation-toggle-btn');
        if (btn) btn.addEventListener('click', () => this.togglePresentation());
        this._hookDataRefresh();
    }

    _injectTabCheckboxes() {
        const container = document.getElementById('presentation-tab-checkboxes');
        if (!container) return;
        container.innerHTML = `
        <div style="margin-top:14px;">
            <div style="font-size:0.82rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;
                        color:var(--text-secondary);margin-bottom:10px;display:flex;align-items:center;gap:8px;">
                <i class="fas fa-check-square"></i> Abas visíveis no Quiosque
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;">
                ${this.allTabOptions.map(tab => `
                <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;
                              border-radius:8px;border:1px solid var(--glass-border);
                              background:rgba(255,255,255,0.04);cursor:pointer;font-size:0.82rem;">
                    <input type="checkbox" id="pres-tab-${tab.id}" value="${tab.id}"
                           ${tab.checked ? 'checked' : ''}
                           style="accent-color:var(--primary);width:16px;height:16px;"
                           onchange="window.presentationManager&&window.presentationManager._onCheckboxChange()">
                    ${tab.label}
                </label>`).join('')}
            </div>
            <div style="display:flex;gap:8px;margin-top:10px;">
                <button onclick="window.presentationManager._selectAll(true)"
                    style="font-size:0.75rem;padding:4px 10px;border-radius:6px;border:1px solid var(--glass-border);background:transparent;color:var(--text-secondary);cursor:pointer;">
                    Marcar todas
                </button>
                <button onclick="window.presentationManager._selectAll(false)"
                    style="font-size:0.75rem;padding:4px 10px;border-radius:6px;border:1px solid var(--glass-border);background:transparent;color:var(--text-secondary);cursor:pointer;">
                    Desmarcar todas
                </button>
            </div>
        </div>`;
    }

    _selectAll(val) {
        this.allTabOptions.forEach(tab => {
            const el = document.getElementById('pres-tab-' + tab.id);
            if (el) { el.checked = val; tab.checked = val; }
        });
    }

    _onCheckboxChange() {
        this.allTabOptions.forEach(tab => {
            const el = document.getElementById('pres-tab-' + tab.id);
            if (el) tab.checked = el.checked;
        });
        if (this.isPresentationActive) this._buildTabList();
    }

    _buildTabList() {
        const checked = this.allTabOptions.filter(t => t.checked).map(t => t.id);
        const accessible = (window.agriculturalDashboard && window.agriculturalDashboard.canAccessTab)
            ? checked.filter(id => window.agriculturalDashboard.canAccessTab(id))
            : checked;
        this.presentationTabs = accessible;
        if (this.currentPresentationTabIndex >= this.presentationTabs.length)
            this.currentPresentationTabIndex = 0;
    }

    togglePresentation() {
        this.isPresentationActive ? this.stopPresentation() : this.startPresentation();
    }

    startPresentation() {
        if (this.isPresentationActive) return;
        this._buildTabList();
        if (!this.presentationTabs.length) { alert('Selecione pelo menos uma aba.'); return; }
        this.isPresentationActive = true;
        document.body.classList.add('presentation-mode');
        this._enterFullscreen();
        this._updateButtonUI(true);
        this._setupListeners();
        this.currentPresentationTabIndex = 0;
        this._showCurrentTab();
        this._restartInterval();
    }

    stopPresentation() {
        if (!this.isPresentationActive) return;
        this.isPresentationActive = false;
        document.body.classList.remove('presentation-mode');
        this._exitFullscreen();
        this._updateButtonUI(false);
        this._removeListeners();
        if (this.presentationInterval) { clearInterval(this.presentationInterval); this.presentationInterval = null; }
    }

    // ⚠️ REGRA MANDATÓRIA: dados atualizam mas modo quiosque NUNCA sai
    _hookDataRefresh() {
        document.addEventListener('agroanalytics:dataUpdated', () => {
            if (this.isPresentationActive) setTimeout(() => this._showCurrentTab(), 400);
        });
        // Se fullscreen cair (ex: notificação do SO), re-entra automaticamente
        document.addEventListener('fullscreenchange', () => {
            if (this.isPresentationActive && !document.fullscreenElement) {
                setTimeout(() => { if (this.isPresentationActive) this._enterFullscreen(); }, 600);
            }
        });
    }

    _restartInterval() {
        if (this.presentationInterval) clearInterval(this.presentationInterval);
        this.presentationInterval = setInterval(() => this._nextSlide(), this.intervalSeconds * 1000);
    }

    _nextSlide() {
        this.currentPresentationTabIndex = (this.currentPresentationTabIndex + 1) % this.presentationTabs.length;
        this._showCurrentTab();
    }

    _showCurrentTab() {
        const tabId = this.presentationTabs[this.currentPresentationTabIndex];
        if (!tabId) return;
        if (window.agriculturalDashboard && window.agriculturalDashboard.showTab)
            window.agriculturalDashboard.showTab(tabId);
    }

    _setupListeners() {
        this._keyHandler = (e) => {
            if (e.key === 'Escape') {
                // ESC pede confirmação — modo mandatório não sai por acidente
                if (confirm('Sair do modo Quiosque?')) this.stopPresentation();
                return;
            }
            if (e.key === 'ArrowRight') { this._nextSlide(); this._restartInterval(); }
            if (e.key === 'ArrowLeft') {
                this.currentPresentationTabIndex = this.currentPresentationTabIndex > 0
                    ? this.currentPresentationTabIndex - 1 : this.presentationTabs.length - 1;
                this._showCurrentTab(); this._restartInterval();
            }
        };
        document.addEventListener('keydown', this._keyHandler);
    }

    _removeListeners() {
        if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);
    }

    _enterFullscreen() {
        const el = document.documentElement;
        try { (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen).call(el); } catch(e) {}
    }

    _exitFullscreen() {
        try { if (document.fullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch(e) {}
    }

    _updateButtonUI(active) {
        const btn = document.getElementById('presentation-toggle-btn');
        if (!btn) return;
        btn.innerHTML = active ? '<i class="fas fa-stop"></i> SAIR DO QUIOSQUE' : '<i class="fas fa-tv"></i> INICIAR APRESENTAÇÃO';
        btn.style.background = active ? '#ef4444' : '';
    }
}

document.addEventListener('DOMContentLoaded', () => { window.presentationManager = new PresentationManager(); });
