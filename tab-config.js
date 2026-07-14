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

    function updateTierRate(idx, value) {
      var tiers = getSalaryTiers(cfg).map(function (t, i) {
        return i === idx ? Object.assign({}, t, { rate: value }) : t;
      });
      update('salaryTiers', tiers);
    }

    function setCurrentTier(idx) { update('currentYosIndex', idx); }

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

    return h(React.Fragment, null,
      h('div', { style: { textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: 1, margin: '8px 0 -4px' } }, syncBadge),

      /* ---- SALÁRIO & DIFERENCIAIS ---- */
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
        h(NumField, { label: 'SOCIAL SECURITY (%)', value: cfg.ssRatePct, onChange: function (v) { update('ssRatePct', v); } }),
        h(NumField, { label: 'MEDICARE (%)', value: cfg.medicareRatePct, onChange: function (v) { update('medicareRatePct', v); } }),
        h(NumField, { label: 'FEDERAL WITHHOLDING — % EFETIVO', value: cfg.fedWithholdingPct, onChange: function (v) { update('fedWithholdingPct', v); } }),
        h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#D1D5DB', marginTop: 4 } },
          'O federal withholding efetivo varia com o gross. Ajuste se o valor calculado diferir do holerite real.'
        )
      ),

      /* ---- DEDUÇÕES PRÉ-TAX ---- */
      h(Section, { title: 'DEDUÇÕES PRÉ-TAX', summary: formatUSD(totalPreTax), defaultOpen: false },
        preTaxItems.map(function (item) {
          return h('div', { key: item.key, style: S.lineItemRow },
            h('span', { style: S.lineItemLabel }, item.label),
            h('input', {
              type: 'number', step: '0.01', value: item.value,
              style: Object.assign({}, S.input, { width: 90, textAlign: 'right' }),
              onChange: function (ev) { updatePreTaxItem(item.key, ev.target.value); }
            })
          );
        }),
        h('div', { style: S.totalRow },
          h('span', null, 'TOTAL'), h('span', { style: { color: '#5EEAD4' } }, formatUSD(totalPreTax))
        )
      ),

      /* ---- DEDUÇÕES PÓS-TAX ---- */
      h(Section, { title: 'DEDUÇÕES PÓS-TAX', summary: formatUSD(totalPostTax), defaultOpen: false },
        postTaxItems.map(function (item) {
          return h('div', { key: item.key, style: S.lineItemRow },
            h('span', { style: S.lineItemLabel }, item.label),
            h('input', {
              type: 'number', step: '0.01', value: item.value,
              style: Object.assign({}, S.input, { width: 90, textAlign: 'right' }),
              onChange: function (ev) { updatePostTaxItem(item.key, ev.target.value); }
            })
          );
        }),
        h('div', { style: S.totalRow },
          h('span', null, 'TOTAL'), h('span', { style: { color: '#5EEAD4' } }, formatUSD(totalPostTax))
        )
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
          'Toque em uma faixa para marcá-la como sua posição atual. A projeção avança um tier por ano automaticamente.'
        ),
        salaryTiers.map(function (t, i) {
          var isCurrent = i === currentYosIndex;
          return h('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
            h('button', {
              style: Object.assign({}, S.tierBadge, isCurrent ? {} : { background: '#1F2937', color: '#D1D5DB' }, { cursor: 'pointer', border: 'none', flexShrink: 0, width: 60, fontSize: 9 }),
              onClick: function () { setCurrentTier(i); }
            }, t.yos + 'a'),
            h('input', {
              type: 'number', step: '0.01', value: t.rate, style: Object.assign({}, S.input, { flex: 1 }),
              onChange: function (ev) { updateTierRate(i, ev.target.value); }
            }),
            h('span', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#D1D5DB' } }, '/h')
          );
        }),
        h('button', { style: Object.assign({}, S.ghostBtn, { marginTop: 8 }), onClick: function () { update('salaryTiers', DEFAULT_SALARY_TIERS); update('currentYosIndex', 0); } },
          h(Icon, { name: 'reset', size: 12 }), 'RESTAURAR TABELA PADRÃO'
        )
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
