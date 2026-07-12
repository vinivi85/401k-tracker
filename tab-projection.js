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

  var PAYCHECKS_PER_YEAR = 26; // biweekly

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
    var cfgState = React.useState(loadJSON(KEY_PAYCHECK, defaultPaycheckConfig));
    var cfg = cfgState[0], setCfg = cfgState[1];

    /* Lê progressão salarial do KEY_PAYCHECK também */
    var projCfgState = React.useState(loadJSON(KEY_PROJECTION, defaultProjectionConfig));
    var projCfg = projCfgState[0], setProjCfg = projCfgState[1];

    /* Sincroniza config do Supabase ao montar */
    React.useEffect(function () {
      var cancelled = false;
      SupabaseAPI.fetchUserConfig().then(function (remote) {
        if (cancelled) return;
        if (remote && Object.keys(remote).length > 0) {
          var merged = Object.assign({}, defaultPaycheckConfig, remote);
          setCfg(merged);
          saveJSON(KEY_PAYCHECK, merged);
        }
      }).catch(function () {});
      return function () { cancelled = true; };
    }, []);

    function updateProj(field, value) {
      var next = Object.assign({}, projCfg);
      next[field] = value;
      setProjCfg(next);
      saveJSON(KEY_PROJECTION, next);
    }

    var startBalance = getLatestBalance();

    /* Lê da config unificada (KEY_PAYCHECK) */
    var salaryTiers = getSalaryTiers(cfg);
    var currentYosIndex = getCurrentYosIndex(cfg);
    var annualReturn = blendedAnnualReturn(projCfg);

    /* Lê percentuais de contribuição direto do config do Paycheck */
    var paycheckCfg = cfg;
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

    var horizons = projCfg.horizons || [10, 15, 20, 25, 30];
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
          h('span', { style: S.cardTitle }, 'PROGRESSÃO SALARIAL (FLEET SERVICE/RAMP)')
        ),
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
          'Posição atual: ' + salaryTiers[currentYosIndex].yos + ' anos. A projeção avança um tier por ano automaticamente. ⚙ Edite em CONFIG → Progressão Salarial.')
      ),

      h('div', { style: S.card },
        h('div', { style: S.cardHeader },
          h('span', { style: S.cardTitle }, 'PARÂMETROS DA PROJEÇÃO')
        ),

        h('div', { style: S.importBox },
          'Retornos baseados no histórico real de 10 anos de cada fundo (prospecto NetBenefits, dados de 05/31/2026).'
        ),

        h('div', { style: S.lineItemRow }, h('span', { style: S.lineItemLabel }, 'Alocação US Large Cap Index'), h('span', { style: S.lineItemValue }, projCfg.allocPctLargeCap + '%')),
        h('div', { style: S.lineItemRow }, h('span', { style: S.lineItemLabel }, 'Retorno 10yr · Large Cap'), h('span', { style: S.lineItemValue }, projCfg.returnLargeCap + '%')),
        h('div', { style: S.lineItemRow }, h('span', { style: S.lineItemLabel }, 'Retorno 10yr · Target Date 2050'), h('span', { style: S.lineItemValue }, projCfg.returnTargetDate + '%')),
        h('div', { style: S.lineItemRow }, h('span', { style: S.lineItemLabel }, 'Gross biweekly (da aba PAYCHECK)'), h('span', { style: S.lineItemValue }, formatUSD(baseBiweeklyGross))),
        h('div', { style: Object.assign({}, S.lineItemRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 4 }) },
          h('span', { style: S.lineItemLabel }, 'CONTRIBUIÇÃO TOTAL 401K'),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, width: '100%' } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono', monospace", fontSize: 10 } },
              h('span', { style: { color: '#6B7280' } }, 'Employee'), h('span', { style: { color: '#9CA3AF' } }, employeePct + '%')
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
            '⚙ Edite todos os parâmetros na aba CONFIG'
          )
        )
      ),

      h('div', { style: S.footer }, 'TAXAS DE RETORNO SÃO ESTIMATIVAS HISTÓRICAS · NÃO É GARANTIA DE RESULTADO FUTURO')
    );
  }

  window.ProjectionTab = ProjectionTab;
})();
