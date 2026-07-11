/* =========================================================
   TAB 2: PAYCHECK CALCULATOR
   Regras verificadas contra pay stub real (período 06/08-06/21/2026):
   - OT1.5 = base x 1.5 | OT2.0 = base x 2.0
   - WRK-HOL (feriado trabalhado) = base x 1.5
   - HOL (feriado não trabalhado) = base x 1.0
   - Shift 2 REG diff = fixo ($0.51/h) | Shift 2 OT diff = fixo ($0.77/h) — ambos valores
     diretos do holerite, NÃO derivados um do outro por multiplicador
   - LUNCH-P entra como linha de OT (base x 1.5)
   - 401k = % do gross editável (confirmado 4% = $103.97 em gross $2,599.16)
   - SS/Medicare base = Gross - soma dos itens pré-tax (medical/dental/vision/AD&D)
   - Federal taxable base = SS/Medicare base - 401k contribution
   - SS rate confirmado: 6.2023% | Medicare rate confirmado: 1.4505%
   - Federal varia MUITO com o gross (de $31.27 a $0.00 em casos reais) — alíquota editável
   ========================================================= */
(function () {
  'use strict';
  var h = React.createElement;

  function sumItems(items) {
    if (!Array.isArray(items)) return 0;
    return items.reduce(function (sum, item) { return sum + num(item.value, 0); }, 0);
  }

  function calcPaycheck(cfg) {
    var base = num(cfg.baseRate, 23.28);
    var otRate = base * 1.5;
    var ot2Rate = base * 2.0;
    var holRate = base * 1.0;
    var wrkHolRate = base * 1.5;
    var s2RegDiff = num(cfg.shift2RegDiff, 0.51);
    var s2OtDiff = num(cfg.shift2OtDiff, 0.77);
    var s2Ot2Diff = num(cfg.shift2Ot2Diff, 1.02);

    var regHours = num(cfg.regHours, 0);
    var otHours = num(cfg.otHours, 0);
    var ot2Hours = num(cfg.ot2Hours, 0);
    var holHours = num(cfg.holHours, 0);
    var wrkHolHours = num(cfg.wrkHolHours, 0);
    var lunchHours = num(cfg.lunchPenaltyHours, 0);

    var payReg = regHours * base;
    var payOt = otHours * otRate;
    var payOt2 = ot2Hours * ot2Rate;
    var payHol = holHours * holRate;
    var payWrkHol = wrkHolHours * wrkHolRate;
    var payLunch = lunchHours * otRate;

    var regLikeHours = regHours + holHours;
    var otLikeHours = otHours + wrkHolHours + lunchHours; // OT1.5, WRK-HOL, LUNCH-P
    var ot2LikeHours = ot2Hours;                          // OT2.0 tem diff próprio ($1.02)

    var diffReg = regLikeHours * s2RegDiff;
    var diffOt = otLikeHours * s2OtDiff;
    var diffOt2 = ot2LikeHours * s2Ot2Diff;

    var gross = payReg + payOt + payOt2 + payHol + payWrkHol + payLunch + diffReg + diffOt + diffOt2;

    var contrib401k = gross * (num(cfg.contrib401kPct, 4) / 100);
    var matchLimitPct = num(cfg.matchLimitPct, 4);
    var profitSharingPct = num(cfg.profitSharingPct, 5);
    var myContribPct = num(cfg.contrib401kPct, 4);
    var companyMatch = gross * (Math.min(myContribPct, matchLimitPct) / 100);
    var profitSharing = gross * (profitSharingPct / 100);
    var companyTotal = companyMatch + profitSharing;
    var total401k = contrib401k + companyTotal;
    var preTaxTotal = sumItems(cfg.preTaxItems);
    var postTaxTotal = sumItems(cfg.postTaxItems);

    var ssMedicareBase = gross - preTaxTotal;
    var federalTaxableBase = ssMedicareBase - contrib401k;

    var ss = ssMedicareBase * (num(cfg.ssRatePct, 6.2) / 100);
    var medicare = ssMedicareBase * (num(cfg.medicareRatePct, 1.45) / 100);
    var federal = federalTaxableBase > 0 ? federalTaxableBase * (num(cfg.fedWithholdingPct, 1.2316) / 100) : 0;

    var totalDeductions = contrib401k + preTaxTotal + ss + medicare + federal + postTaxTotal;
    var net = gross - totalDeductions;

    return {
      base: base, otRate: otRate, ot2Rate: ot2Rate, holRate: holRate, wrkHolRate: wrkHolRate,
      s2RegDiff: s2RegDiff, s2OtDiff: s2OtDiff, s2Ot2Diff: s2Ot2Diff,
      payReg: payReg, payOt: payOt, payOt2: payOt2, payHol: payHol, payWrkHol: payWrkHol, payLunch: payLunch,
      diffReg: diffReg, diffOt: diffOt, diffOt2: diffOt2,
      gross: gross, contrib401k: contrib401k, companyMatch: companyMatch, profitSharing: profitSharing, companyTotal: companyTotal, total401k: total401k,
      preTaxTotal: preTaxTotal, postTaxTotal: postTaxTotal,
      ssMedicareBase: ssMedicareBase, federalTaxableBase: federalTaxableBase,
      ss: ss, medicare: medicare, federal: federal,
      totalDeductions: totalDeductions, net: net
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

  function DeductionRow(props) {
    var item = props.item;
    return h('div', { style: S.lineItemRow },
      h('span', { style: S.lineItemLabel }, item.label),
      h('input', {
        type: 'number', step: '0.01', value: item.value,
        style: { background: 'transparent', border: 'none', borderBottom: '1px dashed #374151', color: '#F9FAFB', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600, textAlign: 'right', width: 80, outline: 'none', padding: '2px 0' },
        onChange: function (ev) { props.onChange(item.key, ev.target.value); }
      })
    );
  }

  function PaycheckTab() {
    var cfgState = React.useState(loadJSON(KEY_PAYCHECK, defaultPaycheckConfig));
    var cfg = cfgState[0], setCfg = cfgState[1];

    var editState = React.useState(false);
    var editingRules = editState[0], setEditingRules = editState[1];

    var showImportState = React.useState(false);
    var showImport = showImportState[0], setShowImport = showImportState[1];

    function update(field, value) {
      var next = Object.assign({}, cfg);
      next[field] = value;
      setCfg(next);
      saveJSON(KEY_PAYCHECK, next);
    }

    function updatePreTaxItem(key, value) {
      var items = (cfg.preTaxItems || []).map(function (item) {
        return item.key === key ? Object.assign({}, item, { value: value }) : item;
      });
      update('preTaxItems', items);
    }

    function updatePostTaxItem(key, value) {
      var items = (cfg.postTaxItems || []).map(function (item) {
        return item.key === key ? Object.assign({}, item, { value: value }) : item;
      });
      update('postTaxItems', items);
    }

    function resetDefaults() {
      setCfg(defaultPaycheckConfig);
      saveJSON(KEY_PAYCHECK, defaultPaycheckConfig);
    }

    var r = calcPaycheck(cfg);
    var preTaxItems = cfg.preTaxItems || [];
    var postTaxItems = cfg.postTaxItems || [];

    var lineItems = [];
    if (num(cfg.regHours) > 0) lineItems.push(['WRK REG (' + cfg.regHours + 'h × ' + formatUSD(r.base) + ')', r.payReg]);
    if (num(cfg.otHours) > 0) lineItems.push(['WRK OT1.5 (' + cfg.otHours + 'h × ' + formatUSD(r.otRate) + ')', r.payOt]);
    if (num(cfg.ot2Hours) > 0) lineItems.push(['WRK OT2.0 (' + cfg.ot2Hours + 'h × ' + formatUSD(r.ot2Rate) + ')', r.payOt2]);
    if (num(cfg.holHours) > 0) lineItems.push(['HOL (' + cfg.holHours + 'h × ' + formatUSD(r.holRate) + ')', r.payHol]);
    if (num(cfg.wrkHolHours) > 0) lineItems.push(['WRK-HOL (' + cfg.wrkHolHours + 'h × ' + formatUSD(r.wrkHolRate) + ')', r.payWrkHol]);
    if (num(cfg.lunchPenaltyHours) > 0) lineItems.push(['LUNCH-P (' + cfg.lunchPenaltyHours + 'h × ' + formatUSD(r.otRate) + ')', r.payLunch]);
    if (r.diffReg > 0) lineItems.push(['Shift 2 REG diff (' + (num(cfg.regHours) + num(cfg.holHours)) + 'h × ' + formatUSD(r.s2RegDiff) + ')', r.diffReg]);
    if (r.diffOt > 0) lineItems.push(['Shift 2 OT diff (' + (num(cfg.otHours) + num(cfg.wrkHolHours) + num(cfg.lunchPenaltyHours)) + 'h × ' + formatUSD(r.s2OtDiff) + ')', r.diffOt]);
    if (r.diffOt2 > 0) lineItems.push(['Shift 2 DT diff (' + cfg.ot2Hours + 'h × ' + formatUSD(r.s2Ot2Diff) + ')', r.diffOt2]);

    return h(React.Fragment, null,
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
          h(NumField, { label: 'REG (h)', value: cfg.regHours, step: '0.01', onChange: function (v) { update('regHours', v); } }),
          h(NumField, { label: 'OT 1.5 (h)', value: cfg.otHours, step: '0.01', onChange: function (v) { update('otHours', v); } })
        ),
        h('div', { style: S.formRow2 },
          h(NumField, { label: 'OT 2.0 (h)', value: cfg.ot2Hours, step: '0.01', onChange: function (v) { update('ot2Hours', v); } }),
          h(NumField, { label: 'HOL (h)', value: cfg.holHours, step: '0.01', onChange: function (v) { update('holHours', v); } })
        ),
        h('div', { style: S.formRow2 },
          h(NumField, { label: 'WRK-HOL (h)', value: cfg.wrkHolHours, step: '0.01', onChange: function (v) { update('wrkHolHours', v); } }),
          h(NumField, { label: 'LUNCH-P (h)', value: cfg.lunchPenaltyHours, step: '0.01', onChange: function (v) { update('lunchPenaltyHours', v); } })
        )
      ),

      h('div', { style: S.card },
        h('div', { style: S.cardHeader }, h('span', { style: S.cardTitle }, 'DETALHAMENTO DO BRUTO')),
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

      h('div', { style: S.card },
        h('div', { style: S.cardHeader }, h('span', { style: S.cardTitle }, '401(K) — CONTRIBUIÇÕES')),

        h('div', { style: S.lineItemRow },
          h('span', { style: S.lineItemLabel }, 'Minha contribuição'),
          h('span', null,
            h('input', {
              type: 'number', step: '0.01', value: cfg.contrib401kPct,
              style: { background: 'transparent', border: 'none', borderBottom: '1px dashed #374151', color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, textAlign: 'right', width: 40, outline: 'none' },
              onChange: function (ev) { update('contrib401kPct', ev.target.value); }
            }),
            h('span', { style: { color: '#9CA3AF', fontSize: 11, marginRight: 8 } }, '%'),
            h('span', { style: S.lineItemValue }, formatUSD(r.contrib401k))
          )
        ),

        h('div', { style: S.lineItemRow },
          h('span', { style: S.lineItemLabel }, 'Match da empresa (limite'),
          h('span', null,
            h('input', {
              type: 'number', step: '0.01', value: num(cfg.matchLimitPct, 4),
              style: { background: 'transparent', border: 'none', borderBottom: '1px dashed #374151', color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, textAlign: 'right', width: 40, outline: 'none' },
              onChange: function (ev) { update('matchLimitPct', ev.target.value); }
            }),
            h('span', { style: { color: '#9CA3AF', fontSize: 11, marginRight: 8 } }, '%)'),
            h('span', { style: S.lineItemValue }, formatUSD(r.companyMatch))
          )
        ),

        h('div', { style: S.lineItemRow },
          h('span', { style: S.lineItemLabel }, '401K AA Contrib ('),
          h('span', null,
            h('input', {
              type: 'number', step: '0.01', value: num(cfg.profitSharingPct, 5),
              style: { background: 'transparent', border: 'none', borderBottom: '1px dashed #374151', color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, textAlign: 'right', width: 40, outline: 'none' },
              onChange: function (ev) { update('profitSharingPct', ev.target.value); }
            }),
            h('span', { style: { color: '#9CA3AF', fontSize: 11, marginRight: 8 } }, '% fixo)'),
            h('span', { style: S.lineItemValue }, formatUSD(r.profitSharing))
          )
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

      h('div', { style: S.card },
        h('div', { style: S.cardHeader }, h('span', { style: S.cardTitle }, 'DEDUÇÕES PRÉ-TAX')),
        preTaxItems.map(function (item) {
          return h(DeductionRow, { key: item.key, item: item, onChange: updatePreTaxItem });
        }),
        h('div', { style: Object.assign({}, S.totalRow, { fontSize: 12, paddingTop: 8 }) },
          h('span', null, 'TOTAL PRÉ-TAX'), h('span', null, formatUSD(r.preTaxTotal))
        )
      ),

      h('div', { style: S.card },
        h('div', { style: S.cardHeader }, h('span', { style: S.cardTitle }, 'TAXES (IMPOSTOS)')),

        h('div', { style: S.lineItemRow },
          h('span', { style: S.lineItemLabel }, 'Social Security'),
          h('span', null,
            h('input', {
              type: 'number', step: '0.0001', value: cfg.ssRatePct,
              style: { background: 'transparent', border: 'none', borderBottom: '1px dashed #374151', color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, textAlign: 'right', width: 50, outline: 'none' },
              onChange: function (ev) { update('ssRatePct', ev.target.value); }
            }),
            h('span', { style: { color: '#9CA3AF', fontSize: 11, marginRight: 8 } }, '%'),
            h('span', { style: S.lineItemValue }, formatUSD(r.ss))
          )
        ),
        h('div', { style: S.lineItemRow },
          h('span', { style: S.lineItemLabel }, 'Medicare'),
          h('span', null,
            h('input', {
              type: 'number', step: '0.0001', value: cfg.medicareRatePct,
              style: { background: 'transparent', border: 'none', borderBottom: '1px dashed #374151', color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, textAlign: 'right', width: 50, outline: 'none' },
              onChange: function (ev) { update('medicareRatePct', ev.target.value); }
            }),
            h('span', { style: { color: '#9CA3AF', fontSize: 11, marginRight: 8 } }, '%'),
            h('span', { style: S.lineItemValue }, formatUSD(r.medicare))
          )
        ),
        h('div', { style: S.lineItemRow },
          h('span', { style: S.lineItemLabel }, 'Federal Withholding'),
          h('span', null,
            h('input', {
              type: 'number', step: '0.0001', value: cfg.fedWithholdingPct,
              style: { background: 'transparent', border: 'none', borderBottom: '1px dashed #374151', color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, textAlign: 'right', width: 50, outline: 'none' },
              onChange: function (ev) { update('fedWithholdingPct', ev.target.value); }
            }),
            h('span', { style: { color: '#9CA3AF', fontSize: 11, marginRight: 8 } }, '%'),
            h('span', { style: S.lineItemValue }, formatUSD(r.federal))
          )
        ),
        h('div', { style: Object.assign({}, S.totalRow, { fontSize: 12, paddingTop: 8, color: '#FB7185' }) },
          h('span', null, 'TOTAL TAXES'), h('span', null, formatUSD(r.ss + r.medicare + r.federal))
        ),
        h('div', { style: Object.assign({}, S.importBox, { marginTop: 10, marginBottom: 0 }) },
          'Alíquotas editáveis (toque no número), valores calculados automaticamente e travados. Federal varia bastante quinzena a quinzena — ajuste comparando com seu holerite real.'
        )
      ),

      h('div', { style: S.card },
        h('div', { style: S.cardHeader }, h('span', { style: S.cardTitle }, 'DEDUÇÕES PÓS-TAX')),
        postTaxItems.map(function (item) {
          return h(DeductionRow, { key: item.key, item: item, onChange: updatePostTaxItem });
        }),
        h('div', { style: Object.assign({}, S.totalRow, { fontSize: 12, paddingTop: 8 }) },
          h('span', null, 'TOTAL PÓS-TAX'), h('span', null, formatUSD(r.postTaxTotal))
        )
      ),

      h('div', { style: Object.assign({}, S.card, { background: 'linear-gradient(160deg, #134E4A 0%, #111827 100%)' }) },
        h('div', { style: S.totalRow },
          h('span', { style: { color: '#5EEAD4' } }, 'NET PAY'), h('span', { style: { color: '#5EEAD4' } }, formatUSD(r.net))
        )
      ),

      h('div', { style: S.card },
        h('div', { style: S.cardHeader },
          h('span', { style: S.cardTitle }, 'REGRAS DE PAGAMENTO'),
          h('button', { style: S.ghostBtn, onClick: function () { setEditingRules(!editingRules); } },
            editingRules ? 'FECHAR' : 'EDITAR')
        ),

        !editingRules ? h('div', null,
          h('div', { style: S.lineItemRow }, h('span', { style: S.lineItemLabel }, 'Taxa base'), h('span', { style: S.lineItemValue }, formatUSD(cfg.baseRate) + '/h')),
          h('div', { style: S.lineItemRow }, h('span', { style: S.lineItemLabel }, 'Shift 2 REG diff'), h('span', { style: S.lineItemValue }, formatUSD(cfg.shift2RegDiff) + '/h')),
          h('div', { style: S.lineItemRow }, h('span', { style: S.lineItemLabel }, 'Shift 2 OT diff (OT1.5)'), h('span', { style: S.lineItemValue }, formatUSD(cfg.shift2OtDiff) + '/h')),
          h('div', { style: S.lineItemRow }, h('span', { style: S.lineItemLabel }, 'Shift 2 DT diff (OT2.0)'), h('span', { style: S.lineItemValue }, formatUSD(num(cfg.shift2Ot2Diff, 1.02)) + '/h'))
        ) : h('div', { style: S.formBox },
          h(NumField, { label: 'TAXA BASE ($/h) — atualize quando mudar de faixa', value: cfg.baseRate, onChange: function (v) { update('baseRate', v); } }),
          h(NumField, { label: 'SHIFT 2 REG DIFF ($/h)', value: cfg.shift2RegDiff, onChange: function (v) { update('shift2RegDiff', v); } }),
          h(NumField, { label: 'SHIFT 2 OT DIFF ($/h) — OT1.5, WRK-HOL, LUNCH-P', value: cfg.shift2OtDiff, onChange: function (v) { update('shift2OtDiff', v); } }),
          h(NumField, { label: 'SHIFT 2 DT DIFF ($/h) — OT2.0 (Double Time)', value: num(cfg.shift2Ot2Diff, 1.02), onChange: function (v) { update('shift2Ot2Diff', v); } }),
          h('button', { style: S.ghostBtn, onClick: resetDefaults }, h(Icon, { name: 'reset', size: 12 }), 'RESTAURAR PADRÃO')
        )
      ),

      h('div', { style: S.footer }, 'REGRAS BASEADAS NO PAY STUB REAL · AA FLEET SERVICE/RAMP · TWU · SHIFT 2')
    );
  }

  window.PaycheckTab = PaycheckTab;
  window.calcPaycheck = calcPaycheck;
})();
