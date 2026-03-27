// ============================================================
// FormUsuario.js — v2.0 Produção
// Criação e edição de usuários com sessão admin preservada
// ============================================================

(function() {

    // ── ESTADO INTERNO ───────────────────────────────────────
    let _uid    = null;
    let _isEdit = false;

    // ── API PÚBLICA ───────────────────────────────────────────
    window.FormUsuario = {
        init:  function(usuario) { _build(usuario || null); },
        reset: function()        { _build(null); }
    };

    // ── CONSTRUÇÃO DO FORM ────────────────────────────────────
    function _build(usuario) {
        _uid    = usuario ? usuario.uid || usuario.id : null;
        _isEdit = !!_uid;

        const el = document.getElementById('formUsuarioContainer');
        if (!el) return;

        const nome     = _safe(usuario?.displayName || usuario?.nickname || '');
        const email    = _safe(usuario?.email || '');
        const roleAtual = usuario?.role || 'viewer';

        const roles = [
            { value: 'viewer',  label: 'Viewer'  },
            { value: 'editor',  label: 'Editor'  },
            { value: 'admin',   label: 'Admin'   },
            { value: 'master',  label: 'Master'  },
        ];

        el.innerHTML = `
            <div style="padding:20px;background:var(--glass-bg,#0f172a);border-radius:12px;border:1px solid var(--glass-border,#1e293b);max-width:440px;margin:0 auto;">
                <h3 style="margin:0 0 16px;font-size:1rem;font-weight:700;color:var(--primary,#38bdf8);">
                    <i class="fas ${_isEdit ? 'fa-user-edit' : 'fa-user-plus'}"></i>
                    ${_isEdit ? 'Editar Usuário' : 'Novo Usuário'}
                </h3>

                <label style="${_lbl()}">Nome / Apelido</label>
                <input id="fu-nome" value="${nome}" placeholder="Nome completo ou apelido" style="${_inp()}">

                <label style="${_lbl()}">E-mail${_isEdit ? ' (não editável)' : ''}</label>
                <input id="fu-email" value="${email}" placeholder="usuario@empresa.com ou deixe em branco"
                    ${_isEdit ? 'disabled' : ''} style="${_inp()}${_isEdit ? 'opacity:0.5;' : ''}">

                ${!_isEdit ? `
                <label style="${_lbl()}">Senha (mín. 6 caracteres)</label>
                <input id="fu-senha" type="password" placeholder="••••••••" style="${_inp()}">
                ` : ''}

                <label style="${_lbl()}">Papel de acesso</label>
                <select id="fu-role" style="${_inp()}">
                    ${roles.map(r => `<option value="${r.value}" ${roleAtual===r.value?'selected':''}>${r.label}</option>`).join('')}
                </select>

                <div id="fu-msg" style="margin:10px 0;font-size:0.8rem;min-height:20px;"></div>

                <div style="display:flex;gap:10px;margin-top:4px;">
                    <button id="fu-salvar" class="btn-primary" style="flex:1;">
                        <i class="fas fa-save"></i> ${_isEdit ? 'Salvar alterações' : 'Criar usuário'}
                    </button>
                    <button id="fu-cancelar" class="gc-btn ghost" style="flex:0 0 auto;padding:8px 16px;">
                        Cancelar
                    </button>
                </div>
            </div>
        `;

        document.getElementById('fu-salvar').onclick    = _salvar;
        document.getElementById('fu-cancelar').onclick  = () => { el.innerHTML = ''; };
    }

    // ── SALVAR ────────────────────────────────────────────────
    async function _salvar() {
        const nome  = (document.getElementById('fu-nome')?.value  || '').trim();
        const email = (document.getElementById('fu-email')?.value || '').trim().toLowerCase();
        const senha = document.getElementById('fu-senha')?.value  || '';
        const role  = document.getElementById('fu-role')?.value   || 'viewer';
        const btn   = document.getElementById('fu-salvar');

        if (!nome)             return _msg('Nome é obrigatório.', 'red');
        if (!_isEdit && senha.length < 6) return _msg('Senha deve ter ao menos 6 caracteres.', 'red');

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aguarde...';
        _msg('', '');

        const db = firebase.firestore();

        try {
            if (_isEdit) {
                // ── EDIÇÃO: apenas Firestore ──────────────────
                await db.collection('users').doc(_uid).update({
                    displayName: nome,
                    nickname:    nome,
                    role,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                _msg('✅ Usuário atualizado com sucesso!', 'green');
                setTimeout(() => {
                    document.getElementById('formUsuarioContainer').innerHTML = '';
                }, 2000);

            } else {
                // ── CRIAÇÃO: Auth + Firestore sem perder sessão admin ──
                // Geração de email: se não preenchido, cria agro.local único
                const nickSlug  = nome.toLowerCase().normalize('NFD')
                    .replace(/[\u0300-\u036f]/g,'')
                    .replace(/[^a-z0-9]/g,'').slice(0, 20) || 'user';
                const ts        = Date.now().toString(36);
                const emailFinal = email || `${nickSlug}_${ts}@agro.local`;

                // Salva sessão do admin antes de qualquer operação
                const adminUser = firebase.auth().currentUser;
                const adminEmail= adminUser?.email;
                const savedPass = localStorage.getItem('ag_saved_pass');

                // Cria usuário via REST API — admin NÃO perde sessão
                const FIREBASE_API_KEY = 'AIzaSyADUuqh_THzGInTSytxzUFEwHV5LmwdvYc';
                const finalPass = senha || (nickSlug + ts + '!A7');

                const restResp = await fetch(
                    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            email: emailFinal,
                            password: finalPass,
                            returnSecureToken: false
                        })
                    }
                );
                const restData = await restResp.json();
                let newUid = null;

                if (restData.error) {
                    const code = (restData.error.message || '').toUpperCase();
                    if (code.includes('EMAIL_EXISTS')) {
                        _msg('E-mail já em uso. Tente outro apelido.', 'red');
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fas fa-save"></i> Criar usuário';
                        return;
                    }
                    throw new Error(restData.error.message || 'Erro ao criar no Auth.');
                }
                newUid = restData.localId;
                if (!newUid) throw new Error('Firebase não retornou UID.');

                // Agora com sessão admin, escreve no Firestore
                await db.collection('users').doc(newUid).set({
                    displayName: nome,
                    nickname:    nome,
                    email:       emailFinal,
                    role,
                    createdAt:  firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt:  firebase.firestore.FieldValue.serverTimestamp(),
                    disabled:   false,
                    customPermissions: _defaultPerms(role)
                }, { merge: true });

                _msg(`✅ Usuário "${nome}" criado! Email: ${emailFinal}`, 'green');
                setTimeout(() => {
                    document.getElementById('formUsuarioContainer').innerHTML = '';
                    if (window.agriculturalDashboard?.loadUserManagementData)
                        window.agriculturalDashboard.loadUserManagementData();
                }, 2500);
            }

        } catch (err) {
            console.error('[FormUsuario] Erro:', err);
            const msg = err.code === 'auth/weak-password'    ? 'Senha muito fraca (mín. 6 caracteres).'
                      : err.code === 'auth/invalid-email'    ? 'E-mail inválido.'
                      : err.message || 'Erro inesperado.';
            _msg('❌ ' + msg, 'red');
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-save"></i> ${_isEdit ? 'Salvar alterações' : 'Criar usuário'}`;
        }
    }

    // ── HELPERS ───────────────────────────────────────────────
    function _defaultPerms(role) {
        const base = ['tab-moagem','tab-consumo','tab-consumo-cam','tab-caminhao',
                      'tab-equipamento','tab-frentes','tab-metas','tab-horaria','tab-visaoglobal'];
        if (role === 'admin' || role === 'master')
            return [...base, 'tab-gerenciar','tab-usuarios','tab-alertas'];
        if (role === 'editor') return [...base, 'tab-gerenciar'];
        return base;
    }

    function _msg(text, color) {
        const el = document.getElementById('fu-msg');
        if (!el) return;
        el.textContent = text;
        el.style.color  = color === 'green' ? '#4ade80'
                        : color === 'red'   ? '#f87171' : 'var(--text-secondary)';
    }

    function _lbl() {
        return 'display:block;font-size:0.75rem;font-weight:600;color:var(--text-secondary);margin-bottom:4px;margin-top:10px;';
    }

    function _inp() {
        return 'width:100%;padding:8px 12px;background:rgba(0,0,0,0.25);color:var(--text-primary,#fff);border:1px solid var(--glass-border,#334155);border-radius:8px;font-size:0.85rem;box-sizing:border-box;';
    }

    function _safe(t) {
        return String(t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

})();
