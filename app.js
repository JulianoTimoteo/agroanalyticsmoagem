// app.js - VERSÃO COMPLETA CORRIGIDA (COM FIREBASE INTEGRADO E ABA CONSUMO CAM)

// Utilitário de Criptografia para Segurança Local (apenas para dados não críticos)
const SimpleCrypto = {
    _key: 'AgroKey_2026_Secure',
    
    encrypt: function(data) {
        if (!data) return null;
        try {
            const jsonStr = JSON.stringify(data);
            let result = '';
            for (let i = 0; i < jsonStr.length; i++) {
                result += String.fromCharCode(jsonStr.charCodeAt(i) ^ this._key.charCodeAt(i % this._key.length));
            }
            return btoa(result);
        } catch (e) {
            console.error("Erro na criptografia:", e);
            return null;
        }
    },
    
    decrypt: function(encryptedData) {
        if (!encryptedData) return null;
        try {
            const str = atob(encryptedData);
            let result = '';
            for (let i = 0; i < str.length; i++) {
                result += String.fromCharCode(str.charCodeAt(i) ^ this._key.charCodeAt(i % this._key.length));
            }
            return JSON.parse(result);
        } catch (e) {
            try { return JSON.parse(encryptedData); } catch (err) { return null; }
        }
    }
};

// ─────────────────────────────────────────────────────────────────
// AgroLocalDB — Cache offline-first via IndexedDB (sem limite 5 MB)
// ─────────────────────────────────────────────────────────────────
class AgroLocalDB {
    constructor() {
        this.DB_NAME    = 'AgroAnalyticsDB';
        this.DB_VERSION = 7; // v7 — adiciona stores camD1/camAcm (caminhões próprios)
        this._db        = null;
        this.STORES     = ['producao','potencial','metas','acmSafra',
                           'consumoD1','consumoAcm','dispD1','dispAcm','tpl',
                           'camD1','camAcm','_meta'];
    }
    async open() {
        if (this._db) return this._db;
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                this.STORES.forEach(s => {
                    if (!db.objectStoreNames.contains(s)) {
                        s === '_meta'
                            ? db.createObjectStore('_meta')
                            : db.createObjectStore(s, { autoIncrement: true });
                    }
                });
            };
            req.onsuccess = (e) => { this._db = e.target.result; resolve(this._db); };
            req.onerror   = (e) => reject(e.target.error);
        });
    }
    async saveTable(store, rows) {
        if (!Array.isArray(rows)) return;
        await this.open();
        return new Promise((resolve, reject) => {
            const tx = this._db.transaction(store, 'readwrite');
            const s  = tx.objectStore(store);
            s.clear();
            rows.forEach(r => s.add(r));
            tx.oncomplete = () => resolve(true);
            tx.onerror    = (e) => reject(e.target.error);
        });
    }
    async getTable(store) {
        await this.open();
        return new Promise((resolve, reject) => {
            const tx  = this._db.transaction(store, 'readonly');
            const req = tx.objectStore(store).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror   = (e) => reject(e.target.error);
        });
    }
    async setMeta(key, value) {
        await this.open();
        return new Promise((resolve, reject) => {
            const tx = this._db.transaction('_meta', 'readwrite');
            tx.objectStore('_meta').put(value, key);
            tx.oncomplete = () => resolve(true);
            tx.onerror    = (e) => reject(e.target.error);
        });
    }
    async getMeta(key) {
        await this.open();
        return new Promise((resolve, reject) => {
            const req = this._db.transaction('_meta','readonly').objectStore('_meta').get(key);
            req.onsuccess = () => resolve(req.result ?? null);
            req.onerror   = (e) => reject(e.target.error);
        });
    }
    async hasData() {
        try {
            await this.open();
            return new Promise(resolve => {
                const req = this._db.transaction('producao','readonly').objectStore('producao').count();
                req.onsuccess = () => resolve(req.result > 0);
                req.onerror   = () => resolve(false);
            });
        } catch(e) { return false; }
    }
    async saveAllTables(state) {
        await Promise.all([
            this.saveTable('producao',  state.data          || []),
            this.saveTable('potencial', state.potentialData || []),
            this.saveTable('metas',     state.metaData      || []),
            this.saveTable('acmSafra',  state.acmSafraData  || []),
            this.saveTable('consumoD1', state.consumoD1Data || []),
            this.saveTable('consumoAcm',state.consumoAcmData|| []),
            this.saveTable('dispD1',    state.dispD1Data    || []),
            this.saveTable('dispAcm',   state.dispAcmData   || []),
            this.saveTable('tpl',       state.tplData       || []),
            this.saveTable('camD1',     state.camD1Data     || []),
            this.saveTable('camAcm',    state.camAcmData    || []),
            this.setMeta('lastSync',    Date.now()),
            this.setMeta('producaoLen', (state.data || []).length),
        ]);
    }
    async loadAllTables() {
        const [data, potentialData, metaData, acmSafraData,
               consumoD1Data, consumoAcmData, dispD1Data, dispAcmData, tplData,
               camD1Data, camAcmData] =
            await Promise.all([
                this.getTable('producao'),  this.getTable('potencial'),
                this.getTable('metas'),     this.getTable('acmSafra'),
                this.getTable('consumoD1'), this.getTable('consumoAcm'),
                this.getTable('dispD1'),    this.getTable('dispAcm'),
                this.getTable('tpl'),
                this.getTable('camD1'),     this.getTable('camAcm'),
            ]);
        return { data, potentialData, metaData, acmSafraData,
                 consumoD1Data, consumoAcmData, dispD1Data, dispAcmData, tplData,
                 camD1Data, camAcmData };
    }
    async getLastSyncAge() {
        const ts = await this.getMeta('lastSync');
        return ts ? Date.now() - ts : null;
    }
}

class AgriculturalDashboard {
    constructor() {
        this.GAS_API_URL = 'https://script.google.com/macros/s/AKfycbySnMWO9OY8F23BMMYe0u1JqHfSZqVqhmpTlp6gbprLL6YobQHLgJM8rzvZlH-dzQ/exec';

        this.GAS_PARAMS = {
            producao: { meses: 2, safra: '' },
            tpl:      { meses: 14, safra: '' },
        };

        this.TPL_PARTITIONS = [];
        this.PRODUCAO_PARTITIONS = [];

        this.localDB  = new AgroLocalDB();
        this._APP_VERSION = '6.8.7';
        this._syncing = false;

        if (typeof IntelligentProcessor !== 'undefined') this.processor = new IntelligentProcessor(); 
        if (typeof DataVisualizer !== 'undefined') this.visualizer = new DataVisualizer();
        if (typeof DataValidator !== 'undefined') this.validator = new DataValidator();
        if (typeof DataAnalyzer !== 'undefined') this.analyzer = new DataAnalyzer();
        if (typeof VisualizerConsumo !== 'undefined') this.consumoRenderer = new VisualizerConsumo();
        if (typeof VisualizerConsumoCam !== 'undefined') this.consumoCamRenderer = new VisualizerConsumoCam();
        if (typeof VisualizerVisaoGlobal !== 'undefined') this.visaoGlobalRenderer = new VisualizerVisaoGlobal();

        if (typeof OEEAnalyzer !== 'undefined') this.oeeAnalyzer = new OEEAnalyzer();
        if (typeof VisualizerOEE !== 'undefined' && this.visualizer) {
            this.oeeRenderer = new VisualizerOEE(this.visualizer);
        }
        this.oeeAnalysis   = null;
        this.tplData       = [];
        
        this.data = []; 
        this.potentialData = []; 
        this.metaData = []; 
        this.acmSafraData = []; 
        // consumoCamRenderer já inicializado acima — não sobrescrever com null
        this.consumoD1Data = [];
        this.consumoAcmData = [];
        this.camD1Data  = [];
        this.camAcmData = [];
        this.dispD1Data = [];
        this.dispAcmData = [];
        this.tplData = [];
        this.fleetData = []; 
        this.analysisResult = null;
        this.validationResult = null;
        this.isAnimatingParticles = true;
        this.animationFrameId = null; 
        
        this.currentSlideIndex = 0;
        this.carouselInterval = null; 
        this.refreshIntervalId = null; 
        this.refreshTimeoutId = null; 
        
        this.currentUser = null;
        this.currentUserRole = null;
        this.currentUserCustomPermissions = null;
        this.currentUserPermissions = {}; 
        
        this.permissions = {
            'master': ['tab-gerenciar', 'tab-moagem', 'tab-consumo', 'tab-consumo-cam', 'tab-caminhao', 'tab-equipamento', 'tab-frentes', 'tab-metas', 'tab-horaria', 'tab-usuarios', 'tab-alertas', 'tab-visaoglobal', 'tab-oee-colhedoras', 'tab-oee-caminhoes', 'tab-comparativo-oee', 'tab-eficiencia-operacional', 'tab-gargalos'],
            'admin':  ['tab-gerenciar', 'tab-moagem', 'tab-consumo', 'tab-consumo-cam', 'tab-caminhao', 'tab-equipamento', 'tab-frentes', 'tab-metas', 'tab-horaria', 'tab-usuarios', 'tab-alertas', 'tab-visaoglobal', 'tab-oee-colhedoras', 'tab-oee-caminhoes', 'tab-comparativo-oee', 'tab-eficiencia-operacional', 'tab-gargalos'],
            'editor': ['tab-gerenciar', 'tab-moagem', 'tab-consumo', 'tab-consumo-cam', 'tab-caminhao', 'tab-equipamento', 'tab-frentes', 'tab-metas', 'tab-horaria', 'tab-usuarios', 'tab-alertas', 'tab-visaoglobal', 'tab-oee-colhedoras', 'tab-oee-caminhoes', 'tab-comparativo-oee', 'tab-eficiencia-operacional', 'tab-gargalos'],
            'viewer': ['tab-gerenciar', 'tab-moagem', 'tab-consumo', 'tab-consumo-cam', 'tab-caminhao', 'tab-equipamento', 'tab-frentes', 'tab-metas', 'tab-horaria', 'tab-usuarios', 'tab-alertas', 'tab-visaoglobal', 'tab-oee-colhedoras', 'tab-oee-caminhoes', 'tab-comparativo-oee', 'tab-eficiencia-operacional', 'tab-gargalos']
        };
        
        this._applyVisualFixes();
        this.initializeEventListeners();
        this.initializeParticles();
        this.loadTheme();
        this.loadMeta(); 
        this.initShiftTracker(); 
        this.clearResults(); 
    }

    _applyVisualFixes() {
        const style = document.createElement('style');
        style.innerHTML = `
            .modal-overlay.active { display: flex !important; visibility: visible !important; opacity: 1 !important; z-index: 9999; }
            .modal-overlay.visible { display: flex !important; }
            .btn-cssbuttons { min-width: 200px !important; height: 54px !important; padding: 0 25px !important; }
            .role-dropdown, select.full-width-input { 
                background-color: #1a1f2e !important; 
                color: #e0e0e0 !important; 
                border: 1px solid #555 !important; 
                padding: 8px; 
                border-radius: 4px; 
            }
            .role-dropdown option, select option { 
                background-color: #1a1f2e !important; 
                color: #e0e0e0 !important; 
            }
            #frentes-selection-container {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
                gap: 8px;
            }
            #frentes-selection-container label { 
                display: flex; 
                align-items: center; 
                gap: 5px; 
                padding: 6px; 
                cursor: pointer; 
                color: #ddd; 
                background: rgba(255,255,255,0.05); 
                border-radius: 4px; 
                border: 1px solid transparent;
                font-size: 0.85rem;
            }
            #frentes-selection-container label:hover { 
                background: rgba(255,255,255,0.1); 
                border-color: rgba(255,255,255,0.2); 
            }
            
            body.snapshot-mode .tab-pane.active {
                background: none !important;
                box-shadow: none !important;
            }
            
            body.snapshot-mode[data-theme="light"] {
                background-color: #f0f2f5 !important;
                color: #000 !important;
            }
            body.snapshot-mode[data-theme="light"] .analytics-card,
            body.snapshot-mode[data-theme="light"] .kpi-card,
            body.snapshot-mode[data-theme="light"] .card {
                background: #ffffff !important;
                border: 1px solid #d1d5db !important;
                box-shadow: none !important;
                color: #000 !important;
                backdrop-filter: none !important;
            }
            
            body.snapshot-mode[data-theme="dark"] {
                background-color: #050A14 !important;
                color: #fff !important;
            }
            body.snapshot-mode[data-theme="dark"] .analytics-card,
            body.snapshot-mode[data-theme="dark"] .kpi-card,
            body.snapshot-mode[data-theme="dark"] .card {
                background: #0A0E17 !important;
                border: 1px solid #333 !important;
                box-shadow: none !important;
                color: #e0e0e0 !important;
                backdrop-filter: none !important;
            }

            body.snapshot-mode .item-value, 
            body.snapshot-mode .stat-val {
                text-shadow: none !important;
            }
            
            .badge-master {
                background: linear-gradient(135deg, #8B5CF6, #7C3AED);
                color: white;
            }
            .badge-admin {
                background: linear-gradient(135deg, #EF4444, #DC2626);
                color: white;
            }
            .badge-editor {
                background: linear-gradient(135deg, #10B981, #059669);
                color: white;
            }
            .badge-viewer {
                background: linear-gradient(135deg, #3B82F6, #1D4ED8);
                color: white;
            }
        `;
        document.head.appendChild(style);
    }

    // =================== AUTENTICAÇÃO E PERFIL ===================
    
    handleAuthStateChange(user, dbUserData = null) {
        if (user && dbUserData) {
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('main-dashboard').classList.remove('hidden');

            this.currentUser = { 
                ...user, 
                ...dbUserData,
                uid: user.uid || user.id 
            };
            this.currentUserRole = dbUserData.role || 'viewer';
            this.currentUserCustomPermissions = dbUserData.permissions?.tabAccess || null;

            this.renderTabsNavigation();

            // ── Bloqueia inputs de meta para não-admins ──
            const _isAdm = ['admin','master'].includes(this.currentUserRole);
            ['metaMoagemInput','metaRotacaoInput'].forEach(function(id) {
                const el = document.getElementById(id);
                if (!el) return;
                el.disabled = !_isAdm;
                el.title    = _isAdm ? '' : 'Apenas Admin ou Master podem alterar as metas';
                el.style.opacity = _isAdm ? '' : '0.55';
                el.style.cursor  = _isAdm ? '' : 'not-allowed';
            });
            
            this.showTab('tab-moagem');

            this.startLoadingProcess(); 
            this.setupAutoRefresh(); 
            
            const currentUserEmailEl = document.getElementById('current-user-email');
            if (currentUserEmailEl) {
                currentUserEmailEl.textContent = user.email;
            }

            if (this.isCurrentUserAdminOrMaster()) {
                this.loadUserManagementData();
                this.loadRegistrationRequests();
            }

        } else {
            document.getElementById('main-dashboard').classList.add('hidden');
            document.getElementById('login-screen').classList.remove('hidden');
            
            if (this.refreshTimeoutId) clearTimeout(this.refreshTimeoutId);
            this.currentUser = null;
            this.currentUserRole = null;
        }
    }
    
    async handleLogin(e) {
        e.preventDefault();
        const userIdentifier = document.getElementById('login-user').value;
        const password = document.getElementById('login-password').value;
        const errorEl = document.getElementById('auth-error');
        const btn = document.querySelector('#login-form button[type="submit"]');
        
        if (errorEl) errorEl.classList.add('hidden');
        document.getElementById('auth-success').classList.add('hidden');
        if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';

        try {
            let email = userIdentifier.trim().toLowerCase();
            if (!email.includes('@')) {
                email += '@usinapitangueiras.com.br';
            }
            // Autentica via Firebase Auth — não lê Firestore antes do login
            // onAuthStateChanged dispara automaticamente após signIn
            await firebase.auth().signInWithEmailAndPassword(email, password);

            // Salva ou limpa credenciais conforme checkbox
            const sc = document.getElementById('save-credentials');
            if (sc && sc.checked) {
                localStorage.setItem('ag_saved_user', email);
                localStorage.setItem('ag_saved_pass', btoa(password));
            } else {
                localStorage.removeItem('ag_saved_user');
                localStorage.removeItem('ag_saved_pass');
            }

            document.getElementById('login-user').value = '';
            document.getElementById('login-password').value = '';

        } catch (error) {
            console.error('Erro no login:', error);
            let msg = 'Credenciais inválidas.';
            if (error.code === 'auth/user-not-found')     msg = 'Usuário não encontrado.';
            if (error.code === 'auth/wrong-password')     msg = 'Senha incorreta.';
            if (error.code === 'auth/invalid-email')      msg = 'E-mail inválido.';
            if (error.code === 'auth/too-many-requests')  msg = 'Muitas tentativas. Aguarde e tente novamente.';
            if (error.code === 'auth/invalid-credential') msg = 'E-mail ou senha inválidos.';
            if (errorEl) {
                errorEl.textContent = msg;
                errorEl.classList.remove('hidden');
            }
        } finally {
            if (btn) btn.innerHTML = 'Entrar <i class="fas fa-arrow-right"></i>';
        }
    }

    async handleForgotPassword(e) {
        e.preventDefault();
        const userIdentifier = document.getElementById('login-user').value;
        const errorEl = document.getElementById('auth-error');
        const successEl = document.getElementById('auth-success');
        errorEl.classList.add('hidden');
        successEl.classList.add('hidden');

        let email = userIdentifier.trim().toLowerCase();

        if (!email || !email.includes('@')) {
            if (errorEl) {
                errorEl.textContent = "Por favor, insira o seu E-mail no campo acima para redefinir a senha.";
                errorEl.classList.remove('hidden');
            }
            return;
        }

        try {
            await firebase.auth().sendPasswordResetEmail(email);
            
            if (successEl) {
                successEl.innerHTML = `<i class="fas fa-check-circle"></i> E-mail de redefinição de senha enviado para <strong>${email}</strong>. Verifique sua caixa de entrada.`;
                successEl.classList.remove('hidden');
            }
        } catch (error) {
            console.error("Erro ao enviar reset:", error);
            if (errorEl) {
                let msg = "Erro ao tentar redefinir a senha.";
                if (error.code === 'auth/user-not-found') msg = "Usuário não encontrado. Verifique o e-mail informado.";
                errorEl.textContent = msg;
                errorEl.classList.remove('hidden');
            }
        }
    }

    async handleSignup(e) {
        e.preventDefault();
        const name = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value.trim().toLowerCase();
        const phone = document.getElementById('signup-phone').value;
        const errorEl = document.getElementById('auth-error');
        const successEl = document.getElementById('auth-success');
        const btn = document.querySelector('#signup-form button[type="submit"]');

        if(errorEl) errorEl.classList.add('hidden');
        if(successEl) successEl.classList.add('hidden');
        
        if (!name || !email || !phone) {
             if(errorEl) {
                 errorEl.textContent = "Preencha todos os campos para solicitar o cadastro.";
                 errorEl.classList.remove('hidden');
             }
             return;
        }

        if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

        try {
            const db = firebase.firestore();
            
            const userQuery = await db.collection('users').where('email', '==', email).get();
            if (!userQuery.empty) {
                throw new Error("Este e-mail já possui cadastro no sistema.");
            }

            const reqQuery = await db.collection('requests').where('email', '==', email).where('status', '==', 'pending').get();
            if (!reqQuery.empty) {
                throw new Error("Já existe uma solicitação pendente para este e-mail.");
            }

            await db.collection('requests').add({
                name: name,
                email: email,
                phone: phone,
                status: 'pending',
                requestedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            document.getElementById('signup-name').value = '';
            document.getElementById('signup-email').value = '';
            document.getElementById('signup-phone').value = '';

            if(successEl) {
                successEl.innerHTML = "<strong>Solicitação de cadastro enviada!</strong> Aguarde a aprovação do administrador.";
                successEl.classList.remove('hidden');
            }

            setTimeout(() => {
                document.getElementById('signup-form').classList.add('hidden');
                document.getElementById('login-form').classList.remove('hidden');
                if(successEl) successEl.classList.add('hidden');
            }, 5000);

        } catch (error) {
            console.error("Erro na solicitação:", error);
            if(errorEl) {
                errorEl.textContent = error.message || "Erro de conexão. Tente novamente.";
                errorEl.classList.remove('hidden');
            }
        } finally {
            if (btn) btn.innerHTML = 'Solicitar Acesso <i class="fas fa-paper-plane"></i>';
        }
    }

    async handleLogout() {
        // Confirmação simples — sem duplo clique necessário
        if (!confirm('Confirmar saída do sistema?')) return;
        try {
            // Limpa credenciais salvas ao sair explicitamente
            localStorage.removeItem('ag_saved_user');
            localStorage.removeItem('ag_saved_pass');
            await firebase.auth().signOut();
            this.handleAuthStateChange(null);
        } catch (error) {
            console.error('Erro ao fazer logout:', error);
        }
    }
    
    isCurrentUserAdmin() {
        return this.currentUserRole === 'admin' || this.currentUserRole === 'master';
    }
    
    isCurrentUserAdminOrMaster() {
        return this.currentUserRole === 'admin' || this.currentUserRole === 'master';
    }
    
    toggleMenu(forceClose = false) {
        const menuContainer = document.getElementById('tabs-nav-container');
        const backdrop = document.getElementById('menu-backdrop');
        const isMobile = window.innerWidth <= 768;

        if (!menuContainer || !backdrop) return;

        const _closeMenu = () => {
            menuContainer.classList.remove('open');
            backdrop.classList.remove('active');
            backdrop.style.cssText = 'display:none !important; pointer-events:none !important; visibility:hidden !important; z-index:-1 !important;';
            document.body.style.overflowY = '';
            document.body.classList.remove('no-scroll');
        };

        if (!isMobile) {
            _closeMenu();
            return;
        }

        if (forceClose || menuContainer.classList.contains('open')) {
            _closeMenu();
        } else {
            menuContainer.classList.add('open');
            backdrop.style.cssText = '';
            backdrop.classList.add('active');
            document.body.style.overflowY = 'hidden';
            document.body.classList.add('no-scroll');
        }
    }

    showTab(tabId) {
        if (window.innerWidth <= 768) {
            this.toggleMenu(true);
        }

        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.remove('active');
            pane.style.display = 'none';
        });

        document.querySelectorAll('.tabs-nav .tab-button').forEach(button => {
            button.classList.remove('active');
        });

        const activePane = document.getElementById(tabId);
        if (activePane) {
            activePane.classList.add('active');
            activePane.style.display = 'block';
        }
        
        const activeBtn = document.querySelector(`[data-tab="${tabId}"]`) ||
                          document.querySelector(`.tab-button[onclick*='${tabId}']`);
        if (activeBtn) activeBtn.classList.add('active');
        
        const needsParticles = (tabId === 'tab-gerenciar' || tabId === 'tab-usuarios');
        if (needsParticles && !this.isAnimatingParticles) {
            this.isAnimatingParticles = true;
            this.initializeParticles(); 
        } else if (!needsParticles && this.isAnimatingParticles) {
            this.isAnimatingParticles = false;
        }
        
        if (tabId === 'tab-moagem') {
             setTimeout(() => {
                 this.showSlide(this.currentSlideIndex); 
                 this.initializeCarousel();
             }, 50);
        } else {
             this.stopCarousel();
        }

        if (tabId === 'tab-horaria') {
            setTimeout(() => this.renderHxHTimeline(), 50);
        }

        if (tabId === 'tab-usuarios') {
            if (this.isCurrentUserAdminOrMaster()) {
                this.showSubTab('subtab-gerenciar-acesso', document.querySelector('#tab-usuarios .sub-tabs-nav .tab-button'));
                this.loadUserManagementData();
            } else {
                this.showUserAccessMessage();
            }
        }
    }

