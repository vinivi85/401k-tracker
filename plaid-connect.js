/* =========================================================
   PLAID CONNECTION — Fidelity 401K Balance Sync
   Usa Vercel Serverless Functions como backend seguro
   ========================================================= */
(function () {
  'use strict';
  var h = React.createElement;

  var PLAID_SCRIPT = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';

  function loadPlaidScript() {
    return new Promise(function (resolve, reject) {
      if (window.Plaid) { resolve(); return; }
      var s = document.createElement('script');
      s.src = PLAID_SCRIPT;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function PlaidConnectionCard(props) {
    var userId = props.userId;

    var statusState = React.useState(null); // null=loading, {connected,balance,lastSync}
    var status = statusState[0], setStatus = statusState[1];
    var loadingState = React.useState(false);
    var loading = loadingState[0], setLoading = loadingState[1];
    var errorState = React.useState(null);
    var error = errorState[0], setError = errorState[1];
    var syncingState = React.useState(false);
    var syncing = syncingState[0], setSyncing = syncingState[1];

    function fetchStatus() {
      if (!userId) return;
      fetch('/api/plaid-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId })
      }).then(function (r) { return r.json(); })
        .then(function (d) { setStatus(d); })
        .catch(function (e) { setError('Erro ao verificar conexão: ' + e.message); setStatus({ connected: false }); });
    }

    React.useEffect(function () { fetchStatus(); }, [userId]);

    function connectPlaid() {
      setLoading(true);
      setError(null);
      loadPlaidScript().then(function () {
        return fetch('/api/plaid-link-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: userId })
        });
      }).then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data.link_token) throw new Error(data.error || 'Sem link_token');
          var handler = window.Plaid.create({
            token: data.link_token,
            onSuccess: function (public_token, metadata) {
              setLoading(true);
              fetch('/api/plaid-exchange', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  public_token: public_token,
                  institution_name: metadata.institution ? metadata.institution.name : 'Fidelity',
                  userId: userId
                })
              }).then(function (r) { return r.json(); })
                .then(function (d) {
                  if (d.error) throw new Error(d.error);
                  setLoading(false);
                  fetchStatus();
                }).catch(function (e) {
                  setLoading(false);
                  setError('Erro ao conectar: ' + e.message);
                });
            },
            onExit: function (err) {
              setLoading(false);
              if (err) setError('Plaid Link encerrado: ' + (err.error_message || err.display_message || ''));
            }
          });
          handler.open();
        }).catch(function (e) {
          setLoading(false);
          setError('Erro ao iniciar Plaid: ' + e.message);
        });
    }

    function syncBalance() {
      setSyncing(true);
      setError(null);
      fetch('/api/plaid-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId })
      }).then(function (r) { return r.json(); })
        .then(function (d) {
          setSyncing(false);
          if (d.error) throw new Error(d.error);
          fetchStatus();
        }).catch(function (e) {
          setSyncing(false);
          setError('Erro ao sincronizar: ' + e.message);
        });
    }

    function disconnect() {
      if (!confirm('Desconectar a Fidelity do app?')) return;
      fetch('/api/plaid-disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId })
      }).then(function () { setStatus({ connected: false }); })
        .catch(function (e) { setError('Erro ao desconectar: ' + e.message); });
    }

    if (!userId) return h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#6B7280' } }, 'Faça login para conectar');

    if (status === null) return h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#B0B7C3' } }, 'Verificando conexão...');

    return h('div', null,
      error ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#FB7185', marginBottom: 10, padding: '6px 10px', background: '#1a0a0a', borderRadius: 6 } }, error) : null,

      status.connected ? h('div', null,
        /* Connected state */
        h('div', { style: { background: '#0F2D2A', borderRadius: 10, padding: 14, marginBottom: 10, border: '1px solid #134E4A' } },
          h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#5EEAD4', marginBottom: 8 } },
            '✓ ' + (status.institution_name || 'Fidelity') + ' CONECTADO'
          ),
          h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 24, fontWeight: 700, color: '#F9FAFB', marginBottom: 4 } },
            formatUSD(status.current_balance || 0)
          ),
          h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#B0B7C3' } },
            'Última sync: ' + (status.last_synced_at ? new Date(status.last_synced_at).toLocaleString('pt-BR') : 'nunca')
          ),
          /* Account breakdown */
          status.accounts && status.accounts.length > 1 ? h('div', { style: { marginTop: 10 } },
            status.accounts.map(function (a, i) {
              return h('div', { key: i, style: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderTop: '1px solid #1F2937' } },
                h('span', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#9CA3AF' } }, a.name),
                h('span', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#D1D5DB' } }, formatUSD(a.balance || 0))
              );
            })
          ) : null
        ),
        h('div', { style: { display: 'flex', gap: 8 } },
          h('button', {
            style: Object.assign({}, S.submitBtn, { flex: 2 }),
            onClick: syncBalance,
            disabled: syncing
          }, syncing ? 'SINCRONIZANDO...' : '↻ SINCRONIZAR SALDO'),
          h('button', {
            style: Object.assign({}, S.addBtn, { flex: 1, justifyContent: 'center', color: '#FB7185', borderColor: '#7F1D1D' }),
            onClick: disconnect
          }, 'DESCONECTAR')
        )
      ) : h('div', null,
        /* Disconnected state */
        h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#B0B7C3', marginBottom: 14 } },
          'Conecte sua conta Fidelity para sincronizar o saldo do 401K automaticamente.'
        ),
        h('button', {
          style: Object.assign({}, S.submitBtn, { width: '100%' }),
          onClick: connectPlaid,
          disabled: loading
        }, loading ? 'ABRINDO PLAID...' : '+ CONECTAR FIDELITY')
      )
    );
  }

  window.PlaidConnectionCard = PlaidConnectionCard;
})();

