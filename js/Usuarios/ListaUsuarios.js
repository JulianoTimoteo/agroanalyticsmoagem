// ============================================================
// js/Usuarios/ListaUsuarios.js
// Responsabilidade: Tabela de listagem de usuários cadastrados
//   — Colunas: Nome, E-mail, Perfil, Status, Ações (editar/excluir)
//   — Escuta evento 'usuarioSalvo' para atualizar automaticamente
// ============================================================
// ⚠️ DEPENDÊNCIA CRUZADA
// Depende de: app.js (estado global — lista de usuários vem de Firebase/GAS)
// Interage com: FormUsuario.js — ao clicar Editar, chama initFormUsuario(usuario)
// Se alterar a fonte de dados de usuários, revisar aqui e em app.js
// ============================================================

let _usuarios = [];

/**
 * Inicializa a lista de usuários.
 * @param {Object[]} usuarios - Array de objetos de usuário
 */
function initListaUsuarios(usuarios) {
    _usuarios = usuarios || [];
    _listenSave();
    _render();
}

/**
 * Atualiza a lista com novos dados.
 * @param {Object[]} usuarios
 */
function updateListaUsuarios(usuarios) {
    _usuarios = usuarios || [];
    _render();
}

// ─────────────────────────────────
// PRIVADO
// ─────────────────────────────────

function _listenSave() {
    document.addEventListener('usuarioSalvo', (e) => {
        const payload = e.detail;
        if (!payload) return;

        const idx = _usuarios.findIndex(u => u.uid === payload.uid || u.email === payload.email);
        if (idx >= 0) {
            _usuarios[idx] = { ..._usuarios[idx], ...payload };
        } else {
            _usuarios.push({ uid: payload.uid || `local_${Date.now()}`, ...payload });
        }
        _render();
    });
}

function _render() {
    const container = document.getElementById('listaUsuariosContainer')
        || document.getElementById('usuariosTableContainer');
    if (!container) return;

    if (!_usuarios.length) {
        container.innerHTML = `
            <div style="text-align:center;padding:32px;color:var(--text, #F0F0F0);font-size:0.9rem;">
                Nenhum usuário cadastrado.
            </div>`;
        return;
    }

    container.innerHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
            <thead>
                <tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
                    <th style="${_thStyle()}">Nome</th>
                    <th style="${_thStyle()}">E-mail</th>
                    <th style="${_thStyle('center')}">Perfil</th>
                    <th style="${_thStyle('center')}">Status</th>
                    <th style="${_thStyle('center')}">Ações</th>
                </tr>
            </thead>
            <tbody>
                ${_usuarios.map((u, i) => _buildRow(u, i)).join('')}
            </tbody>
        </table>
    `;

    // Bind botões
    container.querySelectorAll('[data-action="editar"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const uid = btn.dataset.uid;
            const u   = _usuarios.find(x => x.uid === uid);
            if (u && window.FormUsuario) window.FormUsuario.init(u);
        });
    });

    container.querySelectorAll('[data-action="excluir"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const uid = btn.dataset.uid;
            if (confirm('Deseja excluir este usuário?')) _excluir(uid);
        });
    });
}

function _buildRow(u, i) {
    const perfilColor = u.perfil === 'admin'  ? '#FF2E63'
                      : u.perfil === 'viewer' ? 'var(--text, #F0F0F0)'
                      : '#40800c';

    const bg = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)';

    return `
        <tr style="background:${bg};border-bottom:1px solid rgba(255,255,255,0.05);">
            <td style="${_tdStyle()}">${_safe(u.displayName || u.nome || '—')}</td>
            <td style="${_tdStyle()};color:var(--text, #F0F0F0);">${_safe(u.email || '—')}</td>
            <td style="${_tdStyle('center')}">
                <span style="
                    padding:3px 8px;border-radius:6px;font-size:0.75rem;font-weight:700;
                    background:${perfilColor}22;color:${perfilColor};
                ">${_safe(u.perfil || 'operador')}</span>
            </td>
            <td style="${_tdStyle('center')}">
                <span style="color:${u.disabled ? '#FF2E63' : '#40800c'};font-size:0.75rem;font-weight:700;">
                    ${u.disabled ? '● Inativo' : '● Ativo'}
                </span>
            </td>
            <td style="${_tdStyle('center')}">
                <button data-action="editar" data-uid="${_safe(u.uid)}"
                    style="padding:4px 10px;background:rgba(33,150,243,0.15);border:1px solid rgba(33,150,243,0.3);
                           border-radius:6px;color:#2196F3;font-size:0.75rem;cursor:pointer;margin-right:4px;">
                    Editar
                </button>
                <button data-action="excluir" data-uid="${_safe(u.uid)}"
                    style="padding:4px 10px;background:rgba(255,46,99,0.12);border:1px solid rgba(255,46,99,0.25);
                           border-radius:6px;color:#FF2E63;font-size:0.75rem;cursor:pointer;">
                    Excluir
                </button>
            </td>
        </tr>
    `;
}

function _excluir(uid) {
    _usuarios = _usuarios.filter(u => u.uid !== uid);
    _render();

    if (typeof firebase !== 'undefined') {
        firebase.firestore().collection('users').doc(uid)
            .delete()
            .catch(e => console.error('[ListaUsuarios] Erro ao excluir:', e));
    }
}

function _thStyle(align = 'left') {
    return `padding:10px 12px;text-align:${align};color:var(--text, #F0F0F0);font-weight:700;font-size:0.75rem;text-transform:uppercase;`;
}

function _tdStyle(align = 'left') {
    return `padding:10px 12px;text-align:${align};color:#e0e0e0;`;
}

function _safe(t) {
    return String(t || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Expõe globalmente
window.ListaUsuarios = { init: initListaUsuarios, update: updateListaUsuarios };
