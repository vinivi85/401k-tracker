/* =========================================================
   TAB: PAYCHECK — cálculo e visualização do contracheque
   Todos os parâmetros (taxas, deduções, 401k%) vêm da aba CONFIG.
   Aqui só se lançam as horas da quinzena.
   ========================================================= */
(function () {
  'use strict';
  var h = React.createElement;

  /* ---------- Cálculo do contracheque ---------- */
  function calcPaycheck(cfg) {
    var base = num(cfg.baseRate, 23.28);
    var otRate = base * 1.5;
    var ot2Rate = base * 2;
    var holRate = base;
    var wrkHolRate = base * 1.5;

    var s2RegDiff  = num(cfg.shift2RegDiff, 0.51);
    var s2OtDiff   = num(cfg.shift2OtDiff, 0.77);
    var s2Ot2Diff  = num(cfg.shift2Ot2Diff, 1.02);

    var regHours   = num(cfg.regHours, 0);
    var otHours    = num(cfg.otHours, 0);
    var ot2Hours   = num(cfg.ot2Hours, 0);
    var holHours   = num(cfg.holHours, 0);
    var wrkHolHours = num(cfg.wrkHolHours, 0);
    var lunchHours = num(cfg.lunchPenaltyHours, 0);

    var payReg    = regHours   * base;
    var payOt     = otHours    * otRate;
    var payOt2    = ot2Hours   * ot2Rate;
    var payHol    = holHours   * holRate;
    var payWrkHol = wrkHolHours * wrkHolRate;
    var payLunch  = lunchHours * otRate;

    var regLikeHours = regHours + holHours;
    var otLikeHours  = otHours + wrkHolHours + lunchHours;
    var ot2LikeHours = ot2Hours;

    var diffReg  = regLikeHours  * s2RegDiff;
    var diffOt   = otLikeHours   * s2OtDiff;
    var diffOt2  = ot2LikeHours  * s2Ot2Diff;

    var gross = payReg + payOt + payOt2 + payHol + payWrkHol + payLunch + diffReg + diffOt + diffOt2;

    var contrib401k    = gross * (num(cfg.contrib401kPct, 4) / 100);
    var matchLimitPct  = num(cfg.matchLimitPct, 4);
    var profitSharingPct = num(cfg.profitSharingPct, 5);
    var myContribPct   = num(cfg.contrib401kPct, 4);
    var companyMatch   = gross * (Math.min(myContribPct, matchLimitPct) / 100);
    var profitSharing  = gross * (profitSharingPct / 100);
    var companyTotal   = companyMatch + profitSharing;
    var total401k      = contrib401k + companyTotal;

    var sumItems = function (items) { return (items || []).reduce(function (s, i) { return s + num(i.value); }, 0); };
    var preTaxTotal  = sumItems(cfg.preTaxItems);
    var postTaxTotal = sumItems(cfg.postTaxItems);

    var ssMedicareBase    = gross - preTaxTotal;
    var federalTaxableBase = ssMedicareBase - contrib401k;
    var ss      = ssMedicareBase    * (num(cfg.ssRatePct, 6.2)          / 100);
    var medicare = ssMedicareBase   * (num(cfg.medicareRatePct, 1.45)   / 100);
    var federal  = federalTaxableBase > 0 ? federalTaxableBase * (num(cfg.fedWithholdingPct, 1.2316) / 100) : 0;

    var totalDeductions = contrib401k + preTaxTotal + ss + medicare + federal + postTaxTotal;
    var net = gross - totalDeductions;

    return {
      base, otRate, ot2Rate, holRate, wrkHolRate,
      s2RegDiff, s2OtDiff, s2Ot2Diff,
      payReg, payOt, payOt2, payHol, payWrkHol, payLunch,
      diffReg, diffOt, diffOt2,
      gross, contrib401k, companyMatch, profitSharing, companyTotal, total401k,
      preTaxTotal, postTaxTotal,
      ssMedicareBase, federalTaxableBase,
      ss, medicare, federal,
      totalDeductions, net
    };
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

  function InfoBadge(props) {
    return h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#D1D5DB', margin: '4px 0 8px', lineHeight: 1.4 } },
      '⚙ ' + props.text + ' — edite em CONFIG'
    );
  }

  function PaycheckTab() {
    var cfgState = React.useState(loadJSON(KEY_PAYCHECK, defaultPaycheckConfig));
    var cfg = cfgState[0], setCfg = cfgState[1];

    var showImportState = React.useState(false);
    var showImport = showImportState[0], setShowImport = showImportState[1];

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

    function update(field, value) {
      var next = Object.assign({}, cfg);
      next[field] = value;
      setCfg(next);
      saveJSON(KEY_PAYCHECK, next);
      /* Salva no Supabase com debounce de 1s */
      clearTimeout(window._paycheckSaveTimer);
      window._paycheckSaveTimer = setTimeout(function () {
        SupabaseAPI.saveUserConfig(next).catch(function (e) {
          console.error('Falha ao salvar config no Supabase', e);
        });
      }, 1000);
    }

    var r = calcPaycheck(cfg);
    var preTaxItems  = cfg.preTaxItems  || [];
    var postTaxItems = cfg.postTaxItems || [];

    var lineItems = [];
    if (num(cfg.regHours) > 0)          lineItems.push(['WRK REG ('   + cfg.regHours   + 'h × ' + formatUSD(r.base)      + ')', r.payReg]);
    if (num(cfg.otHours) > 0)           lineItems.push(['WRK OT1.5 (' + cfg.otHours    + 'h × ' + formatUSD(r.otRate)    + ')', r.payOt]);
    if (num(cfg.ot2Hours) > 0)          lineItems.push(['WRK OT2.0 (' + cfg.ot2Hours   + 'h × ' + formatUSD(r.ot2Rate)   + ')', r.payOt2]);
    if (num(cfg.holHours) > 0)          lineItems.push(['HOL ('        + cfg.holHours   + 'h × ' + formatUSD(r.holRate)   + ')', r.payHol]);
    if (num(cfg.wrkHolHours) > 0)       lineItems.push(['WRK-HOL ('   + cfg.wrkHolHours + 'h × ' + formatUSD(r.wrkHolRate) + ')', r.payWrkHol]);
    if (num(cfg.lunchPenaltyHours) > 0) lineItems.push(['LUNCH-P ('   + cfg.lunchPenaltyHours + 'h × ' + formatUSD(r.otRate) + ')', r.payLunch]);
    if (r.diffReg  > 0) lineItems.push(['Shift 2 REG diff (' + (num(cfg.regHours) + num(cfg.holHours)) + 'h × ' + formatUSD(r.s2RegDiff) + ')', r.diffReg]);
    if (r.diffOt   > 0) lineItems.push(['Shift 2 OT diff ('  + (num(cfg.otHours) + num(cfg.wrkHolHours) + num(cfg.lunchPenaltyHours)) + 'h × ' + formatUSD(r.s2OtDiff) + ')', r.diffOt]);
    if (r.diffOt2  > 0) lineItems.push(['Shift 2 DT diff ('  + cfg.ot2Hours + 'h × ' + formatUSD(r.s2Ot2Diff) + ')', r.diffOt2]);

    return h(React.Fragment, null,

      /* ---- Prévia ---- */
      h('div', { style: S.gaugeCard },
        h('div', { style: S.gaugeLabel }, 'PRÉVIA · PRÓXIMO PAYCHECK'),
        h('div', { style: S.deltaRow },
          h('div', { style: S.deltaBox },
            h('div', { style: S.deltaLabel }, 'BRUTO (GROSS)'),
            h('div', { style: S.gaugeValueSm }, formatUSD(r.gross))
          ),
          h('div', { style: S.deltaDivider }),
          h('div', { style: S.deltaBox },
            h('div', { style: S.deltaLabel }, 'LÍQUIDO (NET)'),
            h('div', { style: Object.assign({}, S.gaugeValueSm, { color: '#5EEAD4' }) }, formatUSD(r.net))
          )
        ),
        h('div', { style: Object.assign({}, S.gaugeDate, { marginTop: 14, marginBottom: 0 }) },
          'TOTAL DESCONTOS: ' + formatUSD(r.totalDeductions))
      ),

      /* ---- Horas ---- */
      h('div', { style: S.card },
        h('div', { style: S.cardHeader },
          h('span', { style: S.cardTitle }, 'HORAS DA QUINZENA'),
          h('button', { style: S.ghostBtn, onClick: function () { setShowImport(!showImport); } },
            h(Icon, { name: 'chart', size: 12 }), 'IMPORTAR')
        ),
        showImport ? h('div', { style: S.importBox },
          'Para atualizar com base no seu último paycheck: tire print ou PDF do Pay Statement e mande no chat com a Claude. ',
          'Ela lê os valores (horas, deduções, impostos) e te devolve os números prontos para colar nos campos.'
        ) : null,
        h('div', { style: S.formRow2 },
          h(NumField, { label: 'REG (h)',    value: cfg.regHours,          step: '0.01', onChange: function (v) { update('regHours', v); } }),
          h(NumField, { label: 'OT 1.5 (h)', value: cfg.otHours,          step: '0.01', onChange: function (v) { update('otHours', v); } })
        ),
        h('div', { style: S.formRow2 },
          h(NumField, { label: 'OT 2.0 (h)', value: cfg.ot2Hours,          step: '0.01', onChange: function (v) { update('ot2Hours', v); } }),
          h(NumField, { label: 'HOL (h)',     value: cfg.holHours,          step: '0.01', onChange: function (v) { update('holHours', v); } })
        ),
        h('div', { style: S.formRow2 },
          h(NumField, { label: 'WRK-HOL (h)', value: cfg.wrkHolHours,      step: '0.01', onChange: function (v) { update('wrkHolHours', v); } }),
          h(NumField, { label: 'LUNCH-P (h)', value: cfg.lunchPenaltyHours, step: '0.01', onChange: function (v) { update('lunchPenaltyHours', v); } })
        )
      ),

      /* ---- Detalhamento bruto ---- */
      h('div', { style: S.card },
        h('div', { style: S.cardHeader }, h('span', { style: S.cardTitle }, 'DETALHAMENTO DO BRUTO')),
        h(InfoBadge, { text: 'Base ' + formatUSD(r.base) + '/h · OT1.5 ' + formatUSD(r.otRate) + ' · OT2.0 ' + formatUSD(r.ot2Rate) + ' · S2-REG +' + formatUSD(r.s2RegDiff) + ' · S2-OT +' + formatUSD(r.s2OtDiff) + ' · S2-DT +' + formatUSD(r.s2Ot2Diff) }),
        lineItems.map(function (item, i) {
          return h('div', { key: i, style: S.lineItemRow },
            h('span', { style: S.lineItemLabel }, item[0]),
            h('span', { style: S.lineItemValue }, formatUSD(item[1]))
          );
        }),
        h('div', { style: Object.assign({}, S.totalRow, { color: '#F9FAFB' }) },
          h('span', null, 'GROSS'), h('span', null, formatUSD(r.gross))
        )
      ),

      /* ---- 401K (só leitura) ---- */
      h('div', { style: S.card },
        h('div', { style: S.cardHeader }, h('span', { style: S.cardTitle }, '401(K) — CONTRIBUIÇÕES')),
        h(InfoBadge, { text: 'Employee ' + num(cfg.contrib401kPct, 4) + '% · Match limite ' + num(cfg.matchLimitPct, 4) + '% · AA Contrib ' + num(cfg.profitSharingPct, 5) + '%' }),
        h('div', { style: S.lineItemRow },
          h('span', { style: S.lineItemLabel }, 'Minha contribuição (' + num(cfg.contrib401kPct, 4) + '%)'),
          h('span', { style: S.lineItemValue }, formatUSD(r.contrib401k))
        ),
        h('div', { style: S.lineItemRow },
          h('span', { style: S.lineItemLabel }, 'Match AA (' + num(cfg.matchLimitPct, 4) + '%)'),
          h('span', { style: S.lineItemValue }, formatUSD(r.companyMatch))
        ),
        h('div', { style: S.lineItemRow },
          h('span', { style: S.lineItemLabel }, '401K AA Contrib (' + num(cfg.profitSharingPct, 5) + '%)'),
          h('span', { style: S.lineItemValue }, formatUSD(r.profitSharing))
        ),
        h('div', { style: Object.assign({}, S.lineItemRow, { borderBottom: 'none' }) },
          h('span', { style: S.lineItemLabel }, 'Total empresa'),
          h('span', { style: Object.assign({}, S.lineItemValue, { color: '#5EEAD4' }) }, formatUSD(r.companyTotal))
        ),
        h('div', { style: Object.assign({}, S.totalRow, { borderTop: '1px solid #1A2333', paddingTop: 10, marginTop: 4 }) },
          h('span', null, 'TOTAL 401K (EU + EMPRESA)'),
          h('span', { style: { color: '#F9FAFB', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 } }, formatUSD(r.total401k))
        )
      ),

      /* ---- Deduções pré-tax (só leitura) ---- */
      h('div', { style: S.card },
        h('div', { style: S.cardHeader }, h('span', { style: S.cardTitle }, 'DEDUÇÕES PRÉ-TAX')),
        h(InfoBadge, { text: 'Valores configurados em CONFIG → Deduções Pré-Tax' }),
        preTaxItems.map(function (item, i) {
          return h('div', { key: i, style: S.lineItemRow },
            h('span', { style: S.lineItemLabel }, item.label),
            h('span', { style: S.lineItemValue }, formatUSD(num(item.value)))
          );
        }),
        h('div', { style: Object.assign({}, S.totalRow, { fontSize: 12, paddingTop: 8 }) },
          h('span', null, 'TOTAL PRÉ-TAX'), h('span', null, formatUSD(r.preTaxTotal))
        )
      ),

      /* ---- Impostos (só leitura) ---- */
      h('div', { style: S.card },
        h('div', { style: S.cardHeader }, h('span', { style: S.cardTitle }, 'TAXES (IMPOSTOS)')),
        h(InfoBadge, { text: 'SS ' + num(cfg.ssRatePct, 6.2) + '% · Medicare ' + num(cfg.medicareRatePct, 1.45) + '% · Federal ' + num(cfg.fedWithholdingPct, 1.2316) + '%' }),
        h('div', { style: S.lineItemRow },
          h('span', { style: S.lineItemLabel }, 'Social Security (' + num(cfg.ssRatePct, 6.2) + '%)'),
          h('span', { style: S.lineItemValue }, formatUSD(r.ss))
        ),
        h('div', { style: S.lineItemRow },
          h('span', { style: S.lineItemLabel }, 'Medicare (' + num(cfg.medicareRatePct, 1.45) + '%)'),
          h('span', { style: S.lineItemValue }, formatUSD(r.medicare))
        ),
        h('div', { style: S.lineItemRow },
          h('span', { style: S.lineItemLabel }, 'Federal Withholding (' + num(cfg.fedWithholdingPct, 1.2316) + '%)'),
          h('span', { style: S.lineItemValue }, formatUSD(r.federal))
        ),
        h('div', { style: Object.assign({}, S.totalRow, { fontSize: 12, paddingTop: 8, color: '#FB7185' }) },
          h('span', null, 'TOTAL TAXES'), h('span', null, formatUSD(r.ss + r.medicare + r.federal))
        )
      ),

      /* ---- Deduções pós-tax (só leitura) ---- */
      h('div', { style: S.card },
        h('div', { style: S.cardHeader }, h('span', { style: S.cardTitle }, 'DEDUÇÕES PÓS-TAX')),
        h(InfoBadge, { text: 'Valores configurados em CONFIG → Deduções Pós-Tax' }),
        postTaxItems.map(function (item, i) {
          return h('div', { key: i, style: S.lineItemRow },
            h('span', { style: S.lineItemLabel }, item.label),
            h('span', { style: S.lineItemValue }, formatUSD(num(item.value)))
          );
        }),
        h('div', { style: Object.assign({}, S.totalRow, { fontSize: 12, paddingTop: 8 }) },
          h('span', null, 'TOTAL PÓS-TAX'), h('span', null, formatUSD(r.postTaxTotal))
        )
      ),

      /* ---- NET PAY ---- */
      h('div', { style: Object.assign({}, S.card, { background: 'linear-gradient(160deg, #134E4A 0%, #111827 100%)' }) },
        h('div', { style: S.totalRow },
          h('span', { style: { color: '#5EEAD4' } }, 'NET PAY'), h('span', { style: { color: '#5EEAD4' } }, formatUSD(r.net))
        )
      ),

      h('div', { style: S.footer }, 'REGRAS BASEADAS NO PAY STUB REAL · AA FLEET SERVICE/RAMP · TWU · SHIFT 2')
    );
  }

  window.PaycheckTab = PaycheckTab;
  window.calcPaycheck = calcPaycheck;
})();