/* =========================================================
   PLAID WALLET CONNECTION — Robinhood, Marcus, etc.
   ========================================================= */
(function () {
  'use strict';
  var h = React.createElement;

  function PlaidWalletCard(props) {
    var userId  = props.userId;
    var wallets = props.wallets || []; // carteiras configuradas no app

    var itemsState = React.useState([]);
    var items = itemsState[0], setItems = itemsState[1];
    var loadingState = React.useState(false);
    var loading = loadingState[0], setLoading = loadingState[1];
    var errorState = React.useState(null);
    var error = errorState[0], setError = errorState[1];
    var syncingState = React.useState(false);
    var syncing = syncingState[0], setSyncing = syncingState[1];

    function fetchStatus() {
      if (!userId) return;
      fetch('/api/plaid-wallet-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      }).then(function(r){ return r.json(); })
        .then(function(d){ setItems(d.items || []); })
        .catch(function(e){ setError(e.message); });
    }

    React.useEffect(function(){ fetchStatus(); }, [userId]);

    function connectNew() {
      setLoading(true); setError(null);
      var loadScript = window.Plaid
        ? Promise.resolve()
        : new Promise(function(resolve, reject){
            var s = document.createElement('script');
            s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
            s.onload = resolve; s.onerror = reject;
            document.head.appendChild(s);
          });

      loadScript.then(function(){
        return fetch('/api/plaid-wallet-link-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId })
        });
      }).then(function(r){ return r.json(); })
        .then(function(data){
          if (!data.link_token) throw new Error(data.error || 'No link_token');
          var handler = window.Plaid.create({
            token: data.link_token,
            onSuccess: function(public_token, metadata){
              setLoading(true);
              fetch('/api/plaid-wallet-exchange', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  public_token,
                  institution_name: metadata.institution ? metadata.institution.name : null,
                  userId
                })
              }).then(function(r){ return r.json(); })
                .then(function(d){
                  setLoading(false);
                  if (d.error) throw new Error(d.error);
                  fetchStatus();
                }).catch(function(e){ setLoading(false); setError(e.message); });
            },
            onExit: function(err){ setLoading(false); if (err) setError(err.display_message || ''); }
          });
          handler.open();
        }).catch(function(e){ setLoading(false); setError(e.message); });
    }

    function assignWallet(accountId, walletId) {
      fetch('/api/plaid-wallet-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, walletId })
      }).then(function(){ fetchStatus(); })
        .catch(function(e){ setError(e.message); });
    }

    function syncAll() {
      setSyncing(true); setError(null);
      fetch('/api/plaid-wallet-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      }).then(function(r){ return r.json(); })
        .then(function(d){ setSyncing(false); if (d.error) throw new Error(d.error); fetchStatus(); })
        .catch(function(e){ setSyncing(false); setError(e.message); });
    }

    if (!userId) return null;

    return h('div', null,
      error ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#FB7185', marginBottom: 10, padding: '6px 10px', background: '#1a0a0a', borderRadius: 6 } }, error) : null,

      /* Connected institutions */
      items.map(function(item){
        return h('div', { key: item.id, style: { background: '#111827', borderRadius: 10, padding: 12, marginBottom: 10, border: '1px solid #1F2937' } },
          h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#5EEAD4', marginBottom: 8 } },
            '✓ ' + (item.institution_name || 'Instituição')
          ),
          item.accounts.map(function(acc){
            return h('div', { key: acc.id, style: { padding: '8px 0', borderTop: '1px solid #1F2937' } },
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                h('span', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#D1D5DB' } }, acc.account_name),
                h('span', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#F9FAFB', fontWeight: 700 } }, formatUSD(acc.current_balance || 0))
              ),
              /* Wallet association dropdown */
              h('div', { style: { marginTop: 4 } },
                h('select', {
                  style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, background: '#1F2937', color: '#9CA3AF', border: '1px solid #374151', borderRadius: 6, padding: '3px 6px', width: '100%' },
                  value: acc.wallet_id || '',
                  onChange: function(ev){ assignWallet(acc.id, ev.target.value || null); }
                },
                  h('option', { value: '' }, '— selecionar carteira —'),
                  wallets.map(function(w){
                    return h('option', { key: w.name, value: w.name }, w.name);
                  })
                )
              )
            );
          })
        );
      }),

      /* Buttons */
      h('div', { style: { display: 'flex', gap: 8, marginTop: 4 } },
        h('button', {
          style: Object.assign({}, S.submitBtn, { flex: 2 }),
          onClick: connectNew, disabled: loading
        }, loading ? 'ABRINDO PLAID...' : '+ CONECTAR INSTITUIÇÃO'),
        items.length > 0 ? h('button', {
          style: Object.assign({}, S.addBtn, { flex: 1, justifyContent: 'center' }),
          onClick: syncAll, disabled: syncing
        }, syncing ? '...' : '↻ SYNC') : null
      )
    );
  }

  window.PlaidWalletCard = PlaidWalletCard;
})();
