/* =========================================================
   TAB 2: PAYCHECK CALCULATOR
   Regras verificadas:
   - OT1.5 = base x 1.5 | OT2.0 = base x 2.0
   - WRK-HOL (feriado trabalhado) = base x 1.5
   - HOL (feriado não trabalhado) = base x 1.0
   - Shift 2 REG diff = fixo ($0.51) | Shift 2 OT diff = REG diff x 1.5 (sempre, mesmo se base mudar)
   - LUNCH-P entra como linha de OT (base x 1.5)
   - 401k = 4% do gross (não excluído de SS/Medicare, excluído do federal)
   - SS/Medicare base = Gross - Section125 (médico/dental/visão/AD&D)
   - Federal taxable base = SS/Medicare base - 401k contribution
   ========================================================= */
(function () {
  'use strict';
  var h = React.createElement;

  // Federal withholding: aproximação simples por % efetivo, calibrada no ÚNICO ponto
  // verificado contra pay stub real: taxable $2,539.82 -> federal $31.27 (1.2316% efetivo).
  // O federal withholding real segue uma tabela progressiva do IRS (Pub. 15-T) que NÃO
  // temos os brackets exatos aqui — então isso é uma aproximação por %, mais precisa
  // perto do seu gross típico (~$2,200-2,800 biweekly) e menos precisa em extremos.
  // Sempre editável em "EDITAR REGRAS" comparando com o holerite real.
  function estimateFederalWithholding(taxableBase, effectivePct) {
    if (taxableBase <= 0) return 0;
    return taxableBase * (num(effectivePct, 1.2316) / 100);
  }

  function calcPaycheck(cfg) {
    var base = num(cfg.baseRate, 23.28);
    var otRate = base * 1.5;
    var ot2Rate = base * 2.0;
    var holRate = base * 1.0;
    var wrkHolRate = base * 1.5;
    var s2RegDiff = num(cfg.shift2RegDiff, 0.51);
    var s2OtDiff = s2RegDiff * num(cfg.shift2OtMultiplier, 1.5);

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
    var payLunch = lunchHours * otRate; // LUNCH-P entra como linha de OT 1.5x

    // Shift 2 differential aplica sobre TODAS as horas (reg-like e OT-like)
    var regLikeHours = regHours + holHours; // diff REG
    var otLikeHours = otHours + ot2Hours + wrkHolHours + lunchHours; // diff OT

    var diffReg = regLikeHours * s2RegDiff;
    var diffOt = otLikeHours * s2OtDiff;

    var gross = payReg + payOt + payOt2 + payHol + payWrkHol + payLunch + diffReg + diffOt;

    var contrib401k = gross * (num(cfg.contrib401kPct, 4) / 100);
    var fixedPretax = num(cfg.fixedPretax, 0);

    var ssMedicareBase = gross - fixedPretax;
    var federalTaxableBase = ssMedicareBase - contrib401k;

    var ss = ssMedicareBase * (num(cfg.ssRate, 6.2) / 100);
    var medicare = ssMedicareBase * (num(cfg.medicareRate, 1.45) / 100);
    var federal = estimateFederalWithholding(federalTaxableBase, cfg.fedWithholdingPct);

    var fixedPosttax = num(cfg.fixedPosttax, 0);

    var totalDeductions = contrib401k + fixedPretax + ss + medicare + federal + fixedPosttax;
    var net = gross - contrib401k - fixedPretax - ss - medicare - federal - fixedPosttax;

    return {
      base: base, otRate: otRate, ot2Rate: ot2Rate, holRate: holRate, wrkHolRate: wrkHolRate,
      s2RegDiff: s2RegDiff, s2OtDiff: s2OtDiff,
      payReg: payReg, payOt: payOt, payOt2: payOt2, payHol: payHol, payWrkHol: payWrkHol, payLunch: payLunch,
      diffReg: diffReg, diffOt: diffOt,
      gross: gross, contrib401k: contrib401k, fixedPretax: fixedPretax,
      ssMedicareBase: ssMedicareBase, federalTaxableBase: federalTaxableBase,
      ss: ss, medicare: medicare, federal: federal, fixedPosttax: fixedPosttax,
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

    function resetDefaults() {
      setCfg(defaultPaycheckConfig);
      saveJSON(KEY_PAYCHECK, defaultPaycheckConfig);
    }

    var r = calcPaycheck(cfg);

    var lineItems = [];
    if (num(cfg.regHours) > 0) lineItems.push(['WRK REG (' + cfg.regHours + 'h × ' + formatUSD(r.base) + ')', r.payReg]);
    if (num(cfg.otHours) > 0) lineItems.push(['WRK OT1.5 (' + cfg.otHours + 'h × ' + formatUSD(r.otRate) + ')', r.payOt]);
    if (num(cfg.ot2Hours) > 0) lineItems.push(['WRK OT2.0 (' + cfg.ot2Hours + 'h × ' + formatUSD(r.ot2Rate) + ')', r.payOt2]);
    if (num(cfg.holHours) > 0) lineItems.push(['HOL (' + cfg.holHours + 'h × ' + formatUSD(r.holRate) + ')', r.payHol]);
    if (num(cfg.wrkHolHours) > 0) lineItems.push(['WRK-HOL (' + cfg.wrkHolHours + 'h × ' + formatUSD(r.wrkHolRate) + ')', r.payWrkHol]);
    if (num(cfg.lunchPenaltyHours) > 0) lineItems.push(['LUNCH-P (' + cfg.lunchPenaltyHours + 'h × ' + formatUSD(r.otRate) + ')', r.payLunch]);
    lineItems.push(['Shift 2 REG diff', r.diffReg]);
    lineItems.push(['Shift 2 OT diff', r.diffOt]);

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
          'Para atualizar com base no seu último paycheck: tire print ou PDF do Work Summary / Pay Stub e mande no chat com a Claude. ',
          'Ela vai ler os valores (horas REG, OT, HOL, etc.) e te devolver os números prontos para colar nos campos abaixo.'
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
        h('div', { style: S.cardHeader }, h('span', { style: S.cardTitle }, 'DESCONTOS')),
        h('div', { style: S.lineItemRow }, h('span', { style: S.lineItemLabel }, '401(k) (' + cfg.contrib401kPct + '% do gross)'), h('span', { style: S.lineItemValue }, '−' + formatUSD(r.contrib401k))),
        h('div', { style: S.lineItemRow }, h('span', { style: S.lineItemLabel }, 'Pré-tax fixo (médico/dental/visão/AD&D)'), h('span', { style: S.lineItemValue }, '−' + formatUSD(r.fixedPretax))),
        h('div', { style: S.lineItemRow }, h('span', { style: S.lineItemLabel }, 'Social Security (' + cfg.ssRate + '%)'), h('span', { style: S.lineItemValue }, '−' + formatUSD(r.ss))),
        h('div', { style: S.lineItemRow }, h('span', { style: S.lineItemLabel }, 'Medicare (' + cfg.medicareRate + '%)'), h('span', { style: S.lineItemValue }, '−' + formatUSD(r.medicare))),
        h('div', { style: S.lineItemRow }, h('span', { style: S.lineItemLabel }, 'Federal withholding (~' + cfg.fedWithholdingPct + '%)'), h('span', { style: S.lineItemValue }, '−' + formatUSD(r.federal))),
        h('div', { style: S.lineItemRow }, h('span', { style: S.lineItemLabel }, 'Pós-tax fixo'), h('span', { style: S.lineItemValue }, '−' + formatUSD(r.fixedPosttax))),
        h('div', { style: Object.assign({}, S.totalRow, { color: '#5EEAD4' }) },
          h('span', null, 'NET PAY'), h('span', null, formatUSD(r.net))
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
          h('div', { style: S.lineItemRow }, h('span', { style: S.lineItemLabel }, 'Shift 2 OT diff (= REG diff × 1.5)'), h('span', { style: S.lineItemValue }, formatUSD(r.s2OtDiff) + '/h')),
          h('div', { style: S.lineItemRow }, h('span', { style: S.lineItemLabel }, 'Contribuição 401(k)'), h('span', { style: S.lineItemValue }, cfg.contrib401kPct + '% do gross'))
        ) : h('div', { style: S.formBox },
          h(NumField, { label: 'TAXA BASE ($/h) — atualize quando mudar', value: cfg.baseRate, onChange: function (v) { update('baseRate', v); } }),
          h(NumField, { label: 'SHIFT 2 REG DIFF ($/h)', value: cfg.shift2RegDiff, onChange: function (v) { update('shift2RegDiff', v); } }),
          h(NumField, { label: 'CONTRIBUIÇÃO 401(K) (%)', value: cfg.contrib401kPct, onChange: function (v) { update('contrib401kPct', v); } }),
          h(NumField, { label: 'PRÉ-TAX FIXO ($, médico+dental+visão+AD&D)', value: cfg.fixedPretax, onChange: function (v) { update('fixedPretax', v); } }),
          h(NumField, { label: 'PÓS-TAX FIXO ($)', value: cfg.fixedPosttax, onChange: function (v) { update('fixedPosttax', v); } }),
          h(NumField, { label: 'FEDERAL WITHHOLDING EFETIVO (%)', value: cfg.fedWithholdingPct, onChange: function (v) { update('fedWithholdingPct', v); } }),
          h('button', { style: S.ghostBtn, onClick: resetDefaults }, h(Icon, { name: 'reset', size: 12 }), 'RESTAURAR PADRÃO')
        ),
        h('div', { style: Object.assign({}, S.importBox, { marginTop: 12, marginBottom: 0 }) },
          'Federal withholding é uma aproximação por % efetivo (calibrada no seu holerite real), não a tabela completa do IRS. Para gross muito diferente do seu padrão, confira contra o holerite e ajuste a % em "EDITAR REGRAS" se necessário.'
        )
      ),

      h('div', { style: S.footer }, 'REGRAS BASEADAS NO PAY STUB REAL · AA FLEET SERVICE/RAMP · TWU · SHIFT 2')
    );
  }

  window.PaycheckTab = PaycheckTab;
  window.calcPaycheck = calcPaycheck;
})();
