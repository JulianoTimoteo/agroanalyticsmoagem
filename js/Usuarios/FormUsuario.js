// ============================================================
// js/Usuarios/FormUsuario.js
// Responsabilidade: Formulário de criação/edição de usuário
//   — Campos: nome, email, senha, perfil (admin/operador/viewer)
//   — Validação client-side e submissão via Firebase Auth
// ============================================================
// ⚠️ DEPENDÊNCIA CRUZADA
// Depende de: app.js (estado global — usuário autenticado)
// Interage com: ListaUsuarios.js (após save, dispara 'usuarioSalvo' para atualizar lista)
// Se remover Firebase, substituir _salvarNoFirebase() por chamada GAS/API
// ============================================================

/**
 * Inicializa o formulário de usuário no DOM.
 * @param {Object} [usuarioParaEditar] - Se fornecido, preenche o form para edição
 */
function initFormUsuario(usuarioParaEditar = null) {
    _buildForm(usuarioParaEditar);
}

/**
 * Reseta o formulário para estado vazio (novo usuário).
 */
function resetFormUsuario() {
    _buildForm(null);
}

// ─────────────────────────────────
// PRIVADO
// ─────────────────────────────────

function _buildForm(usuario) {
    const container = document.getElementById('formUsuarioContainer')
        || document.getElementById('usuarioFormContainer');
    if (!container) return;

    const isEdit = !!usuario;

    container.innerHTML = `
        <div class="form-usuario" style="
            background: rgba(15,23,42,0.7);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 12px;
            padding: 24px;
            max-width: 480px;
        ">
            <h3 style="margin:0 0 20px;font-size:1rem;font-weight:700;color:#fff;">
                ${isEdit ? '✏️ Editar Usuário' : '➕ Novo Usuário'}
            </h3>

            <div class="form-group" style="margin-bottom:16px;">
                <label style="display:block;font-size:0.8rem;color:var(--text, #F0F0F0);margin-bottom:6px;">Nome *</label>
                <input id="inputNomeUsuario" type="text" value="${_safe(usuario?.displayName || '')}"
                    placeholder="Nome completo"
                    style="${_inputStyle()}">
            </div>

            <div class="form-group" style="margin-bottom:16px;">
                <label style="display:block;font-size:0.8rem;color:var(--text, #F0F0F0);margin-bottom:6px;">E-mail *</label>
                <input id="inputEmailUsuario" type="email" value="${_safe(usuario?.email || '')}"
                    placeholder="usuario@empresa.com.br"
                    ${isEdit ? 'disabled' : ''}
                    style="${_inputStyle(isEdit)}">
            </div>

            ${!isEdit ? `
            <div class="form-group" style="margin-bottom:16px;">
                <label style="display:block;font-size:0.8rem;color:var(--text, #F0F0F0);margin-bottom:6px;">Senha *</label>
                <input id="inputSenhaUsuario" type="password" placeholder="Mínimo 8 caracteres"
                    style="${_inputStyle()}">
            </div>` : ''}

            <div class="form-group" style="margin-bottom:20px;">
                <label style="display:block;font-size:0.8rem;color:var(--text, #F0F0F0);margin-bottom:6px;">Perfil *</label>
                <select id="inputPerfilUsuario" style="${_inputStyle()}">
                    <option value="operador"  ${usuario?.perfil === 'operador'  ? 'selected' : ''}>Operador</option>
                    <option value="admin"     ${usuario?.perfil === 'admin'     ? 'selected' : ''}>Administrador</option>
                    <option value="viewer"    ${usuario?.perfil === 'viewer'    ? 'selected' : ''}>Visualizador</option>
                </select>
            </div>

            <div id="formUsuarioMsgErro" style="display:none;color:#FF2E63;font-size:0.8rem;margin-bottom:12px;"></div>

            <div style="display:flex;gap:10px;justify-content:flex-end;">
                <button onclick="resetFormUsuario()"
                    style="padding:8px 18px;background:transparent;border:1px solid rgba(255,255,255,0.12);
                           border-radius:8px;color:var(--text, #F0F0F0);font-size:0.85rem;cursor:pointer;">
                    Cancelar
                </button>
                <button id="btnSalvarUsuario"
                    style="padding:8px 18px;background:#2196F3;border:none;
                           border-radius:8px;color:#fff;font-size:0.85rem;font-weight:700;cursor:pointer;">
                    ${isEdit ? 'Salvar Alterações' : 'Criar Usuário'}
                </button>
            </div>
        </div>
    `;

    document.getElementById('btnSalvarUsuario')
        ?.addEventListener('click', () => _salvar(isEdit, usuario?.uid));
}

function _salvar(isEdit, uid) {
    const nome   = (document.getElementById('inputNomeUsuario')?.value || '').trim();
    const email  = (document.getElementById('inputEmailUsuario')?.value || '').trim();
    const senha  = (document.getElementById('inputSenhaUsuario')?.value || '').trim();
    const perfil = document.getElementById('inputPerfilUsuario')?.value || 'operador';

    if (!nome || !email) {
        _showErro('Nome e e-mail são obrigatórios.');
        return;
    }
    if (!isEdit && senha.length < 8) {
        _showErro('A senha deve ter pelo menos 8 caracteres.');
        return;
    }

    _hideErro();

    const payload = { nome, email, perfil, uid };
    if (!isEdit) payload.senha = senha;

    // Dispara evento para ListaUsuarios.js e app.js
    document.dispatchEvent(new CustomEvent('usuarioSalvo', { detail: payload }));

    // Tenta Firebase se disponível
    _salvarNoFirebase(payload, isEdit);
}

function _salvarNoFirebase(payload, isEdit) {
    if (typeof firebase === 'undefined') {
        console.info('[FormUsuario] Firebase não disponível — dado enviado via evento.');
        return;
    }

    if (isEdit) {
        // Atualiza Firestore
        firebase.firestore().collection('users').doc(payload.uid)
            .update({ displayName: payload.nome, perfil: payload.perfil })
            .then(() => _showSucesso('Usuário atualizado com sucesso.'))
            .catch(e => _showErro(e.message));
    } else {
        // Cria conta (requer Admin SDK — aqui apenas registra localmente)
        console.warn('[FormUsuario] Criação via client SDK limitada. Use Firebase Admin SDK ou GAS.');
        _showSucesso('Usuário registrado localmente. Configure o backend para persistência.');
    }
}

function _showErro(msg) {
    const el = document.getElementById('formUsuarioMsgErro');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function _showSucesso(msg) {
    const el = document.getElementById('formUsuarioMsgErro');
    if (el) { el.textContent = msg; el.style.color = '#40800c'; el.style.display = 'block'; }
}

function _hideErro() {
    const el = document.getElementById('formUsuarioMsgErro');
    if (el) el.style.display = 'none';
}

function _inputStyle(disabled = false) {
    return `
        width:100%;box-sizing:border-box;
        background:rgba(255,255,255,0.05);
        border:1px solid rgba(255,255,255,${disabled ? '0.04' : '0.12'});
        border-radius:8px;padding:10px 12px;
        color:${disabled ? 'var(--text-secondary, #D8D8D8)' : '#fff'};font-size:0.88rem;
        outline:none;
        ${disabled ? 'cursor:not-allowed;' : ''}
    `;
}

function _safe(t) {
    return String(t || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Expõe globalmente
window.FormUsuario   = { init: initFormUsuario, reset: resetFormUsuario };
window.resetFormUsuario = resetFormUsuario;  // para o botão cancelar inline
