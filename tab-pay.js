/* =========================================================
   TAB 4: PAY — holerites (líquido) agrupados por mês
   Dados inseridos manualmente a partir do histórico em pay.aa.com.
   Cada item: data do pagamento, período (referência), valor líquido, tipo.
   ========================================================= */
(function () {
  'use strict';
  var h = React.createElement;

  /* ---------- Seed: histórico de pagamentos líquidos (extraído de pay.aa.com) ---------- */
  var initialPayEntries = [
    { id: 'p1',  date: '2026-01-09', periodStart: '2025-12-22', periodEnd: '2026-01-04', amount: 912.87,   type: 'Regular payroll run' },
    { id: 'p2',  date: '2026-01-23', periodStart: '2026-01-05', periodEnd: '2026-01-18', amount: 3302.13,  type: 'Regular payroll run' },
    { id: 'p3',  date: '2026-02-06', periodStart: '2026-01-19', periodEnd: '2026-02-01', amount: 2885.24,  type: 'Regular payroll run' },
    { id: 'p4',  date: '2026-02-20', periodStart: '2026-02-02', periodEnd: '2026-02-15', amount: 2549.26,  type: 'Regular payroll run' },
    { id: 'p5',  date: '2026-02-24', periodStart: '2026-02-24', periodEnd: '2026-02-24', amount: 177.81,   type: 'Bonus payment' },
    { id: 'p6',  date: '2026-03-06', periodStart: '2026-02-16', periodEnd: '2026-03-01', amount: 3034.60,  type: 'Regular payroll run' },
    { id: 'p7',  date: '2026-03-20', periodStart: '2026-03-02', periodEnd: '2026-03-15', amount: 2677.92,  type: 'Regular payroll run' },
    { id: 'p8',  date: '2026-04-02', periodStart: '2026-03-16', periodEnd: '2026-03-29', amount: 1952.18,  type: 'Regular payroll run' },
    { id: 'p9',  date: '2026-04-17', periodStart: '2026-03-30', periodEnd: '2026-04-12', amount: 2705.82,  type: 'Regular payroll run' },
    { id: 'p10', date: '2026-05-01', periodStart: '2026-04-13', periodEnd: '2026-04-26', amount: 2642.23,  type: 'Regular payroll run' },
    { id: 'p11', date: '2026-05-15', periodStart: '2026-04-27', periodEnd: '2026-05-10', amount: 2727.79,  type: 'Regular payroll run' },
    { id: 'p12', date: '2026-05-29', periodStart: '2026-05-11', periodEnd: '2026-05-24', amount: 2511.76,  type: 'Regular payroll run' },
    { id: 'p13', date: '2026-06-12', periodStart: '2026-05-25', periodEnd: '2026-06-07', amount: 2144.22,  type: 'Regular payroll run' },
    { id: 'p14', date: '2026-06-26', periodStart: '2026-06-08', periodEnd: '2026-06-21', amount: 2008.87,  type: 'Regular payroll run' }
  ];

  var MONTH_NAMES = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];

  function loadPayEntries() {
    try {
      var raw = window.__dbCache[KEY_PAY_ENTRIES];
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return initialPayEntries;
  }

  function monthKey(iso) {
    return iso.slice(0, 7); // 'YYYY-MM'
  }

  function monthLabel(key) {
    var parts = key.split('-');
    var y = parts[0], m = parseInt(parts[1], 10) - 1;
    return MONTH_NAMES[m] + ' ' + y.slice(2);
  }

  function PayTab() {
    var state = React.useState(loadPayEntries());
    var entries = state[0], setEntries = state[1];

    var formState = React.useState(false);
    var showForm = formState[0], setShowForm = formState[1];

    var dateState = React.useState('');
    var newDate = dateState[0], setNewDate = dateState[1];

    var amountState = React.useState('');
    var newAmount = amountState[0], setNewAmount = amountState[1];

    var typeState = React.useState('Regular payroll run');
    var newType = typeState[0], setNewType = typeState[1];

    var errState = React.useState('');
    var error = errState[0], setError = errState[1];

    function handleAdd() {
      setError('');
      if (!newDate) { setError('Selecione a data do pagamento.'); return; }
      var amt = parseFloat(newAmount);
      if (!newAmount || isNaN(amt)) { setError('Informe um valor líquido válido.'); return; }
      var entry = { id: Date.now().toString(), date: newDate, periodStart: newDate, periodEnd: newDate, amount: amt, type: newType || 'Regular payroll run' };
      var next = entries.concat([entry]);
      setEntries(next);
      saveJSON(KEY_PAY_ENTRIES, next);
      setNewDate('');
      setNewAmount('');
      setNewType('Regular payroll run');
      setShowForm(false);
    }

    function handleDelete(id) {
      var next = entries.filter(function (e) { return e.id !== id; });
      setEntries(next);
      saveJSON(KEY_PAY_ENTRIES, next);
    }

    var sorted = entries.slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); });

    /* ---------- Agrupa por mês ---------- */
    var groups = {};
    var order = [];
    sorted.forEach(function (e) {
      var key = monthKey(e.date);
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(e);
    });
    order.sort();

    var monthSummaries = order.map(function (key) {
      var items = groups[key];
      var total = items.reduce(function (sum, e) { return sum + e.amount; }, 0);
      return { key: key, items: items, total: total, count: items.length };
    });

    var grandTotal = monthSummaries.reduce(function (sum, m) { return sum + m.total; }, 0);
    var avgMonth = monthSummaries.length ? grandTotal / monthSummaries.length : 0;

    var chartData = monthSummaries.map(function (m) {
      return { label: monthLabel(m.key), value: m.total };
    });

    /* ---------- Renderiza do mês mais recente para o mais antigo ---------- */
    var monthCards = monthSummaries.slice().reverse().map(function (m) {
      var rows = m.items.slice().reverse().map(function (e) {
        var rangeLabel = e.periodStart === e.periodEnd
          ? formatDateLabel(e.periodStart)
          : (formatDateLabel(e.periodStart) + '–' + formatDateLabel(e.periodEnd));
        return h('div', { key: e.id, style: S.entryRow },
          h('div', { style: S.entryDate }, formatDateLabel(e.date)),
          h('div', null,
            h('div', { style: S.entryBalance }, formatUSD(e.amount)),
            h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#4B5563', marginTop: 2 } }, e.type === 'Bonus payment' ? 'BÔNUS · ' + rangeLabel : rangeLabel)
          ),
          h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: e.type === 'Bonus payment' ? '#FBBF24' : '#4B5563', textAlign: 'right' } }, e.type === 'Bonus payment' ? 'BÔNUS' : ''),
          h('button', { style: S.deleteBtn, onClick: function () { handleDelete(e.id); } }, h(Icon, { name: 'trash', size: 13 }))
        );
      });

      return h('div', { key: m.key, style: S.card },
        h('div', { style: S.cardHeader },
          h('span', { style: S.cardTitle }, monthLabel(m.key)),
          h('span', { style: S.cardSub }, m.count + ' pagamento' + (m.count > 1 ? 's' : ''))
        ),
        h('div', { style: S.totalRow },
          h('span', null, 'TOTAL LÍQUIDO'),
          h('span', { style: { color: '#5EEAD4' } }, formatUSD(m.total))
        ),
        h('div', { style: S.entryList }, rows)
      );
    });

    return h(React.Fragment, null,
      h('div', { style: S.gaugeCard },
        h('div', { style: S.gaugeLabel }, 'TOTAL RECEBIDO (LÍQUIDO)'),
        h('div', { style: S.gaugeValue }, formatUSD(grandTotal)),
        h('div', { style: S.gaugeDate }, monthSummaries.length + ' meses registrados · MÉDIA ' + formatUSD(avgMonth) + '/MÊS'),

        h('div', { style: S.deltaRow },
          h('div', { style: S.deltaBox },
            h('div', { style: S.deltaLabel }, 'ÚLTIMO MÊS'),
            h('div', { style: Object.assign({}, S.deltaValue, { color: '#5EEAD4' }) },
              monthSummaries.length ? formatUSD(monthSummaries[monthSummaries.length - 1].total) : '—'
            )
          ),
          h('div', { style: S.deltaDivider }),
          h('div', { style: S.deltaBox },
            h('div', { style: S.deltaLabel }, 'TOTAL DE PAGAMENTOS'),
            h('div', { style: Object.assign({}, S.deltaValue, { color: '#F9FAFB' }) }, String(sorted.length))
          )
        )
      ),

      h('div', { style: S.card },
        h('div', { style: S.cardHeader },
          h('span', { style: S.cardTitle }, 'LÍQUIDO POR MÊS'),
          h('span', { style: S.cardSub }, monthSummaries.length + ' meses')
        ),
        h(MiniChart, { data: chartData })
      ),

      monthCards,

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
            h('label', { style: S.formLabel }, 'VALOR LÍQUIDO (USD)'),
            h('input', { type: 'number', step: '0.01', placeholder: '2008.87', value: newAmount, style: S.input, onChange: function (ev) { setNewAmount(ev.target.value); } })
          ),
          h('div', { style: S.formRow },
            h('label', { style: S.formLabel }, 'TIPO'),
            h('select', { value: newType, style: S.input, onChange: function (ev) { setNewType(ev.target.value); } },
              h('option', { value: 'Regular payroll run' }, 'Regular payroll run'),
              h('option', { value: 'Bonus payment' }, 'Bonus payment')
            )
          ),
          error ? h('div', { style: S.errorText }, error) : null,
          h('button', { style: S.submitBtn, onClick: handleAdd }, 'REGISTRAR PAGAMENTO')
        ) : null
      ),

      h('div', { style: S.footer }, 'DADOS SALVOS NESTE DISPOSITIVO · PAY.AA.COM')
    );
  }

  window.PayTab = PayTab;
})();
