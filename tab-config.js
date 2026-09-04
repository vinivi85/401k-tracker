/* =========================================================
   TAB: CONFIG — parâmetros centralizados do usuário
   Salva em Supabase (user_configs) + cache local (KEY_PAYCHECK)
   para compatibilidade com tab-paycheck.js e tab-projection.js
   ========================================================= */
(function () {
  'use strict';
  var h = React.createElement;

  /* Componente reutilizável de campo numérico */
  function NumField(props) {
    return h('div', { style: S.formRow },
      h('label', { style: S.formLabel }, props.label),
      h('input', {
        type: 'number', step: props.step || '0.01', value: props.value, style: S.input,
        onChange: function (ev) { props.onChange(ev.target.value); }
      })
    );
  }

  /* Seção colapsável reutilizável */
  function Section(props) {
    var openState = React.useState(props.defaultOpen !== false);
    var open = openState[0], setOpen = openState[1];
    return h('div', { style: S.card },
      h('div', { style: S.walletCardHeader, onClick: function () { setOpen(!open); } },
        h('span', { style: S.cardTitle }, props.title),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          props.summary ? h('span', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#5EEAD4' } }, props.summary) : null,
          h('div', { style: { color: '#D1D5DB', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' } },
            h(Icon, { name: 'chevron', size: 16 })
          )
        )
      ),
      open ? h('div', { style: { marginTop: 12, paddingTop: 12, borderTop: '1px solid #1A2333' } }, props.children) : null
    );
  }


  /* ================================================================
     CONECTAR CONTAS — Plaid integration
     Status: pending -> connecting -> connected -> associating -> associated
     ================================================================ */
  function ConnectAccountsSection(props) {
    var userId = props.userId;

    /* Load wallets from Tracker (Supabase) */
    var walletsState = React.useState([]);
    var wallets = walletsState[0], setWallets = walletsState[1];

    React.useEffect(function() {
      function loadWallets() {
        SupabaseAPI.fetchWallets().then(function(w) {
          setWallets(w || []);
        }).catch(function(){});
      }
      loadWallets();
      window.addEventListener('wallet-renamed', loadWallets);
      return function() { window.removeEventListener('wallet-renamed', loadWallets); };
    }, [userId]);

    /* trackerAccounts = 401K + carteiras do Tracker */
    var trackerAccounts = [{ id: '401k', label: '401K Fidelity' }].concat(
      wallets.map(function(w){ return { id: w.name, label: w.name }; })
    );

    /* accounts stored in user_configs as plaidAccounts array */
    var accountsState = React.useState(props.savedAccounts || []);
    var accounts = accountsState[0], setAccounts = accountsState[1];
    var showImportState = React.useState(false);
    var showImport = showImportState[0], setShowImport = showImportState[1];

    /* Sync account names from tracker wallets */
    React.useEffect(function() {
      if (!wallets.length || !accounts.length) return;
      var needsUpdate = false;
      var synced = accounts.map(function(acc) {
        if (!acc.walletId) return acc;
        /* Find matching tracker wallet by ID or by name */
        var trackerWallet = wallets.find(function(w) {
          return w.id === acc.walletId || w.name === acc.walletId;
        });
        if (trackerWallet && trackerWallet.name !== acc.name) {
          needsUpdate = true;
          return Object.assign({}, acc, { name: trackerWallet.name });
        }
        return acc;
      });
      if (needsUpdate) {
        setAccounts(synced);
        props.onSave && props.onSave(synced);
      }
    }, [wallets]);

    /* Regrava no banco as associacoes do estado local — corrige contas com wallet_id null */
    var repairedRef = React.useRef(false);
    var repairInfoState = React.useState('');
    var repairInfo = repairInfoState[0], setRepairInfo = repairInfoState[1];
    React.useEffect(function() {
      if (repairedRef.current) return;
      if (!userId || !accounts.length) return;
      var assoc = accounts.filter(function(a) {
        return a.status === 'associated' && a.plaidAccountId && a.walletId;
      }).map(function(a) {
        return { plaidAccountId: a.plaidAccountId, walletId: a.name || a.walletId, itemId: a.plaidItemId };
      });
      if (!assoc.length) return;
      repairedRef.current = true;
      fetch('/api/plaid-wallet?action=repair', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId, accounts: assoc })
      }).then(function(r){ return r.text().then(function(t){ try { return JSON.parse(t); } catch(e) { return {}; } }); })
        .then(function(d) {
          console.log('repair:', JSON.stringify(d));
          if (d && d.failed && d.failed.length) {
            setRepairInfo(d.failed.map(function(f) {
              return f.wallet + ': ' + f.reason + (f.detail ? ' — ' + f.detail : '');
            }).join(' | '));
          }
        }).catch(function(){});
    }, [accounts, userId]);
    var loadingState = React.useState(null); // id being loaded
    var loadingId = loadingState[0], setLoadingId = loadingState[1];
    var confirmState = React.useState(null); // {type, id, msg, onOk}
    var confirmDialog = confirmState[0], setConfirmDialog = confirmState[1];
    var associatingState = React.useState(null); // account id being associated
    var associatingId = associatingState[0], setAssociatingId = associatingState[1];

    function save(next) {
      setAccounts(next);
      props.onSave && props.onSave(next);
    }

    function confirm(msg, onOk) {
      setConfirmDialog({ msg: msg, onOk: onOk });
    }

    function importAccount(wallet) {
      var already = accounts.find(function(a){ return a.walletId === wallet.id || a.name === wallet.name; });
      if (already) { alert('"' + wallet.name + '" já foi importada.'); return; }
      var newAcc = { id: Date.now().toString(), name: wallet.name, status: 'pending',
        plaidItemId: null, plaidAccounts: [], walletId: wallet.id, plaidAccountId: null };
      var updated = accounts.concat([newAcc]);
      save(updated);
      setShowImport(false);
    }

    function disconnectAccount(id) {
      var acc = accounts.find(function(a){ return a.id === id; });
      if (!acc) return;
      confirm('Desconectar "' + acc.name + '" do Plaid e remover associação?', function() {
        if (acc.plaidItemId && userId) {
          fetch('/api/plaid-wallet?action=disconnect', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId: acc.plaidItemId, userId: userId })
          }).then(function(r){ return r.text(); }).catch(function(){});
        }
        var updated = accounts.map(function(a) {
          if (a.id !== id) return a;
          return Object.assign({}, a, { status: 'pending', plaidItemId: null, plaidAccounts: [], walletId: null, plaidAccountId: null, institutionName: null });
        });
        save(updated);
        setAssociatingId(null);
      });
    }

    function syncAccount(id) {
      var acc = accounts.find(function(a){ return a.id === id; });
      if (!acc || !userId) return;
      setLoadingId(id);
      fetch('/api/plaid-wallet?action=sync-one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId, itemId: acc.plaidItemId, walletId: acc.walletId, plaidAccountId: acc.plaidAccountId })
      }).then(function(r){ return r.text().then(function(t){ try{ return JSON.parse(t); }catch(e){ return { error: 'Resposta inválida do servidor: ' + t.slice(0,100) }; } }); })
        .then(function(d){
          setLoadingId(null);
          if (d.error) {
            /* Check if it's a credential/reauth error */
            var isReauth = d.error && (d.error.indexOf('login') !== -1 || d.error.indexOf('credentials') !== -1 || d.error.indexOf('ITEM_LOGIN_REQUIRED') !== -1);
            var updated2 = accounts.map(function(a){
              if (a.id !== id) return a;
              return Object.assign({}, a, { needsReauth: isReauth, lastMsg: '⚠ ' + (isReauth ? 'Reautenticação necessária' : d.error), lastSynced: new Date().toISOString() });
            });
            save(updated2);
            return;
          }
          var result = d.result || {};
          var msg = result.action === 'created'
            ? '✓ Leitura criada: ' + formatUSD(d.balance)
            : result.action === 'updated'
            ? '✓ Leitura atualizada: ' + formatUSD(d.balance)
            : result.action === 'skipped'
            ? '— Sem alteração: ' + formatUSD(d.balance)
            : result.action === 'error'
            ? '⚠ ' + (result.error || 'Erro desconhecido')
            : '✓ Sync: ' + formatUSD(d.balance);
          var updated = accounts.map(function(a){
            if (a.id !== id) return a;
            return Object.assign({}, a, { lastBalance: d.balance, lastSynced: new Date().toISOString(), lastMsg: msg });
          });
          save(updated);
          /* Notify Tracker to reload wallet entries */
          window.dispatchEvent(new Event('plaid-sync-done'));
        }).catch(function(e){ setLoadingId(null); alert(e.message); });
    }

    function deleteAccount(id) {
      var acc = accounts.find(function(a){ return a.id === id; });
      if (!acc) return;
      var msg = acc.status === 'pending' ? 'Excluir "' + acc.name + '"?' :
                'Excluir "' + acc.name + '"? Isso vai desconectar do Plaid também.';
      confirm(msg, function() {
        /* If connected, disconnect from Plaid */
        if (acc.plaidItemId && userId) {
          fetch('/api/plaid-wallet?action=disconnect', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId: acc.plaidItemId, userId: userId })
          }).then(function(r){ return r.text(); }).catch(function(){});
        }
        save(accounts.filter(function(a){ return a.id !== id; }));
      });
    }

    function loadPlaidScript(cb) {
      if (window.Plaid) { cb(); return; }
      var s = document.createElement('script');
      s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
      s.onload = cb;
      s.onerror = function(){ alert('Erro ao carregar Plaid'); };
      document.head.appendChild(s);
    }

    function reauthAccount(id) {
      var acc = accounts.find(function(a){ return a.id === id; });
      if (!acc || !userId) return;
      setLoadingId(id);
      loadPlaidScript(function() {
        /* Get update mode link token using the existing access token */
        fetch('/api/plaid-wallet?action=reauth-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: userId, itemId: acc.plaidItemId })
        }).then(function(r){ return r.text().then(function(t){ try{ return JSON.parse(t); }catch(e){ return {}; } }); })
          .then(function(data) {
            if (!data.link_token) { setLoadingId(null); alert('Erro: ' + (data.error || 'sem link_token')); return; }
            var handler = window.Plaid.create({
              token: data.link_token,
              onSuccess: function() {
                setLoadingId(null);
                /* Clear needsReauth flag */
                var updated = accounts.map(function(a){
                  if (a.id !== id) return a;
                  return Object.assign({}, a, { needsReauth: false, lastMsg: '✓ Reautenticado com sucesso', lastSynced: new Date().toISOString() });
                });
                save(updated);
              },
              onExit: function(e){ setLoadingId(null); if (e) alert(e.display_message || ''); }
            });
            handler.open();
          }).catch(function(e){ setLoadingId(null); alert(e.message); });
      });
    }

    function connectAccount(id) {
      confirm('Conectar "' + (accounts.find(function(a){return a.id===id;})||{}).name + '" via Plaid?', function() {
        setLoadingId(id);
        loadPlaidScript(function() {
          fetch('/api/plaid-wallet?action=link-token', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userId })
          }).then(function(r){ return r.json(); })
            .then(function(data) {
              if (!data.link_token) throw new Error(data.error || 'No link_token');
              var handler = window.Plaid.create({
                token: data.link_token,
                onSuccess: function(public_token, meta) {
                  fetch('/api/plaid-wallet?action=exchange', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ public_token: public_token, institution_name: meta.institution ? meta.institution.name : null, userId: userId })
                  }).then(function(r){ return r.json(); })
                    .then(function(d) {
                      setLoadingId(null);
                      if (d.error) {
            /* Check if it's a credential/reauth error */
            var isReauth = d.error && (d.error.indexOf('login') !== -1 || d.error.indexOf('credentials') !== -1 || d.error.indexOf('ITEM_LOGIN_REQUIRED') !== -1);
            var updated2 = accounts.map(function(a){
              if (a.id !== id) return a;
              return Object.assign({}, a, { needsReauth: isReauth, lastMsg: '⚠ ' + (isReauth ? 'Reautenticação necessária' : d.error), lastSynced: new Date().toISOString() });
            });
            save(updated2);
            return;
          }
                      /* Update account with plaid data */
                      var updated = accounts.map(function(a) {
                        if (a.id !== id) return a;
                        return Object.assign({}, a, {
                          status: 'connected',
                          plaidItemId: d.item_id,
                          institutionName: d.institution_name,
                          plaidAccounts: d.accounts || []
                        });
                      });
                      save(updated);
                    }).catch(function(e){ setLoadingId(null); alert(e.message); });
                },
                onExit: function(e){ setLoadingId(null); if (e) alert(e.display_message || ''); }
              });
              handler.open();
            }).catch(function(e){ setLoadingId(null); alert(e.message); });
        });
      });
    }

    function associateAccount(id) {
      setAssociatingId(associatingId === id ? null : id);
    }

    function doAssociate(accId, plaidAccountId, walletId) {
      var targetAcc = accounts.find(function(a){ return a.id === accId; });
      /* Check if another account is already associated to this wallet */
      var existing = accounts.find(function(a) {
        return a.id !== accId && a.status === 'associated' && a.walletId === walletId;
      });
      var msg = existing
        ? '"' + existing.name + '" já está associada a "' + walletId + '". Substituir?'
        : 'Associar esta conta a "' + walletId + '"?';
      confirm(msg, function() {
        /* If replacing, clear old association */
        var updated = accounts.map(function(a) {
          if (a.id === accId) return Object.assign({}, a, { status: 'associated', walletId: walletId, plaidAccountId: plaidAccountId });
          if (existing && a.id === existing.id) return Object.assign({}, a, { status: 'connected', walletId: null, plaidAccountId: null });
          return a;
        });
        fetch('/api/plaid-wallet?action=assign', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId: accId, walletId: walletId, plaidAccountId: plaidAccountId, userId: userId, itemId: targetAcc ? targetAcc.plaidItemId : null })
        }).catch(function(){});
        save(updated);
        setAssociatingId(null);
      });
    }

    var statusDot = function(status) {
      var color = status === 'associated' ? '#00FF88' : status === 'connected' ? '#FFD700' : '#FF4444';
      return h('span', { style: { display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, marginRight: 6, flexShrink: 0 } });
    };

    return h('div', null,
      /* Confirm dialog */
      confirmDialog ? h('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 } },
        h('div', { style: { background: '#111827', borderRadius: 14, padding: 20, maxWidth: 320, width: '100%', border: '1px solid #1F2937' } },
          h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#F9FAFB', marginBottom: 16 } }, confirmDialog.msg),
          h('div', { style: { display: 'flex', gap: 8 } },
            h('button', { style: Object.assign({}, S.ghostBtn, { flex: 1 }), onClick: function(){ setConfirmDialog(null); } }, 'CANCELAR'),
            h('button', { style: Object.assign({}, S.submitBtn, { flex: 1 }), onClick: function(){ confirmDialog.onOk(); setConfirmDialog(null); } }, 'CONFIRMAR')
          )
        )
      ) : null,

      /* Accounts list */
      accounts.length === 0 ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#6B7280', padding: '8px 0', marginBottom: 8 } },
        'Nenhuma conta adicionada.'
      ) : null,

      accounts.map(function(acc) {
        var isLoading = loadingId === acc.id;
        var isAssociating = associatingId === acc.id;
        return h('div', { key: acc.id, style: { background: '#111827', borderRadius: 10, padding: 12, marginBottom: 8, border: '1px solid ' + (acc.status === 'associated' ? '#00FF88' : acc.status === 'connected' ? '#FFD700' : '#374151') } },
          /* Header */
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: acc.status !== 'pending' ? 8 : 0 } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
              statusDot(acc.status),
              h('span', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#F9FAFB', fontWeight: 600 } }, acc.name),
              (acc.status === 'connected' || acc.status === 'associated') ? h('span', {
                style: { marginLeft: 'auto', fontFamily: "'Inter', sans-serif", fontSize: 9, fontWeight: 800,
                  color: '#FFFFFF', background: '#000000', padding: '3px 8px', borderRadius: 6,
                  letterSpacing: 0.5, border: '1px solid #333' }
              }, 'plaid') : null
            ),
            h('button', { style: Object.assign({}, S.smallAddBtn, { color: '#FB7185', borderColor: '#7F1D1D' }), onClick: function(){ deleteAccount(acc.id); } },
              h(Icon, { name: 'trash', size: 12 })
            )
          ),

          /* Institution name if connected */
          (acc.institutionName || acc.walletId) ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#B0B7C3', marginBottom: 8 } },
            (acc.institutionName || 'Plaid') + (acc.walletId ? ' → ' + acc.name : '')
          ) : null,

          /* Buttons row — habilitados apenas na sequência correta */
          h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 } },
            /* REAUTENTICAR — aparece quando credencial expirou */
            acc.needsReauth ? h('button', {
              style: Object.assign({}, S.smallAddBtn, { color: '#FFD700', borderColor: '#B8860B', opacity: isLoading ? 0.6 : 1 }),
              disabled: isLoading,
              onClick: function(){ reauthAccount(acc.id); }
            }, isLoading ? 'ABRINDO...' : '⚠ REAUTENTICAR') : null,

            /* CONECTAR — só habilitado em pending */
            !acc.needsReauth ? h('button', {
              style: Object.assign({}, S.smallAddBtn, {
                color: acc.status === 'pending' ? '#FF4444' : '#00FF88',
                borderColor: acc.status === 'pending' ? '#7F1D1D' : '#00AA55',
                opacity: (isLoading || acc.status !== 'pending') ? 0.4 : 1,
                cursor: acc.status !== 'pending' ? 'default' : 'pointer'
              }),
              disabled: isLoading || acc.status !== 'pending',
              onClick: function(){ if (acc.status === 'pending') connectAccount(acc.id); }
            }, isLoading ? 'ABRINDO...' : acc.status === 'pending' ? 'CONECTAR' : '✓ CONECTADO') : null,

            /* ASSOCIAR — só habilitado em connected */
            h('button', {
              style: Object.assign({}, S.smallAddBtn, {
                color: acc.status === 'associated' ? '#00FF88' : acc.status === 'connected' ? '#FFD700' : '#4B5563',
                borderColor: acc.status === 'associated' ? '#00AA55' : acc.status === 'connected' ? '#B8860B' : '#1F2937',
                opacity: acc.status === 'connected' ? 1 : 0.4,
                cursor: acc.status === 'connected' ? 'pointer' : 'default'
              }),
              disabled: acc.status !== 'connected',
              onClick: function(){ if (acc.status === 'connected') associateAccount(acc.id); }
            }, acc.status === 'associated' ? (isAssociating ? 'FECHAR' : '✓ ASSOCIADO') : (isAssociating ? 'FECHAR' : 'ASSOCIAR')),

            /* DESCONECTAR — só habilitado em associated */
            h('button', {
              style: Object.assign({}, S.smallAddBtn, {
                color: acc.status === 'associated' ? '#FF4444' : '#4B5563',
                borderColor: acc.status === 'associated' ? '#CC0000' : '#1F2937',
                opacity: acc.status === 'associated' ? 1 : 0.4,
                cursor: acc.status === 'associated' ? 'pointer' : 'default'
              }),
              disabled: acc.status !== 'associated',
              onClick: function(){ if (acc.status === 'associated') disconnectAccount(acc.id); }
            }, 'DESCONECTAR'),

            /* SYNC — só habilitado em associated */
            h('button', {
              style: Object.assign({}, S.smallAddBtn, {
                color: acc.status === 'associated' ? '#00FFD1' : '#4B5563',
                borderColor: acc.status === 'associated' ? '#00AA8A' : '#1F2937',
                opacity: (acc.status === 'associated' && loadingId !== acc.id) ? 1 : 0.4,
                cursor: acc.status === 'associated' ? 'pointer' : 'default'
              }),
              disabled: acc.status !== 'associated' || loadingId === acc.id,
              onClick: function(){ if (acc.status === 'associated') syncAccount(acc.id); }
            }, loadingId === acc.id ? '...' : '↻ SYNC')
          ),

          /* Last sync info */
          acc.status === 'associated' && acc.lastSynced ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#D1D5DB', marginTop: 6, padding: '4px 8px', background: '#0F2D2A', borderRadius: 6 } },
            (acc.lastMsg || ('↻ ' + formatUSD(acc.lastBalance))) + ' · ' + new Date(acc.lastSynced).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
          ) : null,

          /* Association panel */
          isAssociating ? h('div', { style: { marginTop: 10, borderTop: '1px solid #1F2937', paddingTop: 10 } },
            h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#B0B7C3', marginBottom: 8 } },
              'Selecione a conta Plaid e a conta do app:'
            ),
            /* Plaid accounts from this item — always show for selection */
            acc.plaidAccounts && acc.plaidAccounts.length > 0 ? h('div', { style: { marginBottom: 8 } },
              h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#9CA3AF', marginBottom: 4 } }, 'CONTA PLAID:'),
              acc.plaidAccounts.map(function(pa) {
                return h('button', {
                  key: pa.account_id,
                  style: {
                    display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', marginBottom: 4,
                    borderRadius: 8, border: '1px solid', cursor: 'pointer',
                    borderColor: acc.plaidAccountId === pa.account_id ? '#5EEAD4' : '#1F2937',
                    background: acc.plaidAccountId === pa.account_id ? '#0F2D2A' : '#0D1117',
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                    color: acc.plaidAccountId === pa.account_id ? '#5EEAD4' : '#D1D5DB'
                  },
                  onClick: function() {
                    var updated = accounts.map(function(a){ return a.id === acc.id ? Object.assign({}, a, { plaidAccountId: pa.account_id }) : a; });
                    setAccounts(updated);
                  }
                }, pa.name + ' · ' + formatUSD(pa.balance || 0));
              })
            ) : null,
            /* Tracker accounts */
            h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#9CA3AF', marginBottom: 4 } }, 'ASSOCIAR A:'),
            trackerAccounts.length === 0 ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#FB7185', padding: '6px 0' } },
              'Nenhuma carteira encontrada. Verifique a seção FUNDOS no CONFIG.'
            ) : null,
            trackerAccounts.map(function(ta) {
              return h('button', {
                key: ta.id,
                style: {
                  display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', marginBottom: 4,
                  borderRadius: 8, border: '1px solid', cursor: 'pointer',
                  borderColor: '#1F2937', background: '#0D1117',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#D1D5DB'
                },
                onClick: function() {
                  var plaidAccId = acc.plaidAccountId || (acc.plaidAccounts && acc.plaidAccounts.length > 0 ? acc.plaidAccounts[0].account_id : null);
                  if (!plaidAccId) { alert('Selecione a conta Plaid acima primeiro'); return; }
                  doAssociate(acc.id, plaidAccId, ta.id);
                }
              }, ta.label);
            })
          ) : null
        );
      }),

      /* Add account button */
      showImport
        ? h('div', { style: { marginTop: 8, background: '#111827', borderRadius: 10, padding: 12, border: '1px solid #1F2937' } },
            h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#B0B7C3', marginBottom: 10 } },
              'Selecione uma conta do Tracker:'
            ),
            wallets.filter(function(w){
              return !accounts.find(function(a){ return a.walletId === w.id || a.name === w.name; });
            }).length === 0
              ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#6B7280', marginBottom: 8 } },
                  'Todas as contas já foram importadas.'
                )
              : wallets.filter(function(w){
                  return !accounts.find(function(a){ return a.walletId === w.id || a.name === w.name; });
                }).map(function(w) {
                  return h('button', {
                    key: w.id,
                    style: { display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px',
                      marginBottom: 6, borderRadius: 8, border: '1px solid #1F2937',
                      background: '#0D1117', cursor: 'pointer',
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#D1D5DB' },
                    onClick: function(){ importAccount(w); }
                  },
                    h('span', { style: { color: w.category === 'retirement' ? '#5EEAD4' : '#9CA3AF', marginRight: 6 } },
                      w.category === 'retirement' ? '◆' : '◇'
                    ),
                    w.name
                  );
                }),
            h('button', { style: Object.assign({}, S.ghostBtn, { width: '100%', marginTop: 4 }),
              onClick: function(){ setShowImport(false); }
            }, 'CANCELAR')
          )
        : h('button', { style: Object.assign({}, S.addBtn, { width: '100%', justifyContent: 'center', marginTop: 4 }),
            onClick: function(){ setShowImport(true); }
          },
            h(Icon, { name: 'plus', size: 14 }), 'IMPORTAR CONTA'
          ),
      repairInfo ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#FF6B81', marginTop: 8, padding: '6px 8px', background: '#2A0F14', borderRadius: 6, wordBreak: 'break-word' } }, '\u26a0 ' + repairInfo) : null
    );
  }

  function ConfigTab() {
    var cfgState = React.useState(loadJSON(KEY_PAYCHECK, defaultPaycheckConfig));
    var cfg = cfgState[0], setCfg = cfgState[1];

    var projCfgState = React.useState(loadJSON(KEY_PROJECTION, defaultProjectionConfig));
    var projCfg = projCfgState[0], setProjCfg = projCfgState[1];

    var syncState = React.useState('idle'); // 'idle' | 'syncing' | 'synced' | 'offline'
    var syncStatus = syncState[0], setSyncStatus = syncState[1];

    /* Carrega config do Supabase ao montar */
    React.useEffect(function () {
      var cancelled = false;
      setSyncStatus('syncing');
      SupabaseAPI.fetchUserConfig().then(function (remote) {
        if (cancelled) return;
        if (remote && Object.keys(remote).length > 0) {
          var merged = Object.assign({}, defaultPaycheckConfig, remote);
          setCfg(merged);
          saveJSON(KEY_PAYCHECK, merged);
          /* Sincroniza fundos e horizons com projCfg também */
          if (remote.funds) {
            var mergedProj = Object.assign({}, loadJSON(KEY_PROJECTION, defaultProjectionConfig), { funds: remote.funds });
            setProjCfg(mergedProj);
            saveJSON(KEY_PROJECTION, mergedProj);
          }
        }
        setSyncStatus('synced');
      }).catch(function () {
        if (!cancelled) setSyncStatus('offline');
      });
      return function () { cancelled = true; };
    }, []);

    function update(field, value) {
      var next = Object.assign({}, cfg);
      next[field] = value;
      setCfg(next);
      saveJSON(KEY_PAYCHECK, next);
      clearTimeout(window._configSaveTimer);
      window._configSaveTimer = setTimeout(function () {
        setSyncStatus('syncing');
        SupabaseAPI.saveUserConfig(next).then(function () {
          setSyncStatus('synced');
        }).catch(function () {
          setSyncStatus('offline');
        });
      }, 800);
    }

    function updateProj(field, value) {
      var next = Object.assign({}, projCfg);
      next[field] = value;
      setProjCfg(next);
      saveJSON(KEY_PROJECTION, next);
      /* Se for fundos, salva no Supabase também (dentro de user_configs) */
      if (field === 'funds') {
        clearTimeout(window._configSaveTimer);
        window._configSaveTimer = setTimeout(function () {
          SupabaseAPI.fetchUserConfig().then(function (remote) {
            var merged = Object.assign({}, remote || {}, { funds: value });
            return SupabaseAPI.saveUserConfig(merged);
          }).catch(function () {});
        }, 800);
      }
    }

    function updatePreTaxItem(key, value) {
      var items = (cfg.preTaxItems || []).map(function (it) {
        return it.key === key ? Object.assign({}, it, { value: parseFloat(value) || 0 }) : it;
      });
      update('preTaxItems', items);
    }

    function updatePostTaxItem(key, value) {
      var items = (cfg.postTaxItems || []).map(function (it) {
        return it.key === key ? Object.assign({}, it, { value: parseFloat(value) || 0 }) : it;
      });
      update('postTaxItems', items);
    }

    function sortTiers(tiers) {
      return tiers.slice().sort(function (a, b) {
        function tierVal(yos) {
          if (!yos) return 999;
          if (String(yos).indexOf('+') !== -1) return 11;
          var n = parseInt(String(yos).split('-')[0], 10);
          return isNaN(n) ? 999 : n;
        }
        return tierVal(a.yos) - tierVal(b.yos);
      });
    }

    function updateTiers(next) {
      var sorted = sortTiers(next);
      /* Mantém a faixa selecionada pelo nome após reordenar */
      var currentYos = salaryTiers[currentYosIndex] ? salaryTiers[currentYosIndex].yos : null;
      var newIdx = currentYos
        ? sorted.findIndex(function (t) { return t.yos === currentYos; })
        : currentYosIndex;
      if (newIdx < 0) newIdx = 0;
      /* Atualiza os dois campos de uma vez para evitar conflito de estado */
      var next2 = Object.assign({}, cfg, { salaryTiers: sorted, currentYosIndex: newIdx });
      setCfg(next2);
      saveJSON(KEY_PAYCHECK, next2);
      clearTimeout(window._configSaveTimer);
      window._configSaveTimer = setTimeout(function () {
        setSyncStatus('syncing');
        SupabaseAPI.saveUserConfig(next2).then(function () {
          setSyncStatus('synced');
        }).catch(function () { setSyncStatus('offline'); });
      }, 800);
    }

    function updateTierRate(idx, value) {
      var tiers = getSalaryTiers(cfg).map(function (t, i) {
        return i === idx ? Object.assign({}, t, { rate: value }) : t;
      });
      update('salaryTiers', tiers);
    }

    function setCurrentTier(idx) {
      var rate = salaryTiers[idx] ? salaryTiers[idx].rate : cfg.baseRate;
      var next = Object.assign({}, cfg, { currentYosIndex: idx, baseRate: rate });
      setCfg(next);
      saveJSON(KEY_PAYCHECK, next);
      clearTimeout(window._configSaveTimer);
      window._configSaveTimer = setTimeout(function () {
        setSyncStatus('syncing');
        SupabaseAPI.saveUserConfig(next).then(function () {
          setSyncStatus('synced');
        }).catch(function () { setSyncStatus('offline'); });
      }, 800);
    }

    function resetAll() {
      setCfg(defaultPaycheckConfig);
      saveJSON(KEY_PAYCHECK, defaultPaycheckConfig);
      setSyncStatus('syncing');
      SupabaseAPI.saveUserConfig(defaultPaycheckConfig).then(function () {
        setSyncStatus('synced');
      }).catch(function () { setSyncStatus('offline'); });
    }

    var salaryTiers = getSalaryTiers(cfg);
    var currentYosIndex = getCurrentYosIndex(cfg);

    var preTaxItems = cfg.preTaxItems || defaultPaycheckConfig.preTaxItems;
    var postTaxItems = cfg.postTaxItems || defaultPaycheckConfig.postTaxItems;

    var totalContribPct = num(cfg.contrib401kPct, 4) + num(cfg.matchLimitPct, 4) + num(cfg.profitSharingPct, 5);
    var totalPreTax = preTaxItems.reduce(function (s, i) { return s + num(i.value); }, 0);
    var totalPostTax = postTaxItems.reduce(function (s, i) { return s + num(i.value); }, 0);

    var syncBadge;
    if (syncStatus === 'syncing') syncBadge = h('span', { style: { color: '#B0B7C3' } }, 'SALVANDO...');
    else if (syncStatus === 'synced') syncBadge = h('span', { style: { color: '#5EEAD4' } }, '☁ SALVO');
    else if (syncStatus === 'offline') syncBadge = h('span', { style: { color: '#FBBF24' } }, '⚠ OFFLINE');

    var yos = calcYOS(cfg.seniorityDate);
    var suggestedIdx = suggestTierIndex(yos, salaryTiers);
    var suggestedTier = salaryTiers[suggestedIdx];

    return h(React.Fragment, null,
      h('div', { style: { textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: 1, margin: '8px 0 -4px' } }, syncBadge),

      /* ---- SENIORITY ---- */
      h(Section, { title: 'SENIORITY', defaultOpen: true,
        summary: yos !== null ? yos + ' ano' + (yos !== 1 ? 's' : '') + ' de empresa' : 'informe a data'
      },
        h('div', { style: S.formRow },
          h('label', { style: S.formLabel }, 'DATA DE CONTRATAÇÃO'),
          h('input', {
            type: 'date', value: cfg.seniorityDate || '', style: S.input,
            onChange: function (ev) {
              var newDate = ev.target.value;
              var newYos = calcYOS(newDate);
              var newIdx = suggestTierIndex(newYos, salaryTiers);
              update('seniorityDate', newDate);
              /* Atualiza automaticamente a faixa salarial e a taxa base */
              if (newIdx !== currentYosIndex) {
                update('currentYosIndex', newIdx);
                update('baseRate', salaryTiers[newIdx].rate);
              }
            }
          })
        ),
        yos !== null ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, marginTop: 8 } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 4 } },
            h('span', { style: { color: '#D1D5DB' } }, 'ANOS DE SERVIÇO (YOS)'),
            h('span', { style: { color: '#5EEAD4', fontWeight: 700 } }, yos + ' ano' + (yos !== 1 ? 's' : ''))
          ),
          h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 4 } },
            h('span', { style: { color: '#D1D5DB' } }, 'FAIXA ATUAL'),
            h('span', { style: { color: '#5EEAD4', fontWeight: 700 } }, suggestedTier ? suggestedTier.yos + ' anos · ' + formatUSD(suggestedTier.rate) + '/h' : '—')
          ),
          h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#B0B7C3', marginTop: 6 } },
            'Faixa e taxa base atualizadas automaticamente com base na data de contratação.'
          )
        ) : h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#B0B7C3', marginTop: 4 } },
          'Informe a data de contratação para calcular YOS e selecionar a faixa salarial automaticamente.'
        )
      ),
      h(Section, { title: 'SALÁRIO & DIFERENCIAIS', summary: formatUSD(num(cfg.baseRate, 23.28)) + '/h' },
        h(NumField, { label: 'TAXA BASE ($/h)', value: cfg.baseRate, onChange: function (v) { update('baseRate', v); } }),
        h(NumField, { label: 'SHIFT 2 REG DIFF ($/h)', value: cfg.shift2RegDiff, onChange: function (v) { update('shift2RegDiff', v); } }),
        h(NumField, { label: 'SHIFT 2 OT DIFF ($/h) — OT1.5, WRK-HOL, LUNCH-P', value: cfg.shift2OtDiff, onChange: function (v) { update('shift2OtDiff', v); } }),
        h(NumField, { label: 'SHIFT 2 DT DIFF ($/h) — OT2.0 (Double Time)', value: cfg.shift2Ot2Diff, onChange: function (v) { update('shift2Ot2Diff', v); } })
      ),

      /* ---- 401K ---- */
      h(Section, { title: '401K', summary: totalContribPct + '%' },
        h(NumField, { label: 'MINHA CONTRIBUIÇÃO (%)', value: cfg.contrib401kPct, onChange: function (v) { update('contrib401kPct', v); } }),
        h(NumField, { label: 'MATCH AA — LIMITE (%)', value: cfg.matchLimitPct, onChange: function (v) { update('matchLimitPct', v); } }),
        h(NumField, { label: '401K AA CONTRIB (%)', value: cfg.profitSharingPct, onChange: function (v) { update('profitSharingPct', v); } }),
        h('div', { style: Object.assign({}, S.totalRow, { marginTop: 8 }) },
          h('span', null, 'TOTAL CONTRIBUIÇÃO'),
          h('span', { style: { color: '#5EEAD4', fontWeight: 700 } }, totalContribPct + '%')
        )
      ),

      /* ---- IMPOSTOS ---- */
      h(Section, { title: 'IMPOSTOS', defaultOpen: false },
        h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#5EEAD4', marginBottom: 10, padding: '6px 10px', background: '#0F2D2A', borderRadius: 6 } },
          '✓ Alíquotas atualizadas automaticamente ao importar PDF'
        ),
        h(NumField, { label: 'SOCIAL SECURITY (%)', value: cfg.ssRatePct, onChange: function (v) { update('ssRatePct', v); } }),
        h(NumField, { label: 'MEDICARE (%)', value: cfg.medicareRatePct, onChange: function (v) { update('medicareRatePct', v); } }),
        h(NumField, { label: 'FEDERAL WITHHOLDING — % EFETIVO', value: cfg.fedWithholdingPct, onChange: function (v) { update('fedWithholdingPct', v); } }),
        h(NumField, { label: 'EER GROSS-UP (imputed income)', value: cfg.imputedEerGrossUp, onChange: function (v) { update('imputedEerGrossUp', v); } }),
        h(NumField, { label: 'GROUP TERM LIFE (imputed income)', value: cfg.imputedGtl, onChange: function (v) { update('imputedGtl', v); } }),
        h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#D1D5DB', marginTop: 4 } },
          'O federal withholding efetivo varia com o gross. Ajuste se o valor calculado diferir do holerite real.'
        )
      ),

      /* ---- DEDUÇÕES PRÉ-TAX ---- */
      h(Section, { title: 'DEDUÇÕES PRÉ-TAX', summary: formatUSD(totalPreTax), defaultOpen: false },
        h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#B0B7C3', marginBottom: 10, lineHeight: 1.6 } },
          'Medical, Dental, Vision, AD&D etc. — adicione ou remova conforme seus benefícios ativos.'
        ),
        preTaxItems.map(function (item, i) {
          return h('div', { key: item.key || i, style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 } },
            h('input', {
              type: 'text', value: item.label, placeholder: 'Nome do benefício',
              style: Object.assign({}, S.input, { flex: 1, fontSize: 11 }),
              onChange: function (ev) {
                var next = preTaxItems.map(function (it, j) { return j === i ? Object.assign({}, it, { label: ev.target.value }) : it; });
                update('preTaxItems', next);
              }
            }),
            h('input', {
              type: 'number', step: '0.01', value: item.value, placeholder: '0.00',
              style: Object.assign({}, S.input, { width: 80, textAlign: 'right', flexShrink: 0 }),
              onChange: function (ev) {
                var next = preTaxItems.map(function (it, j) { return j === i ? Object.assign({}, it, { value: parseFloat(ev.target.value) || 0 }) : it; });
                update('preTaxItems', next);
              }
            }),
            h('button', { style: S.deleteBtn, onClick: function () {
              update('preTaxItems', preTaxItems.filter(function (_, j) { return j !== i; }));
            }}, h(Icon, { name: 'trash', size: 13 }))
          );
        }),
        h('div', { style: Object.assign({}, S.totalRow, { borderTop: '1px solid #1A2333', paddingTop: 8, marginTop: 4 }) },
          h('span', null, 'TOTAL'), h('span', { style: { color: '#5EEAD4' } }, formatUSD(totalPreTax))
        ),
        h('button', {
          style: Object.assign({}, S.addBtn, { marginTop: 10, width: '100%', justifyContent: 'center' }),
          onClick: function () {
            update('preTaxItems', preTaxItems.concat([{ key: 'pre_' + Date.now(), label: '', value: 0 }]));
          }
        }, h(Icon, { name: 'plus', size: 14 }), 'ADICIONAR DEDUÇÃO PRÉ-TAX'),
        h('button', { style: Object.assign({}, S.ghostBtn, { marginTop: 6 }), onClick: function () {
          update('preTaxItems', defaultPaycheckConfig.preTaxItems);
        }}, h(Icon, { name: 'reset', size: 12 }), 'RESTAURAR PADRÃO')
      ),

      /* ---- DEDUÇÕES PÓS-TAX ---- */
      h(Section, { title: 'DEDUÇÕES PÓS-TAX', summary: formatUSD(totalPostTax), defaultOpen: false },
        h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#B0B7C3', marginBottom: 10, lineHeight: 1.6 } },
          'Life Insurance, 401k Loan, Union Dues etc. — adicione ou remova conforme seus descontos ativos.'
        ),
        postTaxItems.map(function (item, i) {
          return h('div', { key: item.key || i, style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 } },
            h('input', {
              type: 'text', value: item.label, placeholder: 'Nome do desconto',
              style: Object.assign({}, S.input, { flex: 1, fontSize: 11 }),
              onChange: function (ev) {
                var next = postTaxItems.map(function (it, j) { return j === i ? Object.assign({}, it, { label: ev.target.value }) : it; });
                update('postTaxItems', next);
              }
            }),
            h('input', {
              type: 'number', step: '0.01', value: item.value, placeholder: '0.00',
              style: Object.assign({}, S.input, { width: 80, textAlign: 'right', flexShrink: 0 }),
              onChange: function (ev) {
                var next = postTaxItems.map(function (it, j) { return j === i ? Object.assign({}, it, { value: parseFloat(ev.target.value) || 0 }) : it; });
                update('postTaxItems', next);
              }
            }),
            h('button', { style: S.deleteBtn, onClick: function () {
              update('postTaxItems', postTaxItems.filter(function (_, j) { return j !== i; }));
            }}, h(Icon, { name: 'trash', size: 13 }))
          );
        }),
        h('div', { style: Object.assign({}, S.totalRow, { borderTop: '1px solid #1A2333', paddingTop: 8, marginTop: 4 }) },
          h('span', null, 'TOTAL'), h('span', { style: { color: '#5EEAD4' } }, formatUSD(totalPostTax))
        ),
        h('button', {
          style: Object.assign({}, S.addBtn, { marginTop: 10, width: '100%', justifyContent: 'center' }),
          onClick: function () {
            update('postTaxItems', postTaxItems.concat([{ key: 'post_' + Date.now(), label: '', value: 0 }]));
          }
        }, h(Icon, { name: 'plus', size: 14 }), 'ADICIONAR DEDUÇÃO PÓS-TAX'),
        h('button', { style: Object.assign({}, S.ghostBtn, { marginTop: 6 }), onClick: function () {
          update('postTaxItems', defaultPaycheckConfig.postTaxItems);
        }}, h(Icon, { name: 'reset', size: 12 }), 'RESTAURAR PADRÃO')
      ),

      /* ---- PROJEÇÃO 401K — Fundos ---- */
      h(Section, { title: 'PROJEÇÃO 401K — FUNDOS', defaultOpen: false,
        summary: (function () {
          var funds = projCfg.funds || [];
          var totalAlloc = funds.reduce(function (s, f) { return s + num(f.allocPct); }, 0);
          var blended = funds.reduce(function (s, f) { return s + (num(f.allocPct) / (totalAlloc || 1)) * num(f.returnPct); }, 0);
          return totalAlloc.toFixed(1) + '% · retorno pond. ' + blended.toFixed(2) + '%';
        })()
      },
        h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#B0B7C3', marginBottom: 12, lineHeight: 1.6 } },
          'Cada fundo precisa ter a participação (% do total aportado) e o retorno anual histórico (lâmina do fundo). A soma das participações deve ser 100%.'
        ),

        (function () {
          var funds = projCfg.funds || [];
          var totalAlloc = funds.reduce(function (s, f) { return s + num(f.allocPct); }, 0);
          var blended = funds.length && totalAlloc > 0
            ? funds.reduce(function (s, f) { return s + (num(f.allocPct) / totalAlloc) * num(f.returnPct); }, 0)
            : 0;

          return h('div', null,
            funds.map(function (fund, i) {
              return h('div', { key: fund.id, style: { background: '#0B1120', borderRadius: 10, padding: 12, marginBottom: 8, border: '1px solid #1F2937' } },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
                  h('input', {
                    type: 'text', value: fund.name,
                    placeholder: 'Nome do fundo',
                    style: Object.assign({}, S.input, { flex: 1, marginRight: 8, fontSize: 11 }),
                    onChange: function (ev) {
                      var next = funds.map(function (f, j) { return j === i ? Object.assign({}, f, { name: ev.target.value }) : f; });
                      updateProj('funds', next);
                    }
                  }),
                  h('button', { style: Object.assign({}, S.deleteBtn, { flexShrink: 0 }), onClick: function () {
                    var next = funds.filter(function (_, j) { return j !== i; });
                    updateProj('funds', next);
                  }}, h(Icon, { name: 'trash', size: 13 }))
                ),
                h('div', { style: { display: 'flex', gap: 10 } },
                  h('div', { style: { flex: 1 } },
                    h('label', { style: S.formLabel }, 'PARTICIPAÇÃO (%)'),
                    h('input', {
                      type: 'number', step: '0.01', value: fund.allocPct,
                      style: S.input,
                      onChange: function (ev) {
                        var next = funds.map(function (f, j) { return j === i ? Object.assign({}, f, { allocPct: parseFloat(ev.target.value) || 0 }) : f; });
                        updateProj('funds', next);
                      }
                    })
                  ),
                  h('div', { style: { flex: 1 } },
                    h('label', { style: S.formLabel }, 'RETORNO ANUAL (%)'),
                    h('input', {
                      type: 'number', step: '0.01', value: fund.returnPct,
                      style: S.input,
                      onChange: function (ev) {
                        var next = funds.map(function (f, j) { return j === i ? Object.assign({}, f, { returnPct: parseFloat(ev.target.value) || 0 }) : f; });
                        updateProj('funds', next);
                      }
                    })
                  )
                )
              );
            }),

            /* Total e retorno ponderado */
            h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, borderTop: '1px solid #1A2333', paddingTop: 10, marginTop: 4, display: 'flex', justifyContent: 'space-between' } },
              h('span', { style: { color: totalAlloc > 100.1 || totalAlloc < 99.9 && funds.length > 0 ? '#FB7185' : '#5EEAD4' } },
                'TOTAL PARTICIPAÇÃO: ' + totalAlloc.toFixed(2) + '%' + (Math.abs(totalAlloc - 100) > 0.1 && funds.length > 0 ? ' ⚠ deve ser 100%' : '')
              ),
              h('span', { style: { color: '#D1D5DB' } }, 'RETORNO POND.: ' + blended.toFixed(2) + '%')
            ),

            /* Botão adicionar fundo */
            h('button', {
              style: Object.assign({}, S.addBtn, { marginTop: 12, width: '100%', justifyContent: 'center' }),
              onClick: function () {
                var next = funds.concat([{ id: 'f' + Date.now(), name: '', allocPct: 0, returnPct: 0 }]);
                updateProj('funds', next);
              }
            }, h(Icon, { name: 'plus', size: 14 }), 'ADICIONAR FUNDO'),

            /* Reset */
            h('button', { style: Object.assign({}, S.ghostBtn, { marginTop: 8 }), onClick: function () {
              updateProj('funds', defaultProjectionConfig.funds);
            }}, h(Icon, { name: 'reset', size: 12 }), 'RESTAURAR PADRÃO')
          );
        })()
      ),

      /* ---- PROGRESSÃO SALARIAL ---- */
      h(Section, { title: 'PROGRESSÃO SALARIAL (FLEET SERVICE/RAMP)', defaultOpen: false },
        h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#B0B7C3', marginBottom: 12, lineHeight: 1.6 } },
          'Toque no badge da faixa para marcá-la como sua posição atual. Adicione ou remova faixas conforme a tabela oficial da AA.'
        ),
        salaryTiers.map(function (t, i) {
          var isCurrent = i === currentYosIndex;
          return h('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
            h('button', {
              style: Object.assign({}, S.tierBadge, isCurrent ? {} : { background: '#1F2937', color: '#D1D5DB' }, { cursor: 'pointer', border: 'none', flexShrink: 0, width: 52, fontSize: 9 }),
              onClick: function () { setCurrentTier(i); }
            }, t.yos + 'a'),
            h('input', {
              type: 'text', value: t.yos, placeholder: 'ex: 3-4',
              style: Object.assign({}, S.input, { width: 56, flexShrink: 0, fontSize: 11 }),
              onBlur: function (ev) {
                /* Reordena ao sair do campo de faixa */
                var next = salaryTiers.map(function (s, j) { return j === i ? Object.assign({}, s, { yos: ev.target.value }) : s; });
                updateTiers(next);
              },
              onChange: function (ev) {
                /* Atualiza valor sem reordenar enquanto digita */
                var next = salaryTiers.map(function (s, j) { return j === i ? Object.assign({}, s, { yos: ev.target.value }) : s; });
                update('salaryTiers', next);
              }
            }),
            h('input', {
              type: 'number', step: '0.01', value: t.rate,
              style: Object.assign({}, S.input, { flex: 1 }),
              onChange: function (ev) {
                var next = salaryTiers.map(function (s, j) { return j === i ? Object.assign({}, s, { rate: parseFloat(ev.target.value) || 0 }) : s; });
                update('salaryTiers', next);
              }
            }),
            h('span', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#D1D5DB', flexShrink: 0 } }, '/h'),
            h('button', { style: S.deleteBtn, onClick: function () {
              var next = salaryTiers.filter(function (_, j) { return j !== i; });
              updateTiers(next);
            }}, h(Icon, { name: 'trash', size: 13 }))
          );
        }),
        h('button', {
          style: Object.assign({}, S.addBtn, { marginTop: 10, width: '100%', justifyContent: 'center' }),
          onClick: function () {
            /* Nova faixa vai pro final e reordena */
            updateTiers(salaryTiers.concat([{ yos: '', rate: 0 }]));
          }
        }, h(Icon, { name: 'plus', size: 14 }), 'ADICIONAR FAIXA'),
        h('div', { style: { display: 'flex', gap: 8, marginTop: 6 } },
          h('button', { style: Object.assign({}, S.ghostBtn, { flex: 1 }), onClick: function () {
            updateTiers(salaryTiers);
          }}, h(Icon, { name: 'chart', size: 12 }), 'ORDENAR'),
          h('button', { style: Object.assign({}, S.ghostBtn, { flex: 1 }), onClick: function () {
            update('salaryTiers', DEFAULT_SALARY_TIERS);
            update('currentYosIndex', 0);
          }}, h(Icon, { name: 'reset', size: 12 }), 'RESTAURAR PADRÃO')
        )
      ),

      /* ---- CONECTAR CONTAS ---- */
      h(Section, { title: 'CONECTAR CONTAS', defaultOpen: false },
        h(ConnectAccountsSection, {
          userId: window.currentUserId ? window.currentUserId() : null,
          savedAccounts: cfg.plaidAccounts || [],
          onSave: function(next) {
            update('plaidAccounts', next);
          }
        })
      ),

      /* ---- RESET GERAL ---- */
      h('div', { style: S.card },
        h('div', { style: S.cardHeader }, h('span', { style: S.cardTitle }, 'RESTAURAR TUDO')),
        h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#B0B7C3', marginBottom: 12 } },
          'Volta todos os parâmetros para os valores padrão da AA (Shift 2, 2023+). Não afeta seus dados de pagamentos, leituras ou carteiras.'
        ),
        h('button', { style: Object.assign({}, S.addBtn, { color: '#FB7185', borderColor: '#7F1D1D' }), onClick: resetAll },
          h(Icon, { name: 'reset', size: 14 }), 'RESTAURAR PADRÕES'
        )
      ),

      h('div', { style: S.footer }, 'PARÂMETROS SALVOS NA NUVEM · SINCRONIZADO ENTRE APARELHOS')
    );
  }

  window.ConfigTab = ConfigTab;
})();
