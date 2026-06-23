/* =========================================================
   TAB 1: TRACKER DE SALDO
   ========================================================= */
(function () {
  'use strict';
  var h = React.createElement;

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
      h('div', { style: S.gaugeCard },
        h('div', { style: S.gaugeLabel }, 'SALDO ATUAL'),
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
          h('span', { style: S.cardTitle }, 'ALTÍMETRO DE SALDO'),
          h('span', { style: S.cardSub }, sorted.length + ' leituras')
        ),
        h(MiniChart, { data: chartData })
      ),

      h('div', { style: S.card },
        h('div', { style: S.cardHeader },
          h('span', { style: S.cardTitle }, 'REGISTRO DE LEITURAS'),
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

      h('div', { style: S.footer }, 'DADOS SALVOS NESTE DISPOSITIVO · NETBENEFITS / FIDELITY')
    );
  }

  window.TrackerTab = TrackerTab;
})();