    showSubTab(subTabId, clickedButton) {
        document.querySelectorAll('#tab-usuarios .tab-pane-sub').forEach(pane => {
            pane.classList.remove('active');
        });
        document.querySelectorAll('#tab-usuarios .sub-tabs-nav .tab-button').forEach(button => {
            button.classList.remove('active');
        });

        const activePane = document.getElementById(subTabId);
        if (activePane) {
            activePane.classList.add('active');
        }
        if (clickedButton) {
            clickedButton.classList.add('active');
        }
        
        if (subTabId === 'subtab-gerenciar-acesso') {
            this.loadUserManagementData();
        } else if (subTabId === 'subtab-solicitacoes') {
            this.loadRegistrationRequests();
        }
    }

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            modal.classList.add('visible');
            modal.style.display = 'flex';

            // Pré-preenche apelido ao abrir configurações de conta
            if (modalId === 'user-settings-modal') {
                const nickEl = document.getElementById('new-nickname');
                if (nickEl && this.currentUser) {
                    nickEl.value = this.currentUser.nickname || '';
                    nickEl.placeholder = this.currentUser.nickname || 'Seu apelido atual';
                }
                // Reseta para a aba de senha por padrão
                if (typeof accTabSwitch === 'function') accTabSwitch('pass');
            }
        } else {
            console.error(`Modal ${modalId} não encontrado.`);
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            modal.classList.remove('visible');
            modal.style.display = 'none';
        }
    }

    async openUserModal(userId = null) {
        let modal = document.getElementById('admin-user-modal');
        let form = document.getElementById('admin-user-form');
        
        if (!modal) {
            modal = document.getElementById('user-settings-modal');
            if (!modal) return;
        }

        if (form) form.reset();
        
        const staticPerms = document.querySelector('.permissions-container');
        if (staticPerms) staticPerms.style.display = 'none';

        const idInput = document.getElementById('admin-user-id');
        if (idInput) idInput.value = userId || '';
        
        const permsContainerId = 'admin-user-perms-container';
        let permsContainer = document.getElementById(permsContainerId);
        
        if (!permsContainer && form) {
            permsContainer = document.createElement('div');
            permsContainer.id = permsContainerId;
            permsContainer.className = 'permissions-grid';
            permsContainer.style.marginTop = '15px';
            permsContainer.style.borderTop = '1px solid var(--glass-border)';
            permsContainer.style.paddingTop = '10px';
            
            const title = document.createElement('h4');
            title.textContent = "Permissões de Acesso (Abas):";
            title.style.marginBottom = '10px';
            title.style.fontSize = '0.9rem';
            title.style.color = 'var(--text-secondary)';
            permsContainer.appendChild(title);

            const grid = document.createElement('div');
            grid.style.display = 'grid';
            grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
            grid.style.gap = '8px';

            const allTabs = [
                { id: 'tab-gerenciar', label: 'Gerenciar' },
                { id: 'tab-moagem', label: 'Moagem' },
                { id: 'tab-caminhao', label: 'Caminhões' },
                { id: 'tab-equipamento', label: 'Colheita' },
                { id: 'tab-consumo', label: 'Consumo' },
                { id: 'tab-consumo-cam', label: 'Consumo Cam' },
                { id: 'tab-frentes', label: 'Frentes' },
                { id: 'tab-metas', label: 'Metas' },
                { id: 'tab-horaria', label: 'Entrega HxH' },
                { id: 'tab-visaoglobal', label: 'Visão Global' },
                { id: 'tab-usuarios', label: 'Usuários' }
            ];

            allTabs.forEach(tab => {
                const label = document.createElement('label');
                label.style.display = 'flex';
                label.style.alignItems = 'center';
                label.style.gap = '5px';
                label.style.fontSize = '0.85rem';
                
                const box = document.createElement('input');
                box.type = 'checkbox';
                box.name = 'perm';
                box.value = tab.id;
                box.id = `perm-chk-${tab.id}`;
                box.checked = true;

                label.appendChild(box);
                label.appendChild(document.createTextNode(tab.label));
                grid.appendChild(label);
            });
            permsContainer.appendChild(grid);
            
            const btns = form.querySelector('.modal-buttons') || form.querySelector('button[type="submit"]');
            form.insertBefore(permsContainer, btns);
        }

        if (userId) {
            try {
                const db = firebase.firestore();
                const userDoc = await db.collection('users').doc(userId).get();
                
                if (userDoc.exists) {
                    const user = userDoc.data();
                    
                    const nicknameInput = document.getElementById('admin-user-nickname');
                    if (nicknameInput) nicknameInput.value = user.nickname || user.email.split('@')[0];
                    
                    const passInput = document.getElementById('admin-user-password');
                    if (passInput) passInput.placeholder = "Senha (Deixe em branco para manter)";

                    let activePerms = user.customPermissions || [];

                    if (permsContainer) {
                        const checkboxes = permsContainer.querySelectorAll('input[name="perm"]');
                        checkboxes.forEach(cb => {
                            cb.checked = activePerms.includes(cb.value);
                        });
                    }
                }
            } catch (error) {
                console.error("Erro ao carregar usuário:", error);
                alert("Erro ao carregar dados do usuário.");
            }
        } else {
            const passInput = document.getElementById('admin-user-password');
            if (passInput) passInput.placeholder = "Senha (Obrigatório para novo)";
            if (permsContainer) {
                const checkboxes = permsContainer.querySelectorAll('input[name="perm"]');
                checkboxes.forEach(cb => cb.checked = true);
            }
        }
        this.openModal('admin-user-modal');
    }

    async saveAdminUser(e) {
        e.preventDefault();
        const id = document.getElementById('admin-user-id').value;
        const nickname = document.getElementById('admin-user-nickname').value;
        const password = document.getElementById('admin-user-password').value;
        
        const checkboxes = document.querySelectorAll('#admin-user-form input[name="perm"]:checked');
        const selectedPerms = Array.from(checkboxes).map(cb => cb.value);

        if (!nickname) {
            alert("O campo Apelido é obrigatório.");
            return;
        }

        try {
            const db = firebase.firestore();

            if (id) {
                const updateData = {
                    nickname: nickname,
                    customPermissions: selectedPerms,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                
                await db.collection('users').doc(id).update(updateData);
                
                alert("Usuário e permissões atualizados com sucesso!");
                this.closeModal('admin-user-modal');
                this.loadUserManagementData();
            } else {
                if (!password || password.length < 6) {
                    alert("A senha é obrigatória para novos usuários (mínimo 6 caracteres).");
                    return;
                }

                const email = nickname.includes('@') ? nickname.toLowerCase() : `${nickname.toLowerCase()}@agro.local`;
                
                const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
                const newUser = userCredential.user;
                
                await db.collection('users').doc(newUser.uid).set({
                    email: email,
                    nickname: nickname,
                    role: 'viewer',
                    customPermissions: selectedPerms,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                alert(`Usuário ${nickname} criado com sucesso!`);
                this.closeModal('admin-user-modal');
                this.loadUserManagementData();
            }
        } catch (error) {
            console.error("Erro ao salvar:", error);
            let errorMessage = error.message;
            if (error.code === 'auth/email-already-in-use') {
                errorMessage = "Este e-mail já está em uso por outro usuário.";
            }
            alert("Erro ao salvar: " + errorMessage);
        }
    }

    async loadUserManagementData() {
        const container = document.getElementById('user-management-container');
        if (!container) return;
        
        container.innerHTML = `
            <div style="text-align: center; padding: 2rem;">
                <div class="loader"></div>
                <p>Carregando usuários ativos...</p>
            </div>
        `;
        
        try {
            const isAdminOrMaster = this.isCurrentUserAdminOrMaster();
            
            if (!isAdminOrMaster) {
                this.showUserAccessMessage();
                return;
            }
            
            const db = firebase.firestore();
            const usersSnapshot = await db.collection('users').get();
            const users = [];
            
            usersSnapshot.forEach(doc => {
                users.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            this.renderUserTable(container, users);

        } catch (error) {
            console.error("Erro ao carregar usuários:", error);
            container.innerHTML = `
                <div class="alert-danger" style="padding: 1rem; text-align: center;">
                    <i class="fas fa-exclamation-triangle"></i> Erro ao carregar dados de usuários.
                </div>
            `;
        }
    }

    renderUserTable(container, users) {
        const cu = this.currentUser;
        const isM = cu && cu.role === 'master';
        const isA = cu && (cu.role === 'admin' || cu.role === 'master');

        if (users.length === 0) {
            container.innerHTML = `
            <div style="text-align:center;padding:4rem 1rem;">
              <i class="fas fa-users-slash" style="font-size:3rem;color:var(--text-secondary);opacity:.4;"></i>
              <h3 style="margin:1rem 0 .5rem;color:var(--text);">Nenhum usuário cadastrado</h3>
              <p style="color:var(--text-secondary);font-size:.9rem;">Crie o primeiro usuário clicando em "Novo Usuário".</p>
            </div>`;
            return;
        }

        users.sort((a, b) => {
            const rank = { master:0, admin:1, editor:2, viewer:3 };
            return (rank[a.role]??9) - (rank[b.role]??9);
        });

        const roleConf = {
            master: { badge:'#7B61FF', bg:'rgba(123,97,255,.12)', icon:'fa-crown',       label:'Master'  },
            admin:  { badge:'#00D4FF', bg:'rgba(0,212,255,.12)',  icon:'fa-user-shield',  label:'Admin'   },
            editor: { badge:'#22c55e', bg:'rgba(34,197,94,.12)',  icon:'fa-edit',         label:'Editor'  },
            viewer: { badge:'#f59e0b', bg:'rgba(251,191,36,.12)', icon:'fa-eye',          label:'Viewer'  }
        };

        const cards = users.map(u => {
            const isSelf = cu && cu.uid === u.id;
            const rc = roleConf[u.role] || roleConf.viewer;
            const created = u.createdAt ? new Date(u.createdAt.seconds*1000).toLocaleDateString('pt-BR') : '—';
            const perms = (u.customPermissions || []).length;

            const roleOptions = ['master','admin','editor','viewer']
                .filter(r => r !== 'master' || isM)
                .map(r => `<option value="${r}" ${u.role===r?'selected':''}>${roleConf[r].label}</option>`)
                .join('');

            return `
            <div class="gu-card ${isSelf ? 'gu-card--self' : ''}" data-uid="${u.id}">
              <div class="gu-card-top">
                <div class="gu-avatar" style="background:${rc.bg};color:${rc.badge};">
                  <i class="fas ${rc.icon}"></i>
                </div>
                <div class="gu-info">
                  <div class="gu-name">
                    ${u.nickname || u.email || u.id}
                    ${isSelf ? '<span class="gu-self-tag">Você</span>' : ''}
                  </div>
                  <div class="gu-email">${u.email || '—'}</div>
                </div>
                <div class="gu-meta">
                  <div class="gu-meta-item"><i class="fas fa-calendar-alt"></i> ${created}</div>
                  <div class="gu-meta-item"><i class="fas fa-key"></i> ${perms} perms</div>
                </div>
              </div>
              <div class="gu-card-bottom">
                <div class="gu-role-wrap">
                  <span class="gu-role-badge" style="background:${rc.bg};color:${rc.badge};border-color:${rc.badge}40;">
                    <i class="fas ${rc.icon}"></i> ${rc.label}
                  </span>
                  ${!isSelf && isA ? `
                  <select class="gu-role-select" onchange="window.agriculturalDashboard.updateUserRole('${u.id}', this.value)" title="Alterar papel">
                    ${roleOptions}
                  </select>` : ''}
                </div>
                <div class="gu-actions">
                  ${!isSelf ? `
                    <button class="gu-btn gu-btn-edit" onclick="window.agriculturalDashboard.openUserModal('${u.id}')" title="Editar">
                      <i class="fas fa-edit"></i>
                    </button>
                    <button class="gu-btn gu-btn-del" onclick="window.agriculturalDashboard.deleteUserPrompt('${u.id}','${(u.email||u.nickname||'').replace(/'/g,'')}')"
                      ${u.role==='master'?'disabled title="Master não pode ser excluído"':''}>
                      <i class="fas fa-trash"></i>
                    </button>
                  ` : `<span style="font-size:.75rem;color:var(--text-secondary);opacity:.7;">Sua conta</span>`}
                </div>
              </div>
            </div>`;
        }).join('');

        container.innerHTML = `
        <style>
          .gu-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:14px; padding:4px 0; }
          @media(max-width:600px){ .gu-grid { grid-template-columns:1fr; } }
          .gu-card {
            background:var(--card-bg,rgba(255,255,255,.06));
            border:1px solid var(--border-color,rgba(255,255,255,.1));
            border-radius:14px; overflow:hidden;
            transition:border-color .2s, transform .15s;
          }
          .gu-card:hover { border-color:rgba(0,212,255,.35); transform:translateY(-2px); }
          .gu-card--self { border-color:rgba(123,97,255,.4) !important; }
          .gu-card-top {
            display:flex; align-items:flex-start; gap:12px;
            padding:16px 18px 12px;
          }
          .gu-avatar {
            width:42px; height:42px; border-radius:12px; flex-shrink:0;
            display:flex; align-items:center; justify-content:center;
            font-size:1.1rem;
          }
          .gu-info { flex:1; min-width:0; }
          .gu-name {
            font-size:.9rem; font-weight:800; color:var(--text,#F0F0F0);
            white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
            display:flex; align-items:center; gap:6px;
          }
          .gu-self-tag {
            font-size:.65rem; font-weight:700; padding:2px 7px;
            border-radius:10px; background:rgba(123,97,255,.2); color:#a78bfa;
            border:1px solid rgba(123,97,255,.3); flex-shrink:0;
          }
          .gu-email { font-size:.75rem; color:var(--text-secondary); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .gu-meta { display:flex; flex-direction:column; gap:3px; flex-shrink:0; align-items:flex-end; }
          .gu-meta-item { font-size:.68rem; color:var(--text-secondary); display:flex; align-items:center; gap:4px; }
          .gu-card-bottom {
            display:flex; align-items:center; justify-content:space-between;
            padding:10px 18px 14px; border-top:1px solid var(--border-color,rgba(255,255,255,.08));
            background:rgba(0,0,0,.08);
          }
          .gu-role-wrap { display:flex; align-items:center; gap:8px; }
          .gu-role-badge {
            display:inline-flex; align-items:center; gap:5px;
            padding:4px 10px; border-radius:8px; font-size:.74rem; font-weight:700;
            border:1px solid;
          }
          .gu-role-select {
            padding:4px 8px; border-radius:8px; font-size:.74rem; font-weight:600;
            background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.15);
            color:var(--text,#F0F0F0); cursor:pointer;
          }
          [data-theme="light"] .gu-role-select { background:#fff; color:#333; border-color:#ccc; }
          .gu-actions { display:flex; gap:6px; }
          .gu-btn {
            width:32px; height:32px; border-radius:8px; border:none; cursor:pointer;
            display:flex; align-items:center; justify-content:center;
            font-size:.8rem; transition:all .15s;
          }
          .gu-btn:disabled { opacity:.35; cursor:not-allowed; }
          .gu-btn-edit { background:rgba(0,212,255,.12); color:#00D4FF; }
          .gu-btn-edit:hover:not(:disabled) { background:rgba(0,212,255,.25); }
          .gu-btn-del  { background:rgba(239,68,68,.12); color:#f87171; }
          .gu-btn-del:hover:not(:disabled)  { background:rgba(239,68,68,.25); }
          .gu-summary {
            display:flex; align-items:center; justify-content:space-between;
            padding:0 2px 14px; flex-wrap:wrap; gap:10px;
          }
          .gu-summary-text { font-size:.8rem; color:var(--text-secondary); }
          .gu-summary-text strong { color:var(--text,#F0F0F0); }
        </style>
        <div class="gu-summary">
          <span class="gu-summary-text">
            <strong>${users.length}</strong> usuário${users.length!==1?'s':''} registrado${users.length!==1?'s':''}
            &nbsp;·&nbsp; Logado como <strong>${cu?.nickname||cu?.email||'—'}</strong>
            <span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;
              background:${(roleConf[cu?.role]||roleConf.viewer).bg};
              color:${(roleConf[cu?.role]||roleConf.viewer).badge};
              border:1px solid ${(roleConf[cu?.role]||roleConf.viewer).badge}40;
              font-weight:700;font-size:.68rem;margin-left:6px;">
              <i class="fas ${(roleConf[cu?.role]||roleConf.viewer).icon}"></i>
              ${(roleConf[cu?.role]||roleConf.viewer).label}
            </span>
          </span>
        </div>
        <div class="gu-grid">${cards}</div>`;
    }
    async updateUserRole(userId, newRole) {
        try {
            const isMaster = this.currentUserRole === 'master';
            if (!isMaster) {
                alert("Apenas o usuário Master pode alterar papéis de usuários.");
                return;
            }
            if (this.currentUser && this.currentUser.uid === userId) {
                alert("Não é possível alterar seu próprio papel por esta interface.");
                return;
            }
            if (confirm(`Alterar papel para "${newRole}"?`)) {
                const db = firebase.firestore();
                await db.collection('users').doc(userId).update({
                    role: newRole,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                this.loadUserManagementData();
                alert("Papel atualizado com sucesso!");
            }
        } catch (error) {
            console.error("Erro ao atualizar papel:", error);
            alert(`Erro: ${error.message}`);
        }
    }

    async deleteUserPrompt(userId, userEmail) {
        const isMaster = this.currentUserRole === 'master';
        if (!isMaster) {
            alert("Apenas o usuário Master pode excluir usuários.");
            return;
        }
        if (this.currentUser && this.currentUser.uid === userId) {
            alert("Não é possível excluir a si mesmo.");
            return;
        }
        if (confirm(`Excluir usuário ${userEmail}?`)) {
            await this.deleteUser(userId);
        }
    }

    async deleteUser(userId) {
        try {
            const db = firebase.firestore();
            await db.collection('users').doc(userId).delete();
            alert("Usuário removido do sistema (perfil excluído).");
            this.loadUserManagementData();
        } catch (error) {
            console.error("Erro ao excluir usuário:", error);
            alert(`Erro: ${error.message}`);
        }
    }
    
    showUserAccessMessage() {
        const container = document.getElementById('user-management-container');
        if (!container) return;
        container.innerHTML = `
            <div class="access-message" style="text-align: center; padding: 3rem 1rem;">
                <div style="font-size: 4rem; color: var(--warning); margin-bottom: 1rem;"><i class="fas fa-lock"></i></div>
                <h3>Acesso Restrito</h3>
                <p>Esta funcionalidade está disponível apenas para administradores e master.</p>
                <p>Seu papel atual: <strong>${this.currentUserRole || 'Não definido'}</strong></p>
            </div>
        `;
    }
    
    async loadRegistrationRequests() {
        const container = document.getElementById('registration-requests-container');
        if (!container) return;

        try {
            const db = firebase.firestore();
            const requestsSnapshot = await db.collection('requests')
                .where('status', '==', 'pending')
                .orderBy('requestedAt', 'desc')
                .get();
            
            const requests = [];
            requestsSnapshot.forEach(doc => {
                requests.push({ id: doc.id, ...doc.data() });
            });
            
            const countEl = document.getElementById('requests-count');
            if (countEl) {
                countEl.textContent = requests.length;
                countEl.className = 'gu-badge-count' + (requests.length > 0 ? '' : ' zero');
            }

            if (requests.length === 0) {
                container.innerHTML = `<p style="text-align: center; padding: 2rem;">Nenhuma solicitação pendente.</p>`;
                return;
            }

            const cards = requests.map(req => {
                const requestedAt = req.requestedAt ? new Date(req.requestedAt.seconds * 1000).toLocaleDateString('pt-BR') : 'N/A';
                const phone = (req.phone || '').replace(/\D/g, '');
                return `
                <div style="background:var(--card-bg,rgba(255,255,255,.06));border:1px solid var(--border-color,rgba(255,255,255,.1));
                  border-radius:12px;padding:16px 18px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
                  <div style="width:40px;height:40px;border-radius:12px;background:rgba(251,191,36,.12);color:#fbbf24;
                    display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;">
                    <i class="fas fa-user-clock"></i>
                  </div>
                  <div style="flex:1;min-width:180px;">
                    <div style="font-weight:800;font-size:.9rem;color:var(--text);">${req.name || '—'}</div>
                    <div style="font-size:.76rem;color:var(--text-secondary);margin-top:2px;">${req.email || '—'}</div>
                    ${phone ? `<a href="https://wa.me/${phone}" target="_blank"
                      style="font-size:.75rem;color:#25D366;text-decoration:none;display:inline-flex;align-items:center;gap:4px;margin-top:3px;">
                      <i class="fab fa-whatsapp"></i> ${req.phone}
                    </a>` : ''}
                  </div>
                  <div style="font-size:.72rem;color:var(--text-secondary);white-space:nowrap;">
                    <i class="fas fa-calendar-alt" style="margin-right:4px;opacity:.6;"></i>${requestedAt}
                  </div>
                  <div style="display:flex;gap:8px;flex-shrink:0;">
                    <button style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;
                      border-radius:8px;border:none;cursor:pointer;font-size:.78rem;font-weight:700;
                      background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;"
                      onclick="window.agriculturalDashboard.approveRequest('${req.id}','${req.email}','${req.name}','${(req.phone||\'\').replace(/\D/g,\'\')}')">
                      <i class="fas fa-check"></i> Aprovar
                    </button>
                    <button style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;
                      border-radius:8px;border:none;cursor:pointer;font-size:.78rem;font-weight:700;
                      background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.3);"
                      onclick="window.agriculturalDashboard.rejectRequest('${req.id}','${req.email}')">
                      <i class="fas fa-times"></i> Recusar
                    </button>
                  </div>
                </div>`;
            }).join('');
            container.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px;">${cards}</div>`;

        } catch (error) {
            console.error("Erro ao carregar solicitações:", error);
            container.innerHTML = `<p class="alert-danger" style="padding: 1rem;">Erro ao carregar solicitações.</p>`;
        }
    }

    async approveRequest(requestId, email, name, phone) {
        if (!confirm(`Aprovar cadastro para ${name} (${email})?`)) return;
        try {
            const db = firebase.firestore();
            // Gera senha temporária aleatória (8 chars)
            const tmpPass = Math.random().toString(36).slice(-4).toUpperCase() +
                            Math.random().toString(36).slice(-4) + '!';

            const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, tmpPass);
            const newUser = userCredential.user;

            await db.collection('users').doc(newUser.uid).set({
                email: email,
                nickname: name || email.split('@')[0],
                name: name,
                role: 'viewer',
                customPermissions: ['tab-moagem','tab-consumo','tab-consumo-cam',
                    'tab-caminhao','tab-equipamento','tab-frentes','tab-metas',
                    'tab-horaria','tab-visaoglobal'],
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            await db.collection('requests').doc(requestId).update({
                status: 'approved',
                approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
                authUid: newUser.uid
            });

            // Envia e-mail de redefinição de senha pelo Firebase (link oficial)
            await firebase.auth().sendPasswordResetEmail(email);

            // Abre WhatsApp com mensagem de aprovação se tiver telefone
            const reqSnap = await db.collection('requests').doc(requestId).get();
            const reqData  = reqSnap.exists ? reqSnap.data() : {};
            const tel      = (reqData.phone || phone || '').replace(/\D/g,'');
            if (tel) {
                const msgWA = encodeURIComponent(
                    `Olá ${name}! Seu acesso ao AgroAnalytics foi aprovado. ✅\n` +
                    `📧 E-mail: ${email}\n` +
                    `🔑 Você receberá um e-mail para definir sua senha.\n` +
                    `Após criar a senha, acesse o sistema normalmente.`
                );
                window.open(`https://wa.me/55${tel}?text=${msgWA}`, '_blank');
            }

            alert(`✅ Usuário ${name} criado!\nE-mail de redefinição de senha enviado para ${email}.`);
            this.loadRegistrationRequests();
            this.loadUserManagementData();
        } catch (error) {
            console.error('Erro na aprovação:', error);
            let errorMessage = error.message;
            if (error.code === 'auth/email-already-in-use')
                errorMessage = 'Este e-mail já está em uso. O usuário pode já ter sido criado.';
            alert(`Erro ao criar usuário: ${errorMessage}`);
        }
    }

    async rejectRequest(requestId, email) {
        if (!confirm(`Recusar cadastro para ${email}? A solicitação será removida.`)) return;
        try {
            const db = firebase.firestore();
            await db.collection('requests').doc(requestId).update({
                status: 'rejected',
                rejectedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            this.loadRegistrationRequests();
            alert(`Solicitação de ${email} recusada.`);
        } catch (error) {
            console.error("Erro ao recusar:", error);
            alert(`Erro ao recusar solicitação: ${error.message}`);
        }
    }
    
    async updateFleetStatus() {
        try {
            if (window.StatusDaFrota && this.analysisResult) {
                window.StatusDaFrota.update(this.analysisResult);
            }
        } catch (error) {
            console.error('Erro ao atualizar status da frota:', error);
        }
    }
    
    async syncFleetRegistry(data) {
        try {
            const uniqueFleetsInImport = new Set();
            data.forEach(row => {
                if (row.frota) {
                    const cleanFrota = String(row.frota).trim().replace(/^0+/, '');
                    if(cleanFrota.length > 0) uniqueFleetsInImport.add(cleanFrota);
                }
            });
            return uniqueFleetsInImport.size;
        } catch (error) {
            console.error("Erro ao sincronizar frotas:", error);
            return 0;
        }
    }
    
    setupAutoRefresh() {
        if (this.refreshTimeoutId) clearTimeout(this.refreshTimeoutId);
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinutes = now.getMinutes();

        let targetHour = currentHour;
        let targetMinutes = 0;
        
        if (currentMinutes < 30) {
            targetMinutes = 30;
        } else {
            targetHour = currentHour + 1;
            targetMinutes = 0;
            if (targetHour === 24) targetHour = 0;
        }

        let nextFixedTime = new Date();
        nextFixedTime.setHours(targetHour);
        nextFixedTime.setMinutes(targetMinutes);
        nextFixedTime.setSeconds(0);
        nextFixedTime.setMilliseconds(0);

        if (nextFixedTime.getTime() <= now.getTime()) {
            nextFixedTime = new Date(nextFixedTime.getTime() + 24 * 3600 * 1000);
        }

        const delayMs = nextFixedTime.getTime() - now.getTime();
        
        this.refreshTimeoutId = setTimeout(() => {
            this.startLoadingProcess();
            this.setupAutoRefresh();
        }, delayMs);
        
        this.updateNextRefreshDisplay(nextFixedTime);
    }
    
    initializeCarousel() {
        this.stopCarousel(); 
        this.carouselInterval = setInterval(() => {
            this.navigateCarousel(1); 
        }, 20000); 
        this.showSlide(this.currentSlideIndex);
    }
    
    stopCarousel() {
        if (this.carouselInterval) {
            clearInterval(this.carouselInterval);
            this.carouselInterval = null;
        }
    }
    
    navigateCarousel(direction) {
        const slides = document.querySelectorAll('.carousel-slide');
        if (slides.length === 0) return;
        
        let newIndex = this.currentSlideIndex + direction;
        if (newIndex >= slides.length) {
            newIndex = 0;
        } else if (newIndex < 0) {
            newIndex = slides.length - 1;
        }

        this.showSlide(newIndex);
        this.initializeCarousel();
    }

    showSlide(index) {
        const slides = document.querySelectorAll('.carousel-slide');
        const indicators = document.querySelectorAll('.carousel-indicators .indicator');
        
        if (slides.length === 0 || index < 0 || index >= slides.length) return;

        slides.forEach((slide, i) => {
            if (i === index) slide.classList.add('active');
            else slide.classList.remove('active');
        });
        
        indicators.forEach((indicator, i) => {
            if (i === index) indicator.classList.add('active');
            else indicator.classList.remove('active');
        });

        this.currentSlideIndex = index;
        const chartIds = ['realHourlyChart', 'potencialHourlyChart', 'rotacaoHourlyChart'];
        const activeChartId = chartIds[index];
        
        if (this.visualizer && this.visualizer.charts[activeChartId]) {
            setTimeout(() => {
                if (this.visualizer.charts[activeChartId]) {
                    this.visualizer.charts[activeChartId].resize();
                    if (this.analysisResult && this.visualizer.updateChartData) {
                        this.visualizer.updateChartData(activeChartId, this.analysisResult);
                    }
                }
            }, 100);
        }
    }
    
    loadMeta() {
        const metas = { 'metaMoagem': '18500', 'metaRotacao': '1100' };
        Object.keys(metas).forEach(key => {
            const savedMeta = localStorage.getItem(key);
            const input = document.getElementById(key + 'Input');
            if (input) {
                if (savedMeta && !isNaN(parseFloat(savedMeta))) input.value = savedMeta;
                else input.value = metas[key];
            }
        });
        localStorage.removeItem('metaColheita');
        this.updateMoagemTargetDisplay();
    }

    saveMeta(newValue, key) {
        if (newValue && !isNaN(parseFloat(newValue))) {
            localStorage.setItem(key, newValue);
        }
        if (key === 'metaMoagem') {
            this.updateMoagemTargetDisplay(); 
            if (this.data.length > 0) this.recalculateProjectionAndRender();
            else if (this.analysisResult) this.visualizer.updateDashboard(this.analysisResult);
        }
        if (key === 'metaRotacao' && this.analysisResult) {
            this.visualizer.updateDashboard(this.analysisResult);
        }
    }
    
    updateMoagemTargetDisplay() {
        const targetValue = parseFloat(localStorage.getItem('metaMoagem') || '18500');
        const displayEl = document.getElementById('moagemTargetDisplay');
        if (displayEl) {
            if (typeof Utils !== 'undefined' && Utils.formatNumber) {
                displayEl.textContent = Utils.formatNumber(targetValue) + ' t';
            } else {
                displayEl.textContent = targetValue.toLocaleString('pt-BR') + ' t';
            }
        }
    }
    
    recalculateProjectionAndRender() {
        this.showLoadingAnimation(); 
        this.analysisResult = this.analyzer.analyzeAll(this.data, this.potentialData, this.metaData, this.validationResult, this.acmSafraData);
        
        this.visualizer.updateDashboard(this.analysisResult);
        this.updateDashboardWithCorrectedValues();
        this.updateRollingAverages();
        this.renderHxHTimeline();
        this.hideLoadingAnimation();
        this.initializeCarousel();
    }
    
    calculateRealAccumulated() {
        const _toNum = (v) => {
            if (v === null || v === undefined || v === '') return 0;
            if (typeof v === 'number') return isNaN(v) ? 0 : v;
            let s = String(v).trim().replace(/[^\d,.-]/g, '');
            if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
            s = s.replace(',', '.');
            const n = parseFloat(s);
            return isNaN(n) ? 0 : n;
        };

        if (this.data && this.data.length > 0) {
            let maxDate = null;
            this.data.forEach(item => {
                const d = String(item.data || item.dia_balanca || item.diaBal || item['Dia Balanca'] || item.Data || '').slice(0, 10).trim();
                if (d && d !== 'undefined' && (!maxDate || d > maxDate)) maxDate = d;
            });

            if (maxDate) {
                const rowsUltimoDia = this.data.filter(item => {
                    const d = String(item.data || item.dia_balanca || item.diaBal || item['Dia Balanca'] || item.Data || '').slice(0, 10).trim();
                    return d === maxDate;
                });

                const totalPeso = rowsUltimoDia.reduce((sum, item) => {
                    if (typeof item === 'object' && item !== null) {
                        return sum + (_toNum(item.peso || item.pesoLiquido || item['Peso Líquido'] || item['Peso Liquido'] || 0));
                    }
                    return sum;
                }, 0);

                if (totalPeso > 10) return totalPeso;
            }
        }

        return 0;
    }
    
    initShiftTracker() {
        const updateShift = () => {
            const now = new Date();
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            
            let shiftName = '';
            let progress = 0;
            let cssClass = '';
            
            const startA = 7 * 60 + 45; 
            const startB = 16 * 60;         
            const startC = 23 * 60 + 40; 

            if (currentMinutes >= startA && currentMinutes < startB) {
                shiftName = 'Turno A (Manhã)';
                cssClass = 'turno-a';
                progress = ((currentMinutes - startA) / (startB - startA)) * 100;
            } else if (currentMinutes >= startB && currentMinutes < startC) {
                shiftName = 'Turno B (Tarde)';
                cssClass = 'turno-b';
                progress = ((currentMinutes - startB) / (startC - startB)) * 100;
            } else {
                shiftName = 'Turno C (Noite)';
                cssClass = 'turno-c';
                const totalDuration = (24 * 60 - startC) + startA; 
                let elapsed = currentMinutes >= startC ? currentMinutes - startC : (24 * 60 - startC) + currentMinutes;
                progress = (elapsed / totalDuration) * 100;
            }

            const fillEl = document.getElementById('shiftProgressFill');
            const nameEl = document.getElementById('shiftName');
            const timeEl = document.getElementById('shiftTimeRemaining');

            if (fillEl && nameEl && timeEl) {
                fillEl.classList.remove('turno-a', 'turno-b', 'turno-c');
                fillEl.classList.add(cssClass);
                fillEl.style.width = `${Math.min(100, Math.max(0, progress))}%`;
                nameEl.textContent = shiftName;
                timeEl.textContent = `${progress.toFixed(1)}%`;
            }
        };

        updateShift();
        setInterval(updateShift, 10000); 
    }
    
    updateDashboardWithCorrectedValues() {
        const updateEl = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };

        const acumuladoReal = this.calculateRealAccumulated();

        if (this.analysisResult) {
            this.analysisResult.acumuladoDia    = acumuladoReal;
            this.analysisResult.acumuladoRealDia = acumuladoReal;
        }
        const metaDiaria = parseFloat(localStorage.getItem('metaMoagem') || '18500');
        const porcentagem = Math.min(100, (acumuladoReal / metaDiaria) * 100);
        
        updateEl('moagemAcumulado', acumuladoReal.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' t');
        
        const moagemProgressBar = document.getElementById('moagemProgressBar');
        if (moagemProgressBar) moagemProgressBar.style.width = `${porcentagem}%`;
        
        updateEl('moagemPerc', `${porcentagem.toFixed(1)}%`);
        updateEl('moagemTargetDisplay', metaDiaria.toLocaleString('pt-BR') + ' t');
        
        this.updateFleetStatus();
        
        const _parseSafraNum = (v) => {
            if (!v && v !== 0) return 0;
            if (typeof v === 'number') return isNaN(v) ? 0 : v;
            let s = String(v).trim().replace(/[^\d,.-]/g, '');
            if (!s) return 0;
            const dots = (s.match(/\./g) || []).length;
            if (dots > 1) s = s.replace(/\./g, '');
            s = s.replace(',', '.');
            return parseFloat(s) || 0;
        };
        const safraAcumuladoRaw = (this.analysisResult && this.analysisResult.acumuladoSafra > 0)
            ? this.analysisResult.acumuladoSafra
            : acumuladoReal;
        const safraAcumulado = _parseSafraNum(safraAcumuladoRaw);
        updateEl('moagemAcumuladoSafra', safraAcumulado.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' t');

        // ── Tooltip safra-aware: mostra safra atual + safra anterior ──
        try {
            const safraInfo = this.analyzer && this.analyzer._safraInfo;
            const safraLabelEl = document.getElementById('acumuladoSafra');
            if (safraLabelEl && safraInfo) {
                const labelCard = safraLabelEl.closest('.info-compact-card');
                if (labelCard) {
                    // Remove tooltip anterior
                    const oldTip = labelCard.querySelector('.safra-tooltip-wrap');
                    if (oldTip) oldTip.remove();

                    const tipWrap = document.createElement('div');
                    tipWrap.className = 'safra-tooltip-wrap';
                    tipWrap.style.cssText = 'position:relative;display:inline-flex;align-items:center;margin-top:4px;cursor:help;';

                    const tipLabel = document.createElement('span');
                    tipLabel.style.cssText = 'font-size:.7rem;color:var(--primary);font-weight:700;border-bottom:1px dashed;';
                    tipLabel.textContent = safraInfo.hasSafra2627 ? 'Safra 26/27 ▲' : 'Safra 25/26';

                    const tipBox = document.createElement('div');
                    tipBox.style.cssText = [
                        'position:absolute;bottom:calc(100% + 6px);left:0;',
                        'background:#1e293b;color:#e2e8f0;border:1px solid #334155;',
                        'border-radius:8px;padding:8px 12px;font-size:.75rem;z-index:9999;',
                        'white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,.4);',
                        'display:none;min-width:200px;'
                    ].join('');

                    const fmt = n => n.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
                    const lines = [
                        `<b>🌿 Safra Atual (${safraInfo.safraAtual})</b>`,
                        `${fmt(safraInfo.hasSafra2627 ? safraInfo.total2627 : safraInfo.total2526)} t`,
                        `<hr style="border-color:#334155;margin:5px 0;">`,
                    ];
                    if (safraInfo.hasSafra2627 && safraInfo.total2526 > 0) {
                        lines.push(`<span style="opacity:.7;">Safra Anterior 25/26:</span>`);
                        lines.push(`<span style="opacity:.7;">${fmt(safraInfo.total2526)} t</span>`);
                    }
                    tipBox.innerHTML = lines.join('<br>');

                    tipWrap.addEventListener('mouseenter', () => { tipBox.style.display = 'block'; });
                    tipWrap.addEventListener('mouseleave', () => { tipBox.style.display = 'none'; });
                    tipWrap.appendChild(tipLabel);
                    tipWrap.appendChild(tipBox);
                    labelCard.appendChild(tipWrap);
                }
            }
        } catch(e) { /* tooltip safra opcional */ }
        
        if (this.analysisResult && this.data && this.data.length > 0) {
            const totalViagens = this.analysisResult.totalViagens || 0;
            const viagensProprias = this.analysisResult.viagensProprias || 0;
            const viagensTerceiros = this.analysisResult.viagensTerceiros || 0;
            
            updateEl('totalViagens', totalViagens.toString());
            updateEl('viagensProprias', viagensProprias.toString());
            updateEl('viagensTerceiros', viagensTerceiros.toString());
        }
        
        if (this.analysisResult && this.visualizer && this.visualizer.kpisRenderer) {
            try {
                this.visualizer.kpisRenderer.updateHeaderStats(this.analysisResult);
            } catch(e) {}
        }

        if (this.consumoRenderer) {
            this.consumoRenderer.render(
                this.consumoD1Data,
                this.consumoAcmData,
                this.data,
                this.dispD1Data,
                this.dispAcmData
            );
        }

        if (this.consumoCamRenderer) {
            this.consumoCamRenderer.render(
                this.camD1Data,
                this.camAcmData,
                this.data
            );
        }

        if (this.visaoGlobalRenderer) {
            this.visaoGlobalRenderer.render(
                this.data,
                this.consumoD1Data,
                this.consumoAcmData,
                this.dispD1Data,
                this.dispAcmData,
                this.analysisResult
            );
        }

        if (window.StatusDaFrota)        window.StatusDaFrota.update(this.analysisResult);

        if (window.OEE_TPL && this.tplData && this.tplData.length > 0) {
            try {
                if (window.OEE_TPL_Analysis) {
                    const tplAnalysis = window.OEE_TPL_Analysis.analyze(this.tplData);
                    if (this.analysisResult) this.analysisResult.tplAnalysis = tplAnalysis;
                    console.log('[OEE_TPL_Analysis] OEE:', (tplAnalysis.oee.oee * 100).toFixed(1) + '%');
                }
                window.OEE_TPL.renderColhedoras(this.tplData);
                window.OEE_TPL.renderCaminhoes(this.tplData);
                window.OEE_TPL.renderComparativo(this.tplData);
                window.OEE_TPL.renderGargalos(this.tplData);
            } catch(e) { console.warn('[OEE_TPL]', e); }
        }
        if (window.AcumuladoEProgresso)  window.AcumuladoEProgresso.update(this.analysisResult);
        if (window.ProjecaoDeMoagem)     window.ProjecaoDeMoagem.update(this.analysisResult);
        if (window.RankingCaminhoes)     window.RankingCaminhoes.update(this.analysisResult);
        if (window.GraficoRotaCaminhoes) window.GraficoRotaCaminhoes.update(this.analysisResult);
        if (window.RankingColhedoras)    window.RankingColhedoras.update(this.analysisResult);
        if (window.GraficoDisponibilidade && this.consumoAcmData)
            window.GraficoDisponibilidade.update(this.consumoAcmData);
    }

    async processDataAsync(productionData, potentialData, metaData, refreshTargetTime) {
        this._setLoadingMsg('Analisando dados…', 75);
        await this._yieldControl(); 
        
        if (this.validator && productionData && productionData.length > 0) {
            this.validationResult = this.validator.validateAll(productionData);
            this.renderAlerts(this.validationResult.anomalies);
        }
        
        await this._yieldControl(); 
        this.analysisResult = this.analyzer.analyzeAll(productionData, potentialData, this.metaData, this.validationResult, this.acmSafraData);

        await this._yieldControl();
        const totalRegistered = await this.syncFleetRegistry(productionData);
        if (this.analysisResult) this.analysisResult.totalRegisteredFleets = totalRegistered;

        this._setLoadingMsg('Renderizando dashboard…', 90);
        await this._yieldControl(); 
        this.visualizer.updateDashboard(this.analysisResult);
        
        this.updateDashboardWithCorrectedValues();
        await this.updateFleetStatus();
        this.updateRollingAverages();
        this.renderHxHTimeline();

        await this._yieldControl();
        this._runOEEAnalysis();

        this.showAnalyticsSection(true);
        if (this.canAccessTab('tab-moagem')) this.showTab('tab-moagem');

        if (this.analysisResult) {
            if (window.StatusDaFrota)        window.StatusDaFrota.init(this.analysisResult);
            if (window.AcumuladoEProgresso)  window.AcumuladoEProgresso.init(this.analysisResult);
            if (window.ProjecaoDeMoagem)     window.ProjecaoDeMoagem.init(this.analysisResult);
            if (window.RankingCaminhoes)     window.RankingCaminhoes.init(this.analysisResult);
            if (window.GraficoRotaCaminhoes) window.GraficoRotaCaminhoes.init(this.analysisResult);
            if (window.RankingColhedoras)    window.RankingColhedoras.init(this.analysisResult);
            if (window.GraficoDisponibilidade && this.consumoAcmData)
                window.GraficoDisponibilidade.init(this.consumoAcmData);
        }
        const hxhRows = this.data || [];
        if (window.TimelineHXH)    window.TimelineHXH.init(hxhRows);
        if (window.ViagensPorHora) window.ViagensPorHora.init(hxhRows);
        if (window.PesoPorFrente)  window.PesoPorFrente.init(hxhRows); 
        
        this.updateNextRefreshDisplay(refreshTargetTime); 
        this.initializeCarousel();
    }

    _runOEEAnalysis() {
        try {
            if (!this.oeeAnalyzer || !this.oeeRenderer) {
                console.warn('[OEE] Módulos não carregados — abas OEE ficarão vazias.');
                return;
            }
            if (!this.analysisResult || !this.analysisResult.data) {
                console.warn('[OEE] Sem dados de produção para análise OEE.');
                return;
            }

            const nDias = this._calcNDias(this.analysisResult.data);

            console.log(`[OEE] Iniciando análise. Dias: ${nDias} | TPL rows: ${this.tplData.length} | Prod rows: ${this.analysisResult.data.length}`);

            this.oeeAnalysis = this.oeeAnalyzer.analyzeAll(
                this.analysisResult.data,
                this.tplData,
                nDias,
                this.analysisResult.metaData
            );

            this.oeeRenderer.renderAbaOEEColhedoras(this.oeeAnalysis);
            this.oeeRenderer.renderAbaOEECaminhoes(this.oeeAnalysis);
            this.oeeRenderer.renderAbaComparativoOEE(this.oeeAnalysis);
            this.oeeRenderer.renderAbaEficiencia(this.oeeAnalysis);
            this.oeeRenderer.renderAbaGargalos(this.oeeAnalysis);

            const meta = this.oeeAnalysis.metadados;
            console.log(`[OEE] ✅ Análise concluída. Modelo: ${meta.modeloOEE} | TPL: ${this.oeeAnalysis.hasTpl ? 'SIM' : 'NÃO'}`);
        } catch (err) {
            console.error('[OEE] Erro na análise OEE — abas podem estar incompletas:', err);
        }
    }

    canAccessTab(tabId) { return true; }

    _directBoot() {
        const loginScreen = document.getElementById('login-screen');
        const mainDash = document.getElementById('main-dashboard');
        if (loginScreen) loginScreen.classList.add('hidden');
        if (mainDash) mainDash.classList.remove('hidden');
        
        this.currentUser = { email: 'local@agro', nickname: 'Operador' };
        this.currentUserRole = 'master';
        
        this.renderTabsNavigation();
        this.showTab('tab-moagem');
        this.startLoadingProcess();
        this.setupAutoRefresh();
    }

    updateRollingAverages() {
        if (!this.analysisResult) return;
        
        const now = new Date();
        const currentHour = now.getHours();
        
        const findCurrentHourData = (data) => {
            if (!data || !Array.isArray(data)) return null;
            return data.find(row => {
                const rowHour = parseInt(row.hora || row.time || row.HORA || -1);
                return rowHour === currentHour;
            }) || data.find(row => {
                if (row.time && typeof row.time === 'string') {
                    const timeParts = row.time.split(':');
                    if (timeParts.length > 0) return parseInt(timeParts[0]) === currentHour;
                }
                return false;
            });
        };
        
        const formatDisp = (val) => {
            let num = parseFloat(val || 0);
            if (num > 0 && num <= 1) num = num * 100; 
            return Math.round(num);
        };

        const updateEl = (id, val, suffix) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val + suffix;
        };
        
        const currentPotData = findCurrentHourData(this.analysisResult.potentialData || []);

        if (currentPotData) {
            const getVal = (keys) => {
                for (const k of keys) if (currentPotData[k] !== undefined) return currentPotData[k];
                return 0;
            };
            const currentDispColh = formatDisp(getVal(['dispColhedora', 'DISP COLHEDORA', 'DISPONIBILIDADE COLHEDORA']));
            const currentDispTrans = formatDisp(getVal(['dispTransbordo', 'DISP TRANSBORDO', 'DISPONIBILIDADE TRANSBORDO']));
            const currentDispCam = formatDisp(getVal(['dispCaminhoes', 'DISP CAMINHÕES', 'DISP CAMINHOES']));
            
            updateEl('dispColhedora', currentDispColh, '%');
            updateEl('dispTransbordo', currentDispTrans, '%');
            updateEl('dispCaminhoes', currentDispCam, '%');
            
            this._calculate3HourAverages(currentHour);
        } else {
            this._calculate3HourAverageForDisps(currentHour);
            this._calculate3HourAverages(currentHour);
        }
    }
    
    _calculate3HourAverageForDisps(currentHour) {
        const last3HoursData = this._getLastNHoursData(this.analysisResult.potentialData, currentHour, 3);
        const updateEl = (id, val, suffix) => {
            const el = document.getElementById(id);
            if(el) el.textContent = val + suffix;
        };

        if (last3HoursData.length === 0) {
            updateEl('dispColhedora', '0', '%');
            updateEl('dispTransbordo', '0', '%');
            updateEl('dispCaminhoes', '0', '%');
            return;
        }
        
        let sumColh = 0, sumTrans = 0, sumCam = 0;
        last3HoursData.forEach(row => {
            let col = parseFloat(row['dispColhedora'] || row['DISP COLHEDORA'] || 0);
            let tr = parseFloat(row['dispTransbordo'] || row['DISP TRANSBORDO'] || 0);
            let cam = parseFloat(row['dispCaminhoes'] || row['DISP CAMINHÕES'] || 0);
            if (col > 0 && col <= 1) col *= 100;
            if (tr > 0 && tr <= 1) tr *= 100;
            if (cam > 0 && cam <= 1) cam *= 100;
            sumColh += col; sumTrans += tr; sumCam += cam;
        });
        
        updateEl('dispColhedora', Math.round(sumColh / last3HoursData.length), '%');
        updateEl('dispTransbordo', Math.round(sumTrans / last3HoursData.length), '%');
        updateEl('dispCaminhoes', Math.round(sumCam / last3HoursData.length), '%');
    }
    
    _calculate3HourAverages(currentHour) {
        const last3Moagem = this._getLastNHoursDataCorrected(this.analysisResult.analise24h, currentHour, 3);
        const updateEl = (id, val, suffix) => {
            const el = document.getElementById(id);
            if(el) el.textContent = val + suffix;
        };

        if (last3Moagem.length > 0) {
            const totalMoagem = last3Moagem.reduce((sum, row) => sum + (parseFloat(row.peso) || 0), 0);
            updateEl('avgMoagem3h', Math.round(totalMoagem / last3Moagem.length).toLocaleString('pt-BR'), ' t/h');
        } else {
            updateEl('avgMoagem3h', '0', ' t/h');
        }
        
        const last3Pot = this._getLastNHoursDataCorrected(this.analysisResult.potentialData, currentHour, 3);
        if (last3Pot.length > 0) {
            const totalPot = last3Pot.reduce((sum, row) => sum + (parseFloat(row.potencial || row.POTENCIAL || 0)), 0);
            const avgPot = totalPot / last3Pot.length;
            updateEl('avgPotencial3h', Math.round(avgPot).toLocaleString('pt-BR'), ' t/h');
            
            const totalRot = last3Pot.reduce((sum, row) => {
                const val = parseFloat(row['rotacao'] || row['rotacaoMoenda'] || row['ROTACAO'] || row['RPM'] || 0);
                return sum + val;
            }, 0);
            updateEl('avgRotacao3h', Math.round(totalRot / last3Pot.length).toLocaleString('pt-BR'), ' RPM');
        } else {
            updateEl('avgPotencial3h', '0', ' t/h');
            updateEl('avgRotacao3h', '0', ' RPM');
        }
    }
    
    _getLastNHoursData(data, currentHour, n) {
        if (!data || !Array.isArray(data)) return [];
        const result = [];
        for (let i = 0; i < n; i++) {
            const targetHour = (currentHour - i + 24) % 24;
            const found = data.find(row => {
                const hora = parseInt(row.hora || row.time || row.HORA || -1);
                if (hora === targetHour) return true;
                if (row.time && typeof row.time === 'string') {
                     return parseInt(row.time.split(':')[0]) === targetHour;
                }
                return false;
            });
            if (found) result.push(found);
        }
        return result;
    }

    _getLastNHoursDataCorrected(data, currentHour, n) {
        if (!data || !Array.isArray(data)) return [];
        const result = [];
        
        if (currentHour === 6) {
            const found = data.find(row => {
                const hora = parseInt(row.hora || row.time || row.HORA || -1);
                if (hora === 6) return true;
                if (row.time && typeof row.time === 'string') {
                     return parseInt(row.time.split(':')[0]) === 6;
                }
                return false;
            });
            if (found) result.push(found);
            return result;
        }
        
        if (currentHour === 7 || currentHour === 8) {
            for (let i = 1; i <= 2; i++) {
                const targetHour = (currentHour - i + 24) % 24;
                const found = data.find(row => {
                    const hora = parseInt(row.hora || row.time || row.HORA || -1);
                    if (hora === targetHour) return true;
                    if (row.time && typeof row.time === 'string') {
                         return parseInt(row.time.split(':')[0]) === targetHour;
                    }
                    return false;
                });
                if (found) result.push(found);
            }
            return result;
        }
        
        for (let i = 1; i <= 3; i++) {
            const targetHour = (currentHour - i + 24) % 24;
            const found = data.find(row => {
                const hora = parseInt(row.hora || row.time || row.HORA || -1);
                if (hora === targetHour) return true;
                if (row.time && typeof row.time === 'string') {
                     return parseInt(row.time.split(':')[0]) === targetHour;
                }
                return false;
            });
            if (found) result.push(found);
        }
        return result;
    }

    showLoadingAnimation(msg) {
        let overlay = document.getElementById('loading-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'loading-overlay';
            overlay.style.cssText = [
                'position:fixed;inset:0;z-index:99999;',
                'background:rgba(5,10,20,0.92);',
                'display:flex;flex-direction:column;align-items:center;justify-content:center;',
                'backdrop-filter:blur(6px);transition:opacity 0.4s ease;'
            ].join('');

            const spinner = document.createElement('div');
            spinner.style.cssText = [
                'width:64px;height:64px;',
                'border:4px solid rgba(0,212,255,0.15);',
                'border-top-color:#00D4FF;border-radius:50%;',
                'animation:_ld-spin 0.9s linear infinite;margin-bottom:24px;'
            ].join('');

            const title = document.createElement('div');
            title.style.cssText = 'color:#00D4FF;font-size:1.4rem;font-weight:700;letter-spacing:2px;margin-bottom:8px;';
            title.textContent = 'AgroAnalytics';

            const status = document.createElement('div');
            status.id = 'loading-status-msg';
            status.style.cssText = 'color:#9ca3af;font-size:0.85rem;text-align:center;max-width:300px;transition:opacity 0.3s;line-height:1.4;';
            status.textContent = 'Carregando dados…';

            const barWrap = document.createElement('div');
            barWrap.style.cssText = 'width:220px;height:3px;background:rgba(255,255,255,0.08);border-radius:2px;margin-top:16px;overflow:hidden;';
            const bar = document.createElement('div');
            bar.id = 'loading-progress-bar';
            bar.style.cssText = 'height:100%;width:0%;background:linear-gradient(90deg,#00D4FF,#40800c);border-radius:2px;transition:width 0.5s ease;';
            barWrap.appendChild(bar);

            const btnClear = document.createElement('button');
            btnClear.id = 'loading-clear-cache-btn';
            btnClear.textContent = '🔄 Limpar cache e recarregar';
            btnClear.style.cssText = [
                'display:none;margin-top:20px;padding:8px 16px;',
                'background:transparent;border:1px solid rgba(255,255,255,0.2);',
                'color:#9ca3af;border-radius:6px;cursor:pointer;font-size:0.8rem;',
                'transition:all 0.2s;'
            ].join('');
            btnClear.onmouseover = () => { btnClear.style.borderColor='#00D4FF'; btnClear.style.color='#00D4FF'; };
            btnClear.onmouseout  = () => { btnClear.style.borderColor='rgba(255,255,255,0.2)'; btnClear.style.color='#9ca3af'; };
            btnClear.onclick = () => {
                if (window.agriculturalDashboard) window.agriculturalDashboard.clearCache();
            };
            setTimeout(() => {
                const b = document.getElementById('loading-clear-cache-btn');
                if (b && document.getElementById('loading-overlay') &&
                    document.getElementById('loading-overlay').style.display !== 'none') {
                    b.style.display = 'block';
                    const s = document.getElementById('loading-status-msg');
                    if (s) s.style.color = '#FFB800';
                }
            }, 15000);

            if (!document.getElementById('_ld-kf')) {
                const st = document.createElement('style');
                st.id = '_ld-kf';
                st.textContent = '@keyframes _ld-spin{to{transform:rotate(360deg)}}';
                document.head.appendChild(st);
            }

            overlay.appendChild(spinner);
            overlay.appendChild(title);
            overlay.appendChild(status);
            overlay.appendChild(barWrap);
            overlay.appendChild(btnClear);
            document.body.appendChild(overlay);
        }
        overlay.classList.remove('hidden');
        overlay.style.opacity = '1';
        overlay.style.display = 'flex';
        if (msg) this._setLoadingMsg(msg, 0);
    }

    _setLoadingMsg(msg, pct) {
        const el = document.getElementById('loading-status-msg');
        if (el) el.textContent = msg;
        const bar = document.getElementById('loading-progress-bar');
        if (bar && pct !== undefined) bar.style.width = pct + '%';
    }

    hideLoadingAnimation() {
        const overlay = document.getElementById('loading-overlay');
        if (!overlay) return;
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
            overlay.style.opacity = '1';
        }, 600);
    }
    
    _yieldControl() { return new Promise(resolve => setTimeout(resolve, 0)); }

    updateNextRefreshDisplay(targetTime) {
        const targetTimeStr = targetTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const displayEl = document.getElementById('refreshStatusText'); 
        if (displayEl) displayEl.innerHTML = `Próxima atualização: ${targetTimeStr} 🔄️`;
    }

    _gvizUrl(sheetId) {
        return 'https://docs.google.com/spreadsheets/d/' + sheetId + '/gviz/tq?tqx=out:csv';
    }

    _normalizeTplRow(row) {
        const ALIAS = {
            'COD.EQUIPAMENTO':     'COD. EQUIPAMENTO',
            'COD EQUIPAMENTO':     'COD. EQUIPAMENTO',
            'CODIGO EQUIPAMENTO':  'COD. EQUIPAMENTO',
            'EQUIPAMENTO':         'COD. EQUIPAMENTO',
            'DATA HORA LOCAL':     'DATA/HORA LOCAL',
            'DATA/HORA':           'DATA/HORA LOCAL',
            'DATA':                'DATA/HORA LOCAL',
            'DT APONTAMENTO':      'DATA/HORA LOCAL',
            'DATA APONTAMENTO':    'DATA/HORA LOCAL',
            'HRS. OPERACIONAIS':   'HRS OPERACIONAIS',
            'HORAS OPERACIONAIS':  'HRS OPERACIONAIS',
            'HRS.OPERACIONAIS':    'HRS OPERACIONAIS',
            'HORA OPERACIONAL':    'HRS OPERACIONAIS',
            'HRS. MOTOR LIGADO':   'HRS MOTOR LIGADO',
            'HORAS MOTOR LIGADO':  'HRS MOTOR LIGADO',
            'HRS.MOTOR LIGADO':    'HRS MOTOR LIGADO',
            'MOTOR LIGADO':        'HRS MOTOR LIGADO',
            'DESC GRUPO OPERAC':   'DESC.GRUPO OPERAC.',
            'DESC.GRUPO OPERAC':   'DESC.GRUPO OPERAC.',
            'GRUPO OPERACIONAL':   'DESC.GRUPO OPERAC.',
            'DESC GRUPO':          'DESC.GRUPO OPERAC.',
            'DESC OPERACAO':       'DESC.OPERAÇÃO',
            'DESC.OPERACAO':       'DESC.OPERAÇÃO',
            'DESC OPERAÇÃO':       'DESC.OPERAÇÃO',
            'OPERACAO':            'DESC.OPERAÇÃO',
            'OPERAÇÃO':            'DESC.OPERAÇÃO',
        };

        const out = {};
        for (const [k, v] of Object.entries(row)) {
            const upper  = k.toUpperCase().trim();
            const mapped = ALIAS[upper];
            const key = mapped || k;
            if (!out[key]) out[key] = v;
        }
        return out;
    }

    async _fetchTplPartition(partition) {
        const url = this._gvizUrl(partition.id);
        console.log('[TPL] Buscando ' + partition.key + ' de ' + url.slice(0, 60) + '...');
        try {
            const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const csvText = await r.text();

            if (!csvText || csvText.trim().startsWith('<!') || csvText.length < 20) {
                console.warn('[TPL] ' + partition.key + ': resposta vazia ou HTML. A planilha está compartilhada publicamente?');
                return [];
            }

            const jsonData = this.processor.parseCsvDirect(csvText);
            if (!jsonData || jsonData.length === 0) {
                console.warn('[TPL] ' + partition.key + ': CSV sem dados');
                return [];
            }

            const ISO_RE = /^\d{4}-\d{2}-\d{2}T/;
            jsonData.forEach(row => {
                for (const k of Object.keys(row)) {
                    const v = row[k];
                    if (typeof v === 'string' && ISO_RE.test(v)) {
                        const d = new Date(v);
                        if (!isNaN(d.getTime())) {
                            const dd = String(d.getDate()).padStart(2, '0');
                            const mm = String(d.getMonth() + 1).padStart(2, '0');
                            const hh = String(d.getHours()).padStart(2, '0');
                            const mi = String(d.getMinutes()).padStart(2, '0');
                            const ss = String(d.getSeconds()).padStart(2, '0');
                            row[k] = dd + '/' + mm + '/' + d.getFullYear() + ' ' + hh + ':' + mi + ':' + ss;
                        }
                    }
                }
            });

            const tplRows = jsonData.map(row => {
                const fixed = {};
                for (const [k, v] of Object.entries(row)) {
                    const fixedKey = this.processor.fixEncoding
                        ? this.processor.fixEncoding(k.trim())
                        : k.trim();
                    fixed[fixedKey] = (v !== null && v !== undefined) ? String(v).trim() : '';
                }
                return fixed;
            }).filter(row =>
                row['COD. EQUIPAMENTO'] || row['COD.EQUIPAMENTO'] ||
                row['COD EQUIPAMENTO']  || row['EQUIPAMENTO']
            ).map(row => this._normalizeTplRow(row));

            console.log('[TPL] ' + partition.key + ': ' + tplRows.length + ' registros carregados ✅');
            if (tplRows.length > 0) {
                console.log('[TPL] Amostra de colunas:', Object.keys(tplRows[0]).slice(0, 8).join(' | '));
            }
            return tplRows;

        } catch (err) {
            console.error('[TPL] ' + partition.key + ' falhou:', err.name, '-', err.message);
            return [];
        }
    }

    async _fetchAllTplPartitions() {
        const partitions = (this.TPL_PARTITIONS || [])
            .filter(p => p && p.id && !p.id.includes('COLE_AQUI') && !p.id.includes('PREENCHER_'));

        if (partitions.length === 0) {
            console.warn('[TPL] Nenhuma partição válida em TPL_PARTITIONS. Configure os IDs das planilhas em app.js.');
            this._showToastSafe(
                'TPL não configurado. Abra app.js e preencha TPL_PARTITIONS com os IDs das planilhas mensais.',
                'warning', '⚙️ Configuração necessária'
            );
            return [];
        }

        console.log('[TPL] Buscando ' + partitions.length + ' partição(ões) em paralelo...');
        this._showToastSafe('Carregando ' + partitions.length + ' planilha(s) TPL...', 'info', 'TPL');

        const results = await Promise.all(partitions.map(p => this._fetchTplPartition(p)));
        const all     = results.flat();

        console.log('[TPL] Total consolidado: ' + all.length + ' registros de ' + partitions.length + ' planilha(s)');

        if (all.length === 0) {
            this._showToastSafe(
                'Nenhum registro TPL carregado. Verifique se as planilhas estão compartilhadas publicamente (Qualquer pessoa com o link).',
                'error', 'TPL vazio'
            );
        } else {
            this._showToastSafe('TPL carregado: ' + all.length + ' registros', 'success', 'TPL ✅');
        }

        return all;
    }

    async _fetchAllProducaoPartitions() {
        const partitions = (this.PRODUCAO_PARTITIONS || [])
            .filter(p => p && p.id && !p.id.includes('PREENCHER_') && !p.id.includes('COLE_AQUI'));

        if (partitions.length === 0) {
            console.warn('[PRODUCAO] Nenhuma partição válida em PRODUCAO_PARTITIONS. Preencha os IDs em app.js.');
            return [];
        }

        console.log('[PRODUCAO] Buscando ' + partitions.length + ' planilha(s) em paralelo...');

        const results = await Promise.all(partitions.map(async (partition) => {
            try {
                const url = this._gvizUrl(partition.id);
                const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
                if (!r.ok) throw new Error('HTTP ' + r.status);
                const csvText = await r.text();

                if (!csvText || csvText.trim().startsWith('<!') || csvText.length < 20) {
                    console.warn('[PRODUCAO] ' + partition.key + ': resposta vazia ou HTML. Planilha compartilhada?');
                    return [];
                }

                const jsonData = this.processor.parseCsvDirect(csvText);
                if (!jsonData || jsonData.length === 0) {
                    console.warn('[PRODUCAO] ' + partition.key + ': CSV sem dados');
                    return [];
                }

                const ISO_RE = /^\d{4}-\d{2}-\d{2}T/;
                jsonData.forEach(row => {
                    for (const k of Object.keys(row)) {
                        const v = row[k];
                        if (typeof v === 'string' && ISO_RE.test(v)) {
                            const d = new Date(v);
                            if (!isNaN(d.getTime())) {
                                const dd = String(d.getDate()).padStart(2, '0');
                                const mm = String(d.getMonth() + 1).padStart(2, '0');
                                const hh = String(d.getHours()).padStart(2, '0');
                                const mi = String(d.getMinutes()).padStart(2, '0');
                                row[k] = dd + '/' + mm + '/' + d.getFullYear() + ' ' + hh + ':' + mi;
                            }
                        }
                    }
                });

                const processed = await this.processor.processCSV(csvText, partition.key + '.csv');
                if (processed && Array.isArray(processed.data) && processed.data.length > 0) {
                    console.log('[PRODUCAO] ' + partition.key + ': ' + processed.data.length + ' registros ✅');
                    return processed.data;
                }
                return [];
            } catch (err) {
                console.error('[PRODUCAO] ' + partition.key + ' falhou:', err.message);
                return [];
            }
        }));

        const allRows = results.flat();
        console.log('[PRODUCAO] Total consolidado: ' + allRows.length + ' registros de ' + partitions.length + ' planilha(s)');
        return allRows;
    }

    _showToastSafe(msg, type, title) {
        try {
            if (typeof this.showToast === 'function') this.showToast(msg, type, title);
            else console.log('[' + (type || 'info').toUpperCase() + '] ' + (title ? title + ': ' : '') + msg);
        } catch(e) {}
    }

    async _fetchGASConsolidated(action) {
        if (!this.GAS_API_URL || this.GAS_API_URL.trim() === '') {
            console.debug('[GAS] GAS_API_URL não configurado (não necessário — TPL usa gviz/CSV direto).');
            return [];
        }
        try {
            const url = `${this.GAS_API_URL}?action=${action}&t=${Date.now()}`;
            const response = await fetch(url, { method: 'GET', mode: 'cors' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const json = await response.json();
            if (json.success && Array.isArray(json.data) && json.data.length > 1) {
                console.log(`[GAS] ${action}: ${json.data.length - 1} registros recebidos.`);
                return json.data;
            }
            console.warn(`[GAS] ${action}: resposta vazia ou inválida.`);
            return [];
        } catch (err) {
            console.error(`[GAS] Erro ao buscar ${action}:`, err);
            return [];
        }
    }

    _convertGASArrayToObjects(gasData) {
        if (!gasData || gasData.length < 2) return [];
        const headers = gasData[0].map(h => String(h).trim());
        const result = [];
        for (let i = 1; i < gasData.length; i++) {
            const row = gasData[i];
            if (!row || row.length === 0) continue;
            const obj = {};
            let hasValue = false;
            headers.forEach((h, idx) => {
                const val = idx < row.length ? row[idx] : '';
                obj[h] = val !== null && val !== undefined ? String(val).trim() : '';
                if (obj[h]) hasValue = true;
            });
            if (hasValue && (obj['COD. EQUIPAMENTO'] || obj['DIA BALANCA'] || Object.values(obj).some(v => v.length > 0))) {
                result.push(obj);
            }
        }
        return result;
    }

    _parseDispCSV(csvText) {
        if (!csvText || typeof csvText !== 'string') return [];
        const lines = csvText.trim().split(/\r?\n/);
        if (lines.length < 2) return [];
        const parseRow = (line) => line.split(',').map(v => v.replace(/^"|"$/g, '').trim());
        const headers = parseRow(lines[0]);
        const result  = [];
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const vals = parseRow(lines[i]);
            const obj  = {};
            headers.forEach((h, idx) => { obj[h] = vals[idx] !== undefined ? vals[idx] : ''; });
            if (obj['Equipamento'] || obj['equipamento']) result.push(obj);
        }
        return result;
    }

    _parseTPLCSV(csvText) {
        if (!csvText || typeof csvText !== 'string') return [];
        const lines = csvText.trim().split(/\r?\n/);
        if (lines.length < 2) return [];

        const headers = lines[0].split(';').map(h => h.replace(/^"|"$/g, '').trim());
        const result  = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const vals = line.split(';');
            const obj  = {};
            headers.forEach((h, idx) => {
                obj[h] = vals[idx] !== undefined ? vals[idx].replace(/^"|"$/g, '').trim() : '';
            });
            if (obj['COD. EQUIPAMENTO']) result.push(obj);
        }

        return result;
    }

    _calcNDias(data) {
        if (!data || data.length === 0) return 1;
        const dias = new Set();
        data.forEach(row => {
            const d = String(row.data || row.dia_balanca || row.diaBal || '').slice(0, 10).trim();
            if (d && d !== 'undefined') dias.add(d);
        });
        return Math.max(1, dias.size);
    }

    async fetchFilesFromCloud() {
        const cacheBuster = Date.now();

        const googleSheetsUrls = {
            'Metas.xlsx':    `https://docs.google.com/spreadsheets/d/e/2PACX-1vQNEyAUSGlaGXiM2ph5B8ti0OEIBhbtTjE3qOcWhmtJAAatW3G6_HFkFu94oZApjofbDWyL3s7YSAVm/pub?output=csv&t=${cacheBuster}`,
            'Potencial.xlsx':`https://docs.google.com/spreadsheets/d/e/2PACX-1vRO00gvJ9bi5lAsVOvNO2E4jXPSyDzVnjCOAqFeG9mB_KAD8BtyGmPMd8bQIANyo_Fj_Ve3mGgqgejI/pub?output=csv&t=${cacheBuster}`,
            'AcmSafra.xlsx': `https://docs.google.com/spreadsheets/d/e/2PACX-1vQHEqli7vcRkApksm7zj7wZAMYG6vWxkc3OaTVyCXZpnUOEsYhzErGYFSOwbkeHNrxAjaoF-GrNY1h7/pub?output=csv&t=${cacheBuster}`,
            'ColConD1.pdf':  `https://docs.google.com/spreadsheets/d/e/2PACX-1vRBdZ_hYsAgPSxcD-jOiGAS8ipGRNVa5GQbC0h9LktnxGuuDZQoTg_lFLtthKafxSRrH6KWSqmcF55y/pub?output=csv&t=${cacheBuster}`,
            'ColConAcm.pdf': `https://docs.google.com/spreadsheets/d/e/2PACX-1vS_yHNnDAfWxujKHsodc6cYzKUmJl1uyIONZnQ4f_L3tSWTt-HN6dkkUraXiCpnVBENcvw_xUR9OD8r/pub?output=csv&t=${cacheBuster}`,
            'DispD1.csv':    `https://docs.google.com/spreadsheets/d/1XE-vc7WbF0aDEIaLq1dO8YhOmyAxl3f5YcbxFqVeHAQ/gviz/tq?tqx=out:csv&t=${cacheBuster}`,
            'DispAcm.csv':   `https://docs.google.com/spreadsheets/d/1kMdunj5Rp_6US5jBO4nL3aveYxWlBs0L7IZdpPOmUw0/gviz/tq?tqx=out:csv&t=${cacheBuster}`,
        };

        const networkState = {
            data: [], potentialData: [], metaData: [], acmSafraData: [],
            consumoD1Data: [], consumoAcmData: [], dispD1Data: [], dispAcmData: [], tplData: [],
            camD1Data: [], camAcmData: []
        };

        let successCount = 0;
        let missingFiles = [];

        this._setLoadingMsg('Carregando dados em tempo real…', 10);
        const fsData = await this._fetchFirestoreRecente().catch(() => null);
        
        if (fsData && fsData.producao && fsData.producao.length > 0) {
            networkState.data         = fsData.producao;
            if (fsData.acmSafra  && fsData.acmSafra.length  > 0) networkState.acmSafraData  = fsData.acmSafra;
            if (fsData.potencial && fsData.potencial.length > 0) networkState.potentialData = fsData.potencial;
            if (fsData.colConAcm && fsData.colConAcm.length > 0) networkState.consumoAcmData = fsData.colConAcm;
            if (fsData.colConD1  && fsData.colConD1.length  > 0) networkState.consumoD1Data  = fsData.colConD1;
            if (fsData.metas     && fsData.metas.length     > 0) networkState.metaData       = fsData.metas;
            if (fsData.tpl       && fsData.tpl.length       > 0) networkState.tplData        = fsData.tpl;
            if (fsData.colCamAcm && fsData.colCamAcm.length > 0) networkState.camAcmData     = fsData.colCamAcm;
            if (fsData.colCamD1  && fsData.colCamD1.length  > 0) networkState.camD1Data      = fsData.colCamD1;
            successCount++;
            console.log(`[Firestore] ✅ ${fsData.producao.length} registros — dashboard pronto`);
            console.log(`[Firestore] ✅ CAM D1: ${fsData.colCamD1?.length || 0} registros`);
            console.log(`[Firestore] ✅ CAM ACM: ${fsData.colCamAcm?.length || 0} registros`);
            this._setLoadingMsg('Dados carregados! Atualizando informações adicionais…', 40);
        } else {
            this._setLoadingMsg('Buscando dados recentes…', 15);
        }

        const fetchFixasPromise = Promise.all(Object.entries(googleSheetsUrls).map(async ([name, url]) => {
            if (!url) return { name, success: false, skipped: true };
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Status HTTP: ${response.status}`);
                const csvText = await response.text();
                return { name, csvText, success: true };
            } catch (error) {
                console.error(`Erro ao baixar ${name}:`, error);
                missingFiles.push(name);
                return { name, success: false };
            }
        }));

        const gasRecentePromise = networkState.data.length === 0
            ? this._fetchGASRecente().catch(err => { console.warn('[GAS] Recente falhou:', err.message); return null; })
            : Promise.resolve(null);

        const [downloadedFiles, gasRecenteRows] = await Promise.all([
            fetchFixasPromise,
            gasRecentePromise,
        ]);

        this._setLoadingMsg('Processando registros…', 55);

        if (gasRecenteRows && gasRecenteRows.length > 0) {
            networkState.data = gasRecenteRows;
            successCount++;
            console.log(`[GAS] Fase 1 ✅ — ${gasRecenteRows.length} registros recentes`);
        }

        for (const file of downloadedFiles) {
            if (!file.success || file.skipped) continue;
            try {
                if (file.name.includes('AcmSafra') || file.name.includes('ColCon')) {
                    if (typeof XLSX !== 'undefined') {
                        const wb    = XLSX.read(file.csvText, { type: 'string' });
                        const sheet = wb.Sheets[wb.SheetNames[0]];
                        const json  = XLSX.utils.sheet_to_json(sheet);
                        if (file.name.includes('AcmSafra'))  networkState.acmSafraData  = json;
                        if (file.name.includes('ColConD1'))  networkState.consumoD1Data  = json;
                        if (file.name.includes('ColConAcm')) networkState.consumoAcmData = json;
                        successCount++;
                    }
                } else if (file.name.includes('DispD1') || file.name.includes('DispAcm')) {
                    const dispJson = this._parseDispCSV(file.csvText);
                    if (file.name.includes('DispD1'))  networkState.dispD1Data  = dispJson;
                    if (file.name.includes('DispAcm')) networkState.dispAcmData = dispJson;
                    if (dispJson.length > 0) successCount++;
                } else {
                    const result = await this.processor.processCSV(file.csvText, file.name);
                    if (result && Array.isArray(result.data) && result.data.length > 0) {
                        if (result.type === 'POTENTIAL') networkState.potentialData = result.data;
                        else if (result.type === 'META') networkState.metaData      = result.data;
                        successCount++;
                    } else {
                        missingFiles.push(file.name + ' (Vazio/Inválido)');
                    }
                }
            } catch (parseError) {
                console.error(`Erro ao processar ${file.name}:`, parseError);
                missingFiles.push(file.name + ' (Erro Parse)');
            }
        }

        await this.updateFleetStatus();
        return { successCount, results: [], missingFiles, networkState };
    }

    _fetchGASViaJSONP(action, extraParams = {}, timeout = 60000) {
        return new Promise((resolve, reject) => {
            const cbName = '_gasCallback_' + action.replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now();
            const params = new URLSearchParams({
                action,
                callback: cbName,
                t: Date.now(),
                ...extraParams
            });
            const url = `${this.GAS_API_URL}?${params}`;
            const script = document.createElement('script');
            let done = false;

            const cleanup = () => {
                done = true;
                delete window[cbName];
                if (script.parentNode) script.parentNode.removeChild(script);
            };

            window[cbName] = (data) => {
                if (done) return;
                cleanup();
                resolve(data);
            };

            const timer = setTimeout(() => {
                if (done) return;
                cleanup();
                reject(new Error(`JSONP timeout (${timeout}ms) para action=${action}`));
            }, timeout);

            script.onerror = () => {
                clearTimeout(timer);
                cleanup();
                reject(new Error(`JSONP script error para action=${action}`));
            };

            script.src = url;
            document.head.appendChild(script);
        });
    }

    async _fetchGAS(action, extraParams = {}) {
        if (!this.GAS_API_URL || !this.GAS_API_URL.trim()) return null;

        const params = new URLSearchParams({ action, t: Date.now(), ...extraParams });
        const url = `${this.GAS_API_URL}?${params}`;

        this._setLoadingMsg(
            action === 'get_producao' ? 'Buscando dados de produção…' : 'Buscando dados TPL…',
            action === 'get_producao' ? 25 : 45
        );
        try {
            const ctrl = new AbortController();
            const tid  = setTimeout(() => ctrl.abort(), 120000);
            const resp = await fetch(url, { signal: ctrl.signal });
            clearTimeout(tid);
            if (resp.ok) {
                const json = await resp.json();
                if (json && json.success !== false) {
                    const src = json.from_cache ? '(cache)' : '(planilhas)';
                    console.log(`[GAS] ${action} ✅ ${src} — ${json.total || '?'} linhas em ${json.elapsed_ms || '?'}ms`);
                    return json;
                }
                console.warn(`[GAS] ${action}: resposta sem sucesso`, json?.erro || json);
            } else {
                console.warn(`[GAS] ${action}: HTTP ${resp.status}`);
            }
        } catch (e) {
            if (e.name === 'AbortError') {
                console.warn(`[GAS] ${action}: timeout 25s — verifique se o GAS v6.4 está implantado (com CacheService).`);
            } else {
                console.warn(`[GAS] ${action}: ${e.message}`);
            }
        }

        return null;
    }

    async _fetchFirestoreRecente() {
        try {
            const db = firebase.firestore();
            const [producaoDoc, acmSafraDoc, potencialDoc, colConAcmDoc, colConD1Doc, metasDoc, tplDoc,
                   colCamAcmDoc, colCamD1Doc] =
                await Promise.all([
                    db.collection('snapshots').doc('producao').get(),
                    db.collection('snapshots').doc('acmSafra').get(),
                    db.collection('snapshots').doc('potencial').get(),
                    db.collection('snapshots').doc('colConAcm').get(),
                    db.collection('snapshots').doc('colConD1').get(),
                    db.collection('snapshots').doc('metas').get(),
                    db.collection('snapshots').doc('tpl').get(),
                    db.collection('snapshots').doc('colCamAcm').get(),
                    db.collection('snapshots').doc('colCamD1').get(),
                ]);

            const parseSnapshot = (doc) => {
                if (!doc.exists) return [];
                try {
                    const data = JSON.parse(doc.data().payload || '{}');
                    if (!data.cab || !data.rows) return [];
                    return data.rows.map(row =>
                        Object.fromEntries(data.cab.map((col, i) => [col, row[i] ?? '']))
                    );
                } catch(e) { return []; }
            };

            const producaoRaw = parseSnapshot(producaoDoc);
            let producaoProcessada = [];
            if (producaoRaw.length > 0) {
                try {
                    const producaoData = JSON.parse(producaoDoc.data().payload || '{}');
                    const csvLines = [producaoData.cab.join(',')].concat(
                        producaoData.rows.map(row =>
                            producaoData.cab.map((_, i) => {
                                const v = String(row[i] ?? '').replace(/"/g, '""');
                                return v.includes(',') ? '"'+v+'"' : v;
                            }).join(',')
                        )
                    );
                    const result = await this.processor.processCSV(csvLines.join('\n'), 'PRODUCAO_FS.csv');
                    producaoProcessada = (result && result.data && result.data.length > 0)
                        ? result.data : producaoRaw;
                } catch(e) { producaoProcessada = producaoRaw; }
            }

            if (producaoProcessada.length === 0) {
                if (producaoRaw && producaoRaw.length > 0) {
                    producaoProcessada = producaoRaw;
                    console.warn('[Firestore] Usando dados brutos (processCSV falhou).');
                } else {
                    console.info('[Firestore] Snapshot vazio — execute inicializarFirestore() no GAS.');
                    return null;
                }
            }

            const age = producaoDoc.exists ? producaoDoc.data().updatedAt : '?';
            console.log(`[Firestore] ✅ ${producaoProcessada.length} registros de produção (atualizado: ${age})`);

            let tplRows = [];
            if (tplDoc.exists) {
                try {
                    const tplData = JSON.parse(tplDoc.data().payload || '{}');
                    if (tplData.cab && tplData.rows) {
                        tplRows = tplData.rows.map(row => {
                            const obj = {};
                            tplData.cab.forEach((col, i) => { obj[col] = row[i] ?? ''; });
                            return this._normalizeTplRow ? this._normalizeTplRow(obj) : obj;
                        });
                        console.log(`[Firestore] ✅ TPL: ${tplRows.length} registros (OEE pronto)`);
                    }
                } catch(e) { console.warn('[Firestore] TPL parse falhou:', e.message); }
            } else {
                console.info('[Firestore] TPL não populado — execute migrarTPL() no GAS.');
            }

            const colCamD1Raw = parseSnapshot(colCamD1Doc);
            const colCamAcmRaw = parseSnapshot(colCamAcmDoc);
            
            console.log(`[Firestore] 🔍 CAM D1: existe=${colCamD1Doc.exists} | registros=${colCamD1Raw.length}`);
            console.log(`[Firestore] 🔍 CAM ACM: existe=${colCamAcmDoc.exists} | registros=${colCamAcmRaw.length}`);
            
            if (colCamD1Raw.length > 0) {
                console.log('[Firestore] 🔍 CAM D1 - amostra de colunas:', Object.keys(colCamD1Raw[0]).slice(0, 8));
                console.log('[Firestore] 🔍 CAM D1 - primeira linha:', JSON.stringify(colCamD1Raw[0]).slice(0, 300));
            }
            if (colCamAcmRaw.length > 0) {
                console.log('[Firestore] 🔍 CAM ACM - amostra de colunas:', Object.keys(colCamAcmRaw[0]).slice(0, 8));
                console.log('[Firestore] 🔍 CAM ACM - primeira linha:', JSON.stringify(colCamAcmRaw[0]).slice(0, 300));
            }

            return {
                producao:   producaoProcessada,
                acmSafra:   parseSnapshot(acmSafraDoc),
                potencial:  parseSnapshot(potencialDoc),
                colConAcm:  parseSnapshot(colConAcmDoc),
                colConD1:   parseSnapshot(colConD1Doc),
                metas:      parseSnapshot(metasDoc),
                tpl:        tplRows,
                colCamAcm:  colCamAcmRaw,
                colCamD1:   colCamD1Raw,
            };
        } catch(e) {
            console.warn('[Firestore] Leitura falhou:', e.message);
            return null;
        }
    }

    async _fetchGASRecente() {
        if (this.GAS_API_URL && this.GAS_API_URL.trim()) {
            try {
                console.log('[GAS] Fase 1 — buscando dados recentes (48h)...');
                const params = new URLSearchParams({ action: 'get_recente', horas: 48, t: Date.now() });
                const url = `${this.GAS_API_URL}?${params}`;
                const ctrl = new AbortController();
                const tid  = setTimeout(() => ctrl.abort(), 8000);
                const resp = await fetch(url, { signal: ctrl.signal });
                clearTimeout(tid);
                if (resp.ok) {
                    const json = await resp.json();
                    if (json && json.success && Array.isArray(json.data) && json.data.length > 1) {
                        console.log(`[GAS] Recente ✅ — ${json.total} linhas (${json.from_cache ? 'cache' : 'planilha'}) em ${json.elapsed_ms}ms`);
                        const gasObjects = this._convertGASArrayToObjects(json.data);
                        if (gasObjects.length > 0) {
                            const csvTemp = this._gasObjectsToCSV(gasObjects);
                            const result  = await this.processor.processCSV(csvTemp, 'PRODUCAO_RECENTE.csv');
                            if (result && Array.isArray(result.data) && result.data.length > 0) return result.data;
                            return gasObjects;
                        }
                    }
                }
            } catch(e) {
                console.info(`[GAS] Recente: ${e.name === 'AbortError' ? 'timeout 8s (cache frio — tentando gviz)' : e.message}`);
            }
        }

        const partitions = (this.PRODUCAO_PARTITIONS || [])
            .filter(p => p && p.id && !p.id.includes('COLE_'));
        if (partitions.length > 0) {
            console.log('[PRODUCAO] Fallback gviz — lendo planilha mais recente...');
            const last = partitions[partitions.length - 1];
            try {
                const url = this._gvizUrl(last.id);
                const r   = await fetch(url, { signal: AbortSignal.timeout(15000) });
                if (r.ok) {
                    const csvText = await r.text();
                    const result  = await this.processor.processCSV(csvText, last.key + '.csv');
                    if (result && Array.isArray(result.data) && result.data.length > 0) {
                        console.log(`[PRODUCAO] gviz ✅ — ${result.data.length} registros de ${last.key}`);
                        return result.data;
                    }
                }
            } catch(e2) {
                console.warn('[PRODUCAO] gviz falhou:', e2.message);
            }
        } else {
            console.warn('[GAS] Fase 1 falhou e PRODUCAO_PARTITIONS está vazio. Configure os IDs em app.js para fallback.');
        }
        return null;
    }

    async _fetchGASProducao() {
        if (!this.GAS_API_URL || !this.GAS_API_URL.trim()) {
            console.warn('[GAS] GAS_API_URL não configurado — Produção não carregada.');
            return [];
        }
        const p = this.GAS_PARAMS?.producao || {};
        const extraParams = {};
        if (p.meses) extraParams.meses = p.meses;
        if (p.safra) extraParams.safra = p.safra;

        console.log(`[GAS] Buscando Produção (${Object.entries(extraParams).map(([k,v]) => k+'='+v).join(', ')||'padrão'})...`);
        const json = await this._fetchGAS('get_producao', extraParams);

        if (!json || !json.success) {
            console.warn('[GAS] Produção: resposta inválida ou falha.', json?.erro || '');
            return [];
        }
        if (!Array.isArray(json.data) || json.data.length < 2) {
            console.warn('[GAS] Produção: nenhum dado retornado.');
            return [];
        }

        console.log(`[GAS] Produção: ${json.total} linhas de ${json.arquivos} planilha(s) em ${json.elapsed_ms}ms`);

        const gasObjects = this._convertGASArrayToObjects(json.data);
        if (!gasObjects.length) return [];

        const csvTemp = this._gasObjectsToCSV(gasObjects);
        const result  = await this.processor.processCSV(csvTemp, 'PRODUCAO_GAS.csv');
        if (result && Array.isArray(result.data) && result.data.length > 0) {
            console.log(`[GAS] Produção normalizada: ${result.data.length} registros ✅`);
            return result.data;
        }
        return gasObjects;
    }

    async _fetchGASTPL() {
        if (!this.GAS_API_URL || !this.GAS_API_URL.trim()) {
            console.warn('[GAS] GAS_API_URL não configurado — TPL não carregado.');
            return [];
        }
        const p = this.GAS_PARAMS?.tpl || {};
        const extraParams = {};
        if (p.meses) extraParams.meses = p.meses;
        if (p.safra) extraParams.safra = p.safra;

        console.log(`[GAS] Buscando TPL (${Object.entries(extraParams).map(([k,v]) => k+'='+v).join(', ')||'padrão'})...`);
        const json = await this._fetchGAS('get_tpl', extraParams);

        if (!json || !json.success) {
            console.warn('[GAS] TPL: resposta inválida ou falha.', json?.erro || '');
            return [];
        }
        if (!Array.isArray(json.data) || json.data.length < 2) {
            console.warn('[GAS] TPL: nenhum dado retornado.');
            return [];
        }

        console.log(`[GAS] TPL: ${json.total} linhas de ${json.arquivos} planilha(s) em ${json.elapsed_ms}ms`);

        const tplRows = this._convertGASArrayToObjects(json.data).map(row =>
            this._normalizeTplRow(row)
        ).filter(row =>
            row['COD. EQUIPAMENTO'] || row['COD.EQUIPAMENTO'] ||
            row['COD EQUIPAMENTO']  || row['EQUIPAMENTO']
        );

        console.log(`[GAS] TPL normalizado: ${tplRows.length} registros ✅`);
        return tplRows;
    }

    _gasObjectsToCSV(objects) {
        if (!objects || objects.length === 0) return '';
        const headers = Object.keys(objects[0]);
        const escape  = (v) => {
            const s = String(v ?? '').replace(/"/g, '""');
            return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
        };
        const lines = [headers.map(escape).join(',')];
        objects.forEach(obj => {
            lines.push(headers.map(h => escape(obj[h] ?? '')).join(','));
        });
        return lines.join('\n');
    }

    _validateCachedData(state) {
        if (!state) return false;
        if (!state.data || state.data.length === 0) return true;

        const _toNum = (v) => {
            if (typeof v === 'number') return isNaN(v) ? 0 : v;
            if (!v) return 0;
            let s = String(v).trim().replace(/[^\d,.-]/g, '');
            if ((s.match(/\./g)||[]).length > 1) s = s.replace(/\./g, '');
            s = s.replace(',', '.');
            const n = parseFloat(s);
            return isNaN(n) ? 0 : n;
        };

        let totalPeso = 0;
        const sample = state.data.slice(0, Math.min(state.data.length, 200));
        for (const row of sample) {
            const v = row.peso || row.pesoLiquido || row['Peso Líquido'] || 0;
            totalPeso += _toNum(v);
        }

        if (totalPeso > 100000) {
            console.warn('[IDB] Peso acumulado na amostra:', totalPeso, '— cache com dados suspeitos, descartando.');
            return false;
        }
        return true;
    }

    _applyState(state) {
        this.data           = state.data           || [];
        this.potentialData  = state.potentialData  || [];
        this.metaData       = state.metaData       || [];
        this.acmSafraData   = state.acmSafraData   || [];
        this.consumoD1Data  = state.consumoD1Data  || [];
        this.consumoAcmData = state.consumoAcmData || [];
        this.dispD1Data     = state.dispD1Data     || [];
        this.dispAcmData    = state.dispAcmData    || [];
        this.tplData        = state.tplData        || [];
        this.camD1Data      = state.camD1Data      || [];
        this.camAcmData     = state.camAcmData     || [];
    }

    _resetState() {
        this.data = []; this.potentialData = []; this.metaData = [];
        this.acmSafraData = []; this.consumoD1Data = []; this.consumoAcmData = [];
        this.dispD1Data = []; this.dispAcmData = []; this.tplData = [];
        this.camD1Data = []; this.camAcmData = [];
    }

    _calcNextRefreshTarget() {
        const now = new Date();
        const t   = new Date(now);
        if (now.getMinutes() < 30) { t.setMinutes(30); }
        else { t.setHours(now.getHours() + 1); t.setMinutes(0); }
        t.setSeconds(0); t.setMilliseconds(0);
        return t;
    }

    _updateFileInfoBadge(justUpdated) {
        const el = document.getElementById('fileInfo');
        if (!el) return;
        const parts = [];
        if (this.data.length)           parts.push('Produção');
        if (this.potentialData.length)  parts.push('Potencial');
        if (this.metaData.length)       parts.push('Metas');
        if (this.acmSafraData.length)   parts.push('AcmSafra');
        if (this.consumoAcmData.length) parts.push('Consumo');
        if (this.dispD1Data.length)     parts.push('DispD1');
        if (this.dispAcmData.length)    parts.push('DispAcm');
        if (this.tplData.length)        parts.push('TPL (OEE)');
        if (this.camD1Data.length)      parts.push('Cam D1');
        if (this.camAcmData.length)     parts.push('Cam ACM');
        el.textContent = 'Arquivos carregados: ' + parts.join(' + ') + '.' + (justUpdated ? ' ✅ Atualizado' : ' (Via Google Sheets)');
        el.style.color = 'var(--success)';
    }

    _showSyncBanner(msg) {
        if (!msg) msg = 'Sincronizando…';
        let b = document.getElementById('_agro-sync-banner');
        if (!b) {
            if (!document.getElementById('_agro-spin-kf')) {
                var st = document.createElement('style');
                st.id = '_agro-spin-kf';
                st.textContent = [
                    '@keyframes _agro-spin{to{transform:rotate(360deg)}}',
                    '#_agro-sync-banner{position:fixed;bottom:18px;right:18px;z-index:9999;',
                    'width:32px;height:32px;border-radius:50%;cursor:default;',
                    'background:rgba(0,212,255,0.12);border:1.5px solid rgba(0,212,255,0.35);',
                    'display:flex;align-items:center;justify-content:center;',
                    'transition:opacity .4s;opacity:0;}',
                    '#_agro-sync-banner .dot{width:14px;height:14px;',
                    'border:2px solid rgba(0,212,255,0.2);border-top-color:#00D4FF;',
                    'border-radius:50%;animation:_agro-spin .8s linear infinite;}',
                    '#_agro-sync-banner .tip{position:absolute;bottom:38px;right:0;',
                    'background:rgba(10,14,23,0.96);border:1px solid rgba(0,212,255,0.25);',
                    'border-radius:8px;padding:8px 12px;font-size:0.75rem;color:#E0E0E0;',
                    'white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .2s;',
                    'box-shadow:0 4px 16px rgba(0,0,0,0.5);}',
                    '#_agro-sync-banner:hover .tip{opacity:1;}'
                ].join('');
                document.head.appendChild(st);
            }
            b = document.createElement('div');
            b.id = '_agro-sync-banner';
            var dot = document.createElement('div'); dot.className = 'dot';
            var tip = document.createElement('div'); tip.className = 'tip';
            tip.id = '_agro-sync-label';
            b.appendChild(dot); b.appendChild(tip);
            document.body.appendChild(b);
        }
        var label = document.getElementById('_agro-sync-label');
        if (label) label.textContent = msg;
        requestAnimationFrame(function() { b.style.opacity = '1'; });
    }

    _hideSyncBanner() {
        var b = document.getElementById('_agro-sync-banner');
        if (!b) return;
        b.style.opacity = '0';
        setTimeout(function() { b.style.display = 'none'; }, 500);
        setTimeout(function() { b.style.display = ''; }, 600);
    }

    async handleFileUpload(event) {
        this.showLoadingAnimation(); 
        const files = Array.from(event.target.files);
        if (files.length === 0) return;
        this._resetState();
        this.clearResults(); 
        this.stopCarousel();
        this.localDB.saveAllTables({
            data:[], potentialData:[], metaData:[], acmSafraData:[],
            consumoD1Data:[], consumoAcmData:[], dispD1Data:[], dispAcmData:[], tplData:[], camD1Data:[], camAcmData:[]
        }).catch(function() {});
        this.startLoadingProcess(); 
    }
    
    async startLoadingProcess() {
        if (this._syncing) return;
        this._syncing = true;

        const cachedVersion = await this.localDB.getMeta('appVersion').catch(() => null);
        if (cachedVersion && cachedVersion !== this._APP_VERSION) {
            console.warn('[IDB] Versão do app mudou (' + cachedVersion + ' → ' + this._APP_VERSION + ') — limpando cache.');
            await this.localDB.saveAllTables({
                data:[], potentialData:[], metaData:[], acmSafraData:[],
                consumoD1Data:[], consumoAcmData:[], dispD1Data:[], dispAcmData:[], tplData:[], camD1Data:[], camAcmData:[]
            }).catch(() => {});
        }
        await this.localDB.setMeta('appVersion', this._APP_VERSION).catch(() => {});

        const hasCached = await this.localDB.hasData();

        if (hasCached) {
            this.showLoadingAnimation('Carregando cache local…');
            this._setLoadingMsg('Carregando cache local…', 10);
            try {
                const cachedState = await this.localDB.loadAllTables();

                const cacheOk = this._validateCachedData(cachedState);
                if (!cacheOk) {
                    console.warn('[IDB] Cache com dados inválidos detectado — descartando e recarregando da fonte.');
                    await this.localDB.saveAllTables({
                        data:[], potentialData:[], metaData:[], acmSafraData:[],
                        consumoD1Data:[], consumoAcmData:[], dispD1Data:[], dispAcmData:[], tplData:[], camD1Data:[], camAcmData:[]
                    });
                    this._syncing = false;
                    await this._fullLoadAndRender();
                    return;
                }

                this._applyState(cachedState);

                if ((!this.tplData || this.tplData.length === 0) &&
                    this.TPL_PARTITIONS && this.TPL_PARTITIONS.some(p => p.id && !p.id.includes('COLE_AQUI'))) {
                    console.log('[TPL] Cache sem TPL — buscando partições configuradas...');
                    this._fetchAllTplPartitions()
                        .then(rows => {
                            if (rows && rows.length > 0) {
                                this.tplData = rows;
                                console.log('[TPL] ' + rows.length + ' registros carregados em segundo plano ✅');
                                if (this.analysisResult) this._runOEEAnalysis();
                            }
                        })
                        .catch(e => console.warn('[TPL] Falha no carregamento em segundo plano:', e.message));
                }
            } catch(e) {
                console.error('[IDB] Erro ao ler cache:', e);
                this._syncing = false;
                await this._fullLoadAndRender();
                return;
            }
            this.clearResults();
            this.stopCarousel();
            const targetTime = this._calcNextRefreshTarget();
            await this.processDataAsync(this.data, this.potentialData, this.metaData, targetTime);
            this.hideLoadingAnimation();
            this.updateDashboardWithCorrectedValues();
            this._updateFileInfoBadge(false);

            const ageMs  = await this.localDB.getLastSyncAge();
            const ageMin = ageMs ? Math.round(ageMs / 60000) : null;
            this._showSyncBanner(ageMin !== null
                ? 'Sincronizando dados (última atualização: ' + ageMin + ' min atrás)…'
                : 'Sincronizando dados mais recentes em segundo plano…');

            this._backgroundSync().finally(() => {
                this._syncing = false;
                this._hideSyncBanner();
            });
        } else {
            await this._fullLoadAndRender();
            this._syncing = false;
        }
    }

    async _fullLoadAndRender() {
        this.showLoadingAnimation('Conectando ao servidor de dados…');
        this._setLoadingMsg('Primeiro acesso — configurando tudo para você. Aguarde...', 10);
        this._mostrarBannerPrimeiroAcesso(true);
        this._resetState();
        this.clearResults();
        this.stopCarousel();
        const cloudResult = await this.fetchFilesFromCloud();
        const ns = cloudResult.networkState;
        this._mostrarBannerPrimeiroAcesso(false);
        if (!ns.data.length && !ns.potentialData.length && !ns.metaData.length && !ns.acmSafraData.length) {
            this.hideLoadingAnimation();
            this.showAnalyticsSection(false);
            this._mostrarTelaErroConexao();
            return;
        }
        this._applyState(ns);
        this._updateFileInfoBadge(false);
        this.localDB.saveAllTables(ns)
            .then(() => console.log('[IDB] Fase 1 persistida.'))
            .catch(e => console.warn('[IDB] Erro ao persistir:', e));
        const targetTime = this._calcNextRefreshTarget();
        await this.processDataAsync(this.data, this.potentialData, this.metaData, targetTime);
        this.hideLoadingAnimation();
        this.updateDashboardWithCorrectedValues();
        document.dispatchEvent(new CustomEvent('agroanalytics:dataUpdated'));

        this._carregarHistoricoBackground();
        if (!this._gasAquecido) {
            this._gasAquecido = true;
            this._aquecerGASBackground();
        }
    }

    _mostrarBannerPrimeiroAcesso(show) {
        let el = document.getElementById('_banner-primeiro-acesso');
        if (show) {
            if (!el) {
                el = document.createElement('div');
                el.id = '_banner-primeiro-acesso';
                el.style.cssText = `
                    position:fixed;bottom:0;left:0;right:0;z-index:9999;
                    background:linear-gradient(135deg,#1a472a,#2d7d32);
                    color:#fff;padding:16px 24px;font-size:14px;
                    display:flex;align-items:center;justify-content:space-between;
                    box-shadow:0 -4px 20px rgba(0,0,0,0.3);
                `;
                el.innerHTML = `
                    <div style="display:flex;align-items:center;gap:12px">
                        <div style="font-size:24px;animation:spin 2s linear infinite">⚙️</div>
                        <div>
                            <div style="font-weight:700;font-size:15px">🌾 Configurando o AgroAnalytics para você</div>
                            <div style="opacity:0.85;font-size:13px;margin-top:2px">
                                Isso só acontece no <b>primeiro acesso</b>. 
                                Próximas entradas serão instantâneas com os dados já salvos no dispositivo.
                            </div>
                        </div>
                    </div>
                    <div style="text-align:right;font-size:12px;opacity:0.8;min-width:120px">
                        <div>Aguarde...</div>
                        <div id="_banner-pct">0%</div>
                    </div>
                `;
                document.body.appendChild(el);
            }
            el.style.display = 'flex';
        } else {
            if (el) el.style.display = 'none';
        }
    }

    _mostrarTelaErroConexao() {
        const mainDash = document.getElementById('main-dashboard');
        const loginScreen = document.getElementById('login-screen');
        if (loginScreen) loginScreen.classList.add('hidden');
        if (mainDash) mainDash.classList.remove('hidden');

        const existing = document.getElementById('_erro-conexao-banner');
        if (existing) existing.remove();

        const banner = document.createElement('div');
        banner.id = '_erro-conexao-banner';
        banner.style.cssText = `
            position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
            background:var(--bg-card,#fff);border-radius:16px;
            box-shadow:0 8px 40px rgba(0,0,0,0.25);padding:32px 40px;
            text-align:center;z-index:9999;max-width:420px;width:90%;
        `;
        banner.innerHTML = `
            <div style="font-size:48px;margin-bottom:12px">🌾</div>
            <h2 style="margin:0 0 8px;color:var(--text-primary,#1a1a1a)">Primeiro acesso</h2>
            <p style="color:var(--text-secondary,#666);margin:0 0 20px;font-size:14px;line-height:1.6">
                Não foi possível carregar os dados agora. 
                Pode ser o <strong>primeiro acesso</strong> ou a conexão está lenta.
            </p>
            <div style="display:flex;gap:10px;flex-direction:column">
                <button onclick="window.location.reload()" 
                    style="background:#2d7d32;color:#fff;border:none;border-radius:8px;
                           padding:12px 20px;font-size:14px;cursor:pointer;font-weight:600">
                    🔄 Tentar novamente
                </button>
                <button onclick="document.getElementById('_erro-conexao-banner').remove();
                                  document.getElementById('tab-gerenciar')?.click();"
                    style="background:transparent;color:var(--text-secondary,#666);border:1px solid #ccc;
                           border-radius:8px;padding:10px 20px;font-size:13px;cursor:pointer">
                    📁 Fazer upload manual de arquivos
                </button>
            </div>
        `;
        document.body.appendChild(banner);
    }

    exportarSnapshotJSON() {
        try {
            const snapshot = {
                _v: this._APP_VERSION,
                _ts: new Date().toISOString(),
                _desc: 'AgroAnalytics snapshot offline — carregado automaticamente sem internet',
                data:          this.data          || [],
                potentialData: this.potentialData || [],
                metaData:      this.metaData      || [],
                acmSafraData:  this.acmSafraData  || [],
                consumoD1Data: this.consumoD1Data || [],
                consumoAcmData:this.consumoAcmData|| [],
                dispD1Data:    this.dispD1Data    || [],
                dispAcmData:   this.dispAcmData   || [],
                tplData:       this.tplData       || [],
                camD1Data:     this.camD1Data     || [],
                camAcmData:    this.camAcmData    || [],
            };
            const json = JSON.stringify(snapshot);
            const blob = new Blob([json], { type: 'application/json' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href = url;
            const now = new Date();
            const ds = `${String(now.getDate()).padStart(2,'0')}${String(now.getMonth()+1).padStart(2,'0')}${now.getFullYear()}`;
            a.download = `agro_snapshot_${ds}.json`;
            a.click();
            URL.revokeObjectURL(url);
            const rows = (this.data || []).length;
            console.log(`[Snapshot] Exportado: ${rows} registros (${Math.round(json.length/1024)} KB)`);
            return true;
        } catch(e) {
            console.error('[Snapshot] Falha ao exportar:', e);
            return false;
        }
    }

    async importarSnapshotJSON(file) {
        try {
            const text = await file.text();
            const snap = JSON.parse(text);
            if (!snap._v || !snap.data) throw new Error('JSON inválido — não é um snapshot AgroAnalytics');
            const state = {
                data:          snap.data          || [],
                potentialData: snap.potentialData || [],
                metaData:      snap.metaData      || [],
                acmSafraData:  snap.acmSafraData  || [],
                consumoD1Data: snap.consumoD1Data || [],
                consumoAcmData:snap.consumoAcmData|| [],
                dispD1Data:    snap.dispD1Data    || [],
                dispAcmData:   snap.dispAcmData   || [],
                tplData:       snap.tplData       || [],
                camD1Data:     snap.camD1Data     || [],
                camAcmData:    snap.camAcmData    || [],
            };
            this._applyState(state);
            await this.localDB.saveAllTables(state).catch(() => {});
            const targetTime = this._calcNextRefreshTarget();
            await this.processDataAsync(this.data, this.potentialData, this.metaData, targetTime);
            this.hideLoadingAnimation();
            this.updateDashboardWithCorrectedValues();
            console.log(`[Snapshot] Importado: ${state.data.length} registros de ${snap._ts}`);
        } catch(e) {
            alert('Erro ao importar snapshot: ' + e.message);
        }
    }

    async _aquecerGASBackground() {
        if (!this.GAS_API_URL) return;
        try {
            const url = `${this.GAS_API_URL}?action=get_recente&force=true&t=${Date.now()}`;
            const ctrl = new AbortController();
            setTimeout(() => ctrl.abort(), 180000);
            await fetch(url, { signal: ctrl.signal });
            console.log('[GAS] Cache de recentes aquecido ✅');
        } catch(e) { }
    }

    async _carregarHistoricoBackground() {
        try {
            this._showSyncBanner('Carregando histórico completo em background…');
            console.log('[GAS] Fase 2 — buscando histórico completo...');

            const [gasProducaoRows, gasTplRows] = await Promise.all([
                this._fetchGASProducao().catch(e => { console.warn('[GAS] Histórico produção falhou:', e.message); return []; }),
                this._fetchGASTPL().catch(e => { console.warn('[GAS] TPL falhou:', e.message); return []; }),
            ]);

            const temNovosDados = (gasProducaoRows && gasProducaoRows.length > (this.data || []).length);
            const temTPL        = (gasTplRows && gasTplRows.length > 0);

            if (!temNovosDados && !temTPL) {
                console.log('[GAS] Fase 2: sem dados novos além dos recentes.');
                this._hideSyncBanner();
                return;
            }

            if (gasProducaoRows && gasProducaoRows.length > 0) this.data     = gasProducaoRows;
            if (gasTplRows      && gasTplRows.length      > 0) this.tplData  = gasTplRows;

            const nsCompleto = {
                data:          this.data          || [],
                potentialData: this.potentialData || [],
                metaData:      this.metaData      || [],
                acmSafraData:  this.acmSafraData  || [],
                consumoD1Data: this.consumoD1Data || [],
                consumoAcmData:this.consumoAcmData|| [],
                dispD1Data:    this.dispD1Data    || [],
                dispAcmData:   this.dispAcmData   || [],
                tplData:       this.tplData       || [],
                camD1Data:     this.camD1Data     || [],
                camAcmData:    this.camAcmData    || [],
            };
            this.localDB.saveAllTables(nsCompleto)
                .then(() => console.log('[IDB] Histórico completo persistido ✅'))
                .catch(e => console.warn('[IDB] Erro ao persistir histórico:', e));

            console.log('[GAS] Fase 2 ✅ — re-renderizando com histórico completo...');
            const targetTime = this._calcNextRefreshTarget();
            await this.processDataAsync(this.data, this.potentialData, this.metaData, targetTime);
            this.updateDashboardWithCorrectedValues();
            this._updateFileInfoBadge(true);
            this._hideSyncBanner();
        } catch(e) {
            console.warn('[GAS] Fase 2 falhou:', e.message);
            this._hideSyncBanner();
        }
    }

    async _backgroundSync() {
        try {
            console.log('[Sync] Sincronização em segundo plano iniciada…');
            const cloudResult = await this.fetchFilesFromCloud();
            const ns = cloudResult.networkState;
            if (!ns.data.length && !ns.potentialData.length) {
                console.warn('[Sync] Rede sem dados. Mantendo cache.');
                return;
            }
            const cachedLen = await this.localDB.getMeta('producaoLen') || 0;
            const hasChange = ns.data.length !== cachedLen;
            await this.localDB.saveAllTables(ns);
            console.log('[Sync] Cache atualizado: ' + cachedLen + ' → ' + ns.data.length + ' registros.');
            const tplWasEmpty = !this.tplData || this.tplData.length === 0;
            const tplNowLoaded = ns.tplData && ns.tplData.length > 0;

            if (hasChange || (tplWasEmpty && tplNowLoaded)) {
                console.log('[Sync] Novos dados — re-renderizando…');
                if (tplWasEmpty && tplNowLoaded) {
                    console.log('[TPL] TPL carregado em background: ' + ns.tplData.length + ' registros ✅');
                }
                this._applyState(ns);
                const targetTime = this._calcNextRefreshTarget();
                await this.processDataAsync(this.data, this.potentialData, this.metaData, targetTime);
                this.updateDashboardWithCorrectedValues();
                this._updateFileInfoBadge(true);
            } else if (tplNowLoaded && this.analysisResult) {
                this.tplData = ns.tplData;
                this._runOEEAnalysis();
                console.log('[TPL] OEE re-calculado com TPL carregado ✅');
            }
        } catch(e) {
            console.error('[Sync] Erro na sincronização em fundo:', e);
        }
    }

    initializeEventListeners() {
        // ── Auto-fill e auto-login se credenciais salvas ──
        (function autoFillCredentials() {
            try {
                const savedU = localStorage.getItem('ag_saved_user');
                const savedP = localStorage.getItem('ag_saved_pass');
                if (savedU && savedP) {
                    const uEl = document.getElementById('login-user');
                    const pEl = document.getElementById('login-password');
                    const sc  = document.getElementById('save-credentials');
                    if (uEl) uEl.value = savedU;
                    if (pEl) pEl.value = atob(savedP);
                    if (sc)  sc.checked = true;
                    const rm = document.getElementById('remember-me');
                    // Dispara login automático se "manter conectado" estiver marcado
                    if (rm && rm.checked) {
                        setTimeout(() => {
                            const form = document.getElementById('login-form');
                            if (form) form.dispatchEvent(new Event('submit', { bubbles:true, cancelable:true }));
                        }, 600);
                    }
                }
            } catch(e) { /* credenciais corrompidas — ignora */ }
        })();

        const fileInput = document.getElementById('fileInput');
        if (fileInput) fileInput.addEventListener('change', (e) => this.handleFileUpload(e));

        const dropzoneCard = document.getElementById('dropzoneCard'); 
        if (dropzoneCard) {
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                dropzoneCard.addEventListener(eventName, (e) => {
                    e.preventDefault(); e.stopPropagation();
                }, false);
            });
            dropzoneCard.addEventListener('dragenter', () => dropzoneCard.classList.add('hover'));
            dropzoneCard.addEventListener('dragleave', () => dropzoneCard.classList.remove('hover'));
            dropzoneCard.addEventListener('drop', (e) => {
                dropzoneCard.classList.remove('hover');
                if (e.dataTransfer.files.length > 0) {
                    this.handleFileUpload({ target: { files: e.dataTransfer.files } });
                }
            });
        }

        const exportBtn = document.querySelector('.btn-export');
        if (exportBtn) exportBtn.addEventListener('click', () => this.captureScreenshot());
        
        const metaMoagemInput = document.getElementById('metaMoagemInput');
        if (metaMoagemInput) metaMoagemInput.addEventListener('change', (e) => this.saveMeta(e.target.value, 'metaMoagem'));
        
        const metaRotacaoInput = document.getElementById('metaRotacaoInput');
        if (metaRotacaoInput) metaRotacaoInput.addEventListener('change', (e) => this.saveMeta(e.target.value, 'metaRotacao'));
        
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) logoutBtn.addEventListener('click', () => this.handleLogout());
        
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) themeToggle.addEventListener('click', () => this.toggleTheme());

        const menuToggleBtn = document.getElementById('menu-toggle-btn');
        if (menuToggleBtn) menuToggleBtn.addEventListener('click', () => this.toggleMenu());
        
        const menuBackdrop = document.getElementById('menu-backdrop');
        if (menuBackdrop) menuBackdrop.addEventListener('click', () => this.toggleMenu(true));

        const showSignupLink = document.getElementById('show-signup');
        const showLoginLink = document.getElementById('show-login');
        const loginForm = document.getElementById('login-form');
        const signupForm = document.getElementById('signup-form');
        
        if (showSignupLink && loginForm && signupForm) {
            showSignupLink.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('auth-error').classList.add('hidden');
                document.getElementById('auth-success').classList.add('hidden');
                loginForm.classList.add('hidden');
                signupForm.classList.remove('hidden');
            });
            showLoginLink.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('auth-error').classList.add('hidden');
                document.getElementById('auth-success').classList.add('hidden');
                signupForm.classList.add('hidden');
                loginForm.classList.remove('hidden');
            });
        }
        
        if (loginForm) loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        if (signupForm) signupForm.addEventListener('submit', (e) => this.handleSignup(e));
        const adminUserForm = document.getElementById('admin-user-form');
        if (adminUserForm) adminUserForm.addEventListener('submit', (e) => this.saveAdminUser(e));

        // ── Alterar senha (modal de conta) ──
        const updatePassForm = document.getElementById('update-password-form');
        if (updatePassForm) {
            updatePassForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const curPass  = document.getElementById('current-password').value;
                const newPass  = document.getElementById('new-password').value;
                const confPass = document.getElementById('confirm-new-password').value;
                const alertEl  = document.getElementById('modal-alert-message');
                if (newPass !== confPass) { alert('As senhas não coincidem.'); return; }
                if (newPass.length < 6)   { alert('A nova senha deve ter ao menos 6 caracteres.'); return; }
                try {
                    const user = firebase.auth().currentUser;
                    if (!user) { alert('Sessão expirada. Faça login novamente.'); return; }
                    // Re-autentica antes de trocar a senha
                    const cred = firebase.auth.EmailAuthProvider.credential(user.email, curPass);
                    await user.reauthenticateWithCredential(cred);
                    await user.updatePassword(newPass);
                    // Atualiza credenciais salvas se existiam
                    const savedU = localStorage.getItem('ag_saved_user');
                    if (savedU) {
                        localStorage.setItem('ag_saved_pass', btoa(newPass));
                    }
                    if (alertEl) {
                        alertEl.textContent = '✅ Senha alterada com sucesso!';
                        alertEl.classList.remove('hidden');
                        setTimeout(() => alertEl.classList.add('hidden'), 3500);
                    }
                    updatePassForm.reset();
                } catch(err) {
                    let msg = 'Erro ao alterar senha.';
                    if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential')
                        msg = 'Senha atual incorreta.';
                    if (err.code === 'auth/weak-password') msg = 'Senha muito fraca (mín. 6 caracteres).';
                    alert(msg);
                }
            });
        }

        // ── Alterar apelido (modal de conta) ──
        const nickForm = document.getElementById('update-nickname-form');
        if (nickForm) {
            nickForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const nick   = document.getElementById('new-nickname').value.trim();
                const alertEl = document.getElementById('modal-alert-message');
                if (!nick) { alert('Digite um apelido.'); return; }
                try {
                    const uid = this.currentUser && this.currentUser.uid;
                    if (!uid) { alert('Sessão expirada.'); return; }
                    await firebase.firestore().collection('users').doc(uid).update({
                        nickname: nick,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    if (this.currentUser) this.currentUser.nickname = nick;
                    // Atualiza exibição no header
                    const emailEl = document.getElementById('current-user-email');
                    if (emailEl) emailEl.textContent = nick;
                    const gcBadge = document.getElementById('gc-user-badge');
                    if (gcBadge) gcBadge.textContent = nick;
                    if (alertEl) {
                        alertEl.textContent = '✅ Apelido atualizado!';
                        alertEl.classList.remove('hidden');
                        setTimeout(() => alertEl.classList.add('hidden'), 3000);
                    }
                    nickForm.reset();
                } catch(err) { alert('Erro: ' + err.message); }
            });
        }
        
        document.querySelectorAll('#tab-usuarios .sub-tabs-nav button').forEach(button => {
             const onclickAttr = button.getAttribute('onclick');
             if (onclickAttr && onclickAttr.includes('showSubTab')) {
                 button.addEventListener('click', (e) => {
                     e.preventDefault();
                     const subTabId = onclickAttr.match(/showSubTab\('([^']+)'/)[1];
                     this.showSubTab(subTabId, button);
                 });
             }
         });
         
        window.addEventListener('resize', () => { if (window.innerWidth > 768) this.toggleMenu(true); });

        (function setupSidebarHoverPush() {
            const nav  = document.getElementById('tabs-nav-container');
            const body = document.body;
            if (!nav) return;
            let hoverTimer = null;
            nav.addEventListener('mouseenter', () => {
                if (window.innerWidth <= 768) return;
                clearTimeout(hoverTimer);
                body.classList.add('nav-expanded');
            });
            nav.addEventListener('mouseleave', () => {
                if (window.innerWidth <= 768) return;
                hoverTimer = setTimeout(() => body.classList.remove('nav-expanded'), 50);
            });
        })();

        setInterval(() => {
            const bd = document.getElementById('menu-backdrop');
            const mn = document.getElementById('tabs-nav-container');
            if (bd && mn && !mn.classList.contains('open') && bd.classList.contains('active')) {
                bd.classList.remove('active');
                bd.style.cssText = 'display:none !important; pointer-events:none !important;';
            }
        }, 500);
        
        const carouselNavBtns = document.querySelectorAll('.carousel-nav');
        if (carouselNavBtns) {
             carouselNavBtns.forEach(btn => {
                 btn.removeAttribute('onclick');
                 btn.addEventListener('click', (e) => {
                     e.preventDefault(); e.stopPropagation();
                     const direction = btn.classList.contains('prev-btn') ? -1 : 1;
                     this.navigateCarousel(direction);
                 });
             });
        }
    }
    
    loadTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        const icon = document.getElementById('theme-icon');
        if (icon) icon.className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);

        const icon = document.getElementById('theme-icon');
        if (icon) icon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';

        // Re-injeta CSS do ConsumoCaminhoes no <head> para garantir troca de tema imediata
        if (this.consumoCamRenderer && typeof this.consumoCamRenderer._cssText === 'function') {
            const old = document.getElementById('vcc4-styles');
            if (old) old.remove();
            const s = document.createElement('style');
            s.id = 'vcc4-styles';
            s.textContent = this.consumoCamRenderer._cssText();
            document.head.appendChild(s);
        }

        this._updateChartsTheme(newTheme);

        if (this.analysisResult) {
            setTimeout(() => {
                try {
                    const acumuladoReal = this.calculateRealAccumulated();
                    this.analysisResult.acumuladoDia    = acumuladoReal;
                    this.analysisResult.acumuladoRealDia = acumuladoReal;

                    if (this.visualizer && typeof this.visualizer.updateTheme === 'function') {
                        this.visualizer.updateTheme();
                    }
                    if (this.visualizer && this.visualizer.kpisRenderer) {
                        this.visualizer.kpisRenderer.updateHeaderStats(this.analysisResult);
                        this.visualizer.kpisRenderer.updateTopLists(this.analysisResult);
                    }
                    if (window.AcumuladoEProgresso) window.AcumuladoEProgresso.update(this.analysisResult);
                    if (window.ProjecaoDeMoagem)    window.ProjecaoDeMoagem.update(this.analysisResult);
                    this.updateDashboardWithCorrectedValues();
                } catch(e) { }
            }, 50);
        }
    }

    _updateChartsTheme(theme) {
        try {
            if (!this.visualizer || !this.visualizer.charts) return;
            Object.values(this.visualizer.charts).forEach(chart => {
                if (chart && typeof chart.update === 'function') {
                    chart.update('none');
                }
            });
        } catch (e) { }
    }

    initializeParticles() {
        let canvas = document.getElementById('particles-js');
        if (!canvas) return;

        if (canvas.tagName !== 'CANVAS') {
            let innerCanvas = canvas.querySelector('canvas');
            if (!innerCanvas) {
                innerCanvas = document.createElement('canvas');
                innerCanvas.style.width = '100%';
                innerCanvas.style.height = '100%';
                innerCanvas.style.position = 'absolute';
                innerCanvas.style.top = '0';
                innerCanvas.style.left = '0';
                canvas.appendChild(innerCanvas);
            }
            canvas = innerCanvas;
        }

        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
        
        const ctx = canvas.getContext('2d');
        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(resizeCanvas, 100);
        });
        resizeCanvas();

        const particles = [];
        const particleCount = 40;

        for (let i = 0; i < particleCount; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 2 + 1,
                speedX: Math.random() * 0.5 - 0.25,
                speedY: Math.random() * 0.5 - 0.25,
                color: `rgba(0, 212, 255, ${Math.random() * 0.3})`
            });
        }

        const animate = () => {
            if (!this.isAnimatingParticles) { 
                this.animationFrameId = null; 
                return; 
            }
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => {
                p.x += p.speedX;
                p.y += p.speedY;
                if (p.x < 0 || p.x > canvas.width) p.speedX *= -1;
                if (p.y < 0 || p.y > canvas.height) p.speedY *= -1;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            });
            this.animationFrameId = requestAnimationFrame(animate); 
        };
        this.animationFrameId = requestAnimationFrame(animate); 
    }
    
    async clearCache() {
        if (!confirm('Isso vai apagar o cache local e recarregar todos os dados da fonte. Continuar?')) return;
        try {
            await this.localDB.saveAllTables({
                data:[], potentialData:[], metaData:[], acmSafraData:[],
                consumoD1Data:[], consumoAcmData:[], dispD1Data:[], dispAcmData:[], tplData:[], camD1Data:[], camAcmData:[]
            });
            this._resetState();
            this._syncing = false;
            console.log('[IDB] Cache limpo pelo usuário.');
            await this._fullLoadAndRender();
        } catch(e) {
            console.error('[IDB] Erro ao limpar cache:', e);
            alert('Erro ao limpar cache: ' + e.message);
        }
    }

    clearResults() {
        this.currentSlideIndex = 0;
        this.stopCarousel(); 
        
        const lastWeighingText = document.getElementById('lastWeighingText');
        if (lastWeighingText) lastWeighingText.textContent = 'Aguardando atualização... 🔄️';
        
        if (this.visualizer && this.visualizer.kpisRenderer && this.visualizer.kpisRenderer.updateHeaderStats) {
            this.visualizer.kpisRenderer.updateHeaderStats({
                totalViagens: 0, viagensProprias: 0, viagensTerceiros: 0, totalPesoLiquido: 0, taxaAnalise: 0,
                distribuicaoFrota: { propria: 0, terceiros: 0 }, acumuladoSafra: 0
            });
        }
        
        const moagemAcumulado = document.getElementById('moagemAcumulado');
        if(moagemAcumulado) moagemAcumulado.textContent = '0 t';
        const moagemProgressBar = document.getElementById('moagemProgressBar');
        if(moagemProgressBar) moagemProgressBar.style.width = '0%';
        const moagemPerc = document.getElementById('moagemPerc');
        if(moagemPerc) moagemPerc.textContent = '0%';
        
        const moagemForecastEl = document.getElementById('moagemForecast');
        const moagemStatusEl = document.getElementById('moagemStatus');
        const forecastDifferenceContainer = document.getElementById('forecastDifferenceContainer');
        
        if (moagemForecastEl) moagemForecastEl.textContent = '0 t';
        if (forecastDifferenceContainer) forecastDifferenceContainer.textContent = '';
        if (moagemStatusEl) {
            moagemStatusEl.textContent = 'Calculando...';
            moagemStatusEl.className = 'forecast-badge';
        }

        ['topFrotasProprias', 'topFrotasTerceiros', 'topEquipamentosProprios', 'topEquipamentosTerceiros', 'topTransbordos', 'topOperadoresColheitaPropria'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.innerHTML = `<div class="top-list-item" style="justify-content: center;">Sem dados.</div>`;
        });
        
        const frontsGrid = document.getElementById('frontsGrid');
        if(frontsGrid) frontsGrid.innerHTML = '';
        
        const metasContainer = document.getElementById('frontsMetaContainer');
        if(metasContainer) metasContainer.innerHTML = '';
        
        const fleetGrid = document.getElementById('fleetStatusCardsGrid');
        if (fleetGrid) fleetGrid.innerHTML = `<p class="text-secondary" style="text-align: center;">Aguardando dados de Potencial.</p>`;

        if (this.visualizer && this.visualizer.destroyAllCharts) {
            this.visualizer.destroyAllCharts();
        }

        this.showAnalyticsSection(false);
        this.updateDashboardWithCorrectedValues();
    }
    
    showAnalyticsSection(enable) {
        const analyticalContent = document.getElementById('analyticalContent');
        if (analyticalContent) {
            if (enable) {
                analyticalContent.classList.remove('analytical-disabled');
                analyticalContent.classList.add('analytical-enabled');
            } else {
                analyticalContent.classList.remove('analytical-enabled');
                analyticalContent.classList.add('analytical-disabled');
            }
        }
    }

    renderAlerts(anomalies) {
        const alertsContainer = document.getElementById('alertsContainer');
        if (!alertsContainer) return;

        alertsContainer.innerHTML = '';

        if (!anomalies || anomalies.length === 0) {
            alertsContainer.innerHTML = `
                <div class="alert-card active">
                    <i class="fas fa-check-circle" style="color: var(--success);"></i>
                    <div>
                        <div class="alert-title">Dados Validados!</div>
                        <div class="alert-message">Nenhuma anomalia crítica encontrada.</div>
                    </div>
                </div>
            `;
            return;
        }

        anomalies.forEach(alert => {
            const alertDiv = document.createElement('div');
            let iconClass = alert.severity === 'critical' ? 'fa-times-circle' : 'fa-info-circle';
            alertDiv.className = `alert-card ${alert.severity}`;
            let detailHtml = alert.detail ? `<div class="alert-card-detail">${alert.detail}</div>` : '';

            alertDiv.innerHTML = `
                <div class="alert-content">
                    <div>
                        <i class="fas ${iconClass}"></i>
                        <div>
                            <div class="alert-title">${alert.title}</div>
                            <div class="alert-message">${alert.message}</div>
                        </div>
                    </div>
                    ${detailHtml}
                </div>
            `;
            alertsContainer.appendChild(alertDiv);
        });
    }
    
    renderTabsNavigation() {
        const container = document.getElementById('tabs-nav-container');
        if (!container) return;

        const groups = [
            {
                id: 'sistema', label: 'Sistema', icon: 'fas fa-sliders-h', labelCls: '',
                tabs: [
                    { id: 'tab-visaoglobal', icon: 'fas fa-chart-pie',      title: 'Visão Global' },
                    { id: 'tab-horaria',     icon: 'fas fa-clock',          title: 'Entrega HxH'  },
                    { id: 'tab-frentes',     icon: 'fas fa-map-marked-alt', title: 'Frentes'      },
                    { id: 'tab-metas',       icon: 'fas fa-bullseye',       title: 'Metas'        },
                ]
            },
            {
                id: 'colheita', label: 'Colheita', icon: 'fas fa-tractor', labelCls: 'nav-group-label--harvest',
                tabs: [
                    { id: 'tab-moagem',      icon: 'fas fa-industry',  title: 'Moagem'      },
                    { id: 'tab-equipamento', icon: 'fas fa-tractor',   title: 'Colhedoras'  },
                    { id: 'tab-consumo',     icon: 'fas fa-gas-pump',  title: 'Consumo'     },
                    { id: 'tab-consumo-cam', icon: 'fas fa-truck',     title: 'Consumo Cam' },
                ]
            },
            {
                id: 'caminhoes', label: 'Caminhões', icon: 'fas fa-truck', labelCls: 'nav-group-label--truck',
                tabs: [
                    { id: 'tab-caminhao', icon: 'fas fa-truck', title: 'Caminhões' },
                ]
            },
            {
                id: 'admin', label: 'Admin', icon: 'fas fa-shield-alt', labelCls: '',
                tabs: [
                    { id: 'tab-gerenciar', icon: 'fas fa-cogs',     title: 'Gerenciar'              },
                    { id: 'tab-usuarios',  icon: 'fas fa-user-lock', title: 'Usuários', admin: true  },
                ]
            }
        ];

        const html = groups.map(g => {
            const btns = g.tabs
                .filter(t => this.canAccessTab(t.id))
                .map(t => {
                    const badge = t.badge
                        ? `<em class="nav-badge${t.badgeWarn ? ' nav-badge--warn' : ''}">${t.badge}</em>`
                        : '';
                    return `<button class="tab-button${t.oee ? ' nav-oee-btn' : ''}${t.admin ? ' admin-tab' : ''}"
                            data-tab="${t.id}"
                            onclick="window.agriculturalDashboard.showTab('${t.id}')">
                        <i class="${t.icon}"></i><span>${t.title}</span>${badge}
                    </button>`;
                }).join('');
            if (!btns.trim()) return '';
            return `
            <div class="nav-group" data-group="${g.id}">
                <div class="nav-group-label ${g.labelCls}">
                    <i class="${g.icon} nav-group-icon"></i>
                    <span class="nav-group-text">${g.label}</span>
                </div>
                <div class="nav-group-row">${btns}</div>
            </div>`;
        }).join('');

        container.innerHTML = `
            <div class="nav-search-wrap">
                <input type="text" id="navSearchInput" class="nav-search-input"
                       placeholder="Buscar aba…" oninput="window._navSearch(this.value)">
            </div>${html}`;

        const activePane = document.querySelector('.tab-pane.active');
        if (activePane) {
            const btn = container.querySelector(`[data-tab="${activePane.id}"]`);
            if (btn) btn.classList.add('active');
        }
    }

    async captureScreenshot() {
        const activeTab = document.querySelector('.tab-pane.active');
        if (!activeTab) {
            alert("Nenhuma aba ativa para capturar.");
            return;
        }

        const exportBtn = document.querySelector('.btn-export');
        const originalBtnText = exportBtn ? exportBtn.innerHTML : '';
        if (exportBtn) {
            exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
            exportBtn.disabled = true;
        }

        document.body.classList.add('snapshot-mode');
        
        const toHide = [
            document.getElementById('particles-js'),
            document.querySelector('.header-controls'),
            document.querySelector('.menu-toggle-btn'),
            document.getElementById('menu-backdrop'),
            document.getElementById('orientation-toast')
        ].filter(el => el);

        const originalDisplay = toHide.map(el => {
            const disp = el.style.display;
            el.style.display = 'none';
            return disp;
        });

        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        const captureBg = isLight ? '#f0f2f5' : '#050A14';

        await new Promise(resolve => setTimeout(resolve, 300));

        try {
            const canvas = await html2canvas(activeTab, {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                backgroundColor: captureBg,
                logging: false,
                imageTimeout: 0,
                ignoreElements: (element) => {
                    return element.classList.contains('header-controls') || 
                           element.id === 'particles-js' ||
                           element.id === 'orientation-toast';
                }
            });

            canvas.toBlob(async (blob) => {
                if (!blob) throw new Error("Erro ao gerar imagem.");

                try {
                    const item = new ClipboardItem({ "image/png": blob });
                    await navigator.clipboard.write([item]);
                    
                    // Visual feedback no botão em vez de alert()
                    if (exportBtn) {
                        exportBtn.innerHTML = '<i class="fas fa-check"></i> Copiado!';
                        exportBtn.style.background = 'linear-gradient(135deg,#22c55e,#16a34a)';
                        setTimeout(() => {
                            exportBtn.style.background = '';
                            exportBtn.innerHTML = originalBtnText || '<i class="fas fa-camera"></i> Ações';
                            exportBtn.disabled = false;
                        }, 2200);
                    }
                } catch (e) {
                    // Clipboard bloqueado (HTTP ou permissão negada)
                    if (exportBtn) {
                        exportBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Permissão negada';
                        exportBtn.style.background = 'linear-gradient(135deg,#f59e0b,#d97706)';
                        setTimeout(() => {
                            exportBtn.style.background = '';
                            exportBtn.innerHTML = originalBtnText || '<i class="fas fa-camera"></i> Ações';
                            exportBtn.disabled = false;
                        }, 3000);
                    }
                    console.warn('Clipboard bloqueado. Use HTTPS ou permita "clipboard-write" no navegador.', e);
                }
            }, 'image/png');

        } catch (error) {
            console.error("Erro no snapshot:", error);
            alert("Erro ao capturar tela: " + error.message);
        } finally {
            document.body.classList.remove('snapshot-mode');
            toHide.forEach((el, index) => {
                if(el) el.style.display = originalDisplay[index];
            });
            // O botão é restaurado pelo sucesso/erro com delay — aqui só libera se ainda bloqueado por erro grave
            if (exportBtn && exportBtn.disabled && exportBtn.innerHTML.includes('Processando')) {
                exportBtn.innerHTML = originalBtnText || '<i class="fas fa-camera"></i> Ações';
                exportBtn.disabled = false;
            }
        }
    }
}

AgriculturalDashboard.prototype.renderHxHTimeline = function() {
    const container = document.getElementById('hxh-timeline-container');
    if (!container) return;

    const analysis = this.analysisResult;
    if (!analysis || !analysis.analise24h || analysis.analise24h.length === 0) {
        container.innerHTML = `
            <div style="padding:30px;text-align:center;color:var(--text-secondary);font-size:.85rem">
                <i class="fas fa-clock" style="margin-right:6px;opacity:.5"></i>
                Aguardando dados de produção...
            </div>`;
        return;
    }

    const buckets = analysis.analise24h;
    const now = new Date();
    const currentHour = now.getHours();
    const currentIdx  = currentHour >= 6 ? currentHour - 6 : currentHour + 18;

    let firstDataIdx = buckets.findIndex(b => (b.peso || 0) > 0);
    if (firstDataIdx < 0) firstDataIdx = 0;

    const totalPeso    = buckets.reduce((s, b) => s + (b.peso || 0), 0);
    const totalViagens = buckets.reduce((s, b) => s + (b.viagens || 0), 0);
    const totalBucketsComDados = buckets.filter(b => (b.peso || 0) > 0).length;
    const horasComDados = totalBucketsComDados || 1;
    const ritmo = horasComDados > 0 ? totalPeso / horasComDados : 0;
    const isDiaConsolidado = totalBucketsComDados >= 16;
    const projecao = isDiaConsolidado ? totalPeso : ritmo * 24;
    const meta         = parseFloat(localStorage.getItem('metaMoagem') || '18500');
    const maxPeso      = Math.max(...buckets.map(b => b.peso || 0), 1);

    const fmtN = (n, dec=1) => n > 0
        ? n.toLocaleString('pt-BR', {minimumFractionDigits:dec, maximumFractionDigits:dec})
        : '—';

    const projCls  = projecao >= meta ? '#10b981' : '#3b82f6';
    const metaCls  = totalPeso >= meta ? '#10b981' : '#f59e0b';
    const dayLabel = (() => {
        const d1 = now.toLocaleDateString('pt-BR');
        const d2 = new Date(now.getTime() - 86400000).toLocaleDateString('pt-BR');
        return `Dia agrícola: ${d2} 06:00 → ${d1} 05:59`;
    })();

    const TOTAL = 24;
    const horaLabel = idx => {
        const h = (idx + 6) % 24;
        return `${String(h).padStart(2,'0')}:00`;
    };

    const tickIdxs = [0,3,6,9,12,15,18,21,23];

    const ticksHtml = tickIdxs.map(idx => {
        const pct = (idx / (TOTAL - 1)) * 100;
        return `<div class="hxh-tick" style="left:${pct}%" data-idx="${idx}">
                    <span class="hxh-tick-label">${horaLabel(idx)}</span>
                </div>`;
    }).join('');

    const segmentsHtml = buckets.map((b, idx) => {
        const pct  = (idx / TOTAL) * 100;
        const w    = (1  / TOTAL) * 100;
        const peso = b.peso || 0;
        const fill = idx > currentIdx ? 0 : Math.max((peso / maxPeso) * 100, peso > 0 ? 4 : 0);
        const col  = idx === currentIdx ? '#22c55e'
                   : idx < currentIdx && peso > 0 ? '#38bdf8'
                   : idx < currentIdx ? 'rgba(255,255,255,0.08)'
                   : 'rgba(255,255,255,0.04)';
        return `<div class="hxh-seg" style="left:${pct}%;width:${w}%;background:${col};opacity:${idx > currentIdx ? 0.3 : 1}"
                     data-idx="${idx}" title="${horaLabel(idx)} — ${peso > 0 ? fmtN(peso,1)+' t' : 'sem dados'} | ${b.viagens||0} viagens">
                    <div class="hxh-seg-fill" style="height:${fill}%"></div>
                </div>`;
    }).join('');

    const detailsForIdx = idx => {
        const b = buckets[idx] || {};
        const peso = b.peso || 0;
        const viagens = b.viagens || 0;
        const acum = buckets.slice(0, idx + 1).reduce((s, x) => s + (x.peso || 0), 0);
        const label = horaLabel(idx);
        const isFut = idx > currentIdx;
        return { label, peso, viagens, acum, isFut };
    };

    const uid = 'hxh_' + Date.now();

    container.innerHTML = `
    <div class="hxh-root" id="${uid}">
        <div class="hxh-kpi-bar">
            <div class="hxh-kpi-item">
                <span class="hxh-kpi-label">Dia agrícola</span>
                <span class="hxh-kpi-val" style="font-size:.72rem;color:var(--text-secondary)">${dayLabel}</span>
            </div>
            <div class="hxh-kpi-item">
                <span class="hxh-kpi-label">Total acumulado</span>
                <span class="hxh-kpi-val" style="color:#38bdf8">${fmtN(totalPeso,1)} t</span>
            </div>
            <div class="hxh-kpi-item">
                <span class="hxh-kpi-label">Projeção 24h</span>
                <span class="hxh-kpi-val" style="color:${projCls}">${fmtN(projecao,0)} t</span>
            </div>
            <div class="hxh-kpi-item">
                <span class="hxh-kpi-label">Meta dia</span>
                <span class="hxh-kpi-val" style="color:${metaCls}">${meta.toLocaleString('pt-BR',{maximumFractionDigits:0})} t</span>
            </div>
            <div class="hxh-kpi-item">
                <span class="hxh-kpi-label">Total viagens</span>
                <span class="hxh-kpi-val">${totalViagens}</span>
            </div>
        </div>

        <div class="hxh-scrubber-wrap">
            <div class="hxh-section-title">
                <span><i class="fas fa-clock" style="margin-right:6px;opacity:.7"></i>Linha do Tempo — Entrega por Hora</span>
                <span class="hxh-drag-hint"><i class="fas fa-hand-point-left"></i> Arraste para navegar</span>
            </div>

            <div class="hxh-track-outer">
                <div class="hxh-segments">${segmentsHtml}</div>
                <div class="hxh-baseline"></div>
                <div class="hxh-ticks">${ticksHtml}</div>
                <input type="range"
                       class="hxh-range"
                       id="${uid}_range"
                       min="0"
                       max="23"
                       step="1"
                       value="${currentIdx}">
            </div>

            <div class="hxh-detail-panel" id="${uid}_detail">
                <i class="fas fa-info-circle" style="opacity:.5;margin-right:6px"></i>
                Arraste a bolinha para ver os dados de cada hora
            </div>
        </div>
    </div>`;

    const rangeEl  = document.getElementById(`${uid}_range`);
    const detailEl = document.getElementById(`${uid}_detail`);
    const segEls   = container.querySelectorAll('.hxh-seg');

    const updateScrubber = (idx) => {
        idx = parseInt(idx);
        const { label, peso, viagens, acum, isFut } = detailsForIdx(idx);

        segEls.forEach((el, i) => {
            el.classList.toggle('hxh-seg-active', i === idx);
        });

        if (isFut) {
            detailEl.innerHTML = `
                <span style="color:var(--text-secondary)"><i class="fas fa-clock" style="margin-right:5px;opacity:.5"></i>
                <strong>${label}</strong> — hora futura, sem dados ainda</span>`;
        } else {
            const pctMeta = meta > 0 ? ((acum / meta) * 100).toFixed(1) : '—';
            const statCls = peso > 0 ? '#38bdf8' : '#6b7280';
            detailEl.innerHTML = `
                <div class="hxh-det-hora"><i class="fas fa-clock" style="margin-right:6px;opacity:.6"></i><strong>${label}</strong></div>
                <div class="hxh-det-grid">
                    <div class="hxh-det-item">
                        <span class="hxh-det-lbl">Toneladas</span>
                        <span class="hxh-det-val" style="color:${statCls}">${peso > 0 ? fmtN(peso,1) + ' t' : '—'}</span>
                    </div>
                    <div class="hxh-det-item">
                        <span class="hxh-det-lbl">Viagens</span>
                        <span class="hxh-det-val">${viagens > 0 ? viagens : '—'}</span>
                    </div>
                    <div class="hxh-det-item">
                        <span class="hxh-det-lbl">Acumulado</span>
                        <span class="hxh-det-val" style="color:#38bdf8">${fmtN(acum,1)} t</span>
                    </div>
                    <div class="hxh-det-item">
                        <span class="hxh-det-lbl">% da Meta</span>
                        <span class="hxh-det-val" style="color:${acum >= meta ? '#10b981' : '#f59e0b'}">${pctMeta}%</span>
                    </div>
                </div>`;
        }
    };

    updateScrubber(currentIdx);

    rangeEl.addEventListener('input', e => updateScrubber(e.target.value));
    rangeEl.addEventListener('change', e => updateScrubber(e.target.value));

    segEls.forEach(el => {
        el.addEventListener('click', () => {
            const idx = parseInt(el.dataset.idx);
            rangeEl.value = idx;
            updateScrubber(idx);
        });
    });
};

document.addEventListener('DOMContentLoaded', () => {
    (function() {
        const bd = document.getElementById('menu-backdrop');
        if (bd) {
            bd.classList.remove('active');
            bd.style.cssText = 'display:none!important;pointer-events:none!important;opacity:0!important;visibility:hidden!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;';
        }
    })();

    window.agriculturalDashboard = new AgriculturalDashboard();
    window.dashboard = window.agriculturalDashboard;

    setTimeout(() => {
        if (document.getElementById('_btn-clear-cache')) return;
        const containers = [
            document.getElementById('tab-gerenciar'),
            document.querySelector('.gerenciar-container'),
            document.querySelector('.dropzone-area'),
            document.querySelector('.file-upload-section'),
            document.querySelector('[data-tab="tab-gerenciar"]'),
        ];
        const container = containers.find(c => c);
        if (!container) return;
        const btn = document.createElement('button');
        btn.id = '_btn-clear-cache';
        btn.title = 'Use quando os dados exibidos estiverem desatualizados ou incorretos';
        btn.style.cssText = 'display:inline-flex;align-items:center;gap:8px;padding:8px 16px;' +
            'border-radius:8px;border:1px solid rgba(255,46,99,0.4);background:rgba(255,46,99,0.1);' +
            'color:#FF2E63;font-size:0.82rem;cursor:pointer;margin-top:12px;transition:background 0.2s;';
        btn.innerHTML = '<i class="fas fa-trash-alt"></i> Limpar Cache e Recarregar';
        btn.onmouseenter = () => btn.style.background = 'rgba(255,46,99,0.22)';
        btn.onmouseleave = () => btn.style.background = 'rgba(255,46,99,0.1)';
        btn.onclick = () => window.agriculturalDashboard && window.agriculturalDashboard.clearCache();
        container.appendChild(btn);
    }, 2000);
    
    if (typeof firebase !== 'undefined' && firebase.auth) {
        try {
            firebase.auth().onAuthStateChanged(async (user) => {
                if (user) {
                    try {
                        const doc = await firebase.firestore().collection('users').doc(user.uid).get();
                        if (doc.exists) {
                            window.agriculturalDashboard.handleAuthStateChange(user, doc.data());
                        } else {
                            console.error("Usuário logado mas sem perfil no banco.");
                            await firebase.auth().signOut();
                            window.agriculturalDashboard.handleAuthStateChange(null);
                        }
                    } catch (error) {
                        console.error("Erro ao buscar perfil:", error);
                        window.agriculturalDashboard._directBoot();
                    }
                } else {
                    window.agriculturalDashboard.handleAuthStateChange(null);
                }
            });
        } catch(e) {
            console.warn('[AUTH] Firebase indisponível, boot direto.');
            window.agriculturalDashboard._directBoot();
        }
    } else {
        console.info('[AUTH] Firebase não detectado. Iniciando modo direto.');
        window.agriculturalDashboard._directBoot();
    }
});

window._navSearch = function(q) {
    q = (q || '').toLowerCase().trim();
    const container = document.getElementById('tabs-nav-container');
    if (!container) return;
    container.querySelectorAll('.nav-group').forEach(group => {
        let any = false;
        group.querySelectorAll('.tab-button').forEach(btn => {
            const label = (btn.querySelector('span') || btn).textContent.toLowerCase();
            const tabId = (btn.dataset.tab || '').toLowerCase();
            const show  = !q || label.includes(q) || tabId.includes(q);
            btn.style.display = show ? '' : 'none';
            if (show) any = true;
        });
        group.style.display = any ? '' : 'none';
    });
};

(function initPWAInstall() {
    let deferredPrompt = null;

    function createInstallBanner() {
        if (document.getElementById('pwa-install-banner')) return;
        const banner = document.createElement('div');
        banner.id = 'pwa-install-banner';
        banner.style.cssText = `
            position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
            background:linear-gradient(135deg,#0ea5e9,#6366f1);
            color:#fff;border-radius:16px;padding:14px 22px;
            display:flex;align-items:center;gap:14px;
            box-shadow:0 8px 32px rgba(0,0,0,0.35);
            z-index:9999;font-family:system-ui,sans-serif;
            font-size:0.88rem;font-weight:600;
            animation:pwaSlideUp 0.4s ease;
            max-width:90vw;
        `;
        banner.innerHTML = `
            <style>@keyframes pwaSlideUp{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}</style>
            <span style="font-size:1.4rem;">📲</span>
            <div>
                <div style="font-weight:800;margin-bottom:2px;">Instalar AgroAnalytics</div>
                <div style="font-size:0.76rem;opacity:0.88;">Acesso offline + carregamento instantâneo</div>
            </div>
            <button id="pwa-install-btn" style="
                background:#fff;color:#0ea5e9;border:none;border-radius:10px;
                padding:8px 18px;font-weight:800;font-size:0.82rem;cursor:pointer;
                white-space:nowrap;flex-shrink:0;
            ">Instalar</button>
            <button id="pwa-dismiss-btn" style="
                background:rgba(255,255,255,0.2);color:#fff;border:none;
                border-radius:8px;padding:8px 12px;cursor:pointer;font-size:0.78rem;
            ">Agora não</button>
        `;
        document.body.appendChild(banner);

        document.getElementById('pwa-install-btn').onclick = async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                setTimeout(() => {
                    if (window.agriculturalDashboard && window.agriculturalDashboard.exportarSnapshotJSON) {
                        window.agriculturalDashboard.exportarSnapshotJSON();
                    }
                    if (navigator.serviceWorker.controller && window.agriculturalDashboard) {
                        const snap = {
                            _v: '6.9.0', _ts: new Date().toISOString(),
                            data: window.agriculturalDashboard.data || [],
                            acmSafraData: window.agriculturalDashboard.acmSafraData || [],
                            metaData: window.agriculturalDashboard.metaData || [],
                        };
                        navigator.serviceWorker.controller.postMessage({
                            type: 'SAVE_SNAPSHOT', payload: snap,
                            cacheKey: '/agroanalytics-snapshot'
                        });
                    }
                }, 1500);
            }
            deferredPrompt = null;
            banner.remove();
        };
        document.getElementById('pwa-dismiss-btn').onclick = () => banner.remove();
        setTimeout(() => banner.remove(), 20000);
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        setTimeout(createInstallBanner, 3000);
    });

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => {
                    console.log('[SW] Registrado:', reg.scope);
                    navigator.serviceWorker.addEventListener('message', (e) => {
                        if (e.data.type === 'SNAPSHOT_SAVED')
                            console.log('[SW] Snapshot salvo no cache:', e.data.key);
                        if (e.data.type === 'SNAPSHOT_LOADED')
                            console.log('[SW] Snapshot carregado do cache offline');
                    });
                })
                .catch(err => console.warn('[SW] Falha no registro:', err));
        });
    }
})();