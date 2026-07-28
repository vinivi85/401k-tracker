/* =========================================================
   TAB: IRS — Federal Tax Return Preview
   Pega dados YTD da aba Pay + campos manuais
   ========================================================= */
(function () {
  'use strict';
  var h = React.createElement;

  var KEY_IRS = 'irs-config';

  /* 2024 Tax Brackets */
  var BRACKETS_2024 = {
    single: [
      { min: 0,       max: 11600,  rate: 0.10 },
      { min: 11600,   max: 47150,  rate: 0.12 },
      { min: 47150,   max: 100525, rate: 0.22 },
      { min: 100525,  max: 191950, rate: 0.24 },
      { min: 191950,  max: 243725, rate: 0.32 },
      { min: 243725,  max: 609350, rate: 0.35 },
      { min: 609350,  max: Infinity, rate: 0.37 }
    ],
    mfj: [
      { min: 0,       max: 23200,  rate: 0.10 },
      { min: 23200,   max: 94300,  rate: 0.12 },
      { min: 94300,   max: 201050, rate: 0.22 },
      { min: 201050,  max: 383900, rate: 0.24 },
      { min: 383900,  max: 487450, rate: 0.32 },
      { min: 487450,  max: 731200, rate: 0.35 },
      { min: 731200,  max: Infinity, rate: 0.37 }
    ],
    mfs: [
      { min: 0,       max: 11600,  rate: 0.10 },
      { min: 11600,   max: 47150,  rate: 0.12 },
      { min: 47150,   max: 100525, rate: 0.22 },
      { min: 100525,  max: 191950, rate: 0.24 },
      { min: 191950,  max: 243725, rate: 0.32 },
      { min: 243725,  max: 365600, rate: 0.35 },
      { min: 365600,  max: Infinity, rate: 0.37 }
    ],
    hoh: [
      { min: 0,       max: 16550,  rate: 0.10 },
      { min: 16550,   max: 63100,  rate: 0.12 },
      { min: 63100,   max: 100500, rate: 0.22 },
      { min: 100500,  max: 191950, rate: 0.24 },
      { min: 191950,  max: 243700, rate: 0.32 },
      { min: 243700,  max: 609350, rate: 0.35 },
      { min: 609350,  max: Infinity, rate: 0.37 }
    ]
  };

  var STANDARD_DEDUCTION_2024 = { single: 14600, mfj: 29200, mfs: 14600, hoh: 21900 };

  var FILING_STATUS_LABELS = {
    single: 'Single',
    mfj:    'Married Filing Jointly',
    mfs:    'Married Filing Separately',
    hoh:    'Head of Household'
  };

  function calcFederalTax(taxableIncome, status) {
    var brackets = BRACKETS_2024[status] || BRACKETS_2024.single;
    var tax = 0;
    for (var i = 0; i < brackets.length; i++) {
      var b = brackets[i];
      if (taxableIncome <= b.min) break;
      var top = Math.min(taxableIncome, b.max);
      tax += (top - b.min) * b.rate;
    }
    return Math.max(0, tax);
  }

  var DEFAULT_IRS = {
    filingStatus: 'single',
    deductionType: 'standard',
    itemizedAmount: 0,
    otherIncome: 0,
    taxCredits: 0,
    spouseW2: 0
  };

  function IrsTab() {
    var cfgState = React.useState(loadJSON(KEY_IRS, DEFAULT_IRS));
    var cfg = cfgState[0], setCfg = cfgState[1];

    var payEntriesState = React.useState([]);
    var payEntries = payEntriesState[0], setPayEntries = payEntriesState[1];

    var paycheckCfgState = React.useState(loadJSON(KEY_PAYCHECK, defaultPaycheckConfig));
    var paycheckCfg = paycheckCfgState[0];

    /* Carrega pay entries do Supabase */
    React.useEffect(function () {
      SupabaseAPI.fetchPayEntries().then(function (entries) {
        setPayEntries(entries || []);
      }).catch(function () {});
      SupabaseAPI.fetchUserConfig().then(function (remote) {
        if (remote && Object.keys(remote).length > 0) {
          paycheckCfgState[1](Object.assign({}, defaultPaycheckConfig, remote));
        }
      }).catch(function () {});
    }, []);

    function update(field, value) {
      var next = Object.assign({}, cfg, { [field]: value });
      setCfg(next);
      saveJSON(KEY_IRS, next);
    }

    /* YTD da aba Pay */
    var grossYTD    = payEntries.reduce(function (s, e) { return s + (e.gross || 0); }, 0);
    var netYTD      = payEntries.reduce(function (s, e) { return s + (e.amount || 0); }, 0);
    var contrib401k = payEntries.reduce(function (s, e) { return s + (e.contrib401k || 0); }, 0);
    var withholdingYTD = payEntries.reduce(function (s, e) {
      /* Federal withholding = gross - preTax - 401k contrib - net - SS - Medicare - postTax */
      /* Estimamos como: gross - net - SS(6.2%) - Medicare(1.45%) - preTax deductions */
      var gross = e.gross || 0;
      var net   = e.amount || 0;
      if (!gross) return s;
      var preTax  = num(paycheckCfg.preTaxItems && paycheckCfg.preTaxItems.reduce ? paycheckCfg.preTaxItems.reduce(function(a,i){return a+num(i.value);},0) : 0);
      var contrib = e.contrib401k || 0;
      var ssMedBase = gross - preTax;
      var ss        = ssMedBase * 0.062;
      var medicare  = ssMedBase * 0.0145;
      var postTax   = num(paycheckCfg.postTaxItems && paycheckCfg.postTaxItems.reduce ? paycheckCfg.postTaxItems.reduce(function(a,i){return a+num(i.value);},0) : 0);
      var withholding = gross - net - ss - medicare - preTax - contrib - postTax;
      return s + Math.max(0, withholding);
    }, 0);

    /* AGI */
    var totalIncome = grossYTD + num(cfg.otherIncome) + num(cfg.spouseW2);
    var above401k   = contrib401k; /* já deduzido pre-tax no paycheck */
    var agi         = totalIncome - above401k;

    /* Deduction */
    var stdDed  = STANDARD_DEDUCTION_2024[cfg.filingStatus] || 14600;
    var deduction = cfg.deductionType === 'itemized'
      ? Math.max(num(cfg.itemizedAmount), stdDed) /* always use higher */
      : stdDed;

    /* Taxable income */
    var taxableIncome = Math.max(0, agi - deduction);

    /* Tax liability */
    var taxLiability = calcFederalTax(taxableIncome, cfg.filingStatus);

    /* Credits */
    var taxAfterCredits = Math.max(0, taxLiability - num(cfg.taxCredits));

    /* Refund / Due */
    var balance = withholdingYTD - taxAfterCredits;
    var isRefund = balance >= 0;

    /* Effective rate */
    var effectiveRate = grossYTD > 0 ? (taxAfterCredits / grossYTD) * 100 : 0;

    var FilingBtn = function (props) {
      var active = cfg.filingStatus === props.value;
      return h('button', {
        style: {
          flex: 1, padding: '8px 4px', borderRadius: 8, border: '1px solid',
          borderColor: active ? '#5EEAD4' : '#1F2937',
          background: active ? '#134E4A' : '#111827',
          color: active ? '#5EEAD4' : '#9CA3AF',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9, letterSpacing: 0.5, cursor: 'pointer'
        },
        onClick: function () { update('filingStatus', props.value); }
      }, props.label);
    };

    return h(React.Fragment, null,

      /* ---- Result card ---- */
      h('div', { style: Object.assign({}, S.gaugeCard, {
        background: isRefund
          ? 'linear-gradient(160deg, #134E4A 0%, #111827 100%)'
          : 'linear-gradient(160deg, #7F1D1D 0%, #111827 100%)'
      }) },
        h('div', { style: S.gaugeLabel }, 'PRÉVIA IRS · ' + (new Date().getFullYear()) + ' TAX YEAR'),
        h('div', { style: { textAlign: 'center', margin: '12px 0 4px' } },
          h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#B0B7C3', marginBottom: 4 } },
            isRefund ? 'REFUND ESTIMADO' : 'IMPOSTO DEVIDO'
          ),
          h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 36, fontWeight: 700, color: isRefund ? '#5EEAD4' : '#FB7185' } },
            (isRefund ? '+' : '-') + formatUSD(Math.abs(balance))
          )
        ),
        h('div', { style: S.deltaRow },
          h('div', { style: S.deltaBox },
            h('div', { style: S.deltaLabel }, 'WITHHELD YTD'),
            h('div', { style: Object.assign({}, S.deltaValue, { color: '#D1D5DB' }) }, formatUSD(withholdingYTD))
          ),
          h('div', { style: S.deltaDivider }),
          h('div', { style: S.deltaBox },
            h('div', { style: S.deltaLabel }, 'TAX LIABILITY'),
            h('div', { style: Object.assign({}, S.deltaValue, { color: '#FBBF24' }) }, formatUSD(taxAfterCredits))
          )
        ),
        h('div', { style: Object.assign({}, S.gaugeDate, { marginTop: 8 }) },
          'TAXA EFETIVA: ' + effectiveRate.toFixed(1) + '% · AGI: ' + formatUSD(agi)
        )
      ),

      /* ---- Filing Status ---- */
      h('div', { style: S.card },
        h('div', { style: S.cardHeader }, h('span', { style: S.cardTitle }, 'FILING STATUS')),
        h('div', { style: { display: 'flex', gap: 6, marginBottom: 6 } },
          h(FilingBtn, { value: 'single', label: 'SINGLE' }),
          h(FilingBtn, { value: 'mfj',    label: 'MARRIED JT' })
        ),
        h('div', { style: { display: 'flex', gap: 6 } },
          h(FilingBtn, { value: 'mfs',    label: 'MARRIED SEP' }),
          h(FilingBtn, { value: 'hoh',    label: 'HEAD OF HH' })
        )
      ),

      /* ---- Income ---- */
      h('div', { style: S.card },
        h('div', { style: S.cardHeader }, h('span', { style: S.cardTitle }, 'RENDA')),
        h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#B0B7C3', marginBottom: 10 } },
          'Gross YTD e contribuição 401K puxados automaticamente da aba PAY'
        ),
        h('div', { style: S.lineItemRow },
          h('span', { style: S.lineItemLabel }, 'GROSS YTD (PAY)'),
          h('span', { style: S.lineItemValue }, formatUSD(grossYTD))
        ),
        h('div', { style: S.lineItemRow },
          h('span', { style: S.lineItemLabel }, '401K PRÉ-TAX YTD'),
          h('span', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#5EEAD4' } }, '-' + formatUSD(contrib401k))
        ),
        h('div', { style: S.formRow },
          h('label', { style: S.formLabel }, 'OUTRAS RENDAS (juros, freelance, etc)'),
          h('input', { type: 'number', step: '0.01', value: cfg.otherIncome, style: S.input,
            onChange: function (ev) { update('otherIncome', parseFloat(ev.target.value) || 0); } })
        ),
        h('div', { style: S.formRow },
          h('label', { style: S.formLabel }, 'W-2 CÔNJUGE (se MFJ)'),
          h('input', { type: 'number', step: '0.01', value: cfg.spouseW2, style: S.input,
            onChange: function (ev) { update('spouseW2', parseFloat(ev.target.value) || 0); } })
        ),
        h('div', { style: Object.assign({}, S.totalRow, { borderTop: '1px solid #1A2333', paddingTop: 8, marginTop: 4 }) },
          h('span', null, 'AGI ESTIMADO'),
          h('span', { style: { color: '#F9FAFB', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 } }, formatUSD(agi))
        )
      ),

      /* ---- Deductions ---- */
      h('div', { style: S.card },
        h('div', { style: S.cardHeader }, h('span', { style: S.cardTitle }, 'DEDUÇÕES')),
        h('div', { style: { display: 'flex', gap: 8, marginBottom: 12 } },
          h('button', {
            style: { flex: 1, padding: '8px', borderRadius: 8, border: '1px solid',
              borderColor: cfg.deductionType === 'standard' ? '#5EEAD4' : '#1F2937',
              background: cfg.deductionType === 'standard' ? '#134E4A' : '#111827',
              color: cfg.deductionType === 'standard' ? '#5EEAD4' : '#9CA3AF',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10, cursor: 'pointer' },
            onClick: function () { update('deductionType', 'standard'); }
          }, 'STANDARD'),
          h('button', {
            style: { flex: 1, padding: '8px', borderRadius: 8, border: '1px solid',
              borderColor: cfg.deductionType === 'itemized' ? '#5EEAD4' : '#1F2937',
              background: cfg.deductionType === 'itemized' ? '#134E4A' : '#111827',
              color: cfg.deductionType === 'itemized' ? '#5EEAD4' : '#9CA3AF',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10, cursor: 'pointer' },
            onClick: function () { update('deductionType', 'itemized'); }
          }, 'ITEMIZED')
        ),
        cfg.deductionType === 'standard' ? h('div', { style: S.lineItemRow },
          h('span', { style: S.lineItemLabel }, 'STANDARD DEDUCTION (' + FILING_STATUS_LABELS[cfg.filingStatus] + ')'),
          h('span', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#5EEAD4' } }, formatUSD(stdDed))
        ) : h('div', null,
          h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#B0B7C3', marginBottom: 8 } },
            'Insira o total de deduções itemizadas. Se menor que o standard (' + formatUSD(stdDed) + '), o standard é usado automaticamente.'
          ),
          h('div', { style: S.formRow },
            h('label', { style: S.formLabel }, 'TOTAL ITEMIZED DEDUCTIONS'),
            h('input', { type: 'number', step: '0.01', value: cfg.itemizedAmount, style: S.input,
              onChange: function (ev) { update('itemizedAmount', parseFloat(ev.target.value) || 0); } })
          ),
          num(cfg.itemizedAmount) < stdDed ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#FBBF24', marginTop: 4 } },
            '⚠ Usando standard deduction (' + formatUSD(stdDed) + ') pois é maior'
          ) : null
        ),
        h('div', { style: Object.assign({}, S.totalRow, { borderTop: '1px solid #1A2333', paddingTop: 8, marginTop: 4 }) },
          h('span', null, 'DEDUÇÃO APLICADA'),
          h('span', { style: { color: '#5EEAD4', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 } }, formatUSD(deduction))
        )
      ),

      /* ---- Tax Calculation ---- */
      h('div', { style: S.card },
        h('div', { style: S.cardHeader }, h('span', { style: S.cardTitle }, 'CÁLCULO FEDERAL')),
        h('div', { style: S.lineItemRow },
          h('span', { style: S.lineItemLabel }, 'RENDA TRIBUTÁVEL'),
          h('span', { style: S.lineItemValue }, formatUSD(taxableIncome))
        ),
        h('div', { style: S.lineItemRow },
          h('span', { style: S.lineItemLabel }, 'IMPOSTO BRUTO'),
          h('span', { style: S.lineItemValue }, formatUSD(taxLiability))
        ),
        h('div', { style: S.formRow },
          h('label', { style: S.formLabel }, 'TAX CREDITS (Child, Education, etc)'),
          h('input', { type: 'number', step: '0.01', value: cfg.taxCredits, style: S.input,
            onChange: function (ev) { update('taxCredits', parseFloat(ev.target.value) || 0); } })
        ),
        h('div', { style: Object.assign({}, S.totalRow, { borderTop: '1px solid #1A2333', paddingTop: 8, marginTop: 4 }) },
          h('span', null, 'TAX LIABILITY FINAL'),
          h('span', { style: { color: '#FBBF24', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 } }, formatUSD(taxAfterCredits))
        )
      ),

      /* ---- Withholding ---- */
      h('div', { style: S.card },
        h('div', { style: S.cardHeader }, h('span', { style: S.cardTitle }, 'WITHHOLDING YTD')),
        h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#B0B7C3', marginBottom: 10 } },
          'Estimado a partir dos pagamentos na aba PAY. Verifique nos seus W-2 ao final do ano.'
        ),
        h('div', { style: S.lineItemRow },
          h('span', { style: S.lineItemLabel }, 'FEDERAL WITHHELD ESTIMADO'),
          h('span', { style: S.lineItemValue }, formatUSD(withholdingYTD))
        ),
        h('div', { style: S.lineItemRow },
          h('span', { style: S.lineItemLabel }, 'SOCIAL SECURITY (6.2%)'),
          h('span', { style: S.lineItemValue }, formatUSD(grossYTD * 0.062))
        ),
        h('div', { style: S.lineItemRow },
          h('span', { style: S.lineItemLabel }, 'MEDICARE (1.45%)'),
          h('span', { style: S.lineItemValue }, formatUSD(grossYTD * 0.0145))
        )
      ),

      h('div', { style: S.footer }, 'PRÉVIA BASEADA NOS DADOS YTD · NÃO SUBSTITUI ASSESSORIA FISCAL · 2024 TAX BRACKETS')
    );
  }

  window.IrsTab = IrsTab;
})();
