/* =========================================================
   TAB 4: PAY — holerites agrupados por mês
   Campos: net (amount), gross (opcional), type, date, period
   Calcula: % redução por período, W-2 estimado, totais por mês
   ========================================================= */
(function () {
  'use strict';
  var h = React.createElement;

  var MONTH_NAMES = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];

  var initialPayEntries = []; // novo usuário começa sem pagamentos — dados vêm do Supabase

  function loadCachedPayEntries() {
    try {
      var raw = window.__dbCache[KEY_PAY_ENTRIES];
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return initialPayEntries;
  }

  function cachePayEntries(list) { saveJSON(KEY_PAY_ENTRIES, list); }

  function monthKey(iso) { return iso.slice(0, 7); }
  function monthLabel(key) {
    var parts = key.split('-');
    return MONTH_NAMES[parseInt(parts[1], 10) - 1] + ' ' + parts[0].slice(2);
  }

  function reductionPct(gross, net) {
    if (!gross || gross <= 0) return null;
    return ((gross - net) / gross) * 100;
  }

  function PayEntryRow(props) {
    var e = props.entry;
    var onDelete = props.onDelete;
    var onUpdate = props.onUpdate;
    var matchLimitPct = props.matchLimitPct || 4;
    var profitSharingPct = props.profitSharingPct || 5;

    var editingState = React.useState(false);
    var editing = editingState[0], setEditing = editingState[1];

    var grossValState = React.useState(e.gross != null ? String(e.gross) : '');
    var grossVal = grossValState[0], setGrossVal = grossValState[1];

    var netValState = React.useState(String(e.amount));
    var netVal = netValState[0], setNetVal = netValState[1];

    var contribValState = React.useState(e.contrib401k != null ? String(e.contrib401k) : '');
    var contribVal = contribValState[0], setContribVal = contribValState[1];

    var dateValState = React.useState(e.date || '');
    var dateVal = dateValState[0], setDateVal = dateValState[1];

    var typeValState = React.useState(e.type || 'Regular payroll run');
    var typeVal = typeValState[0], setTypeVal = typeValState[1];

    var psValState = React.useState(e.profitSharing != null ? String(e.profitSharing) : '');
    var psVal = psValState[0], setPsVal = psValState[1];

    var savingState = React.useState(false);
    var saving = savingState[0], setSaving = savingState[1];

    var errState = React.useState('');
    var err = errState[0], setErr = errState[1];

    function handleSave() {
      setErr('');
      var net = parseFloat(netVal);
      var gross = grossVal ? parseFloat(grossVal) : null;
      var contrib = contribVal ? parseFloat(contribVal) : null;
      var ps = psVal ? parseFloat(psVal) : null;
      if (!dateVal) { setErr('Selecione a data.'); return; }
      if (isNaN(net) || net <= 0) { setErr('Net inválido.'); return; }
      if (gross != null && (isNaN(gross) || gross < net)) { setErr('Gross não pode ser menor que o net.'); return; }
      setSaving(true);
      onUpdate(e.id, { date: dateVal, gross: gross, amount: net, contrib401k: contrib, profitSharing: ps, type: typeVal }, function (ok, msg) {
        setSaving(false);
        if (ok) setEditing(false);
        else setErr(msg || 'Falha ao salvar.');
      });
    }

    /* Usa valores informados diretamente */
    var gross = e.gross;
    var contrib = e.contrib401k;
    var psInformed = e.profitSharing;
    var companyMatch = (gross && contrib) ? gross * (Math.min(contrib / gross * 100, matchLimitPct) / 100) : null;
    var companyTotal = (companyMatch != null && psInformed != null) ? companyMatch + psInformed
                     : (companyMatch != null) ? companyMatch
                     : (psInformed != null) ? psInformed : null;
    var myContribPct = (gross && contrib) ? (contrib / gross * 100) : null;

    /* Sugestão de 401k AA contrib com base no % configurado */
    var psSuggestion = (gross && profitSharingPct) ? gross * profitSharingPct / 100 : null;

    var rangeLabel = e.periodStart === e.periodEnd
      ? formatDateLabel(e.periodStart)
      : (formatDateLabel(e.periodStart) + '–' + formatDateLabel(e.periodEnd));
    var pct = reductionPct(e.gross, e.amount);
    var isBonus = e.type === 'Bonus payment';

    if (editing) {
      return h('div', { style: { padding: '10px 0 12px', borderBottom: '1px solid #1A2333' } },
        /* Cabeçalho com data */
        h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#B0B7C3', marginBottom: 10 } },
          'Editando pagamento'
        ),

        /* Linha 0: DATA + TIPO */
        h('div', { style: { display: 'flex', gap: 10, marginBottom: 8 } },
          h('div', { style: { flex: 1 } },
            h('label', { style: S.formLabel }, 'DATA DO PAGAMENTO'),
            h('input', { type: 'date', value: dateVal, style: S.input, onChange: function (ev) { setDateVal(ev.target.value); } })
          ),
          h('div', { style: { flex: 1 } },
            h('label', { style: S.formLabel }, 'TIPO'),
            h('select', { value: typeVal, style: S.input, onChange: function (ev) { setTypeVal(ev.target.value); } },
              h('option', { value: 'Regular payroll run' }, 'Regular payroll run'),
              h('option', { value: 'Bonus payment' }, 'Bonus payment')
            )
          )
        ),

        /* Linha 1: GROSS + NET */
        h('div', { style: { display: 'flex', gap: 10, marginBottom: 8 } },
          h('div', { style: { flex: 1 } },
            h('label', { style: S.formLabel }, 'GROSS ($)'),
            h('input', { type: 'number', step: '0.01', value: grossVal, style: S.input, placeholder: '3120.50', onChange: function (ev) { setGrossVal(ev.target.value); } })
          ),
          h('div', { style: { flex: 1 } },
            h('label', { style: S.formLabel }, 'NET ($)'),
            h('input', { type: 'number', step: '0.01', value: netVal, style: S.input, onChange: function (ev) { setNetVal(ev.target.value); } })
          )
        ),

        /* Linha 2: MINHA CONTRIB 401K + 401K AA CONTRIB */
        h('div', { style: { display: 'flex', gap: 10, marginBottom: 8 } },
          h('div', { style: { flex: 1 } },
            h('label', { style: S.formLabel }, 'MINHA CONTRIB 401K ($)'),
            h('input', { type: 'number', step: '0.01', value: contribVal, style: S.input, placeholder: '124.80', onChange: function (ev) { setContribVal(ev.target.value); } })
          ),
          h('div', { style: { flex: 1 } },
            h('label', { style: S.formLabel }, '401K AA CONTRIB ($)' + (psSuggestion ? ' ~' + formatUSD(psSuggestion) : '')),
            h('input', { type: 'number', step: '0.01', value: psVal, style: S.input, placeholder: psSuggestion ? psSuggestion.toFixed(2) : '156.03', onChange: function (ev) { setPsVal(ev.target.value); } })
          )
        ),

        /* Preview em tempo real */
        (grossVal && contribVal && parseFloat(grossVal) > 0) ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#5EEAD4', marginBottom: 4 } },
          'Match empresa: ' + formatUSD(parseFloat(grossVal) * (Math.min(parseFloat(contribVal)/parseFloat(grossVal)*100, matchLimitPct)/100)) +
          (psVal ? ' · AA Contrib: ' + formatUSD(parseFloat(psVal)) : '')
        ) : null,
        (grossVal && netVal && parseFloat(grossVal) >= parseFloat(netVal)) ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#FBBF24', marginBottom: 6 } },
          'Redução: ' + reductionPct(parseFloat(grossVal), parseFloat(netVal)).toFixed(2) + '%'
        ) : null,

        err ? h('div', { style: S.errorText }, err) : null,

        /* Botões */
        h('div', { style: { display: 'flex', gap: 8 } },
          h('button', { style: S.submitBtn, onClick: handleSave, disabled: saving }, saving ? 'SALVANDO...' : 'SALVAR'),
          h('button', { style: Object.assign({}, S.addBtn, { color: '#B0B7C3', borderColor: '#374151' }), onClick: function () { setEditing(false); setErr(''); } }, 'CANCELAR')
        )
      );
    }

    return h('div', { key: e.id, style: S.entryRow },
      h('div', { style: S.entryDate }, formatDateLabel(e.date)),
      h('div', null,
        h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 6 } },
          h('div', { style: S.entryBalance }, formatUSD(e.amount)),
          e.gross != null ? h('span', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#D1D5DB' } }, 'de ' + formatUSD(e.gross)) : null
        ),
        contrib != null ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#5EEAD4', marginTop: 1 } },
          '401K: ' + formatUSD(contrib) + (myContribPct ? ' (' + myContribPct.toFixed(1) + '%)' : '') +
          (companyTotal != null ? ' · empresa: ' + formatUSD(companyTotal) : '')
        ) : null,
        h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#D1D5DB', marginTop: 1 } },
          (isBonus ? 'BÔNUS · ' : '') + rangeLabel
        )
      ),
      h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, textAlign: 'right' } },
        pct != null
          ? h('span', { style: { color: '#FB7185' } }, '-' + pct.toFixed(1) + '%')
          : h('span', { style: { color: '#D1D5DB' } }, e.gross == null ? 'SEM GROSS' : (isBonus ? 'BÔNUS' : ''))
      ),
      h('div', { style: { display: 'flex', gap: 4 } },
        h('button', { style: Object.assign({}, S.deleteBtn, { color: '#5EEAD4' }), onClick: function () { setEditing(true); } }, h(Icon, { name: 'edit', size: 13 })),
        h('button', { style: S.deleteBtn, onClick: function () { onDelete(e.id); } }, h(Icon, { name: 'trash', size: 13 }))
      )
    );
  }

  function PayTab() {
    var state = React.useState(loadCachedPayEntries());
    var entries = state[0], setEntries = state[1];

    var syncState = React.useState('syncing');
    var syncStatus = syncState[0], setSyncStatus = syncState[1];

    var formState = React.useState(false);
    var showForm = formState[0], setShowForm = formState[1];

    var newDateState = React.useState('');
    var newDate = newDateState[0], setNewDate = newDateState[1];

    var newNetState = React.useState('');
    var newNet = newNetState[0], setNewNet = newNetState[1];

    var newGrossState = React.useState('');
    var newGross = newGrossState[0], setNewGross = newGrossState[1];

    var newTypeState = React.useState('Regular payroll run');
    var newType = newTypeState[0], setNewType = newTypeState[1];

    var newContribState = React.useState('');
    var newContrib = newContribState[0], setNewContrib = newContribState[1];

    var newPsState = React.useState('');
    var newPs = newPsState[0], setNewPs = newPsState[1];

    var errState = React.useState('');
    var error = errState[0], setError = errState[1];

    var savingState = React.useState(false);
    var saving = savingState[0], setSaving = savingState[1];

    React.useEffect(function () {
      var cancelled = false;
      SupabaseAPI.fetchPayEntries().then(function (remote) {
        if (cancelled) return;
        if (remote && remote.length > 0) { setEntries(remote); cachePayEntries(remote); }
        setSyncStatus('synced');
      }).catch(function () { setSyncStatus('offline'); });
      return function () { cancelled = true; };
    }, []);

    function handleAdd() {
      setError('');
      if (!newDate) { setError('Selecione a data do pagamento.'); return; }
      var net = parseFloat(newNet);
      if (!newNet || isNaN(net)) { setError('Informe o valor líquido (NET).'); return; }
      var gross = newGross ? parseFloat(newGross) : null;
      if (newGross && (isNaN(gross) || gross < net)) { setError('Gross não pode ser menor que o líquido.'); return; }
      var contrib = newContrib ? parseFloat(newContrib) : null;
      var ps = newPs ? parseFloat(newPs) : null;

      var draft = { date: newDate, periodStart: newDate, periodEnd: newDate, amount: net, gross: gross, contrib401k: contrib, profitSharing: ps, type: newType || 'Regular payroll run' };
      setSaving(true);

      SupabaseAPI.insertPayEntry(draft).then(function (created) {
        var next = entries.concat([created]);
        setEntries(next); cachePayEntries(next);
        setNewDate(''); setNewNet(''); setNewGross(''); setNewContrib(''); setNewPs(''); setNewType('Regular payroll run');
        setShowForm(false); setSaving(false);
      }).catch(function () {
        var localEntry = Object.assign({ id: 'local-' + Date.now() }, draft);
        var next = entries.concat([localEntry]);
        setEntries(next); cachePayEntries(next);
        setSyncStatus('offline');
        setError('Sem conexão — salvo só neste dispositivo por enquanto.');
        setSaving(false);
      });
    }

    function handleDelete(id) {
      var next = entries.filter(function (e) { return e.id !== id; });
      setEntries(next); cachePayEntries(next);
      if (String(id).indexOf('local-') === 0) return;
      SupabaseAPI.deletePayEntry(id).catch(function () { setSyncStatus('offline'); });
    }

    function handleUpdate(id, fields, callback) {
      if (String(id).indexOf('local-') === 0) {
        var next = entries.map(function (e) {
          return e.id === id ? Object.assign({}, e, { date: fields.date || e.date, type: fields.type || e.type, gross: fields.gross, amount: fields.amount, contrib401k: fields.contrib401k }) : e;
        });
        setEntries(next); cachePayEntries(next);
        callback(true);
        return;
      }
      SupabaseAPI.updatePayEntry(id, {
        date: fields.date,
        type: fields.type,
        gross: fields.gross,
        amount: fields.amount,
        contrib401k: fields.contrib401k,
        profitSharing: fields.profitSharing
      }).then(function (updated) {
        var next = entries.map(function (e) { return e.id === id ? updated : e; });
        setEntries(next); cachePayEntries(next);
        callback(true);
      }).catch(function (e) {
        console.error('Falha ao atualizar pagamento:', e.message);
        callback(false, 'Erro: ' + (e.message || 'sem conexão') + ' — tente de novo.');
      });
    }

    var sorted = entries.slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); });

    /* Lê config do paycheck do Supabase pra usar matchLimitPct e profitSharingPct */
    var paycheckCfgState = React.useState(loadJSON(KEY_PAYCHECK, defaultPaycheckConfig));
    var paycheckCfg = paycheckCfgState[0], setPaycheckCfg = paycheckCfgState[1];

    React.useEffect(function () {
      SupabaseAPI.fetchUserConfig().then(function (remote) {
        if (remote && Object.keys(remote).length > 0) {
          var merged = Object.assign({}, defaultPaycheckConfig, remote);
          setPaycheckCfg(merged);
          saveJSON(KEY_PAYCHECK, merged);
        }
      }).catch(function () {});
    }, []);

    var matchLimitPct = num(paycheckCfg.matchLimitPct, 4);
    var profitSharingPct = num(paycheckCfg.profitSharingPct, 5);

    /* ---------- Agrupa por mês ---------- */
    var groups = {}, order = [];
    sorted.forEach(function (e) {
      var key = monthKey(e.date);
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(e);
    });
    order.sort();

    var monthSummaries = order.map(function (key) {
      var items = groups[key];
      var totalNet = items.reduce(function (s, e) { return s + e.amount; }, 0);
      var totalGross = items.every(function (e) { return e.gross != null; })
        ? items.reduce(function (s, e) { return s + e.gross; }, 0) : null;
      return { key: key, items: items, total: totalNet, totalGross: totalGross, count: items.length };
    });

    var grandNet = monthSummaries.reduce(function (s, m) { return s + m.total; }, 0);
    var avgMonth = monthSummaries.length ? grandNet / monthSummaries.length : 0;

    /* W-2 estimado = soma de todos os gross do ano corrente que existem */
    var currentYear = new Date().getFullYear().toString();
    var w2Entries = sorted.filter(function (e) { return e.date && e.date.startsWith(currentYear) && e.gross != null; });
    var w2Gross = w2Entries.reduce(function (s, e) { return s + e.gross; }, 0);
    var w2Net   = w2Entries.reduce(function (s, e) { return s + e.amount; }, 0);
    var w2Reduction = w2Gross > 0 ? ((w2Gross - w2Net) / w2Gross) * 100 : null;

    /* Totais anuais 401k */
    var contrib401kEntries = sorted.filter(function (e) { return e.date && e.date.startsWith(currentYear) && e.contrib401k != null && e.gross != null; });
    var totalMyContrib = contrib401kEntries.reduce(function (s, e) { return s + e.contrib401k; }, 0);
    var totalCompanyMatch = contrib401kEntries.reduce(function (s, e) {
      return s + e.gross * (Math.min(e.contrib401k / e.gross * 100, matchLimitPct) / 100);
    }, 0);
    var totalProfitSharing = contrib401kEntries.reduce(function (s, e) { return s + e.gross * profitSharingPct / 100; }, 0);
    var totalCompany = totalCompanyMatch + totalProfitSharing;
    var total401kYTD = totalMyContrib + totalCompany;

    var chartData = monthSummaries.map(function (m) { return { label: monthLabel(m.key), value: m.total }; });

    /* ---------- Cards por mês ---------- */
    var monthCards = monthSummaries.slice().reverse().map(function (m) {
      var mReduction = m.totalGross ? reductionPct(m.totalGross, m.total) : null;

      var rows = m.items.slice().reverse().map(function (e) {
        return h(PayEntryRow, { key: e.id, entry: e, onDelete: handleDelete, onUpdate: handleUpdate, matchLimitPct: matchLimitPct, profitSharingPct: profitSharingPct });
      });

      return h('div', { key: m.key, style: S.card },
        h('div', { style: S.cardHeader },
          h('span', { style: S.cardTitle }, monthLabel(m.key)),
          h('span', { style: S.cardSub }, m.count + ' pagamento' + (m.count > 1 ? 's' : ''))
        ),
        h('div', { style: S.totalRow },
          h('span', null, 'LÍQUIDO'),
          h('span', { style: { color: '#5EEAD4' } }, formatUSD(m.total))
        ),
        m.totalGross ? h('div', { style: S.totalRow },
          h('span', null, 'GROSS'),
          h('div', { style: { textAlign: 'right' } },
            h('div', { style: { color: '#D1D5DB', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 } }, formatUSD(m.totalGross)),
            mReduction ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#FB7185' } }, 'redução ' + mReduction.toFixed(1) + '%') : null
          )
        ) : null,
        h('div', { style: S.entryList }, rows)
      );
    });

    var syncBadge;
    if (syncStatus === 'syncing') syncBadge = h('span', { style: { color: '#B0B7C3' } }, 'SINCRONIZANDO...');
    else if (syncStatus === 'synced') syncBadge = h('span', { style: { color: '#5EEAD4' } }, '☁ SINCRONIZADO');
    else syncBadge = h('span', { style: { color: '#FBBF24' } }, '⚠ OFFLINE · USANDO CACHE LOCAL');

    return h(React.Fragment, null,

      /* ---------- Card principal: net total ---------- */
      h('div', { style: S.gaugeCard },
        h('div', { style: S.gaugeLabel }, 'TOTAL RECEBIDO (LÍQUIDO)'),
        h('div', { style: S.gaugeValue }, formatUSD(grandNet)),
        h('div', { style: S.gaugeDate }, monthSummaries.length + ' meses · MÉDIA ' + formatUSD(avgMonth) + '/MÊS'),
        h('div', { style: S.deltaRow },
          h('div', { style: S.deltaBox },
            h('div', { style: S.deltaLabel }, 'ÚLTIMO MÊS'),
            h('div', { style: Object.assign({}, S.deltaValue, { color: '#5EEAD4' }) },
              monthSummaries.length ? formatUSD(monthSummaries[monthSummaries.length - 1].total) : '—'
            )
          ),
          h('div', { style: S.deltaDivider }),
          h('div', { style: S.deltaBox },
            h('div', { style: S.deltaLabel }, 'Nº DE PAGAMENTOS'),
            h('div', { style: Object.assign({}, S.deltaValue, { color: '#F9FAFB' }) }, String(sorted.length))
          )
        )
      ),

      /* ---------- Card W-2 / gross anual ---------- */
      w2Gross > 0 ? h('div', { style: S.card },
        h('div', { style: S.cardHeader },
          h('span', { style: S.cardTitle }, 'W-2 ESTIMADO ' + currentYear),
          h('span', { style: S.cardSub }, w2Entries.length + ' períodos com gross')
        ),
        h('div', { style: S.totalRow },
          h('span', null, 'GROSS YTD'),
          h('span', { style: { color: '#F9FAFB', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700 } }, formatUSD(w2Gross))
        ),
        h('div', { style: S.totalRow },
          h('span', null, 'NET YTD'),
          h('span', { style: { color: '#5EEAD4' } }, formatUSD(w2Net))
        ),
        h('div', { style: S.totalRow },
          h('span', null, 'TOTAL DESCONTADO'),
          h('span', { style: { color: '#FB7185' } }, formatUSD(w2Gross - w2Net))
        ),
        h('div', { style: Object.assign({}, S.totalRow, { borderTop: '1px solid #134E4A', paddingTop: 10, marginTop: 4 }) },
          h('span', null, 'TAXA EFETIVA DE REDUÇÃO'),
          h('span', { style: { color: '#FBBF24', fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700 } },
            w2Reduction.toFixed(2) + '%'
          )
        ),
        h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#D1D5DB', marginTop: 8 } },
          'Soma de impostos + deduções ÷ gross. Registre o gross em cada pagamento para manter atualizado.'
        )
      ) : null,

      h('div', { style: { textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: 1, margin: '10px 0 -4px' } }, syncBadge),

      h('div', { style: S.card },
        h('div', { style: S.cardHeader },
          h('span', { style: S.cardTitle }, 'LÍQUIDO POR MÊS'),
          h('span', { style: S.cardSub }, monthSummaries.length + ' meses')
        ),
        h(MiniChart, { data: chartData })
      ),

      /* ---------- Card 401k anual ---------- */
      total401kYTD > 0 ? h('div', { style: S.card },
        h('div', { style: S.cardHeader },
          h('span', { style: S.cardTitle }, '401K YTD ' + currentYear),
          h('span', { style: S.cardSub }, contrib401kEntries.length + ' períodos')
        ),
        h('div', { style: S.totalRow },
          h('span', null, 'MINHA CONTRIBUIÇÃO'),
          h('span', { style: { color: '#5EEAD4' } }, formatUSD(totalMyContrib))
        ),
        h('div', { style: S.totalRow },
          h('span', null, 'MATCH DA EMPRESA'),
          h('span', { style: { color: '#5EEAD4' } }, formatUSD(totalCompanyMatch))
        ),
        h('div', { style: S.totalRow },
          h('span', null, '401K AA CONTRIB (' + profitSharingPct + '%)'),
          h('span', { style: { color: '#5EEAD4' } }, formatUSD(totalProfitSharing))
        ),
        h('div', { style: S.totalRow },
          h('span', null, 'TOTAL EMPRESA'),
          h('span', { style: { color: '#D1D5DB' } }, formatUSD(totalCompany))
        ),
        h('div', { style: Object.assign({}, S.totalRow, { borderTop: '1px solid #134E4A', paddingTop: 10, marginTop: 4 }) },
          h('span', null, 'TOTAL 401K (EU + EMPRESA)'),
          h('span', { style: { color: '#F9FAFB', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 14 } }, formatUSD(total401kYTD))
        )
      ) : null,

      monthCards,

      /* ---------- Formulário de novo pagamento ---------- */
      h('div', { style: S.card },
        h('div', { style: S.cardHeader },
          h('span', { style: S.cardTitle }, 'ADICIONAR PAGAMENTO'),
          h('button', { style: S.addBtn, onClick: function () { setShowForm(!showForm); } },
            h(Icon, { name: 'plus', size: 14 }),
            showForm ? 'CANCELAR' : 'NOVO'
          )
        ),
        showForm ? h('div', { style: S.formBox },
          h('div', { style: S.formRow },
            h('label', { style: S.formLabel }, 'DATA DO PAGAMENTO'),
            h('input', { type: 'date', value: newDate, style: S.input, onChange: function (ev) { setNewDate(ev.target.value); } })
          ),
          h('div', { style: S.formRow },
            h('label', { style: S.formLabel }, 'GROSS (BRUTO) — recomendado'),
            h('input', { type: 'number', step: '0.01', placeholder: 'ex: 3120.50', value: newGross, style: S.input, onChange: function (ev) { setNewGross(ev.target.value); } })
          ),
          h('div', { style: S.formRow },
            h('label', { style: S.formLabel }, 'NET (LÍQUIDO)'),
            h('input', { type: 'number', step: '0.01', placeholder: 'ex: 2008.87', value: newNet, style: S.input, onChange: function (ev) { setNewNet(ev.target.value); } })
          ),
          h('div', { style: S.formRow },
            h('label', { style: S.formLabel }, 'MINHA CONTRIB. 401K ($)'),
            h('input', { type: 'number', step: '0.01', placeholder: 'ex: 124.80', value: newContrib, style: S.input, onChange: function (ev) { setNewContrib(ev.target.value); } })
          ),
          h('div', { style: S.formRow },
            h('label', { style: S.formLabel }, '401K AA CONTRIB ($)'),
            h('input', { type: 'number', step: '0.01', placeholder: 'ex: 135.31', value: newPs, style: S.input, onChange: function (ev) { setNewPs(ev.target.value); } })
          ),
          /* Preview em tempo real */
          newGross && newNet && parseFloat(newGross) >= parseFloat(newNet)
            ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#FBBF24', marginBottom: 4 } },
                'Redução: ' + reductionPct(parseFloat(newGross), parseFloat(newNet)).toFixed(2) + '%'
              ) : null,
          newGross && newContrib && parseFloat(newGross) > 0
            ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#5EEAD4', marginBottom: 8 } },
                'Match empresa: ' + formatUSD(parseFloat(newGross) * (Math.min(parseFloat(newContrib)/parseFloat(newGross)*100, matchLimitPct)/100)) +
                ' · AA Contrib: ' + formatUSD(parseFloat(newGross) * profitSharingPct / 100)
              ) : null,
          h('div', { style: S.formRow },
            h('label', { style: S.formLabel }, 'TIPO'),
            h('select', { value: newType, style: S.input, onChange: function (ev) { setNewType(ev.target.value); } },
              h('option', { value: 'Regular payroll run' }, 'Regular payroll run'),
              h('option', { value: 'Bonus payment' }, 'Bonus payment')
            )
          ),
          error ? h('div', { style: S.errorText }, error) : null,
          h('button', { style: S.submitBtn, onClick: handleAdd, disabled: saving }, saving ? 'SALVANDO...' : 'REGISTRAR PAGAMENTO')
        ) : null
      ),

      h('div', { style: S.footer }, 'DADOS NA NUVEM (SUPABASE) · CACHE LOCAL OFFLINE')
    );
  }

  window.PayTab = PayTab;
})();
