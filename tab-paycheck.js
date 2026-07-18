/* =========================================================
   TAB: PAYCHECK — cálculo e visualização do contracheque
   Parâmetros vêm da aba CONFIG. Import de pay stub via PDF + Gemini AI.
   ========================================================= */
(function () {
  'use strict';
  var h = React.createElement;

  var GEMINI_API_KEY = window.__GEMINI_KEY || '';
  var GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=' + GEMINI_API_KEY;

  /* ---------- Cálculo do contracheque ---------- */
  function calcPaycheck(cfg) {
    var base = num(cfg.baseRate, 21.25);
    var otRate = base * 1.5;
    var ot2Rate = base * 2;
    var holRate = base;
    var wrkHolRate = base * 1.5;

    var s2RegDiff  = num(cfg.shift2RegDiff, 0.51);
    var s2OtDiff   = num(cfg.shift2OtDiff, 0.77);
    var s2Ot2Diff  = num(cfg.shift2Ot2Diff, 1.02);

    var regHours    = num(cfg.regHours, 0);
    var sickHours      = num(cfg.sickHours, 0);
    var vacationHours  = num(cfg.vacationHours, 0);
    var additionalHours = num(cfg.additionalHours, 0);
    var totalRegHours  = regHours + sickHours + vacationHours;
    var otHours     = num(cfg.otHours, 0);
    var ot2Hours    = num(cfg.ot2Hours, 0);
    var holHours    = num(cfg.holHours, 0);
    var wrkHolHours = num(cfg.wrkHolHours, 0);
    var lunchHours  = num(cfg.lunchPenaltyHours, 0);

    var payReg         = totalRegHours * base;
    var payAdditional  = additionalHours * base;
    var payOt     = otHours     * otRate;
    var payOt2    = ot2Hours    * ot2Rate;
    var payHol    = holHours    * holRate;
    var payWrkHol = wrkHolHours * wrkHolRate;
    var payLunch  = lunchHours  * otRate;

    var regLikeHours = totalRegHours + additionalHours + holHours;
    var otLikeHours  = otHours + wrkHolHours + lunchHours;
    var ot2LikeHours = ot2Hours;

    var diffReg  = regLikeHours  * s2RegDiff;
    var diffOt   = otLikeHours   * s2OtDiff;
    var diffOt2  = ot2LikeHours  * s2Ot2Diff;

    var gross = payReg + payAdditional + payOt + payOt2 + payHol + payWrkHol + payLunch + diffReg + diffOt + diffOt2;

    var contrib401k     = gross * (num(cfg.contrib401kPct, 4) / 100);
    var matchLimitPct   = num(cfg.matchLimitPct, 4);
    var profitSharingPct = num(cfg.profitSharingPct, 5);
    var myContribPct    = num(cfg.contrib401kPct, 4);
    var companyMatch    = gross * (Math.min(myContribPct, matchLimitPct) / 100);
    var profitSharing   = gross * (profitSharingPct / 100);
    var companyTotal    = companyMatch + profitSharing;
    var total401k       = contrib401k + companyTotal;

    var sumItems = function (items) { return (items || []).reduce(function (s, i) { return s + num(i.value); }, 0); };
    var preTaxTotal  = sumItems(cfg.preTaxItems);
    var postTaxTotal = sumItems(cfg.postTaxItems);

    var ssMedicareBase     = gross - preTaxTotal;
    var federalTaxableBase = ssMedicareBase - contrib401k;
    var ss       = ssMedicareBase    * (num(cfg.ssRatePct, 6.2)          / 100);
    var medicare = ssMedicareBase    * (num(cfg.medicareRatePct, 1.45)   / 100);
    var federal  = federalTaxableBase > 0 ? federalTaxableBase * (num(cfg.fedWithholdingPct, 1.2316) / 100) : 0;

    var totalDeductions = contrib401k + preTaxTotal + ss + medicare + federal + postTaxTotal;
    var net = gross - totalDeductions;

    return {
      base, otRate, ot2Rate, holRate, wrkHolRate,
      s2RegDiff, s2OtDiff, s2Ot2Diff,
      payReg, payAdditional, payOt, payOt2, payHol, payWrkHol, payLunch,
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
    return h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#B0B7C3', margin: '4px 0 8px', lineHeight: 1.4 } },
      '⚙ ' + props.text + ' — edite em CONFIG'
    );
  }

  /* ---------- Extrai texto do PDF via pdfjs-dist ---------- */
  function extractPdfText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var typedArray = new Uint8Array(e.target.result);
        var pdfjsLib = window['pdfjs-dist/build/pdf'];
        if (!pdfjsLib) { reject(new Error('pdfjs não carregado')); return; }
        pdfjsLib.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        pdfjsLib.getDocument({ data: typedArray }).promise.then(function (pdf) {
          var pages = [];
          var total = pdf.numPages;
          for (var i = 1; i <= total; i++) {
            pages.push(pdf.getPage(i).then(function (page) {
              return page.getTextContent().then(function (tc) {
                return tc.items.map(function (it) { return it.str; }).join(' ');
              });
            }));
          }
          Promise.all(pages).then(function (texts) {
            resolve(texts.join('\n'));
          }).catch(reject);
        }).catch(reject);
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  /* ---------- Interpreta texto do pay stub via Gemini ---------- */
  function parsePayStubWithGemini(text) {
    var prompt = [
      'You are parsing an American Airlines pay stub. IMPORTANT: Your entire response must be valid JSON only. Do not include any text, explanation, markdown, or code blocks. Start your response with { and end with }. No backticks. Extract these values from the text and return ONLY a JSON object, no markdown, no explanation.',
      '',
      'JSON fields:',
      '- paymentDate: string "YYYY-MM-DD" (Payment Date field)',
      '- periodStart: string "YYYY-MM-DD" (first date of Pay Period)',
      '- periodEnd: string "YYYY-MM-DD" (second date of Pay Period)',
      '- gross: number (Current Gross Earnings total)',
      '- net: number (Net Pay / Deposit Amount)',
      '- regHours: number (Regular Pay hours + Voluntary Trade Worked hours + Training Pay hours + Additional Hours)',
      '- sickHours: number (Sick Pay hours)',
      '- vacationHours: number (Vacation Pay hours)',
      '- additionalHours: number (Additional Hours - OTS unauthorized overtime paid as regular rate)',
      '- otHours: number (Overtime hours + Hol Worked OT 1.5 hours + Shift 2 OT hours)',
      '- ot2Hours: number (Doubletime hours + Shift 2 DT hours)',
      '- holHours: number (Holiday Premium hours NOT worked)',
      '- wrkHolHours: number (Hol Worked OT 1.5 as holiday pay, only if labeled WRK-HOL)',
      '- lunchHours: number (Lunch penalty hours if any)',
      '- contrib401k: number (401k Company Contrib current amount, labeled "401k Company Contrib.")',
      '- profitSharing: number (AAG Profit Sharing current amount if any, else 0)',
      '- deductions: object with these keys and their CURRENT values:',
      '  - medicalCoverage: number',
      '  - dentalCoverage: number',
      '  - visionCoverage: number',
      '  - employeeADD: number',
      '  - spouseADD: number',
      '  - childADD: number',
      '  - employeeLife: number',
      '  - spouseLife: number',
      '  - childLife: number',
      '  - groupAccident: number',
      '  - loan401k: number (401k Loan if present, else 0)',
      '  - unionDues: number (Union Dues TWU)',
      '',
      'If a value is not found, use 0. Return only the JSON.',
      '',
      'PAY STUB TEXT:',
      text.slice(0, 6000)
    ].join('\n');

    function attemptFetch(retries) {
      return fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 2048 }
        })
      }).then(function (resp) {
        if (resp.status === 429 && retries > 0) {
          return new Promise(function (res) { setTimeout(res, 3000); }).then(function () { return attemptFetch(retries - 1); });
        }
        if (!resp.ok) throw new Error('Gemini error: ' + resp.status);
        return resp.json();
      }).then(function (data) {
        var raw = data.candidates[0].content.parts[0].text;
        // Strip markdown fences if present
        var clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        // Try parsing as-is first
        try {
          return JSON.parse(clean);
        } catch (e0) {}
        // Try extracting outermost {}
        var start = clean.indexOf('{');
        var end = clean.lastIndexOf('}');
        if (start !== -1 && end > start) {
          try { return JSON.parse(clean.slice(start, end + 1)); } catch (e1) {}
        }
        // Gemini may return without outer braces — wrap it
        var wrapped = '{' + clean.replace(/^[^"]*/, '').replace(/[^}]*$/, '') + '}';
        try { return JSON.parse(wrapped); } catch (e2) {}
        // Last resort — wrap entire clean text
        try { return JSON.parse('{' + clean + '}'); } catch (e3) {}
        throw new Error('Parse falhou. Gemini: ' + clean.slice(0, 200));
      });
    }
    return attemptFetch(3);
  }

  /* ---------- Compara deduções extraídas com config atual ---------- */
  function compareDeductions(extracted, cfg) {
    var changes = [];
    var preMap = {
      medicalCoverage: 'Medical Coverage',
      dentalCoverage:  'Dental Coverage',
      visionCoverage:  'Vision Coverage',
      employeeADD:     'Employee AD&D',
      spouseADD:       'Spouse AD&D',
      childADD:        'Child AD&D'
    };
    var postMap = {
      employeeLife:  'Employee Life',
      spouseLife:    'Spouse Life',
      childLife:     'Child Life',
      groupAccident: 'Group Accident Ins',
      loan401k:      '401k Loan',
      unionDues:     'Union Dues - TWU'
    };

    function checkItems(items, map, type) {
      (items || []).forEach(function (item) {
        var key = Object.keys(map).find(function (k) { return map[k] === item.label; });
        if (!key) return;
        var newVal = extracted.deductions[key];
        /* Dedução ausente no pay stub (não encontrada ou zerada) */
        if (newVal === undefined || newVal === null || newVal === 0) {
          if (num(item.value) > 0) {
            changes.push({ key: key, label: item.label, oldVal: num(item.value), newVal: 0, type: type, action: 'remove' });
          }
          return;
        }
        /* Valor diferente */
        if (Math.abs(num(item.value) - newVal) > 0.01) {
          changes.push({ key: key, label: item.label, oldVal: num(item.value), newVal: newVal, type: type, action: 'update' });
        }
      });
    }
    checkItems(cfg.preTaxItems, preMap, 'pre');
    checkItems(cfg.postTaxItems, postMap, 'post');
    return changes;
  }

  /* ---------- Modal de confirmação de deduções ---------- */
  function DeductionModal(props) {
    var changes = props.changes;
    var onConfirm = props.onConfirm;
    var onSkip = props.onSkip;

    var updates = changes.filter(function (c) { return c.action === 'update'; });
    var removals = changes.filter(function (c) { return c.action === 'remove'; });

    return h('div', { style: {
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.75)', zIndex: 999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
    }},
      h('div', { style: { background: '#111827', borderRadius: 16, padding: 20, maxWidth: 400, width: '100%', border: '1px solid #1F2937' } },
        h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#5EEAD4', fontWeight: 700, marginBottom: 12 } }, 'DEDUÇÕES ALTERADAS NO PAY STUB'),
        h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#D1D5DB', marginBottom: 12 } },
          'Deseja atualizar o CONFIG com as alterações abaixo?'
        ),

        updates.length > 0 ? h('div', { style: { marginBottom: 10 } },
          h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#B0B7C3', marginBottom: 4 } }, 'VALORES ALTERADOS:'),
          updates.map(function (c, i) {
            return h('div', { key: i, style: { display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, padding: '5px 0', borderBottom: '1px solid #1A2333' } },
              h('span', { style: { color: '#D1D5DB' } }, c.label),
              h('span', null,
                h('span', { style: { color: '#B0B7C3', textDecoration: 'line-through', marginRight: 8 } }, formatUSD(c.oldVal)),
                h('span', { style: { color: '#5EEAD4' } }, formatUSD(c.newVal))
              )
            );
          })
        ) : null,

        removals.length > 0 ? h('div', { style: { marginBottom: 10 } },
          h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#B0B7C3', marginBottom: 4, marginTop: updates.length > 0 ? 10 : 0 } }, 'NÃO ENCONTRADAS NO PAY STUB (REMOVER):'),
          removals.map(function (c, i) {
            return h('div', { key: i, style: { display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, padding: '5px 0', borderBottom: '1px solid #1A2333' } },
              h('span', { style: { color: '#FB7185' } }, c.label),
              h('span', { style: { color: '#FB7185' } }, formatUSD(c.oldVal) + ' → REMOVER')
            );
          })
        ) : null,

        h('div', { style: { display: 'flex', gap: 10, marginTop: 16 } },
          h('button', { style: S.submitBtn, onClick: onConfirm }, 'SIM, ATUALIZAR CONFIG'),
          h('button', { style: Object.assign({}, S.addBtn, { color: '#B0B7C3', borderColor: '#374151', flex: 1 }), onClick: onSkip }, 'NÃO, SÓ AS HORAS')
        )
      )
    );
  }

  /* ---------- Modal de adicionar no Pay ---------- */
  function AddToPayModal(props) {
    var data = props.data;
    var onConfirm = props.onConfirm;
    var onSkip = props.onSkip;
    var saving = props.saving;

    return h('div', { style: {
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.75)', zIndex: 999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
    }},
      h('div', { style: { background: '#111827', borderRadius: 16, padding: 20, maxWidth: 400, width: '100%', border: '1px solid #1F2937' } },
        h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#5EEAD4', fontWeight: 700, marginBottom: 12 } }, 'ADICIONAR NA ABA PAY?'),
        h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#D1D5DB', marginBottom: 12 } },
          'Deseja registrar este pagamento na aba Pay com os valores extraídos?'
        ),
        h('div', { style: S.totalRow },
          h('span', null, 'DATA'), h('span', { style: { color: '#5EEAD4' } }, data.paymentDate || '—')
        ),
        h('div', { style: S.totalRow },
          h('span', null, 'GROSS'), h('span', { style: { color: '#D1D5DB' } }, formatUSD(data.gross || 0))
        ),
        h('div', { style: S.totalRow },
          h('span', null, 'NET'), h('span', { style: { color: '#5EEAD4' } }, formatUSD(data.net || 0))
        ),
        h('div', { style: S.totalRow },
          h('span', null, 'MINHA 401K'), h('span', { style: { color: '#D1D5DB' } }, formatUSD(data.contrib401k || 0))
        ),
        h('div', { style: S.totalRow },
          h('span', null, '401K AA CONTRIB'), h('span', { style: { color: '#D1D5DB' } }, formatUSD(data.profitSharing || 0))
        ),
        h('div', { style: { display: 'flex', gap: 10, marginTop: 16 } },
          h('button', { style: S.submitBtn, onClick: onConfirm, disabled: saving }, saving ? 'SALVANDO...' : 'SIM, ADICIONAR NO PAY'),
          h('button', { style: Object.assign({}, S.addBtn, { color: '#B0B7C3', borderColor: '#374151', flex: 1 }), onClick: onSkip }, 'NÃO')
        )
      )
    );
  }

  /* ===== COMPONENTE PRINCIPAL ===== */
  function PaycheckTab() {
    var cfgState = React.useState(loadJSON(KEY_PAYCHECK, defaultPaycheckConfig));
    var cfg = cfgState[0], setCfg = cfgState[1];

    /* Estados do import */
    var importingState = React.useState(false);
    var importing = importingState[0], setImporting = importingState[1];
    var importMsgState = React.useState('');
    var importMsg = importMsgState[0], setImportMsg = importMsgState[1];
    var importErrState = React.useState('');
    var importErr = importErrState[0], setImportErr = importErrState[1];

    /* Modal de deduções */
    var dedChangesState = React.useState(null);
    var dedChanges = dedChangesState[0], setDedChanges = dedChangesState[1];
    var pendingImportState = React.useState(null);
    var pendingImport = pendingImportState[0], setPendingImport = pendingImportState[1];

    /* Modal de adicionar no Pay */
    var addToPayState = React.useState(null);
    var addToPayData = addToPayState[0], setAddToPayData = addToPayState[1];
    var addingToPayState = React.useState(false);
    var addingToPay = addingToPayState[0], setAddingToPay = addingToPayState[1];

    /* Data do pagamento */
    var payDateState = React.useState('');
    var payDate = payDateState[0], setPayDate = payDateState[1];

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
      clearTimeout(window._paycheckSaveTimer);
      window._paycheckSaveTimer = setTimeout(function () {
        SupabaseAPI.saveUserConfig(next).catch(function (e) {
          console.error('Falha ao salvar config no Supabase', e);
        });
      }, 1000);
    }

    function applyHours(parsed) {
      var next = Object.assign({}, cfg, {
        regHours:          parsed.regHours    || 0,
        sickHours:         parsed.sickHours       || 0,
        vacationHours:     parsed.vacationHours   || 0,
        additionalHours:   parsed.additionalHours || 0,
        otHours:           parsed.otHours     || 0,
        ot2Hours:          parsed.ot2Hours    || 0,
        holHours:          parsed.holHours    || 0,
        wrkHolHours:       parsed.wrkHolHours || 0,
        lunchPenaltyHours: parsed.lunchHours  || 0
      });
      setCfg(next);
      saveJSON(KEY_PAYCHECK, next);
      clearTimeout(window._paycheckSaveTimer);
      window._paycheckSaveTimer = setTimeout(function () {
        SupabaseAPI.saveUserConfig(next).catch(function () {});
      }, 1000);
    }

    function applyDeductionChanges(changes) {
      var next = Object.assign({}, cfg);
      /* Filtra removals e updates separadamente */
      var removals = changes.filter(function (c) { return c.action === 'remove'; });
      var updates   = changes.filter(function (c) { return c.action === 'update'; });

      next.preTaxItems = (cfg.preTaxItems || [])
        .filter(function (item) {
          return !removals.find(function (c) { return c.label === item.label && c.type === 'pre'; });
        })
        .map(function (item) {
          var ch = updates.find(function (c) { return c.label === item.label && c.type === 'pre'; });
          return ch ? Object.assign({}, item, { value: ch.newVal }) : item;
        });

      next.postTaxItems = (cfg.postTaxItems || [])
        .filter(function (item) {
          return !removals.find(function (c) { return c.label === item.label && c.type === 'post'; });
        })
        .map(function (item) {
          var ch = updates.find(function (c) { return c.label === item.label && c.type === 'post'; });
          return ch ? Object.assign({}, item, { value: ch.newVal }) : item;
        });

      setCfg(next);
      saveJSON(KEY_PAYCHECK, next);
      clearTimeout(window._paycheckSaveTimer);
      window._paycheckSaveTimer = setTimeout(function () {
        SupabaseAPI.saveUserConfig(next).catch(function () {});
      }, 1000);
    }

    function handleFileImport(ev) {
      var file = ev.target.files[0];
      if (!file) return;
      ev.target.value = '';
      setImporting(true);
      setImportMsg('Extraindo texto do PDF...');
      setImportErr('');

      extractPdfText(file).then(function (text) {
        setImportMsg('Interpretando com IA... (' + text.length + ' chars extraídos)');
        console.log('PDF TEXT EXTRACTED:', text.slice(0, 500));
        return parsePayStubWithGemini(text);
      }).then(function (parsed) {
        setImporting(false);
        setImportMsg('');

        /* Preenche data do pagamento */
        if (parsed.paymentDate) setPayDate(parsed.paymentDate);

        /* Aplica horas */
        applyHours(parsed);

        /* Verifica deduções */
        var changes = compareDeductions(parsed, cfg);
        if (changes.length > 0) {
          setPendingImport(parsed);
          setDedChanges(changes);
        } else {
          /* Sem mudanças de deduções — vai direto pro modal do Pay */
          if (parsed.gross || parsed.net) {
            setAddToPayData(parsed);
          }
        }
      }).catch(function (e) {
        setImporting(false);
        setImportMsg('');
        setImportErr('Erro ao processar: ' + e.message);
      });
    }

    function handleDedConfirm() {
      applyDeductionChanges(dedChanges);
      var parsed = pendingImport;
      setDedChanges(null);
      setPendingImport(null);
      if (parsed && (parsed.gross || parsed.net)) {
        setAddToPayData(parsed);
      }
    }

    function handleDedSkip() {
      var parsed = pendingImport;
      setDedChanges(null);
      setPendingImport(null);
      if (parsed && (parsed.gross || parsed.net)) {
        setAddToPayData(parsed);
      }
    }

    function handleAddToPay() {
      var d = addToPayData;
      setAddingToPay(true);
      var entry = {
        date: d.paymentDate || payDate || new Date().toISOString().slice(0, 10),
        periodStart: d.periodStart || d.paymentDate || payDate,
        periodEnd: d.periodEnd || d.paymentDate || payDate,
        amount: d.net || 0,
        gross: d.gross || null,
        contrib401k: d.contrib401k || null,
        profitSharing: d.profitSharing || null,
        type: 'Regular payroll run'
      };
      SupabaseAPI.insertPayEntry(entry).then(function () {
        setAddingToPay(false);
        setAddToPayData(null);
        setImportMsg('✓ Adicionado na aba Pay!');
        setTimeout(function () { setImportMsg(''); }, 3000);
      }).catch(function (e) {
        setAddingToPay(false);
        setImportErr('Erro ao salvar no Pay: ' + e.message);
      });
    }

    var r = calcPaycheck(cfg);
    var preTaxItems  = cfg.preTaxItems  || [];
    var postTaxItems = cfg.postTaxItems || [];

    var lineItems = [];
    if (num(cfg.regHours) > 0)          lineItems.push(['WRK REG ('   + cfg.regHours   + 'h × ' + formatUSD(r.base)      + ')', num(cfg.regHours) * r.base]);
    if (num(cfg.additionalHours) > 0)   lineItems.push(['ADDITIONAL HRS (' + cfg.additionalHours + 'h × ' + formatUSD(r.base) + ')', num(cfg.additionalHours) * r.base]);
    if (num(cfg.sickHours) > 0)         lineItems.push(['SICK ('       + cfg.sickHours   + 'h × ' + formatUSD(r.base)      + ')', num(cfg.sickHours) * r.base]);
    if (num(cfg.vacationHours) > 0)     lineItems.push(['VACATION ('   + cfg.vacationHours + 'h × ' + formatUSD(r.base)     + ')', num(cfg.vacationHours) * r.base]);
    if (num(cfg.otHours) > 0)           lineItems.push(['WRK OT1.5 (' + cfg.otHours    + 'h × ' + formatUSD(r.otRate)    + ')', r.payOt]);
    if (num(cfg.ot2Hours) > 0)          lineItems.push(['WRK OT2.0 (' + cfg.ot2Hours   + 'h × ' + formatUSD(r.ot2Rate)   + ')', r.payOt2]);
    if (num(cfg.holHours) > 0)          lineItems.push(['HOL ('        + cfg.holHours   + 'h × ' + formatUSD(r.holRate)   + ')', r.payHol]);
    if (num(cfg.wrkHolHours) > 0)       lineItems.push(['WRK-HOL ('   + cfg.wrkHolHours + 'h × ' + formatUSD(r.wrkHolRate) + ')', r.payWrkHol]);
    if (num(cfg.lunchPenaltyHours) > 0) lineItems.push(['LUNCH-P ('   + cfg.lunchPenaltyHours + 'h × ' + formatUSD(r.otRate) + ')', r.payLunch]);
    if (r.diffReg  > 0) lineItems.push(['Shift 2 REG diff (' + (num(cfg.regHours) + num(cfg.sickHours) + num(cfg.vacationHours) + num(cfg.additionalHours) + num(cfg.holHours)) + 'h × ' + formatUSD(r.s2RegDiff) + ')', r.diffReg]);
    if (r.diffOt   > 0) lineItems.push(['Shift 2 OT diff ('  + (num(cfg.otHours) + num(cfg.wrkHolHours) + num(cfg.lunchPenaltyHours)) + 'h × ' + formatUSD(r.s2OtDiff) + ')', r.diffOt]);
    if (r.diffOt2  > 0) lineItems.push(['Shift 2 DT diff ('  + cfg.ot2Hours + 'h × ' + formatUSD(r.s2Ot2Diff) + ')', r.diffOt2]);

    return h(React.Fragment, null,

      /* Modais */
      dedChanges ? h(DeductionModal, { changes: dedChanges, onConfirm: handleDedConfirm, onSkip: handleDedSkip }) : null,
      addToPayData ? h(AddToPayModal, { data: addToPayData, onConfirm: handleAddToPay, onSkip: function () { setAddToPayData(null); }, saving: addingToPay }) : null,

      /* Input file hidden */
      h('input', {
        id: 'paystub-file-input', type: 'file', accept: '.pdf', style: { display: 'none' },
        onChange: handleFileImport
      }),

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
          h('button', {
            style: Object.assign({}, S.addBtn, importing ? { opacity: 0.6 } : {}),
            onClick: function () { if (!importing) document.getElementById('paystub-file-input').click(); },
            disabled: importing
          }, h(Icon, { name: 'receipt', size: 14 }), importing ? importMsg : 'IMPORTAR PAY STUB')
        ),

        /* Status do import */
        importMsg && !importing ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#5EEAD4', marginBottom: 8 } }, importMsg) : null,
        importErr ? h('div', { style: S.errorText }, importErr) : null,

        /* Data do pagamento */
        h('div', { style: S.formRow },
          h('label', { style: S.formLabel }, 'DATA DO PAGAMENTO'),
          h('input', { type: 'date', value: payDate, style: S.input, onChange: function (ev) { setPayDate(ev.target.value); } })
        ),

        h('div', { style: S.formRow2 },
          h(NumField, { label: 'REG / TRP (h)',          value: cfg.regHours,          step: '0.01', onChange: function (v) { update('regHours', v); } }),
          h(NumField, { label: 'SICK (h)',               value: cfg.sickHours,         step: '0.01', onChange: function (v) { update('sickHours', v); } })
        ),
        h('div', { style: S.formRow2 },
          h(NumField, { label: 'OT/MANDO-1.5 (h)', value: cfg.otHours,           step: '0.01', onChange: function (v) { update('otHours', v); } }),
          h(NumField, { label: 'OT/MANDO-2.0 (h)', value: cfg.ot2Hours,          step: '0.01', onChange: function (v) { update('ot2Hours', v); } })
        ),
        h('div', { style: S.formRow2 },
          h(NumField, { label: 'HOL (h)',                value: cfg.holHours,          step: '0.01', onChange: function (v) { update('holHours', v); } }),
          h(NumField, { label: 'WRK-HOL (h)',            value: cfg.wrkHolHours,       step: '0.01', onChange: function (v) { update('wrkHolHours', v); } })
        ),
        h('div', { style: S.formRow2 },
          h(NumField, { label: 'ADDITIONAL HRS (h)',     value: cfg.additionalHours,   step: '0.01', onChange: function (v) { update('additionalHours', v); } }),
          h(NumField, { label: 'VACATION (h)',           value: cfg.vacationHours,     step: '0.01', onChange: function (v) { update('vacationHours', v); } })
        ),
        h('div', { style: { maxWidth: '50%', paddingRight: 4 } },
          h(NumField, { label: 'LUNCH-P (h)',            value: cfg.lunchPenaltyHours, step: '0.01', onChange: function (v) { update('lunchPenaltyHours', v); } })
        ),

        /* Botão adicionar no Pay manual (quando tem data) */
        payDate ? h('button', {
          style: Object.assign({}, S.addBtn, { marginTop: 10, width: '100%', justifyContent: 'center' }),
          onClick: function () {
            setAddToPayData({ paymentDate: payDate, gross: r.gross, net: r.net, contrib401k: num(cfg.contrib401kPct, 4) / 100 * r.gross, profitSharing: num(cfg.profitSharingPct, 5) / 100 * r.gross });
          }
        }, h(Icon, { name: 'plus', size: 14 }), 'ADICIONAR NO PAY') : null
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
