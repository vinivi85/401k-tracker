/* =========================================================
   TAB 3: PROJEÇÃO 401(K)
   Lógica: saldo atual (do Tracker) cresce por:
   1) rendimento composto dos fundos (blend ponderado por alocação)
   2) aportes biweekly (employee + company match + company extra)
   Tabela de progressão salarial real (Fleet Service/Ramp, coluna 1/6/2026)
   aplicada para escalar o gross conforme o tempo de empresa avança.
   ========================================================= */
(function () {
  'use strict';
  var h = React.createElement;

  // Tabela real de tiers por tempo de serviço (coluna 1/6/2026), validada em sessão anterior.
  // Serve como valor padrão; o usuário pode editar e os valores ficam salvos em KEY_PROJECTION.
  var DEFAULT_SALARY_TIERS = [
    { yos: '3-4', rate: 23.28 },
    { yos: '4-5', rate: 24.52 },
    { yos: '5-6', rate: 26.36 },
    { yos: '6-7', rate: 27.61 },
    { yos: '7-8', rate: 28.87 },
    { yos: '8-9', rate: 30.50 },
    { yos: '9-10', rate: 32.65 },
    { yos: '10-11', rate: 40.31 },
    { yos: '11+', rate: 41.52 }
  ];

  var PAYCHECKS_PER_YEAR = 26; // biweekly

  function getSalaryTiers(cfg) {
    if (cfg && Array.isArray(cfg.salaryTiers) && cfg.salaryTiers.length > 0) return cfg.salaryTiers;
    return DEFAULT_SALARY_TIERS;
  }

  function getCurrentYosIndex(cfg) {
    var tiers = getSalaryTiers(cfg);
    var idx = (cfg && typeof cfg.currentYosIndex === 'number') ? cfg.currentYosIndex : 0;
    if (idx < 0 || idx >= tiers.length) idx = 0;
    return idx;
  }

  function rateForYear(tiers, currentIdx, yearOffset) {
    // yearOffset 0 = hoje. Cada ano avança um tier, até o último (mantém fixo depois)
    var idx = currentIdx + Math.floor(yearOffset);
    if (idx >= tiers.length) idx = tiers.length - 1;
    return num(tiers[idx].rate);
  }

  function getLatestBalance() {
    var entries = loadEntries();
    if (!entries || entries.length === 0) return 0;
    var sorted = entries.slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    return sorted[sorted.length - 1].balance;
  }

  function getCurrentPaycheckGross() {
    try {
      var paycheckCfg = loadJSON(KEY_PAYCHECK, defaultPaycheckConfig);
      var result = window.calcPaycheck(paycheckCfg);
      return result.gross;
    } catch (e) {
      return num(defaultProjectionConfig.biweeklyGross, 2752.39);
    }
  }

  function blendedAnnualReturn(cfg) {
    var pctLarge = num(cfg.allocPctLargeCap, 20.26) / 100;
    var pctTarget = 1 - pctLarge;
    var rLarge = num(cfg.returnLargeCap, 10.0) / 100;
    var rTarget = num(cfg.returnTargetDate, 8.0) / 100;
    return pctLarge * rLarge + pctTarget * rTarget;
  }

  function projectGrowth(startBalance, years, annualReturn, biweeklyContribFn) {
    // Simulação mês a mês (aproximação biweekly -> mensal x 2.1667), aporte cresce com a tabela de tiers
    var balance = startBalance;
    var monthlyRate = Math.pow(1 + annualReturn, 1 / 12) - 1;
    var totalContributed = 0;
    var rows = [];

    for (var m = 1; m <= years * 12; m++) {
      var yearOffset = (m - 1) / 12;
      var biweeklyContrib = biweeklyContribFn(yearOffset);
      var monthlyContrib = biweeklyContrib * (PAYCHECKS_PER_YEAR / 12);
      balance = balance * (1 + monthlyRate) + monthlyContrib;
      totalContributed += monthlyContrib;

      if (m % 12 === 0) {
        rows.push({
          year: m / 12,
          balance: balance,
          contributed: totalContributed
        });
      }
    }
    return { finalBalance: balance, totalContributed: totalContributed, rows: rows };
  }

  function NumField(props) {
    return h('div', { style: S.formRow },
      h('label', { style: S.formLabel }, props.label),
      h('input', {
        type: 'number', step: props.step || '0.01', value: props.value, style: S.input,
        onChange: function (ev) { props.onChange(ev.target.value); }
      })
    );
  }

  function ProjectionTab() {
    var cfgState = React.useState(loadJSON(KEY_PROJECTION, defaultProjectionConfig));
    var cfg = cfgState[0], setCfg = cfgState[1];

    var editState = React.useState(false);
    var editing = editState[0], setEditing = editState[1];

    var editingTiersState = React.useState(false);
    var editingTiers = editingTiersState[0], setEditingTiers = editingTiersState[1];

    var importState = React.useState(false);
    var showImport = importState[0], setShowImport = importState[1];

    function update(field, value) {
      var next = Object.assign({}, cfg);
      next[field] = value;
      setCfg(next);
      saveJSON(KEY_PROJECTION, next);
    }

    var salaryTiers = getSalaryTiers(cfg);
    var currentYosIndex = getCurrentYosIndex(cfg);

    function updateTierRate(idx, value) {
      var nextTiers = salaryTiers.map(function (t, i) { return i === idx ? Object.assign({}, t, { rate: value }) : t; });
      update('salaryTiers', nextTiers);
    }

    function setCurrentTier(idx) {
      update('currentYosIndex', idx);
    }

    function resetTiers() {
      var next = Object.assign({}, cfg, { salaryTiers: DEFAULT_SALARY_TIERS, currentYosIndex: 0 });
      setCfg(next);
      saveJSON(KEY_PROJECTION, next);
    }

    var startBalance = getLatestBalance();
    var annualReturn = blendedAnnualReturn(cfg);

    /* Lê percentuais de contribuição direto do config do Paycheck */
    var paycheckCfg = loadJSON(KEY_PAYCHECK, defaultPaycheckConfig);
    var employeePct = num(paycheckCfg.contrib401kPct, 4);
    var matchPct = num(paycheckCfg.matchLimitPct, 4);
    var aaPct = num(paycheckCfg.profitSharingPct, 5);
    var totalContribPct = employeePct + matchPct + aaPct;

    var baseBiweeklyGross = getCurrentPaycheckGross();
    var baseRateRef = num(salaryTiers[currentYosIndex].rate);

    function biweeklyContribFn(yearOffset) {
      var rate = rateForYear(salaryTiers, currentYosIndex, yearOffset);
      var scaledGross = baseRateRef > 0 ? baseBiweeklyGross * (rate / baseRateRef) : baseBiweeklyGross;
      return scaledGross * (totalContribPct / 100);
    }

    var horizons = cfg.horizons || [10, 15, 20, 25, 30];
    var monthlyRate = Math.pow(1 + annualReturn, 1 / 12) - 1;
    var projections = horizons.map(function (yrs) {
      var result = projectGrowth(startBalance, yrs, annualReturn, biweeklyContribFn);
      var monthlyYield = result.finalBalance * monthlyRate;
      return {
        years: yrs,
        finalBalance: result.finalBalance,
        totalContributed: result.totalContributed,
        growth: result.finalBalance - startBalance - result.totalContributed,
        monthlyYield: monthlyYield
      };
    });

    var chartHorizon = projections[projections.length - 1];
    var fullSim = projectGrowth(startBalance, horizons[horizons.length - 1], annualReturn, biweeklyContribFn);
    var chartData = fullSim.rows.filter(function (r) { return r.year % 5 === 0 || r.year === horizons[horizons.length - 1]; }).map(function (r) {
      return { label: 'ANO ' + r.year, value: r.balance };
    });
    chartData.unshift({ label: 'HOJE', value: startBalance });

    return h(React.Fragment, null,
      h('div', { style: S.gaugeCard },
        h('div', { style: S.gaugeLabel }, 'SALDO BASE (DO TRACKER)'),
        h('div', { style: S.gaugeValue }, formatUSD(startBalance)),
        h('div', { style: S.gaugeDate }, 'RETORNO ANUAL ESTIMADO (BLEND): ' + (annualReturn * 100).toFixed(2) + '%'),
        h('div', { style: S.deltaRow },
          h('div', { style: S.deltaBox },
            h('div', { style: S.deltaLabel }, 'EM ' + horizons[horizons.length - 1] + ' ANOS'),
            h('div', { style: Object.assign({}, S.gaugeValueSm, { color: '#5EEAD4' }) }, formatUSDShort(chartHorizon.finalBalance))
          ),
          h('div', { style: S.deltaDivider }),
          h('div', { style: S.deltaBox },
            h('div', { style: S.deltaLabel }, 'TOTAL APORTADO'),
            h('div', { style: S.gaugeValueSm }, formatUSDShort(chartHorizon.totalContributed))
          )
        )
      ),

      h('div', { style: S.card },
        h('div', { style: S.cardHeader },
          h('span', { style: S.cardTitle }, 'CRESCIMENTO PROJETADO'),
          h('span', { style: S.cardSub }, horizons[horizons.length - 1] + ' anos')
        ),
        h(MiniChart, { data: chartData, color: '#5EEAD4' })
      ),

      h('div', { style: S.card },
        h('div', { style: S.cardHeader }, h('span', { style: S.cardTitle }, 'PROJEÇÃO POR HORIZONTE')),
        h('table', { style: S.table },
          h('thead', null,
            h('tr', null,
              h('th', { style: S.th }, 'ANOS'),
              h('th', { style: Object.assign({}, S.th, { textAlign: 'right' }) }, 'SALDO'),
              h('th', { style: Object.assign({}, S.th, { textAlign: 'right' }) }, 'APORTADO'),
              h('th', { style: Object.assign({}, S.th, { textAlign: 'right' }) }, 'REND.'),
              h('th', { style: Object.assign({}, S.th, { textAlign: 'right' }) }, '/MÊS')
            )
          ),
          h('tbody', null,
            projections.map(function (p, i) {
              return h('tr', { key: i },
                h('td', { style: S.td }, p.years),
                h('td', { style: Object.assign({}, S.tdBold, { textAlign: 'right' }) }, formatUSDShort(p.finalBalance)),
                h('td', { style: Object.assign({}, S.td, { textAlign: 'right' }) }, formatUSDShort(p.totalContributed)),
                h('td', { style: Object.assign({}, S.td, { textAlign: 'right', color: '#5EEAD4' }) }, formatUSDShort(p.growth)),
                h('td', { style: Object.assign({}, S.td, { textAlign: 'right', color: '#5EEAD4' }) }, formatUSDShort(p.monthlyYield))
              );
            })
          )
        ),
        h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#4B5563', marginTop: 10, lineHeight: 1.5 } },
          'REND./MÊS = quanto o saldo projetado naquele ano renderia por mês, na taxa de retorno usada, se você parasse de aportar a partir daquele ponto.')
      ),

      h('div', { style: S.card },
        h('div', { style: S.cardHeader },
          h('span', { style: S.cardTitle }, 'PROGRESSÃO SALARIAL (FLEET SERVICE/RAMP)'),
          h('button', { style: S.ghostBtn, onClick: function () { setEditingTiers(!editingTiers); } }, editingTiers ? 'FECHAR' : 'EDITAR')
        ),

        !editingTiers ? h('div', null,
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 } },
            salaryTiers.map(function (t, i) {
              var isCurrent = i === currentYosIndex;
              return h('span', {
                key: i,
                style: Object.assign({}, S.tierBadge, isCurrent ? {} : { background: '#1F2937', color: '#9CA3AF' })
              }, t.yos + 'a: ' + formatUSD(num(t.rate)));
            })
          ),
          h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#4B5563', marginTop: 8 } },
            'Posição atual destacada: ' + salaryTiers[currentYosIndex].yos + ' anos de empresa. A projeção avança um tier por ano automaticamente.')
        ) : h('div', { style: S.formBox },
          h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#6B7280', marginBottom: 10, lineHeight: 1.5 } },
            'Toque numa faixa para marcá-la como sua posição atual. Edite o valor/hora de cada faixa conforme a tabela oficial mais recente da AA.'),
          salaryTiers.map(function (t, i) {
            var isCurrent = i === currentYosIndex;
            return h('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
              h('button', {
                style: Object.assign({}, S.tierBadge, isCurrent ? {} : { background: '#1F2937', color: '#9CA3AF' }, { cursor: 'pointer', border: 'none', flexShrink: 0, width: 64 }),
                onClick: function () { setCurrentTier(i); }
              }, t.yos + 'a'),
              h('input', {
                type: 'number', step: '0.01', value: t.rate, style: Object.assign({}, S.input, { flex: 1 }),
                onChange: function (ev) { updateTierRate(i, ev.target.value); }
              }),
              h('span', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#4B5563' } }, '/h')
            );
          }),
          h('button', { style: S.ghostBtn, onClick: resetTiers },
            h(Icon, { name: 'reset', size: 12 }), 'RESTAURAR TABELA PADRÃO')
        )
      ),

      h('div', { style: S.card },
        h('div', { style: S.cardHeader },
          h('span', { style: S.cardTitle }, 'PARÂMETROS DA PROJEÇÃO'),
          h('button', { style: S.ghostBtn, onClick: function () { setEditing(!editing); } }, editing ? 'FECHAR' : 'EDITAR')
        ),

        h('div', { style: S.importBox },
          'Retornos baseados no histórico real de 10 anos de cada fundo (prospecto NetBenefits, dados de 05/31/2026). Usamos o horizonte de 10 anos em vez de 1 ou 3 anos porque suaviza ciclos de alta e baixa do mercado — mais realista para projeção de décadas. Quer atualizar com dados mais recentes? Mande o print/PDF do prospecto aqui no chat.'
        ),

        !editing ? h('div', null,
          h('div', { style: S.lineItemRow }, h('span', { style: S.lineItemLabel }, 'Alocação US Large Cap Index'), h('span', { style: S.lineItemValue }, cfg.allocPctLargeCap + '%')),
          h('div', { style: S.lineItemRow }, h('span', { style: S.lineItemLabel }, 'Retorno 10yr · Large Cap (real, prospecto)'), h('span', { style: S.lineItemValue }, cfg.returnLargeCap + '%')),
          h('div', { style: S.lineItemRow }, h('span', { style: S.lineItemLabel }, 'Retorno 10yr · Target Date 2050 (real, prospecto)'), h('span', { style: S.lineItemValue }, cfg.returnTargetDate + '%')),
          h('div', { style: S.lineItemRow }, h('span', { style: S.lineItemLabel }, 'Gross biweekly (vem da aba PAYCHECK)'), h('span', { style: S.lineItemValue }, formatUSD(baseBiweeklyGross))),
          h('div', { style: Object.assign({}, S.lineItemRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 4 }) },
            h('span', { style: S.lineItemLabel }, 'CONTRIBUIÇÃO TOTAL 401K'),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, width: '100%' } },
              h('div', { style: { display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono', monospace", fontSize: 10 } },
                h('span', { style: { color: '#6B7280' } }, 'Employee (minha)'), h('span', { style: { color: '#9CA3AF' } }, employeePct + '%')
              ),
              h('div', { style: { display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono', monospace", fontSize: 10 } },
                h('span', { style: { color: '#6B7280' } }, 'Match AA'), h('span', { style: { color: '#9CA3AF' } }, matchPct + '%')
              ),
              h('div', { style: { display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono', monospace", fontSize: 10 } },
                h('span', { style: { color: '#6B7280' } }, '401K AA Contrib'), h('span', { style: { color: '#9CA3AF' } }, aaPct + '%')
              ),
              h('div', { style: { display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, borderTop: '1px solid #1A2333', paddingTop: 4, marginTop: 2 } },
                h('span', { style: { color: '#5EEAD4', fontWeight: 700 } }, 'TOTAL'), h('span', { style: { color: '#5EEAD4', fontWeight: 700 } }, totalContribPct + '%')
              )
            ),
            h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#4B5563', marginTop: 4 } },
              'Sincronizado da aba PAYCHECK — altere os % lá para atualizar a projeção.'
            )
          )
        ) : h('div', { style: S.formBox },
          h(NumField, { label: '% ALOCADO EM US LARGE CAP INDEX', value: cfg.allocPctLargeCap, onChange: function (v) { update('allocPctLargeCap', v); } }),
          h(NumField, { label: 'RETORNO 10YR · LARGE CAP (%)', value: cfg.returnLargeCap, onChange: function (v) { update('returnLargeCap', v); } }),
          h(NumField, { label: 'RETORNO 10YR · TARGET DATE 2050 (%)', value: cfg.returnTargetDate, onChange: function (v) { update('returnTargetDate', v); } }),
          h('div', { style: Object.assign({}, S.importBox, { marginBottom: 0 }) },
            'Contribuição total: ' + totalContribPct + '% (' + employeePct + '% employee + ' + matchPct + '% match + ' + aaPct + '% 401K AA Contrib). Para alterar, vá em PAYCHECK → card 401(K).\n\nGross biweekly: ' + formatUSD(baseBiweeklyGross) + ' — calculado automaticamente a partir das horas preenchidas na aba PAYCHECK.'
          ),
          h('button', { style: S.ghostBtn, onClick: function () { setCfg(defaultProjectionConfig); saveJSON(KEY_PROJECTION, defaultProjectionConfig); } },
            h(Icon, { name: 'reset', size: 12 }), 'RESTAURAR PADRÃO')
        )
      ),

      h('div', { style: S.footer }, 'TAXAS DE RETORNO SÃO ESTIMATIVAS HISTÓRICAS · NÃO É GARANTIA DE RESULTADO FUTURO')
    );
  }

  window.ProjectionTab = ProjectionTab;
})();
