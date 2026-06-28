/* =========================================================
   TAB 1: TRACKER DE SALDO
   ========================================================= */
(function () {
  'use strict';
  var h = React.createElement;

  /* ---------- Carteiras de investimento (Robinhood, Crypto.com, etc.) ---------- */

  function loadCachedWallets() {
    try {
      var raw = window.__dbCache[KEY_WALLETS];
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  }

  function loadCachedWalletEntries() {
    try {
      var raw = window.__dbCache[KEY_WALLET_ENTRIES];
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  }

  function WalletCard(props) {
    var wallet = props.wallet;
    var entries = props.entries; // já filtradas para esta carteira, ordenadas asc
    var onAddEntry = props.onAddEntry;
    var onDeleteEntry = props.onDeleteEntry;
    var onDeleteWallet = props.onDeleteWallet;

    var expandState = React.useState(false);
    var expanded = expandState[0], setExpanded = expandState[1];

    var formState = React.useState(false);
    var showForm = formState[0], setShowForm = formState[1];

    var dateState = React.useState('');
    var newDate = dateState[0], setNewDate = dateState[1];

    var balState = React.useState('');
    var newBalance = balState[0], setNewBalance = balState[1];

    var errState = React.useState('');
    var error = errState[0], setError = errState[1];

    var savingState = React.useState(false);
    var saving = savingState[0], setSaving = savingState[1];

    var latest = entries.length ? entries[entries.length - 1] : null;
    var first = entries.length ? entries[0] : null;
    var prev = entries.length > 1 ? entries[entries.length - 2] : null;
    var totalChange = (latest && first) ? latest.balance - first.balance : 0;
    var dayChange = (latest && prev) ? latest.balance - prev.balance : 0;

    var chartData = entries.map(function (e) {
      return { label: formatDateLabel(e.date), value: e.balance };
    });

    function handleAdd() {
      setError('');
      if (!newDate) { setError('Selecione uma data.'); return; }
      var bal = parseFloat(newBalance);
      if (!newBalance || isNaN(bal)) { setError('Informe um valor válido.'); return; }
      setSaving(true);
      onAddEntry(wallet.id, newDate, bal, function (ok, msg) {
        setSaving(false);
        if (ok) {
          setNewDate('');
          setNewBalance('');
          setShowForm(false);
        } else {
          setError(msg || 'Falha ao salvar.');
        }
      });
    }

    var rows = entries.slice().reverse().map(function (e, idx) {
      var sortedIdx = entries.length - 1 - idx;
      var prevEntry = sortedIdx > 0 ? entries[sortedIdx - 1] : null;
      var diff = prevEntry ? e.balance - prevEntry.balance : 0;
      return h('div', { key: e.id, style: S.entryRow },
        h('div', { style: S.entryDate }, formatDateLabel(e.date)),
        h('div', { style: S.entryBalance }, formatUSD(e.balance)),
        h('div', { style: Object.assign({}, S.entryDiff, { color: !prevEntry ? '#6B7280' : (diff >= 0 ? '#5EEAD4' : '#FB7185') }) },
          prevEntry ? ((diff >= 0 ? '+' : '') + formatUSD(diff)) : 'BASE'),
        h('button', { style: S.deleteBtn, onClick: function () { onDeleteEntry(e.id); } }, h(Icon, { name: 'trash', size: 13 }))
      );
    });

    return h('div', { style: S.card },
      h('div', { style: S.walletCardHeader, onClick: function () { setExpanded(!expanded); } },
        h('div', { style: S.walletHeaderLeft },
          h(Icon, { name: 'wallet', size: 15, color: '#5EEAD4' }),
          h('div', null,
            h('div', { style: S.walletName }, wallet.name),
            h('div', { style: S.walletMeta }, latest ? (formatDateLabel(latest.date) + ' · ' + entries.length + ' leitura' + (entries.length > 1 ? 's' : '')) : 'SEM LEITURAS')
          )
        ),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          h('div', { style: { textAlign: 'right' } },
            h('div', { style: S.walletBalance }, latest ? formatUSD(latest.balance) : '—'),
            latest && prev ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: dayChange >= 0 ? '#5EEAD4' : '#FB7185' } }, (dayChange >= 0 ? '+' : '') + formatUSD(dayChange)) : null
          ),
          h(Icon, { name: 'chevron', size: 14, color: '#4B5563' })
        )
      ),

      expanded ? h('div', { style: S.walletBody },
        entries.length > 1 ? h(MiniChart, { data: chartData }) : null,

        latest && first && entries.length > 1 ? h('div', { style: { display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#6B7280', margin: '8px 0 12px' } },
          h('span', null, 'DESDE O INÍCIO'),
          h('span', { style: { color: totalChange >= 0 ? '#5EEAD4' : '#FB7185', fontWeight: 600 } }, (totalChange >= 0 ? '+' : '') + formatUSD(totalChange))
        ) : null,

        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
          h('span', { style: S.cardSub }, 'HISTÓRICO'),
          h('div', { style: { display: 'flex', gap: 6 } },
            h('button', { style: S.smallAddBtn, onClick: function (ev) { ev.stopPropagation(); setShowForm(!showForm); } },
              h(Icon, { name: 'plus', size: 12 }), showForm ? 'CANCELAR' : 'LEITURA'
            ),
            h('button', { style: Object.assign({}, S.smallAddBtn, { color: '#FB7185', borderColor: '#7F1D1D' }), onClick: function (ev) { ev.stopPropagation(); onDeleteWallet(wallet.id); } },
              h(Icon, { name: 'trash', size: 12 }), 'CARTEIRA'
            )
          )
        ),

        showForm ? h('div', { style: S.formBox },
          h('div', { style: S.formRow },
            h('label', { style: S.formLabel }, 'DATA'),
            h('input', { type: 'date', value: newDate, style: S.input, onChange: function (ev) { setNewDate(ev.target.value); } })
          ),
          h('div', { style: S.formRow },
            h('label', { style: S.formLabel }, 'VALOR (USD)'),
            h('input', { type: 'number', step: '0.01', placeholder: '129.38', value: newBalance, style: S.input, onChange: function (ev) { setNewBalance(ev.target.value); } })
          ),
          error ? h('div', { style: S.errorText }, error) : null,
          h('button', { style: S.submitBtn, onClick: handleAdd, disabled: saving }, saving ? 'SALVANDO...' : 'REGISTRAR LEITURA')
        ) : null,

        h('div', { style: S.entryList }, rows.length ? rows : h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#4B5563', padding: '8px 0' } }, 'Nenhuma leitura ainda.'))
      ) : null
    );
  }

  function WalletsSection(props) {
    var wallets = props.wallets, setWallets = props.setWallets;
    var walletEntries = props.walletEntries, setWalletEntries = props.setWalletEntries;
    var syncStatus = props.syncStatus, setSyncStatus = props.setSyncStatus;
    var walletCards = props.walletCards;
    var grandTotal = props.grandTotal;

    var showNewWallet = React.useState(false);
    var showForm = showNewWallet[0], setShowForm = showNewWallet[1];

    var nameState = React.useState('');
    var newName = nameState[0], setNewName = nameState[1];

    var errState = React.useState('');
    var error = errState[0], setError = errState[1];

    function handleAddWallet() {
      setError('');
      if (!newName.trim()) { setError('Dê um nome pra carteira.'); return; }
      SupabaseAPI.insertWallet(newName.trim()).then(function (created) {
        var next = wallets.concat([created]);
        setWallets(next);
        saveJSON(KEY_WALLETS, next);
        setNewName('');
        setShowForm(false);
      }).catch(function (e) {
        console.error('Falha ao criar carteira na nuvem', e);
        var local = { id: 'local-' + Date.now(), name: newName.trim() };
        var next = wallets.concat([local]);
        setWallets(next);
        saveJSON(KEY_WALLETS, next);
        setSyncStatus('offline');
        setError('Sem conexão — carteira salva só neste dispositivo.');
      });
    }

    function handleDeleteWallet(walletId) {
      var nextWallets = wallets.filter(function (w) { return w.id !== walletId; });
      var nextEntries = walletEntries.filter(function (e) { return e.walletId !== walletId; });
      setWallets(nextWallets);
      setWalletEntries(nextEntries);
      saveJSON(KEY_WALLETS, nextWallets);
      saveJSON(KEY_WALLET_ENTRIES, nextEntries);
      if (String(walletId).indexOf('local-') === 0) return;
      SupabaseAPI.deleteWallet(walletId).catch(function (e) {
        console.error('Falha ao deletar carteira na nuvem', e);
        setSyncStatus('offline');
      });
    }

    function handleAddEntry(walletId, date, balance, callback) {
      SupabaseAPI.insertWalletEntry(walletId, date, balance).then(function (created) {
        var next = walletEntries.concat([created]);
        setWalletEntries(next);
        saveJSON(KEY_WALLET_ENTRIES, next);
        callback(true);
      }).catch(function (e) {
        console.error('Falha ao salvar leitura na nuvem', e);
        var local = { id: 'local-' + Date.now(), walletId: walletId, date: date, balance: balance };
        var next = walletEntries.concat([local]);
        setWalletEntries(next);
        saveJSON(KEY_WALLET_ENTRIES, next);
        setSyncStatus('offline');
        callback(false, 'Sem conexão — salvo só neste dispositivo por enquanto.');
      });
    }

    function handleDeleteEntry(entryId) {
      var next = walletEntries.filter(function (e) { return e.id !== entryId; });
      setWalletEntries(next);
      saveJSON(KEY_WALLET_ENTRIES, next);
      if (String(entryId).indexOf('local-') === 0) return;
      SupabaseAPI.deleteWalletEntry(entryId).catch(function (e) {
        console.error('Falha ao deletar leitura na nuvem', e);
        setSyncStatus('offline');
      });
    }

    var syncBadge;
    if (syncStatus === 'syncing') syncBadge = h('span', { style: { color: '#6B7280' } }, 'SINCRONIZANDO...');
    else if (syncStatus === 'synced') syncBadge = h('span', { style: { color: '#5EEAD4' } }, '☁ SINCRONIZADO');
    else syncBadge = h('span', { style: { color: '#FBBF24' } }, '⚠ OFFLINE · USANDO CACHE LOCAL');

    return h(React.Fragment, null,
      h('div', { style: { margin: '28px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
        h('span', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: 1.5, color: '#5EEAD4', fontWeight: 700 } }, 'CARTEIRAS'),
        h('span', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: 1 } }, syncBadge)
      ),

      h('div', { style: S.gaugeCard },
        h('div', { style: S.gaugeLabel }, 'TOTAL EM CARTEIRAS'),
        h('div', { style: S.gaugeValueSm }, formatUSD(grandTotal)),
        h('div', { style: S.gaugeDate }, wallets.length + ' carteira' + (wallets.length !== 1 ? 's' : '') + ' · SOMA DA LEITURA MAIS RECENTE DE CADA')
      ),

      walletCards.map(function (wc) {
        return h(WalletCard, {
          key: wc.wallet.id,
          wallet: wc.wallet,
          entries: wc.entries,
          onAddEntry: handleAddEntry,
          onDeleteEntry: handleDeleteEntry,
          onDeleteWallet: handleDeleteWallet
        });
      }),

      h('div', { style: S.card },
        h('div', { style: S.cardHeader },
          h('span', { style: S.cardTitle }, 'NOVA CARTEIRA'),
          h('button', { style: S.addBtn, onClick: function () { setShowForm(!showForm); } },
            h(Icon, { name: 'plus', size: 14 }),
            showForm ? 'CANCELAR' : 'ADICIONAR'
          )
        ),
        showForm ? h('div', { style: S.formBox },
          h('div', { style: S.formRow },
            h('label', { style: S.formLabel }, 'NOME (EX: ROBINHOOD, CRYPTO.COM)'),
            h('input', { type: 'text', placeholder: 'Robinhood', value: newName, style: S.input, onChange: function (ev) { setNewName(ev.target.value); } })
          ),
          error ? h('div', { style: S.errorText }, error) : null,
          h('button', { style: S.submitBtn, onClick: handleAddWallet }, 'CRIAR CARTEIRA')
        ) : null
      )
    );
  }

  function TrackerTab() {
    var state = React.useState(loadEntries());
    var entries = state[0], setEntries = state[1];

    var formState = React.useState(false);
    var showForm = formState[0], setShowForm = formState[1];

    var dateState = React.useState('');
    var newDate = dateState[0], setNewDate = dateState[1];

    var balState = React.useState('');
    var newBalance = balState[0], setNewBalance = balState[1];

    var errState = React.useState('');
    var error = errState[0], setError = errState[1];

    /* ---------- Estado das carteiras (vive aqui para poder somar no saldo global) ---------- */
    var walletsState = React.useState(loadCachedWallets());
    var wallets = walletsState[0], setWallets = walletsState[1];

    var walletEntriesState = React.useState(loadCachedWalletEntries());
    var walletEntries = walletEntriesState[0], setWalletEntries = walletEntriesState[1];

    var walletSyncState = React.useState('syncing');
    var walletSyncStatus = walletSyncState[0], setWalletSyncStatus = walletSyncState[1];

    React.useEffect(function () {
      var cancelled = false;
      Promise.all([SupabaseAPI.fetchWallets(), SupabaseAPI.fetchWalletEntries()]).then(function (results) {
        if (cancelled) return;
        var remoteWallets = results[0], remoteEntries = results[1];
        setWallets(remoteWallets);
        setWalletEntries(remoteEntries);
        saveJSON(KEY_WALLETS, remoteWallets);
        saveJSON(KEY_WALLET_ENTRIES, remoteEntries);
        setWalletSyncStatus('synced');
      }).catch(function (e) {
        console.error('Supabase fetch wallets falhou, usando cache local', e);
        setWalletSyncStatus('offline');
      });
      return function () { cancelled = true; };
    }, []);

    var sorted = entries.slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    var latest = sorted[sorted.length - 1];
    var first = sorted[0];
    var prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;

    var totalChange = (latest && first) ? latest.balance - first.balance : 0;
    var totalChangePct = (latest && first && first.balance) ? (totalChange / first.balance) * 100 : 0;
    var dayChange = (latest && prev) ? latest.balance - prev.balance : 0;
    var dayChangePct = (latest && prev && prev.balance) ? (dayChange / prev.balance) * 100 : 0;

    var chartData = sorted.map(function (e) {
      return { label: formatDateLabel(e.date), value: e.balance };
    });

    /* ---------- Total das carteiras (soma da leitura mais recente de cada) ---------- */
    var walletsTotal = 0;
    var walletCards = wallets.map(function (w) {
      var ownEntries = walletEntries.filter(function (e) { return e.walletId === w.id; })
        .slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
      if (ownEntries.length) walletsTotal += ownEntries[ownEntries.length - 1].balance;
      return { wallet: w, entries: ownEntries };
    });

    var globalTotal = (latest ? latest.balance : 0) + walletsTotal;

    function handleAdd() {
      setError('');
      if (!newDate) { setError('Selecione uma data.'); return; }
      var bal = parseFloat(newBalance);
      if (!newBalance || isNaN(bal)) { setError('Informe um saldo válido.'); return; }
      var entry = { id: Date.now().toString(), date: newDate, balance: bal };
      var next = entries.filter(function (e) { return e.date !== newDate; }).concat([entry]);
      setEntries(next);
      saveJSON(KEY_ENTRIES, next);
      setNewDate('');
      setNewBalance('');
      setShowForm(false);
    }

    function handleDelete(id) {
      var next = entries.filter(function (e) { return e.id !== id; });
      setEntries(next);
      saveJSON(KEY_ENTRIES, next);
    }

    var entryRows = sorted.slice().reverse().map(function (e, idx) {
      var sortedIdx = sorted.length - 1 - idx;
      var prevEntry = sortedIdx > 0 ? sorted[sortedIdx - 1] : null;
      var diff = prevEntry ? e.balance - prevEntry.balance : 0;
      return h('div', { key: e.id, style: S.entryRow },
        h('div', { style: S.entryDate }, formatDateLabel(e.date) + " '26"),
        h('div', { style: S.entryBalance }, formatUSD(e.balance)),
        h('div', { style: Object.assign({}, S.entryDiff, { color: !prevEntry ? '#6B7280' : (diff >= 0 ? '#5EEAD4' : '#FB7185') }) },
          prevEntry ? ((diff >= 0 ? '+' : '') + formatUSD(diff)) : 'BASE'),
        h('button', { style: S.deleteBtn, onClick: function () { handleDelete(e.id); } }, h(Icon, { name: 'trash', size: 13 }))
      );
    });

    return h(React.Fragment, null,
      h('div', { style: Object.assign({}, S.gaugeCard, { border: '1px solid #134E4A' }) },
        h('div', { style: S.gaugeLabel }, 'SALDO GLOBAL'),
        h('div', { style: S.gaugeValue }, formatUSD(globalTotal)),
        h('div', { style: S.gaugeDate }, '401K + CARTEIRAS · ' + (latest ? formatUSD(latest.balance) + ' + ' + formatUSD(walletsTotal) : 'SEM DADOS DE 401K'))
      ),

      h('div', { style: S.gaugeCard },
        h('div', { style: S.gaugeLabel }, 'SALDO ATUAL 401K'),
        h('div', { style: S.gaugeValue }, latest ? formatUSD(latest.balance) : '—'),
        h('div', { style: S.gaugeDate }, latest ? ('ÚLTIMA LEITURA · ' + formatDateLabel(latest.date).toUpperCase() + ' 2026') : 'SEM DADOS'),

        h('div', { style: S.deltaRow },
          h('div', { style: S.deltaBox },
            h('div', { style: S.deltaLabel }, 'DESDE ÚLTIMA LEITURA'),
            h('div', { style: Object.assign({}, S.deltaValue, { color: dayChange >= 0 ? '#5EEAD4' : '#FB7185' }) },
              h(Icon, { name: dayChange >= 0 ? 'up' : 'down', size: 14 }),
              (dayChange >= 0 ? '+' : '') + formatUSD(dayChange),
              h('span', { style: S.deltaPct }, '(' + (dayChangePct >= 0 ? '+' : '') + dayChangePct.toFixed(2) + '%)')
            )
          ),
          h('div', { style: S.deltaDivider }),
          h('div', { style: S.deltaBox },
            h('div', { style: S.deltaLabel }, 'DESDE O INÍCIO'),
            h('div', { style: Object.assign({}, S.deltaValue, { color: totalChange >= 0 ? '#5EEAD4' : '#FB7185' }) },
              h(Icon, { name: totalChange >= 0 ? 'up' : 'down', size: 14 }),
              (totalChange >= 0 ? '+' : '') + formatUSD(totalChange),
              h('span', { style: S.deltaPct }, '(' + (totalChangePct >= 0 ? '+' : '') + totalChangePct.toFixed(2) + '%)')
            )
          )
        )
      ),

      h('div', { style: S.card },
        h('div', { style: S.cardHeader },
          h('span', { style: S.cardTitle }, 'ALTÍMETRO DE SALDO 401K'),
          h('span', { style: S.cardSub }, sorted.length + ' leituras')
        ),
        h(MiniChart, { data: chartData })
      ),

      h('div', { style: S.card },
        h('div', { style: S.cardHeader },
          h('span', { style: S.cardTitle }, 'REGISTRO DE LEITURAS 401K'),
          h('button', { style: S.addBtn, onClick: function () { setShowForm(!showForm); } },
            h(Icon, { name: 'plus', size: 14 }),
            showForm ? 'CANCELAR' : 'NOVA LEITURA'
          )
        ),

        showForm ? h('div', { style: S.formBox },
          h('div', { style: S.formRow },
            h('label', { style: S.formLabel }, 'DATA'),
            h('input', { type: 'date', value: newDate, style: S.input, max: '2026-12-31', onChange: function (ev) { setNewDate(ev.target.value); } })
          ),
          h('div', { style: S.formRow },
            h('label', { style: S.formLabel }, 'SALDO (USD)'),
            h('input', { type: 'number', step: '0.01', placeholder: '17866.49', value: newBalance, style: S.input, onChange: function (ev) { setNewBalance(ev.target.value); } })
          ),
          error ? h('div', { style: S.errorText }, error) : null,
          h('button', { style: S.submitBtn, onClick: handleAdd }, 'REGISTRAR LEITURA')
        ) : null,

        h('div', { style: S.entryList }, entryRows)
      ),

      h(WalletsSection, {
        wallets: wallets,
        setWallets: setWallets,
        walletEntries: walletEntries,
        setWalletEntries: setWalletEntries,
        syncStatus: walletSyncStatus,
        setSyncStatus: setWalletSyncStatus,
        walletCards: walletCards,
        grandTotal: walletsTotal
      }),

      h('div', { style: S.footer }, 'DADOS SALVOS NESTE DISPOSITIVO · NETBENEFITS / FIDELITY')
    );
  }

  window.TrackerTab = TrackerTab;
})();
