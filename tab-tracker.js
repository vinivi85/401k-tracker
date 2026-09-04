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
    var onRenameWallet = props.onRenameWallet;
    var syncMsg = props.syncMsg;

    var expandState = React.useState(false);
    var expanded = expandState[0], setExpanded = expandState[1];

    var formState = React.useState(false);
    var showForm = formState[0], setShowForm = formState[1];
    var editingState = React.useState(false);
    var editing = editingState[0], setEditing = editingState[1];
    var editNameState = React.useState(wallet.name);
    var editName = editNameState[0], setEditName = editNameState[1];

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
            h('div', { style: S.walletMeta }, latest ? (formatDateLabel(latest.date) + ' · ' + entries.length + ' leitura' + (entries.length > 1 ? 's' : '')) : 'SEM LEITURAS'),
            syncMsg ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: syncMsg.color, marginTop: 3 } }, syncMsg.text) : null
          )
        ),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          h('div', { style: { textAlign: 'right' } },
            h('div', { style: S.walletBalance }, latest ? formatUSD(latest.balance) : '—'),
            latest && prev ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: dayChange >= 0 ? '#5EEAD4' : '#FB7185' } }, (dayChange >= 0 ? '+' : '') + formatUSD(dayChange)) : null
          ),
          h(Icon, { name: 'chevron', size: 14, color: '#D1D5DB' })
        )
      ),

      expanded ? h('div', { style: S.walletBody },
        entries.length > 1 ? h(MiniChart, { data: chartData }) : null,

        latest && first && entries.length > 1 ? h('div', { style: { display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#B0B7C3', margin: '8px 0 12px' } },
          h('span', null, 'DESDE O INÍCIO'),
          h('span', { style: { color: totalChange >= 0 ? '#5EEAD4' : '#FB7185', fontWeight: 600 } }, (totalChange >= 0 ? '+' : '') + formatUSD(totalChange))
        ) : null,

        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
          h('span', { style: S.cardSub }, 'HISTÓRICO'),
          editing
            ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1 } },
                h('input', { type: 'text', value: editName, style: Object.assign({}, S.input, { fontSize: 10, padding: '4px 8px' }),
                  onChange: function(ev){ setEditName(ev.target.value); },
                  onClick: function(ev){ ev.stopPropagation(); }
                }),
                h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 6 } },
                  h('button', { style: Object.assign({}, S.smallAddBtn, { color: '#9CA3AF', borderColor: '#374151' }),
                    onClick: function(ev){ ev.stopPropagation(); setEditing(false); setEditName(wallet.name); }
                  }, 'CANCELAR'),
                  h('button', { style: Object.assign({}, S.smallAddBtn, { color: '#00FF88', borderColor: '#00AA55' }),
                    onClick: function(ev){
                      ev.stopPropagation();
                      if (editName.trim()) {
                        if (onRenameWallet) onRenameWallet(wallet.id, editName.trim());
                        setEditing(false);
                      }
                    }
                  }, 'CONFIRMAR')
                )
              )
            : h('div', { style: { display: 'flex', gap: 6 } },
                h('button', { style: S.smallAddBtn, onClick: function (ev) { ev.stopPropagation(); setShowForm(!showForm); } },
                  h(Icon, { name: 'plus', size: 12 }), showForm ? 'CANCELAR' : 'LEITURA'
                ),
                h('button', { style: Object.assign({}, S.smallAddBtn, { color: '#5EEAD4', borderColor: '#134E4A' }),
                  onClick: function(ev){ ev.stopPropagation(); setEditName(wallet.name); setEditing(true); }
                }, 'EDITAR'),
                h('button', { style: Object.assign({}, S.smallAddBtn, { color: '#FB7185', borderColor: '#7F1D1D' }), onClick: function (ev) { ev.stopPropagation(); onDeleteWallet(wallet.id); } },
                  h(Icon, { name: 'trash', size: 12 }), 'CONTA'
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

        h('div', { style: S.entryList }, rows.length ? rows : h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#D1D5DB', padding: '8px 0' } }, 'Nenhuma leitura ainda.'))
      ) : null
    );
  }

  function WalletsSection(props) {
    var wallets = props.wallets, setWallets = props.setWallets;
    var walletEntries = props.walletEntries, setWalletEntries = props.setWalletEntries;
    var syncStatus = props.syncStatus, setSyncStatus = props.setSyncStatus;
    var walletCards = props.walletCards;
    var syncMsgs = props.syncMsgs || {};
    var deltas = props.deltas || null;
    var prevMonthLabel = props.prevMonthLabel || '';
    var grandTotal = props.grandTotal;
    var category    = props.category    || 'investment';
    var sectionTitle= props.sectionTitle|| 'CARTEIRAS DE INVESTIMENTO';
    var totalLabel  = props.totalLabel  || 'SALDO TOTAL DE INVESTIMENTOS';
    var addTitle    = props.addTitle    || 'NOVA CARTEIRA DE INVESTIMENTO';
    var addSubmit   = props.addSubmit   || 'CRIAR CARTEIRA DE INVESTIMENTO';
    var nameHint    = props.nameHint    || 'NOME (EX: ROBINHOOD, MARCUS)';
    var namePlaceholder = props.namePlaceholder || 'Robinhood';
    var countNoun   = props.countNoun   || 'carteira';

    var showNewWallet = React.useState(false);
    var showForm = showNewWallet[0], setShowForm = showNewWallet[1];

    var nameState = React.useState('');
    var newName = nameState[0], setNewName = nameState[1];

    var errState = React.useState('');
    var error = errState[0], setError = errState[1];

    function handleAddWallet() {
      setError('');
      if (!newName.trim()) { setError('Dê um nome pra carteira.'); return; }
      SupabaseAPI.insertWallet(newName.trim(), category).then(function (created) {
        var next = wallets.concat([created]);
        setWallets(next);
        saveJSON(KEY_WALLETS, next);
        setNewName('');
        setShowForm(false);
      }).catch(function (e) {
        console.error('Falha ao criar carteira na nuvem', e);
        var local = { id: 'local-' + Date.now(), name: newName.trim(), category: category };
        var next = wallets.concat([local]);
        setWallets(next);
        saveJSON(KEY_WALLETS, next);
        setSyncStatus('offline');
        setError('Sem conexão — carteira salva só neste dispositivo.');
      });
    }

    function handleRenameWallet(id, newName) {
      /* Optimistic update first */
      setWallets(wallets.map(function(w){ return w.id === id ? Object.assign({}, w, { name: newName }) : w; }));
      SupabaseAPI.updateWallet(id, newName).then(function(updated) {
        console.log('Renamed OK:', updated);
        /* Notify CONFIG to reload wallets */
        window.dispatchEvent(new Event('wallet-renamed'));
      }).catch(function(e){
        console.error('Rename failed:', e);
        SupabaseAPI.fetchWallets().then(function(w){ setWallets(w||[]); }).catch(function(){});
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
    if (syncStatus === 'syncing') syncBadge = h('span', { style: { color: '#B0B7C3' } }, 'SINCRONIZANDO...');
    else if (syncStatus === 'synced') syncBadge = h('span', { style: { color: '#5EEAD4' } }, '☁ SINCRONIZADO');
    else syncBadge = h('span', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
      h('span', { style: { color: '#FBBF24' } }, '⚠ OFFLINE · USANDO CACHE LOCAL'),
      h('button', {
        style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#5EEAD4',
          background: 'transparent', border: '1px solid #134E4A', borderRadius: 4,
          padding: '2px 6px', cursor: 'pointer' },
        onClick: function() {
          /* Clear session and reload to force re-login */
          try {
            saveJSON('401k-auth-session', null);
            window.__dbCache['401k-auth-session'] = null;
          } catch(e) {}
          window.location.reload();
        }
      }, 'RECONECTAR')
    );

    return h(React.Fragment, null,
      h('div', { style: { margin: '28px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
        h('span', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: 1.5, color: '#5EEAD4', fontWeight: 700 } }, sectionTitle),
        h('span', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: 1 } }, syncBadge)
      ),

      h('div', { style: S.gaugeCard },
        h('div', { style: S.gaugeLabel }, totalLabel),
        h('div', { style: S.gaugeValueSm }, formatUSD(grandTotal)),
        h('div', { style: S.gaugeDate }, walletCards.length + ' ' + countNoun + (walletCards.length !== 1 ? 's' : '') + ' · SOMA DA LEITURA MAIS RECENTE DE CADA'),
        deltas ? h(DeltaRow, { deltas: deltas, prevMonthLabel: prevMonthLabel }) : null
      ),

      walletCards.map(function (wc) {
        return h(WalletCard, {
          key: wc.wallet.id,
          wallet: wc.wallet,
          entries: wc.entries,
          onAddEntry: handleAddEntry,
          onDeleteEntry: handleDeleteEntry,
          onDeleteWallet: handleDeleteWallet,
          onRenameWallet: handleRenameWallet,
          syncMsg: syncMsgs[wc.wallet.name]
        });
      }),

      h('div', { style: S.card },
        h('div', { style: S.cardHeader },
          h('span', { style: S.cardTitle }, addTitle),
          h('button', { style: S.addBtn, onClick: function () { setShowForm(!showForm); } },
            h(Icon, { name: 'plus', size: 14 }),
            showForm ? 'CANCELAR' : 'ADICIONAR'
          )
        ),
        showForm ? h('div', { style: S.formBox },
          h('div', { style: S.formRow },
            h('label', { style: S.formLabel }, nameHint),
            h('input', { type: 'text', placeholder: namePlaceholder, value: newName, style: S.input, onChange: function (ev) { setNewName(ev.target.value); } })
          ),
          error ? h('div', { style: S.errorText }, error) : null,
          h('button', { style: S.submitBtn, onClick: handleAddWallet }, addSubmit)
        ) : null
      )
    );
  }

  /* Bloco de variacao reutilizado pelos cards de total */
  function DeltaRow(props) {
    var d = props.deltas || {};
    var label = props.prevMonthLabel || '';
    var mChange = (typeof d.lastMonthChange === 'number') ? d.lastMonthChange : null;
    var mPct = d.lastMonthChangePct || 0;
    var tChange = d.totalChange || 0;
    var tPct = d.totalChangePct || 0;

    return h('div', { style: S.deltaRow },
      h('div', { style: S.deltaBox },
        h('div', { style: S.deltaLabel }, 'ÚLTIMO MÊS (' + label + ')'),
        mChange !== null
          ? h('div', { style: Object.assign({}, S.deltaValue, { color: mChange >= 0 ? '#5EEAD4' : '#FB7185' }) },
              h(Icon, { name: mChange >= 0 ? 'up' : 'down', size: 14 }),
              (mChange >= 0 ? '+' : '') + formatUSD(mChange),
              h('span', { style: S.deltaPct }, '(' + (mPct >= 0 ? '+' : '') + mPct.toFixed(2) + '%)')
            )
          : h('div', { style: Object.assign({}, S.deltaValue, { color: '#6B7280', fontSize: 11 }) }, 'SEM LEITURAS')
      ),
      h('div', { style: S.deltaDivider }),
      h('div', { style: S.deltaBox },
        h('div', { style: S.deltaLabel }, 'DESDE O INÍCIO'),
        h('div', { style: Object.assign({}, S.deltaValue, { color: tChange >= 0 ? '#5EEAD4' : '#FB7185' }) },
          h(Icon, { name: tChange >= 0 ? 'up' : 'down', size: 14 }),
          (tChange >= 0 ? '+' : '') + formatUSD(tChange),
          h('span', { style: S.deltaPct }, '(' + (tPct >= 0 ? '+' : '') + tPct.toFixed(2) + '%)')
        )
      )
    );
  }

  /* Serie agregada: para cada data, soma o ultimo saldo conhecido de cada conta */
  function aggregateSeries(cards) {
    if (!cards || !cards.length) return [];
    var dateSet = {};
    cards.forEach(function (c) {
      (c.entries || []).forEach(function (e) { dateSet[e.date] = true; });
    });
    var dates = Object.keys(dateSet).sort();
    return dates.map(function (d) {
      var sum = 0;
      cards.forEach(function (c) {
        var last = null;
        var list = c.entries || [];
        for (var i = 0; i < list.length; i++) {
          if (list[i].date <= d) last = list[i]; else break;
        }
        if (last) sum += last.balance;
      });
      return { date: d, balance: sum };
    });
  }

  /* Deltas (mes anterior e desde o inicio) a partir de uma serie ordenada */
  function computeDeltas(series) {
    var out = {
      latest: null, first: null,
      totalChange: 0, totalChangePct: 0,
      lastMonthChange: null, lastMonthChangePct: null
    };
    if (!series || !series.length) return out;

    out.latest = series[series.length - 1];
    out.first = series[0];
    out.totalChange = out.latest.balance - out.first.balance;
    out.totalChangePct = out.first.balance ? (out.totalChange / out.first.balance) * 100 : 0;

    var now = new Date();
    var pMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    var pYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

    var pmEntries = series.filter(function (e) {
      var d = new Date(e.date + 'T00:00:00');
      return d.getMonth() === pMonth && d.getFullYear() === pYear;
    });

    if (pmEntries.length >= 2) {
      var a = pmEntries[0], b = pmEntries[pmEntries.length - 1];
      out.lastMonthChange = b.balance - a.balance;
      out.lastMonthChangePct = a.balance > 0 ? (out.lastMonthChange / a.balance) * 100 : 0;
    } else if (pmEntries.length === 1) {
      var only = pmEntries[0];
      var before = series.filter(function (e) {
        return new Date(e.date + 'T00:00:00') < new Date(only.date + 'T00:00:00');
      });
      if (before.length) {
        var ref = before[before.length - 1];
        out.lastMonthChange = only.balance - ref.balance;
        out.lastMonthChangePct = ref.balance > 0 ? (out.lastMonthChange / ref.balance) * 100 : 0;
      }
    }
    return out;
  }

  function TrackerTab() {
    var state = React.useState(loadEntries());
    var entries = state[0], setEntries = state[1];

    var formState = React.useState(false);
    var showForm = formState[0], setShowForm = formState[1];
    var syncingPlaidState = React.useState(false);
    var syncingPlaid = syncingPlaidState[0], setSyncingPlaid = syncingPlaidState[1];
    var lastSyncState = React.useState(null);
    var lastSync = lastSyncState[0], setLastSync = lastSyncState[1];
    var syncMsgsState = React.useState(loadJSON(KEY_SYNC_MSGS) || {});
    var syncMsgs = syncMsgsState[0], setSyncMsgs = syncMsgsState[1];

    var dateState = React.useState('');
    var newDate = dateState[0], setNewDate = dateState[1];

    var balState = React.useState('');
    var newBalance = balState[0], setNewBalance = balState[1];

    var errState = React.useState('');
    var error = errState[0], setError = errState[1];

    var trackerSyncState = React.useState('syncing');
    var trackerSyncStatus = trackerSyncState[0], setTrackerSyncStatus = trackerSyncState[1];

    /* ---------- Estado das carteiras (vive aqui para poder somar no saldo global) ---------- */
    var walletsState = React.useState(loadCachedWallets());
    var wallets = walletsState[0], setWallets = walletsState[1];

    var walletEntriesState = React.useState(loadCachedWalletEntries());
    var walletEntries = walletEntriesState[0], setWalletEntries = walletEntriesState[1];

    var walletSyncState = React.useState('syncing');
    var walletSyncStatus = walletSyncState[0], setWalletSyncStatus = walletSyncState[1];

    React.useEffect(function () {
      var cancelled = false;
      SupabaseAPI.fetchTrackerEntries().then(function (remote) {
        if (cancelled) return;
        if (remote && remote.length > 0) {
          setEntries(remote);
          saveJSON(KEY_ENTRIES, remote);
          setTrackerSyncStatus('synced');
        } else if (entries && entries.length > 0) {
          // Nuvem vazia, mas existe histórico local (de antes do login) — migra pra nuvem
          Promise.all(entries.map(function (e) { return SupabaseAPI.insertTrackerEntry(e.date, e.balance); }))
            .then(function (created) {
              if (cancelled) return;
              setEntries(created);
              saveJSON(KEY_ENTRIES, created);
              setTrackerSyncStatus('synced');
            })
            .catch(function (e) {
              console.error('Falha ao migrar leituras locais do 401k para a nuvem', e);
              setTrackerSyncStatus('offline');
            });
        } else {
          setTrackerSyncStatus('synced');
        }
      }).catch(function (e) {
        console.error('Supabase fetch tracker_entries falhou, usando cache local', e);
        setTrackerSyncStatus('offline');
      });
      return function () { cancelled = true; };
    }, []);

    React.useEffect(function () {
      var cancelled = false;
      /* Listen for sync events from CONFIG */
      function onPlaidSync() {
        Promise.all([SupabaseAPI.fetchWallets(), SupabaseAPI.fetchWalletEntries()]).then(function(results){
          setWallets(results[0] || []);
        }).catch(function(){});
        Promise.all([SupabaseAPI.fetchWallets(), SupabaseAPI.fetchWalletEntries()])
                    .then(function(results) {
                      var allWallets = results[0] || [];
                      var allEntries = results[1] || [];
                      var fw = allWallets.find(function(w){ return w.name === 'Fidelity 401k - AA'; });
                      if (fw) {
                        var fe = allEntries.filter(function(e){ return e.walletId === fw.id; })
                          .map(function(e){ return { id: e.id, date: e.date, balance: e.balance }; });
                        setEntries(fe);
                        saveJSON(KEY_ENTRIES, fe);
                      }
                    }).catch(function(){});
      }
      window.addEventListener('plaid-sync-done', onPlaidSync);

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

    /* Variação de saldo do mês anterior */
    var now = new Date();
    var prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    var prevMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    var MONTH_NAMES_SHORT = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
    var prevMonthLabel = MONTH_NAMES_SHORT[prevMonth];

    var prevMonthEntries = sorted.filter(function (e) {
      var d = new Date(e.date + 'T00:00:00');
      return d.getMonth() === prevMonth && d.getFullYear() === prevMonthYear;
    });

    var lastMonthChange = null;
    var lastMonthChangePct = null;
    if (prevMonthEntries.length >= 2) {
      var pmFirst = prevMonthEntries[0];
      var pmLast  = prevMonthEntries[prevMonthEntries.length - 1];
      lastMonthChange = pmLast.balance - pmFirst.balance;
      lastMonthChangePct = pmFirst.balance > 0 ? (lastMonthChange / pmFirst.balance) * 100 : 0;
    } else if (prevMonthEntries.length === 1) {
      /* Só uma leitura no mês — compara com leitura anterior disponível */
      var pmEntry = prevMonthEntries[0];
      var beforePm = sorted.filter(function (e) { return new Date(e.date + 'T00:00:00') < new Date(pmEntry.date + 'T00:00:00'); });
      if (beforePm.length > 0) {
        var refEntry = beforePm[beforePm.length - 1];
        lastMonthChange = pmEntry.balance - refEntry.balance;
        lastMonthChangePct = refEntry.balance > 0 ? (lastMonthChange / refEntry.balance) * 100 : 0;
      }
    }

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

    /* Split por categoria — cada card resume as contas listadas abaixo dele */
    var retirementCards = [];
    var investmentCards = [];
    var retirementTotal = 0;
    var investmentTotal = 0;
    walletCards.forEach(function (wc) {
      var last = wc.entries.length ? wc.entries[wc.entries.length - 1].balance : 0;
      if (wc.wallet.category === 'retirement') { retirementCards.push(wc); retirementTotal += last; }
      else { investmentCards.push(wc); investmentTotal += last; }
    });
    var retireDeltas = computeDeltas(aggregateSeries(retirementCards));
    var investDeltas = computeDeltas(aggregateSeries(investmentCards));

    var globalTotal = retirementTotal + investmentTotal;

    function handleAdd() {
      setError('');
      if (!newDate) { setError('Selecione uma data.'); return; }
      var bal = parseFloat(newBalance);
      if (!newBalance || isNaN(bal)) { setError('Informe um saldo válido.'); return; }

      /* Find Fidelity wallet and insert into wallet_entries */
      var fidelityWallet = wallets.find(function(w){ return w.name === 'Fidelity 401k - AA'; });
      if (!fidelityWallet) { setError('Conta Fidelity 401k - AA não encontrada.'); return; }
      SupabaseAPI.insertWalletEntry(fidelityWallet.id, newDate, bal).then(function (created) {
        var entry = { id: created.id, date: created.date, balance: created.balance };
        var next = entries.filter(function (e) { return e.date !== newDate; }).concat([entry]);
        setEntries(next);
        saveJSON(KEY_ENTRIES, next);
        setNewDate('');
        setNewBalance('');
        setShowForm(false);
      }).catch(function (e) {
        console.error('Falha ao salvar leitura 401k na nuvem', e);
        var local = { id: 'local-' + Date.now(), date: newDate, balance: bal };
        var next = entries.filter(function (en) { return en.date !== newDate; }).concat([local]);
        setEntries(next);
        saveJSON(KEY_ENTRIES, next);
        setTrackerSyncStatus('offline');
        setError('Sem conexão — salvo só neste dispositivo por enquanto.');
        setNewDate('');
        setNewBalance('');
        setShowForm(false);
      });
    }

    function handleDelete(id) {
      var next = entries.filter(function (e) { return e.id !== id; });
      setEntries(next);
      saveJSON(KEY_ENTRIES, next);
      if (String(id).indexOf('local-') === 0) return;
      SupabaseAPI.deleteTrackerEntry(id).catch(function (e) {
        console.error('Falha ao deletar leitura 401k na nuvem', e);
        setTrackerSyncStatus('offline');
      });
    }

    var expandedState = React.useState(false);
    var expanded = expandedState[0], setExpanded = expandedState[1];

    var allEntryRows = sorted.slice().reverse().map(function (e, idx) {
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

    var PREVIEW_COUNT = 3;
    var visibleRows = expanded ? allEntryRows : allEntryRows.slice(0, PREVIEW_COUNT);
    var hasMore = allEntryRows.length > PREVIEW_COUNT;

    return h(React.Fragment, null,
      h('div', { style: Object.assign({}, S.gaugeCard, { border: '1px solid #134E4A' }) },
        h('div', { style: S.gaugeLabel }, 'SALDO GLOBAL'),
        h('div', { style: S.gaugeValue }, formatUSD(globalTotal)),
        h('div', { style: S.gaugeDate }, 'APOSENTADORIA ' + formatUSD(retirementTotal) + ' · INVESTIMENTOS ' + formatUSD(investmentTotal)),
        h('div', { style: { marginTop: 12, paddingTop: 10, borderTop: '1px solid #134E4A' } },
          h('button', {
            style: Object.assign({}, S.smallAddBtn, {
              width: '100%', justifyContent: 'center',
              color: syncingPlaid ? '#9CA3AF' : '#00FFD1',
              borderColor: syncingPlaid ? '#1F2937' : '#00AA8A',
              opacity: syncingPlaid ? 0.6 : 1
            }),
            disabled: syncingPlaid,
            onClick: function() {
              var uid = window.currentUserId ? window.currentUserId() : null;
              if (!uid) return;
              setSyncingPlaid(true);
              fetch('/api/plaid-cron?action=sync-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: uid })
              }).then(function(r){ return r.json(); })
                .then(function(d){
                  setSyncingPlaid(false);
                  setLastSync(new Date());
                  if (d.error) { console.error(d.error); return; }
                  /* Mensagem por conta a partir do retorno do sync */
                  var msgs = {};
                  (d.results || []).forEach(function(r) {
                    if (!r || !r.wallet) return;
                    var val = (typeof r.balance === 'number') ? formatUSD(r.balance) : '';
                    if (r.action === 'created') {
                      msgs[r.wallet] = { text: '\u2713 Leitura criada' + (val ? ': ' + val : ''), color: '#00FFB2' };
                    } else if (r.action === 'updated') {
                      msgs[r.wallet] = { text: '\u2713 Leitura atualizada' + (val ? ': ' + val : ''), color: '#00FFB2' };
                    } else if (r.action === 'skipped') {
                      msgs[r.wallet] = { text: '\u2014 Sem altera\u00e7\u00e3o' + (val ? ' \u00b7 igual \u00e0 \u00faltima (' + val + ')' : ''), color: '#C9D1D9' };
                    } else if (r.action === 'error') {
                      msgs[r.wallet] = { text: '\u26a0 ' + (r.error || 'Erro ao sincronizar'), color: '#FF6B81' };
                    }
                  });
                  /* Carteiras que nao voltaram no sync nao tem Plaid conectado */
                  wallets.forEach(function(w) {
                    if (!msgs[w.name]) msgs[w.name] = { text: '\u25cb N\u00e3o conectada', color: '#94A3B8' };
                  });
                  setSyncMsgs(msgs);
                  saveJSON(KEY_SYNC_MSGS, msgs);
                  Promise.all([SupabaseAPI.fetchWallets(), SupabaseAPI.fetchWalletEntries()])
                    .then(function(results) {
                      var allWallets = results[0] || [];
                      var allEntries = results[1] || [];
                      var fw = allWallets.find(function(w){ return w.name === 'Fidelity 401k - AA'; });
                      if (fw) {
                        var fe = allEntries.filter(function(e){ return e.walletId === fw.id; })
                          .map(function(e){ return { id: e.id, date: e.date, balance: e.balance }; });
                        setEntries(fe);
                        saveJSON(KEY_ENTRIES, fe);
                      }
                    }).catch(function(){});
                  Promise.all([SupabaseAPI.fetchWallets(), SupabaseAPI.fetchWalletEntries()])
                    .then(function(results){ setWallets(results[0]||[]); })
                    .catch(function(){});
                }).catch(function(){ setSyncingPlaid(false); });
            }
          }, syncingPlaid ? '↻ SINCRONIZANDO...' : '↻ SYNC CONTAS PLAID'),
          lastSync ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#B0B7C3', textAlign: 'center', marginTop: 6 } },
            'ÚLTIMO SYNC: ' + lastSync.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
          ) : null
        )
      ),

      /* ---- 1a secao: APOSENTADORIA ---- */
      h(WalletsSection, {
        wallets: wallets,
        setWallets: setWallets,
        walletEntries: walletEntries,
        setWalletEntries: setWalletEntries,
        syncStatus: walletSyncStatus,
        setSyncStatus: setWalletSyncStatus,
        walletCards: retirementCards,
        grandTotal: retirementTotal,
        syncMsgs: syncMsgs,
        deltas: retireDeltas,
        prevMonthLabel: prevMonthLabel,
        category: 'retirement',
        sectionTitle: 'CARTEIRAS DE APOSENTADORIA',
        totalLabel: 'SALDO TOTAL DE APOSENTADORIA',
        addTitle: 'NOVA CONTA DE APOSENTADORIA',
        addSubmit: 'CRIAR CONTA DE APOSENTADORIA',
        nameHint: 'NOME (EX: 401K FIDELITY, IRA)',
        namePlaceholder: 'IRA - Fidelity',
        countNoun: 'conta'
      }),

      h(WalletsSection, {
        wallets: wallets,
        setWallets: setWallets,
        walletEntries: walletEntries,
        setWalletEntries: setWalletEntries,
        syncStatus: walletSyncStatus,
        setSyncStatus: setWalletSyncStatus,
        walletCards: investmentCards,
        grandTotal: investmentTotal,
        deltas: investDeltas,
        prevMonthLabel: prevMonthLabel,
        syncMsgs: syncMsgs
      }),

      h('div', { style: S.footer }, 'DADOS SALVOS NESTE DISPOSITIVO · NETBENEFITS / FIDELITY')
    );
  }

  window.TrackerTab = TrackerTab;
})();
