// ============================================================
// ListaUsuarios.js — v2.0 Produção
// onSnapshot com guard de autenticação e UI integrada ao app
// ============================================================

(function() {

    let _unsubscribe = null;  // listener ativo

    // ── API PÚBLICA ───────────────────────────────────────────
    window.ListaUsuarios = {
        init:  function() { _start(); },
        stop:  function() { if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; } }
    };

    // ── INICIALIZAÇÃO ─────────────────────────────────────────
    function _start() {
        // Para qualquer listener anterior
        if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }

        const user = firebase.auth().currentUser;
        if (!user) return;

        _unsubscribe = firebase.firestore()
            .collection('users')
            .onSnapshot(
                snap => {
                    const usuarios = [];
                    snap.forEach(doc => usuarios.push({ uid: doc.id, ...doc.data() }));
                    // Atualiza contagem no header do painel de usuários
                    const countEl = document.getElementById('usuarios-total-count');
                    if (countEl) countEl.textContent = usuarios.length;
                    // Delega renderização ao app principal se disponível
                    if (window.agriculturalDashboard?.loadUserManagementData)
                        window.agriculturalDashboard.loadUserManagementData();
                },
                err => {
                    // Erros de permissão são silenciosos — o usuário não tem acesso admin
                    console.warn('[ListaUsuarios] Sem acesso ao snapshot de usuários:', err.code);
                    if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
                }
            );
    }

})();
