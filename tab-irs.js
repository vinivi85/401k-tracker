/* =========================================================
   TAB: IRS — Federal Tax Return Wizard
   Fluxo estilo TurboTax em 6 etapas dentro da aba
   ========================================================= */
(function () {
  'use strict';
  var h = React.createElement;

  var KEY_IRS = 'irs-wizard-v2';

  /* 2024 Tax Brackets */
  /* 2025 Tax Brackets (IRS Rev. Proc. 2024-40) */
  var BRACKETS = {
    single: [[0,11925,.10],[11925,48475,.12],[48475,103350,.22],[103350,197300,.24],[197300,250525,.32],[250525,626350,.35],[626350,Infinity,.37]],
    mfj:    [[0,23850,.10],[23850,96950,.12],[96950,206700,.22],[206700,394600,.24],[394600,501050,.32],[501050,751600,.35],[751600,Infinity,.37]],
    mfs:    [[0,11925,.10],[11925,48475,.12],[48475,103350,.22],[103350,197300,.24],[197300,250525,.32],[250525,375800,.35],[375800,Infinity,.37]],
    hoh:    [[0,17000,.10],[17000,64850,.12],[64850,103350,.22],[103350,197300,.24],[197300,250500,.32],[250500,626350,.35],[626350,Infinity,.37]]
  };
  /* 2025 Standard Deduction (IRS.gov) */
  var STD_DED = { single:15750, mfj:31500, mfs:15750, hoh:23625 };
  var STATUS_LABELS = { single:'Single', mfj:'Married Filing Jointly', mfs:'Married Filing Separately', hoh:'Head of Household' };

  function calcTax(income, status) {
    var brackets = BRACKETS[status] || BRACKETS.single;
    var tax = 0;
    for (var i = 0; i < brackets.length; i++) {
      var b = brackets[i];
      if (income <= b[0]) break;
      tax += (Math.min(income, b[1]) - b[0]) * b[2];
    }
    return Math.max(0, tax);
  }

  var DEFAULT = {
    step: 0,
    filingStatus: 'single',
    dependents: [],
    otherIncome: { int1099: 0, div1099: 0, freelance: 0, unemployment: 0, other: 0 },
    spouseW2: 0,
    deductionType: 'standard',
    itemized: { mortgage: 0, charitable: 0, salt: 0, medical: 0 },
    credits: { childCare: 0, education: 0, ev: 0, other: 0 },
    schedC: { show: false, miles: 0, insurance: 0, repairs: 0, platformFees: 0, other: 0 }
  };

  function IrsTab() {
    var cfgState = React.useState(function() { return loadJSON(KEY_IRS, DEFAULT); });
    var cfg = cfgState[0], setCfg = cfgState[1];

    var payEntriesState = React.useState([]);
    var payEntries = payEntriesState[0], setPayEntries = payEntriesState[1];
    var paycheckCfgState = React.useState(loadJSON(KEY_PAYCHECK, defaultPaycheckConfig));
    var paycheckCfg = paycheckCfgState[0];

    React.useEffect(function () {
      SupabaseAPI.fetchPayEntries().then(function (e) { setPayEntries(e || []); }).catch(function(){});
      SupabaseAPI.fetchUserConfig().then(function (r) {
        if (r && Object.keys(r).length > 0) paycheckCfgState[1](Object.assign({}, defaultPaycheckConfig, r));
      }).catch(function(){});
    }, []);

    function save(next) { setCfg(next); saveJSON(KEY_IRS, next); }
    function upd(field, value) { save(Object.assign({}, cfg, { [field]: value })); }
    function setStep(s) { upd('step', s); }

    /* YTD from Pay tab */
    var grossYTD = payEntries.reduce(function(s,e){return s+(e.gross||0);},0);
    var contrib401k = payEntries.reduce(function(s,e){return s+(e.contrib401k||0);},0);
    var preTaxTotal = (paycheckCfg.preTaxItems||[]).reduce(function(s,i){return s+num(i.value);},0);
    var postTaxTotal = (paycheckCfg.postTaxItems||[]).reduce(function(s,i){return s+num(i.value);},0);
    var withheldYTD = payEntries.reduce(function(s,e){
      if (!e.gross) return s;
      var base = e.gross - preTaxTotal;
      var ss = base * 0.062;
      var med = base * 0.0145;
      var w = e.gross - (e.amount||0) - ss - med - preTaxTotal - (e.contrib401k||0) - postTaxTotal;
      return s + Math.max(0, w);
    }, 0);

    /* Schedule C — Self Employment */
    var MILEAGE_RATE_2025 = 0.70;
    var sc = cfg.schedC || {};
    var gross1099 = num(cfg.otherIncome ? cfg.otherIncome.freelance : 0);
    var scExpenses = sc.show ? (
      num(sc.miles) * MILEAGE_RATE_2025 +
      num(sc.insurance) + num(sc.repairs) +
      num(sc.platformFees) + num(sc.other)
    ) : 0;
    var scNetProfit = Math.max(0, gross1099 - scExpenses);
    var seTax = scNetProfit * 0.9235 * 0.153; /* Self-employment tax */
    var seDeduction = seTax * 0.5; /* 50% SE tax deduction from AGI */

    /* Calculations */
    var otherInc = Object.values(cfg.otherIncome).reduce(function(s,v){return s+num(v);},0);
    var totalIncome = grossYTD + num(cfg.spouseW2) + otherInc;
    var agi = totalIncome - contrib401k - seDeduction;
    var stdDed = STD_DED[cfg.filingStatus] || 14600;
    var itemizedTotal = Math.min(num(cfg.itemized.salt), 10000) +
      num(cfg.itemized.mortgage) + num(cfg.itemized.charitable) +
      Math.max(0, num(cfg.itemized.medical) - agi * 0.075);
    var deduction = cfg.deductionType === 'itemized' ? Math.max(itemizedTotal, stdDed) : stdDed;
    var taxable = Math.max(0, agi - deduction);
    var childTaxCredit = cfg.dependents.filter(function(d){
      if (!d.dob) return false;
      var age = new Date().getFullYear() - new Date(d.dob).getFullYear();
      return age < 17;
    }).length * 2000;
    var otherDepCredit = cfg.dependents.filter(function(d){
      if (!d.dob) return false;
      var age = new Date().getFullYear() - new Date(d.dob).getFullYear();
      return age >= 17;
    }).length * 500;
    var totalCredits = childTaxCredit + otherDepCredit +
      num(cfg.credits.childCare) + num(cfg.credits.education) +
      num(cfg.credits.ev) + num(cfg.credits.other);
    var taxLiability = calcTax(taxable, cfg.filingStatus);
    var taxAfterCredits = Math.max(0, taxLiability - totalCredits);
    var balance = withheldYTD - taxAfterCredits;
    var isRefund = balance >= 0;
    var effectiveRate = grossYTD > 0 ? (taxAfterCredits / grossYTD) * 100 : 0;

    var STEPS = ['FILING STATUS','DEPENDENTES','RENDA','DEDUÇÕES','CRÉDITOS','RESULTADO'];
    var step = Math.min(Math.max(cfg.step || 0, 0), 5);

    /* ---- Progress bar ---- */
    var ProgressBar = h('div', null,
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 } },
        h('span', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#5EEAD4', letterSpacing: 1 } },
          'ETAPA ' + (step+1) + ' DE ' + STEPS.length + ' · ' + STEPS[step]
        ),
        step < 5 ? h('span', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#B0B7C3' } },
          Math.round(((step+1)/STEPS.length)*100) + '%'
        ) : null
      ),
      h('div', { style: { background: '#1F2937', borderRadius: 4, height: 4, marginBottom: 16 } },
        h('div', { style: {
          background: step === 5 ? '#5EEAD4' : '#0D9488',
          height: 4, borderRadius: 4,
          width: (((step+1)/STEPS.length)*100) + '%',
          transition: 'width 0.3s'
        }})
      )
    );

    /* ---- Nav buttons ---- */
    function NavBtns(showBack, showNext, onNext, nextLabel) {
      return h('div', { style: { display: 'flex', gap: 10, marginTop: 20 } },
        showBack ? h('button', {
          style: Object.assign({}, S.ghostBtn, { flex: 1 }),
          onClick: function() { setStep(step - 1); }
        }, '← VOLTAR') : h('div', { style: { flex: 1 } }),
        showNext ? h('button', {
          style: Object.assign({}, S.submitBtn, { flex: 2 }),
          onClick: onNext || function() { setStep(step + 1); }
        }, nextLabel || 'PRÓXIMO →') : null
      );
    }

    /* ---- STEP 0: Filing Status ---- */
    function StepFilingStatus() {
      var options = [
        { v: 'single', l: 'Single', d: 'Não casado(a) ou legalmente separado(a)' },
        { v: 'mfj',    l: 'Married Filing Jointly', d: 'Casado(a) e declarando junto com cônjuge' },
        { v: 'mfs',    l: 'Married Filing Separately', d: 'Casado(a) mas declarando separado' },
        { v: 'hoh',    l: 'Head of Household', d: 'Solteiro(a) com dependente qualificado' }
      ];
      return h('div', null,
        h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#D1D5DB', marginBottom: 16 } },
          'Como você vai declarar em 2024?'
        ),
        options.map(function(o) {
          var active = cfg.filingStatus === o.v;
          return h('button', {
            key: o.v,
            style: { width: '100%', textAlign: 'left', padding: '14px 16px', marginBottom: 8,
              borderRadius: 10, border: '1px solid', cursor: 'pointer',
              borderColor: active ? '#5EEAD4' : '#1F2937',
              background: active ? '#0F2D2A' : '#111827' },
            onClick: function() { upd('filingStatus', o.v); }
          },
            h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
              color: active ? '#5EEAD4' : '#D1D5DB', fontWeight: active ? 700 : 400 } }, o.l),
            h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
              color: '#6B7280', marginTop: 2 } }, o.d)
          );
        }),
        NavBtns(false, true)
      );
    }

    /* ---- STEP 1: Dependents ---- */
    function StepDependents() {
      var deps = cfg.dependents || [];
      function addDep() {
        upd('dependents', deps.concat([{ name: '', dob: '', relation: 'child' }]));
      }
      function updDep(i, field, val) {
        var next = deps.map(function(d,j){ return j===i ? Object.assign({},d,{[field]:val}) : d; });
        upd('dependents', next);
      }
      function removeDep(i) {
        upd('dependents', deps.filter(function(_,j){ return j!==i; }));
      }
      return h('div', null,
        h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#D1D5DB', marginBottom: 16 } },
          'Você tem dependentes para declarar?'
        ),
        deps.length === 0 ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#6B7280', marginBottom: 12, padding: 12, background: '#111827', borderRadius: 8, border: '1px solid #1F2937' } },
          'Nenhum dependente adicionado. Filhos menores de 17 anos geram $2,000 de Child Tax Credit cada.'
        ) : deps.map(function(d, i) {
          var age = d.dob ? new Date().getFullYear() - new Date(d.dob).getFullYear() : null;
          return h('div', { key: i, style: { background: '#111827', borderRadius: 10, padding: 12, marginBottom: 10, border: '1px solid #1F2937' } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
              h('span', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#5EEAD4' } },
                'DEPENDENTE ' + (i+1) + (age !== null ? ' · ' + age + ' anos' : '')
              ),
              h('button', { style: S.deleteBtn, onClick: function(){ removeDep(i); } }, h(Icon, { name: 'trash', size: 13 }))
            ),
            h('div', { style: S.formRow },
              h('label', { style: S.formLabel }, 'NOME COMPLETO'),
              h('input', { type: 'text', value: d.name, style: S.input, placeholder: 'Nome do dependente',
                onChange: function(ev){ updDep(i,'name',ev.target.value); } })
            ),
            h('div', { style: S.formRow },
              h('label', { style: S.formLabel }, 'DATA DE NASCIMENTO'),
              h('input', { type: 'date', value: d.dob, style: S.input,
                onChange: function(ev){ updDep(i,'dob',ev.target.value); } })
            ),
            h('div', { style: S.formRow },
              h('label', { style: S.formLabel }, 'RELAÇÃO'),
              h('select', { value: d.relation, style: S.input,
                onChange: function(ev){ updDep(i,'relation',ev.target.value); } },
                h('option', { value: 'child' }, 'Filho(a)'),
                h('option', { value: 'stepchild' }, 'Enteado(a)'),
                h('option', { value: 'parent' }, 'Pai/Mãe'),
                h('option', { value: 'other' }, 'Outro')
              )
            ),
            age !== null ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: age < 17 ? '#5EEAD4' : '#FBBF24', marginTop: 4 } },
              age < 17 ? '✓ Child Tax Credit: $2,000' : '✓ Other Dependent Credit: $500'
            ) : null
          );
        }),
        h('button', { style: Object.assign({}, S.addBtn, { width: '100%', justifyContent: 'center', marginBottom: 4 }),
          onClick: addDep },
          h(Icon, { name: 'plus', size: 14 }), 'ADICIONAR DEPENDENTE'
        ),
        NavBtns(true, true)
      );
    }

    /* ---- STEP 2: Income ---- */
    function StepIncome() {
      var oi = cfg.otherIncome;
      function updOI(field, val) { upd('otherIncome', Object.assign({}, oi, { [field]: parseFloat(val)||0 })); }
      return h('div', null,
        /* W-2 automático */
        h('div', { style: { background: '#0F2D2A', borderRadius: 10, padding: 14, marginBottom: 14, border: '1px solid #134E4A' } },
          h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#5EEAD4', marginBottom: 8 } },
            '✓ W-2 IMPORTADO DA ABA PAY'
          ),
          h('div', { style: S.lineItemRow },
            h('span', { style: S.lineItemLabel }, 'GROSS YTD'),
            h('span', { style: S.lineItemValue }, formatUSD(grossYTD))
          ),
          h('div', { style: S.lineItemRow },
            h('span', { style: S.lineItemLabel }, '401K PRÉ-TAX'),
            h('span', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#5EEAD4' } }, '-' + formatUSD(contrib401k))
          ),
          h('div', { style: Object.assign({}, S.lineItemRow, { borderBottom: 'none' }) },
            h('span', { style: S.lineItemLabel }, 'FEDERAL WITHHELD EST.'),
            h('span', { style: S.lineItemValue }, formatUSD(withheldYTD))
          )
        ),
        /* Cônjuge */
        cfg.filingStatus === 'mfj' ? h('div', { style: S.formRow },
          h('label', { style: S.formLabel }, 'W-2 CÔNJUGE'),
          h('input', { type: 'number', step: '0.01', value: cfg.spouseW2, style: S.input,
            onChange: function(ev){ upd('spouseW2', parseFloat(ev.target.value)||0); } })
        ) : null,
        /* Outras rendas */
        h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#D1D5DB', margin: '14px 0 10px' } },
          'OUTRAS RENDAS (deixe 0 se não tiver)'
        ),
        [
          { k: 'int1099',     l: '1099-INT (juros bancários)' },
          { k: 'div1099',     l: '1099-DIV (dividendos)' },
          { k: 'freelance',   l: '1099-NEC / 1099-K (freelance, Turo, Airbnb...)' },
          { k: 'unemployment',l: '1099-G (desemprego)' },
          { k: 'other',       l: 'Outras rendas' }
        ].map(function(f) {
          return h('div', { key: f.k, style: S.formRow },
            h('label', { style: S.formLabel }, f.l),
            h('input', { type: 'number', step: '0.01', value: oi[f.k], style: S.input,
              onChange: function(ev){ updOI(f.k, ev.target.value); } })
          );
        }),

        /* Schedule C — só aparece se tiver 1099-NEC */
        num(oi.freelance) > 0 ? h('div', { style: { marginTop: 8 } },
          h('button', {
            style: { width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 10,
              border: '1px solid', cursor: 'pointer',
              borderColor: (cfg.schedC && cfg.schedC.show) ? '#5EEAD4' : '#374151',
              background: (cfg.schedC && cfg.schedC.show) ? '#0F2D2A' : '#111827' },
            onClick: function() {
              var sc2 = Object.assign({}, cfg.schedC || {}, { show: !(cfg.schedC && cfg.schedC.show) });
              upd('schedC', sc2);
            }
          },
            h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              color: (cfg.schedC && cfg.schedC.show) ? '#5EEAD4' : '#9CA3AF' } },
              (cfg.schedC && cfg.schedC.show) ? '▼ SCHEDULE C — DESPESAS DO NEGÓCIO' : '▶ SCHEDULE C — DEDUZIR DESPESAS DO NEGÓCIO'
            ),
            h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: '#6B7280', marginTop: 2 } },
              'Toque para ' + ((cfg.schedC && cfg.schedC.show) ? 'fechar' : 'abrir') + ' · Milhas, seguro, reparos, taxas da plataforma'
            )
          ),
          (cfg.schedC && cfg.schedC.show) ? h('div', { style: { background: '#111827', borderRadius: 10, padding: 14, marginTop: 6, border: '1px solid #1F2937' } },
            h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#B0B7C3', marginBottom: 10 } },
              'Receita bruta: ' + formatUSD(num(oi.freelance)) + ' · Taxa de milhas 2025: $0.70/mi'
            ),
            [
              { k: 'miles',       l: 'MILHAS RODADAS (business)', suffix: '× $0.70 = ' + formatUSD(num(cfg.schedC ? cfg.schedC.miles : 0) * 0.70), type: 'number' },
              { k: 'insurance',   l: 'SEGURO DO VEÍCULO', type: 'number' },
              { k: 'repairs',     l: 'MANUTENÇÃO / REPAROS', type: 'number' },
              { k: 'platformFees',l: 'TAXAS DA PLATAFORMA (Turo, Airbnb, etc)', type: 'number' },
              { k: 'other',       l: 'OUTRAS DESPESAS', type: 'number' }
            ].map(function(f) {
              return h('div', { key: f.k },
                h('div', { style: S.formRow },
                  h('label', { style: S.formLabel }, f.l + (f.suffix ? ' · ' + f.suffix : '')),
                  h('input', { type: 'number', step: f.k === 'miles' ? '1' : '0.01',
                    value: cfg.schedC ? (cfg.schedC[f.k] || 0) : 0, style: S.input,
                    onChange: function(ev) {
                      var sc3 = Object.assign({}, cfg.schedC || {});
                      sc3[f.k] = parseFloat(ev.target.value) || 0;
                      upd('schedC', sc3);
                    }
                  })
                )
              );
            }),
            h('div', { style: Object.assign({}, S.totalRow, { borderTop: '1px solid #1A2333', paddingTop: 8, marginTop: 4 }) },
              h('span', null, 'LUCRO LÍQUIDO (Schedule C)'),
              h('span', { style: { color: scNetProfit >= 0 ? '#F9FAFB' : '#FB7185',
                fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 } }, formatUSD(scNetProfit))
            ),
            h('div', { style: Object.assign({}, S.lineItemRow, { marginTop: 4 }) },
              h('span', { style: S.lineItemLabel }, 'SELF-EMPLOYMENT TAX (15.3%)'),
              h('span', { style: S.lineItemValue }, formatUSD(seTax))
            ),
            h('div', { style: S.lineItemRow },
              h('span', { style: S.lineItemLabel }, 'DEDUÇÃO SE TAX (50%)'),
              h('span', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#5EEAD4' } }, '-' + formatUSD(seDeduction))
            )
          ) : null
        ) : null,
        h('div', { style: Object.assign({}, S.totalRow, { borderTop: '1px solid #1A2333', paddingTop: 8, marginTop: 4 }) },
          h('span', null, 'AGI ESTIMADO'),
          h('span', { style: { color: '#F9FAFB', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 } }, formatUSD(agi))
        ),
        NavBtns(true, true)
      );
    }

    /* ---- STEP 3: Deductions ---- */
    function StepDeductions() {
      var it = cfg.itemized;
      function updIT(field, val) { upd('itemized', Object.assign({}, it, { [field]: parseFloat(val)||0 })); }
      var useItemized = cfg.deductionType === 'itemized' && itemizedTotal > stdDed;
      return h('div', null,
        h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#D1D5DB', marginBottom: 14 } },
          'Qual tipo de dedução você quer usar?'
        ),
        h('div', { style: { display: 'flex', gap: 8, marginBottom: 16 } },
          ['standard','itemized'].map(function(t) {
            var active = cfg.deductionType === t;
            return h('button', { key: t,
              style: { flex: 1, padding: 12, borderRadius: 10, border: '1px solid', cursor: 'pointer',
                borderColor: active ? '#5EEAD4' : '#1F2937',
                background: active ? '#0F2D2A' : '#111827',
                color: active ? '#5EEAD4' : '#9CA3AF',
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10 },
              onClick: function(){ upd('deductionType', t); }
            },
              h('div', { style: { fontWeight: 700, marginBottom: 4 } }, t === 'standard' ? 'STANDARD' : 'ITEMIZED'),
              h('div', { style: { fontSize: 8 } }, t === 'standard' ? formatUSD(stdDed) + ' automático' : 'Calcular itens')
            );
          })
        ),
        cfg.deductionType === 'standard' ? h('div', { style: { background: '#0F2D2A', borderRadius: 10, padding: 14, border: '1px solid #134E4A' } },
          h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#5EEAD4', marginBottom: 4 } },
            'STANDARD DEDUCTION · ' + STATUS_LABELS[cfg.filingStatus]
          ),
          h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 24, fontWeight: 700, color: '#F9FAFB' } },
            formatUSD(stdDed)
          ),
          h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#B0B7C3', marginTop: 6 } },
            'Recomendado para a maioria das pessoas. Não requer comprovantes.'
          )
        ) : h('div', null,
          [
            { k: 'mortgage',    l: 'Juros do financiamento (Form 1098)' },
            { k: 'charitable',  l: 'Doações (receipts obrigatórios)' },
            { k: 'salt',        l: 'State/local taxes (max $10,000)' },
            { k: 'medical',     l: 'Despesas médicas (>7.5% do AGI)' }
          ].map(function(f) {
            return h('div', { key: f.k, style: S.formRow },
              h('label', { style: S.formLabel }, f.l),
              h('input', { type: 'number', step: '0.01', value: it[f.k], style: S.input,
                onChange: function(ev){ updIT(f.k, ev.target.value); } })
            );
          }),
          h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            color: useItemized ? '#5EEAD4' : '#FBBF24', marginTop: 8, padding: 10,
            background: '#111827', borderRadius: 8, border: '1px solid #1F2937' } },
            useItemized
              ? '✓ Itemized (' + formatUSD(itemizedTotal) + ') > Standard (' + formatUSD(stdDed) + ')'
              : '⚠ Standard (' + formatUSD(stdDed) + ') é maior — será usado automaticamente'
          )
        ),
        h('div', { style: Object.assign({}, S.totalRow, { borderTop: '1px solid #1A2333', paddingTop: 8, marginTop: 12 }) },
          h('span', null, 'DEDUÇÃO APLICADA'),
          h('span', { style: { color: '#5EEAD4', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 } }, formatUSD(deduction))
        ),
        NavBtns(true, true)
      );
    }

    /* ---- STEP 4: Credits ---- */
    function StepCredits() {
      var cr = cfg.credits;
      function updCR(field, val) { upd('credits', Object.assign({}, cr, { [field]: parseFloat(val)||0 })); }
      return h('div', null,
        /* Auto credits */
        h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#D1D5DB', marginBottom: 12 } },
          'CRÉDITOS AUTOMÁTICOS (baseados nos dependentes)'
        ),
        childTaxCredit > 0 ? h('div', { style: S.lineItemRow },
          h('span', { style: S.lineItemLabel }, 'CHILD TAX CREDIT (' +
            cfg.dependents.filter(function(d){ return d.dob && (new Date().getFullYear()-new Date(d.dob).getFullYear())<17;}).length + ' filhos < 17)'),
          h('span', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#5EEAD4' } }, formatUSD(childTaxCredit))
        ) : null,
        otherDepCredit > 0 ? h('div', { style: S.lineItemRow },
          h('span', { style: S.lineItemLabel }, 'OTHER DEPENDENT CREDIT'),
          h('span', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#5EEAD4' } }, formatUSD(otherDepCredit))
        ) : null,
        childTaxCredit === 0 && otherDepCredit === 0 ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#6B7280', marginBottom: 12 } },
          'Nenhum crédito automático. Adicione dependentes na etapa 2.'
        ) : null,
        /* Manual credits */
        h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#D1D5DB', margin: '14px 0 10px' } },
          'OUTROS CRÉDITOS (deixe 0 se não se aplicar)'
        ),
        [
          { k: 'childCare',  l: 'Child & Dependent Care Credit' },
          { k: 'education',  l: 'Education Credit (LLC/AOTC)' },
          { k: 'ev',         l: 'EV Credit (Form 8936)' },
          { k: 'other',      l: 'Outros créditos' }
        ].map(function(f) {
          return h('div', { key: f.k, style: S.formRow },
            h('label', { style: S.formLabel }, f.l),
            h('input', { type: 'number', step: '0.01', value: cr[f.k], style: S.input,
              onChange: function(ev){ updCR(f.k, ev.target.value); } })
          );
        }),
        h('div', { style: Object.assign({}, S.totalRow, { borderTop: '1px solid #1A2333', paddingTop: 8, marginTop: 4 }) },
          h('span', null, 'TOTAL CRÉDITOS'),
          h('span', { style: { color: '#5EEAD4', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 } }, formatUSD(totalCredits))
        ),
        NavBtns(true, true, function(){ setStep(5); }, 'VER RESULTADO →')
      );
    }

    /* ---- STEP 5: Result ---- */
    function StepResult() {
      return h('div', null,
        /* Big result card */
        h('div', { style: Object.assign({}, S.gaugeCard, {
          background: isRefund ? 'linear-gradient(160deg,#134E4A 0%,#111827 100%)' : 'linear-gradient(160deg,#7F1D1D 0%,#111827 100%)',
          marginBottom: 16
        }) },
          h('div', { style: S.gaugeLabel }, 'RESULTADO ESTIMADO · TAX YEAR 2025'),
          h('div', { style: { textAlign: 'center', margin: '16px 0 8px' } },
            h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#B0B7C3', marginBottom: 6 } },
              isRefund ? '🎉 REFUND ESTIMADO' : '⚠ IMPOSTO DEVIDO'
            ),
            h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 42, fontWeight: 700,
              color: isRefund ? '#5EEAD4' : '#FB7185' } },
              (isRefund ? '+' : '-') + formatUSD(Math.abs(balance))
            )
          ),
          h('div', { style: S.deltaRow },
            h('div', { style: S.deltaBox },
              h('div', { style: S.deltaLabel }, 'WITHHELD YTD'),
              h('div', { style: Object.assign({}, S.deltaValue, { color: '#D1D5DB' }) }, formatUSD(withheldYTD))
            ),
            h('div', { style: S.deltaDivider }),
            h('div', { style: S.deltaBox },
              h('div', { style: S.deltaLabel }, 'TAX LIABILITY'),
              h('div', { style: Object.assign({}, S.deltaValue, { color: '#FBBF24' }) }, formatUSD(taxAfterCredits))
            )
          ),
          h('div', { style: Object.assign({}, S.gaugeDate, { marginTop: 8 }) },
            'TAXA EFETIVA: ' + effectiveRate.toFixed(1) + '%'
          )
        ),
        /* Breakdown */
        h('div', { style: S.card },
          h('div', { style: S.cardHeader }, h('span', { style: S.cardTitle }, 'DETALHAMENTO')),
          [
            { l: 'Filing Status',       v: STATUS_LABELS[cfg.filingStatus],  c: '#D1D5DB' },
            { l: 'Dependentes',         v: cfg.dependents.length + ' declarado(s)', c: '#D1D5DB' },
            { l: 'Gross YTD',           v: formatUSD(grossYTD),   c: '#D1D5DB' },
            { l: '401K Pré-Tax',        v: '-' + formatUSD(contrib401k), c: '#5EEAD4' },
            { l: 'Outras Rendas',       v: formatUSD(otherInc),   c: '#D1D5DB' },
            { l: 'AGI',                 v: formatUSD(agi),         c: '#F9FAFB' },
            { l: 'Dedução',             v: '-' + formatUSD(deduction) + ' (' + (cfg.deductionType === 'standard' ? 'standard' : 'itemized') + ')', c: '#5EEAD4' },
            { l: 'Renda Tributável',    v: formatUSD(taxable),    c: '#F9FAFB' },
            { l: 'Imposto Bruto',       v: formatUSD(taxLiability), c: '#FBBF24' },
            { l: 'Créditos',            v: '-' + formatUSD(totalCredits), c: '#5EEAD4' },
            { l: 'Tax Liability Final', v: formatUSD(taxAfterCredits), c: '#FBBF24' },
            { l: 'Federal Withheld',    v: formatUSD(withheldYTD), c: '#D1D5DB' }
          ].map(function(row, i) {
            return h('div', { key: i, style: S.lineItemRow },
              h('span', { style: S.lineItemLabel }, row.l),
              h('span', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: row.c } }, row.v)
            );
          }),
          h('div', { style: Object.assign({}, S.totalRow, { borderTop: '2px solid #1A2333', paddingTop: 10, marginTop: 4 }) },
            h('span', null, isRefund ? 'REFUND ESTIMADO' : 'DEVIDO'),
            h('span', { style: { color: isRefund ? '#5EEAD4' : '#FB7185', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 16 } },
              (isRefund ? '+' : '-') + formatUSD(Math.abs(balance))
            )
          )
        ),
        h('div', { style: { display: 'flex', gap: 10, marginTop: 4 } },
          h('button', { style: Object.assign({}, S.ghostBtn, { flex: 1 }), onClick: function(){ setStep(0); } },
            '← REFAZER'
          )
        ),
        h('div', { style: S.footer }, 'PRÉVIA BASEADA NOS DADOS YTD · NÃO SUBSTITUI ASSESSORIA FISCAL · 2025 TAX BRACKETS')
      );
    }

    var stepContent = [StepFilingStatus, StepDependents, StepIncome, StepDeductions, StepCredits, StepResult][step];

    return h('div', null,
      h('div', { style: { padding: '0 0 8px' } }, ProgressBar),
      h('div', { style: S.card }, stepContent())
    );
  }

  window.IrsTab = IrsTab;
})();
