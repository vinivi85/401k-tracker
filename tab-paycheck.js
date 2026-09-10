/* =========================================================
   TAB: PAYCHECK — cálculo e visualização do contracheque
   Parâmetros vêm da aba CONFIG. Import de pay stub via PDF + Gemini AI.
   ========================================================= */
(function () {
  'use strict';
  var h = React.createElement;

  /* A chave do Gemini fica no servidor — as chamadas passam por /api/gemini */

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

    /* AA adiciona imputed income (EER Gross-Up + Group Term Life) na base SS/Medicare
       SS/Medicare base = gross + imputedIncome - section125 (preTax sem 401k)
       Federal base = SS base - 401k contrib */
    var imputedIncome = num(cfg.imputedEerGrossUp, 0) + num(cfg.imputedGtl, 0);
    var ssMedicareBase     = gross + imputedIncome - preTaxTotal;
    var federalTaxableBase = ssMedicareBase - contrib401k;
    var ss       = ssMedicareBase    * (num(cfg.ssRatePct, 6.2)          / 100);
    var medicare = ssMedicareBase    * (num(cfg.medicareRatePct, 1.45)   / 100);
    var federal  = federalTaxableBase > 0 ? federalTaxableBase * (num(cfg.fedWithholdingPct, 1.2316) / 100) : 0;

    var totalDeductions = contrib401k + preTaxTotal + ss + medicare + federal + postTaxTotal;
    var net = (gross + num(cfg.grossDiff, 0)) - totalDeductions;

    return {
      base, otRate, ot2Rate, holRate, wrkHolRate,
      s2RegDiff, s2OtDiff, s2Ot2Diff,
      payReg, payAdditional, payOt, payOt2, payHol, payWrkHol, payLunch,
      diffReg, diffOt, diffOt2,
      gross: gross + num(cfg.grossDiff, 0),
      grossBase: gross,
      contrib401k, companyMatch, profitSharing, companyTotal, total401k,
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

  /* ---------- Interpreta Work Summary via Gemini Vision ---------- */
  function parseWorkSummaryWithGemini(imageFile) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var base64 = e.target.result.split(',')[1];
        /* Force correct mime type — iOS sometimes returns empty */
        var mimeType = imageFile.type;
        if (!mimeType || mimeType === 'application/octet-stream') {
          var name = (imageFile.name || '').toLowerCase();
          if (name.endsWith('.png')) mimeType = 'image/png';
          else if (name.endsWith('.heic') || name.endsWith('.heif')) mimeType = 'image/jpeg';
          else mimeType = 'image/jpeg';
        }

        var prompt = 'Extract from this American Airlines Work Summary. Return ONLY JSON.\n\nFor columns REG, OT1.5, OT2.0, OTS - sum each column across all rows EXCEPT the LUNCH-P row.\nregHours = REG + OTS columns (excluding LUNCH-P)\notHours = OT1.5 column (excluding LUNCH-P)\not2Hours = OT2.0 column (excluding LUNCH-P, 0 if missing)\nlunchHours = all values in the LUNCH-P row combined\nhoursWorked = Total row last column\nperiodStart = first date in pay period header as YYYY-MM-DD\nperiodEnd = last date in pay period header as YYYY-MM-DD\npaymentDate = next Friday after periodEnd as YYYY-MM-DD\n\n{"periodStart":"","periodEnd":"","paymentDate":"","hoursWorked":0,"regHours":0,"otHours":0,"ot2Hours":0,"lunchHours":0,"sickHours":0,"vacationHours":0,"holHours":0,"wrkHolHours":0,"additionalHours":0}';

        function attempt(retries) {
          return fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType, data: base64 } }
              ]}],
              generationConfig: { temperature: 0, maxOutputTokens: 8192 }
            })
          }).then(function (resp) {
            if ((resp.status === 429 || resp.status === 503) && retries > 0) {
              return new Promise(function (res) { setTimeout(res, 3000); }).then(function () { return attempt(retries - 1); });
            }
            if (!resp.ok) throw new Error('Gemini error: ' + resp.status);
            return resp.json();
          }).then(function (data) {
            if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
              throw new Error('Gemini retornou resposta vazia. Tente novamente.');
            }
            if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
          throw new Error('Gemini retornou resposta vazia. Tente novamente.');
        }
        var raw = data.candidates[0].content.parts[0].text;
            var clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
            /* Try direct parse */
            try { return JSON.parse(clean); } catch (e) {}
            /* Extract first complete JSON object */
            var s = clean.indexOf('{');
            var depth = 0, end = -1;
            for (var i = s; i < clean.length; i++) {
              if (clean[i] === '{') depth++;
              else if (clean[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
            }
            if (s !== -1 && end > s) return JSON.parse(clean.slice(s, end + 1));
            throw new Error('JSON Parse error: ' + clean.slice(0, 80));
          });
        }
        attempt(3).then(resolve).catch(reject);
      };
      reader.onerror = reject;
      reader.readAsDataURL(imageFile);
    });
  }

  /* ---------- Interpreta texto do pay stub via Gemini ---------- */
  /* Remove caracteres de controle e substitutos soltos — um corte no meio de um
     par substituto gera string invalida e o fetch falha com "Load failed" */
  function limparTextoPdf(s) {
    return String(s || '')
      .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
      .replace(/([^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g, '$1')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
      .replace(/\uFFFD/g, '');
  }

  /* Extrai a data do nome do arquivo — serve de chave para nao duplicar
     o mesmo contracheque salvo com nomes diferentes (bucket x Drive) */
  function chaveDataStub(nome) {
    var base = String(nome || '').replace(/\.pdf$/i, '');
    var m = base.match(/(\d{2})[.\-_ ]?(\d{2})[.\-_ ]?(\d{4})/);
    return m ? (m[3] + m[1] + m[2]) : base.toLowerCase();
  }

  /* Nome original do arquivo, sem a extensao */
  function rotuloStub(s) {
    return String(s.name || '').replace(/\.pdf$/i, '');
  }

  function parsePayStubWithGemini(text) {
    var prompt = 'Parse this American Airlines Pay Statement and return ONLY valid JSON starting with {. No markdown, no explanation.\n\nIMPORTANT: Some earnings rows repeat across pay periods (e.g. Doubletime may appear twice with different Period End dates). SUM all hours of the same type.\n\nReturn this exact structure:\n{"paymentDate":"YYYY-MM-DD","periodStart":"YYYY-MM-DD","periodEnd":"YYYY-MM-DD","gross":0,"net":0,"hoursWorked":0,"regHours":0,"sickHours":0,"vacationHours":0,"additionalHours":0,"otHours":0,"ot2Hours":0,"holHours":0,"wrkHolHours":0,"lunchHours":0,"contrib401k":0,"profitSharing":0,"withholdingTax":0,"taxableGross":0,"deductions":{"medicalCoverage":0,"dentalCoverage":0,"visionCoverage":0,"employeeADD":0,"spouseADD":0,"childADD":0,"employeeLife":0,"spouseLife":0,"childLife":0,"groupAccident":0,"loan401k":0,"unionDues":0}}\n\nField rules:\n- paymentDate: Payment Date\n- periodStart/End: Pay Period dates\n- gross: Current Gross Earnings total\n- net: Net Pay / Deposit Amount\n- hoursWorked: Hours Worked in header\n- regHours: SUM of Regular Pay hours + Voluntary Trade Worked hours + Training Pay hours ONLY (do NOT include Shift 2 hours, those are differentials not separate hours)\n- additionalHours: Additional Hours only\n- otHours: SUM of Overtime hours only — NOT Doubletime (e.g. 17.67 OT + 0 MANDO-OT)\n- ot2Hours: SUM of ALL Doubletime rows hours (may appear multiple times with different Period End dates — add them all)\n- holHours: Holiday Premium hours\n- wrkHolHours: Hol Worked OT 1.5 hours\n- contrib401k: 401k in Pre-Tax Deductions (employee)\n- profitSharing: 401k Company Contrib in Additional Information\n- withholdingTax: Federal Withholding Tax current amount\n- taxableGross: Federal Taxes Withholding Tax taxable base (Taxable Earnings row)\n- eerGrossUp: EE Recognition Gross-Up current amount from Imputed Income section (0 if blank or not present)\n- gtlImputed: Group Term Life current amount from Imputed Income section (0 if blank)\n\nPAY STUB TEXT:\n' + limparTextoPdf(text).slice(0, 5000);

    function attemptFetch(retries) {
      var corpo = JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 8192 }
      });
      var bytes = -1;
      try { bytes = new Blob([corpo]).size; } catch (e) {}
      console.log('GEMINI req:', 'prompt', prompt.length, 'chars |', 'body', bytes, 'bytes');

      /* Sempre pelo proxy do proprio dominio — a chave fica no servidor */
      return fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt,
          generationConfig: { temperature: 0, maxOutputTokens: 8192 }
        })
      }).catch(function (e) {
        /* falha de rede — reporta o que der para identificar */
        var det = [];
        det.push(e && e.name ? e.name : 'Error');
        det.push(e && e.message ? e.message : '');
        det.push('prompt=' + prompt.length);
        det.push('body=' + bytes + 'B');
        try { det.push('online=' + navigator.onLine); } catch (e2) {}
        if (retries > 0) {
          console.warn('GEMINI retry apos falha de rede:', det.join(' '));
          return new Promise(function (res) { setTimeout(res, 1500); })
            .then(function () { return attemptFetch(retries - 1); });
        }
        throw new Error(det.join(' · '));
      }).then(function (resp) {
        if ((resp.status === 429 || resp.status === 503) && retries > 0) {
          return new Promise(function (res) { setTimeout(res, 3000); }).then(function () { return attemptFetch(retries - 1); });
        }
        if (!resp.ok) throw new Error('Gemini error: ' + resp.status);
        return resp.json();
      }).then(function (data) {
        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
          throw new Error('Gemini retornou resposta vazia. Tente novamente.');
        }
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
      if (!extracted || !extracted.deductions) return;
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

  /* ---------- PDF Viewer usando pdfjs-dist ---------- */
  function PdfViewer(props) {
    var url = props.url;
    var title = props.title;
    var onClose = props.onClose;

    var pagesState = React.useState([]);
    var pages = pagesState[0], setPages = pagesState[1];
    var loadingState = React.useState(true);
    var loading = loadingState[0], setLoading = loadingState[1];
    var errorState = React.useState(null);
    var error = errorState[0], setError = errorState[1];
    var containerRef = React.useRef(null);

    React.useEffect(function () {
      if (!url) return;
      var pdfjsLib = window['pdfjs-dist/build/pdf'];
      if (!pdfjsLib) { setError('pdfjs não disponível'); setLoading(false); return; }
      pdfjsLib.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

      setLoading(true);
      setError(null);
      setPages([]);

      /* url pode ser ArrayBuffer (baixado via authFetch) ou string URL */
      var docParam = (url instanceof ArrayBuffer || (url && url.byteLength !== undefined))
        ? { data: url }
        : { url: url, withCredentials: false };
      pdfjsLib.getDocument(docParam).promise.then(function (pdf) {
        var numPages = pdf.numPages;
        var renders = [];
        for (var i = 1; i <= numPages; i++) {
          renders.push(pdf.getPage(i));
        }
        return Promise.all(renders);
      }).then(function (pdfPages) {
        setPages(pdfPages);
        setLoading(false);
      }).catch(function (e) {
        setError('Erro ao carregar PDF: ' + e.message);
        setLoading(false);
      });
    }, [url]);

    /* Renderiza cada página em seu canvas */
    React.useEffect(function () {
      if (!pages.length || !containerRef.current) return;
      var container = containerRef.current;
      var canvases = container.querySelectorAll('canvas');
      var viewportWidth = window.innerWidth;

      pages.forEach(function (page, idx) {
        var canvas = canvases[idx];
        if (!canvas) return;
        var viewport = page.getViewport({ scale: viewportWidth / page.getViewport({ scale: 1 }).width });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        var ctx = canvas.getContext('2d');
        page.render({ canvasContext: ctx, viewport: viewport });
      });
    }, [pages]);

    return h('div', { style: {
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: '#111', zIndex: 1000,
      display: 'flex', flexDirection: 'column',
      paddingTop: 'env(safe-area-inset-top)',
      paddingBottom: 'env(safe-area-inset-bottom)'
    }},
      /* Header */
      h('div', { style: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 16px', background: '#0B1120', borderBottom: '1px solid #1F2937', flexShrink: 0
      }},
        h('span', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#5EEAD4', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, title),
        h('button', { style: { background: '#FB7185', border: 'none', color: '#fff', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '6px 14px', borderRadius: 6, marginLeft: 12, flexShrink: 0 }, onClick: function () { if (props.url && props.url.startsWith('blob:')) URL.revokeObjectURL(props.url); onClose(); } }, '✕')
      ),
      /* Content */
      h('div', { style: { flex: 1, overflowY: 'auto', overflowX: 'hidden', background: '#222' } },
        loading ? h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#5EEAD4' } }, 'CARREGANDO PDF...') :
        error ? h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#FB7185', padding: 20, textAlign: 'center' } }, error) :
        h('div', { ref: containerRef, style: { display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' } },
          pages.map(function (_, idx) {
            return h('canvas', { key: idx, style: { width: '100%', display: 'block' } });
          })
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
    var importingWSState = React.useState(false);
    var importingWS = importingWSState[0], setImportingWS = importingWSState[1];
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
    var dupWarningState = React.useState(null); // data duplicada encontrada
    var dupWarning = dupWarningState[0], setDupWarning = dupWarningState[1];

    /* Data do pagamento */
    /* Paycheck Viewer */
    var stubsState = React.useState([]);
    var stubs = stubsState[0], setStubs = stubsState[1];

    /* Lista do viewer = arquivos do bucket + arquivos da pasta do Drive (sem repetir nome) */
    var allStubs = (function () {
      var lista = (stubs || []).map(function (s) {
        return { name: s.name, path: s.path, source: 'bucket' };
      });
      var vistos = {};
      lista.forEach(function (s) {
        vistos[s.name] = true;
        vistos[chaveDataStub(s.name)] = true;
      });
      (cfg.driveFiles || []).forEach(function (f) {
        var chave = chaveDataStub(f.name);
        /* mesmo contracheque ja presente (mesmo nome ou mesma data) */
        if (vistos[f.name] || vistos[chave]) return;
        vistos[f.name] = true;
        vistos[chave] = true;
        lista.push({ name: f.name, driveId: f.id, source: 'drive' });
      });
      /* Mais recente primeiro — pela data extraida do nome, nao pelo texto bruto */
      lista.sort(function (a, b) {
        return chaveDataStub(b.name).localeCompare(chaveDataStub(a.name));
      });
      return lista;
    })();
    var selectedStubState = React.useState('');
    var selectedStub = selectedStubState[0], setSelectedStub = selectedStubState[1];
    var viewerUrlState = React.useState(null);
    var viewerUrl = viewerUrlState[0], setViewerUrl = viewerUrlState[1];
    var viewerUrlState = React.useState(null);
    var viewerUrl = viewerUrlState[0], setViewerUrl = viewerUrlState[1];
    var stubsLoadingState = React.useState(false);
    var stubsLoading = stubsLoadingState[0], setStubsLoading = stubsLoadingState[1];
    var viewerLoadingState = React.useState(false);
    var viewerLoading = viewerLoadingState[0], setViewerLoading = viewerLoadingState[1];

    var payDateState = React.useState(loadJSON(KEY_PAYCHECK, defaultPaycheckConfig).lastPayDate || '');
    var payDate = payDateState[0], setPayDate = payDateState[1];
    var periodStartState = React.useState(loadJSON(KEY_PAYCHECK, defaultPaycheckConfig).lastPeriodStart || '');
    var periodStart = periodStartState[0], setPeriodStart = periodStartState[1];
    var periodEndState = React.useState(loadJSON(KEY_PAYCHECK, defaultPaycheckConfig).lastPeriodEnd || '');
    var periodEnd = periodEndState[0], setPeriodEnd = periodEndState[1];
    var hoursWorkedState = React.useState(loadJSON(KEY_PAYCHECK, defaultPaycheckConfig).lastHoursWorked || null);
    var hoursWorked = hoursWorkedState[0], setHoursWorked = hoursWorkedState[1];

    /* Carrega lista de pay stubs salvos */
    React.useEffect(function () {
      function carregar() {
        SupabaseAPI.listPayStubs().then(function (list) {
          setStubs(list);
        }).catch(function () {});
      }
      carregar();
      /* Recarrega quando o CONFIG importa arquivos do Google Drive */
      window.addEventListener('paystubs-updated', carregar);
      return function () { window.removeEventListener('paystubs-updated', carregar); };
    }, []);

    /* Sincroniza config do Supabase ao montar */
    React.useEffect(function () {
      var cancelled = false;
      SupabaseAPI.fetchUserConfig().then(function (remote) {
        if (cancelled) return;
        if (remote && Object.keys(remote).length > 0) {
          /* Preserva horas do localStorage se o Supabase não as tiver */
          var local = loadJSON(KEY_PAYCHECK, defaultPaycheckConfig);
          var merged = Object.assign({}, defaultPaycheckConfig, remote);
          var hourFields = ['regHours','otHours','ot2Hours','holHours','wrkHolHours',
                            'lunchPenaltyHours','sickHours','vacationHours','additionalHours'];
          hourFields.forEach(function (f) {
            if ((remote[f] === undefined || remote[f] === null) && local[f] !== undefined) {
              merged[f] = local[f];
            }
          });
          /* grossDiff: usa o maior valor entre remote e local para não perder o ajuste do PDF */
          if (local.grossDiff && Math.abs(local.grossDiff) > Math.abs(remote.grossDiff || 0)) {
            merged.grossDiff = local.grossDiff;
          }
          setCfg(merged);
          saveJSON(KEY_PAYCHECK, merged);
          /* Restaura data/período da última instância */
          if (remote.lastPayDate) setPayDate(remote.lastPayDate);
          if (remote.lastPeriodStart) setPeriodStart(remote.lastPeriodStart);
          if (remote.lastPeriodEnd) setPeriodEnd(remote.lastPeriodEnd);
          if (remote.lastHoursWorked) setHoursWorked(remote.lastHoursWorked);
        }
      }).catch(function () {});
      return function () { cancelled = true; };
    }, []);

    /* Atualiza a lista com os arquivos da pasta do Drive */
    var driveSyncState = React.useState('');
    var driveSync = driveSyncState[0], setDriveSync = driveSyncState[1];

    function sincronizarDrive() {
      var uid = window.currentUserId ? window.currentUserId() : null;
      var pasta = cfg.driveFolderId;
      if (!uid || !pasta) return;
      setDriveSync('sync');
      fetch('/api/google-drive?action=list-files', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, folderId: pasta })
      }).then(function (r) {
        return r.text().then(function (t) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          try { return JSON.parse(t); } catch (e) { throw new Error('resposta invalida'); }
        });
      }).then(function (d) {
        if (d.error) throw new Error(d.error);
        var arquivos = (d.files || []).map(function (f) {
          return { id: f.id, name: f.name, modifiedTime: f.modifiedTime || null };
        });
        /* Mais recente primeiro */
        arquivos.sort(function (a, b) {
          return chaveDataStub(b.name).localeCompare(chaveDataStub(a.name));
        });
        var antes = (cfg.driveFiles || []).length;
        update('driveFiles', arquivos);
        var novos = arquivos.length - antes;
        setDriveSync(novos > 0 ? ('+' + novos) : 'ok');
        setTimeout(function () { setDriveSync(''); }, 4000);
      }).catch(function (e) {
        console.error('sync drive:', e);
        setDriveSync('erro');
        setTimeout(function () { setDriveSync(''); }, 4000);
      });
    }

    /* Baixa um PDF da pasta do Drive como Blob (nao passa pelo bucket) */
    function baixarDoDrive(driveId) {
      var uid = window.currentUserId ? window.currentUserId() : null;
      return fetch('/api/google-drive?action=download', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, fileId: driveId })
      }).then(function (r) {
        if (!r.ok) {
          return r.text().then(function (t) {
            throw new Error('servidor HTTP ' + r.status + ' ' + t.slice(0, 150));
          });
        }
        var tipo = r.headers.get('content-type') || '';
        /* Resposta binaria: vira Blob direto, sem base64 nem copias intermediarias */
        if (tipo.indexOf('application/pdf') !== -1) return r.blob();
        /* Compatibilidade com a versao antiga que devolvia base64 em JSON */
        return r.text().then(function (t) {
          var d;
          try { d = JSON.parse(t); }
          catch (e) { throw new Error('resposta invalida (' + t.length + ' bytes)'); }
          if (!d || !d.base64) throw new Error(d && d.error ? d.error : 'download vazio');
          var bin = atob(d.base64);
          var bytes = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return new Blob([bytes], { type: 'application/pdf' });
        });
      }).then(function (blob) {
        if (!blob || !blob.size) throw new Error('arquivo vazio');
        console.log('DRIVE download:', blob.size, 'bytes');
        return blob;
      });
    }

    function importStubFromList() {
      var stub = allStubs.find(function (s) { return s.name === selectedStub; });
      if (!stub) return;
      setImportErr('');
      setImportMsg('Baixando ' + stub.name + '...');
      setImporting(true);
      var obterBlob = stub.source === 'drive'
        ? baixarDoDrive(stub.driveId)
        : SupabaseAPI.getPayStubUrl(stub.path).then(function (url) {
            return fetch(url);
          }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.blob();
          });
      obterBlob.then(function (blob) {
        /* Reaproveita o mesmo fluxo do import manual, sem reenviar ao bucket */
        handleFileImport({ target: { files: [blob], value: '' } }, 'pdf', true);
      }).catch(function (e) {
        setImporting(false);
        setImportMsg('');
        setImportErr('Erro ao ler arquivo: ' + e.message);
      });
    }

    function openPayStubViewer(stub) {
      setViewerLoading(true);

      /* Arquivo do Drive: abre direto do blob, sem guardar nada */
      if (stub.source === 'drive') {
        baixarDoDrive(stub.driveId).then(function (blob) {
          setViewerLoading(false);
          window.open(URL.createObjectURL(blob), '_blank');
        }).catch(function (e) {
          setViewerLoading(false);
          setImportErr('Erro ao abrir do Drive: ' + e.message);
        });
        return;
      }


      var now = Date.now();
      var cachedUrls = cfg.paystubUrls || {};
      var cached = cachedUrls[stub.name];
      /* Reutiliza URL se ainda válida (menos de 25 dias) */
      if (cached && cached.url && cached.ts && (now - cached.ts) < 25 * 24 * 3600 * 1000) {
        setViewerLoading(false);
        window.open(cached.url, '_blank');
        return;
      }
      /* Gera nova URL assinada (30 dias) e salva */
      SupabaseAPI.getPayStubUrl(stub.path).then(function (signedUrl) {
        setViewerLoading(false);
        var next = Object.assign({}, cfg);
        next.paystubUrls = Object.assign({}, cachedUrls);
        next.paystubUrls[stub.name] = { url: signedUrl, ts: now };
        setCfg(next);
        saveJSON(KEY_PAYCHECK, next);
        clearTimeout(window._paycheckSaveTimer);
        window._paycheckSaveTimer = setTimeout(function () {
          SupabaseAPI.saveUserConfig(next).catch(function () {});
        }, 1000);
        window.open(signedUrl, '_blank');
      }).catch(function (e) {
        setViewerLoading(false);
        setImportErr('Erro ao abrir PDF: ' + e.message);
      });
    }

    function deleteStub() {
      var stub = stubs.find(function (s) { return s.name === selectedStub; });
      if (!stub) return;
      SupabaseAPI.deletePayStub(stub.path).then(function () {
        setSelectedStub('');
        setViewerUrl(null);
        return SupabaseAPI.listPayStubs();
      }).then(function (list) {
        setStubs(list);
      }).catch(function (e) { console.error('Delete failed:', e); });
    }

    function checkAndAddToPay(data) {
      var dateToCheck = data.paymentDate || payDate || '';
      if (!dateToCheck) {
        setImportErr('Informe a data do pagamento antes de adicionar na aba Pay.');
        return;
      }
      /* Força busca fresca do Supabase — não usa cache local */
      /* Busca direto no banco sem cache para verificar duplicidade */
      SupabaseAPI.checkPayEntryExists(dateToCheck).then(function (exists) {
        if (exists) {
          setDupWarning({ date: dateToCheck, data: data });
        } else {
          setAddToPayData(data);
        }
      }).catch(function () { setAddToPayData(data); });
    }

    function persistDateFields(newPayDate, newPeriodStart, newPeriodEnd, newHoursWorked) {
      /* Lê o cfg mais recente do localStorage para não sobrescrever horas */
      var currentCfg = loadJSON(KEY_PAYCHECK, defaultPaycheckConfig);
      var next = Object.assign({}, currentCfg, {
        lastPayDate: newPayDate !== undefined ? newPayDate : payDate,
        lastPeriodStart: newPeriodStart !== undefined ? newPeriodStart : periodStart,
        lastPeriodEnd: newPeriodEnd !== undefined ? newPeriodEnd : periodEnd,
        lastHoursWorked: newHoursWorked !== undefined ? newHoursWorked : hoursWorked
      });
      saveJSON(KEY_PAYCHECK, next);
      clearTimeout(window._paycheckDateSaveTimer);
      window._paycheckDateSaveTimer = setTimeout(function () {
        SupabaseAPI.saveUserConfig(next).catch(function () {});
      }, 1200);
    }

    function clearAllHours() {
      var cleared = Object.assign({}, cfg, {
        regHours: 80, sickHours: 0, vacationHours: 0, additionalHours: 0,
        otHours: 0, ot2Hours: 0, holHours: 0, wrkHolHours: 0, lunchPenaltyHours: 0, grossDiff: 0
      });
      setCfg(cleared);
      saveJSON(KEY_PAYCHECK, cleared);
      setPayDate('');
      setPeriodStart('');
      setPeriodEnd('');
      setHoursWorked(null);
      persistDateFields('', '', '', null);
      clearTimeout(window._paycheckSaveTimer);
      window._paycheckSaveTimer = setTimeout(function () {
        SupabaseAPI.saveUserConfig(cleared).catch(function () {});
      }, 1000);
    }

    function update(field, value) {
      /* Forma funcional: nunca perde um valor gravado por outro caminho
         (ex.: grossDiff calculado apos import de PDF) por causa de um
         cfg antigo capturado no closure deste render. */
      setCfg(function (prevCfg) {
        var next = Object.assign({}, prevCfg);
        next[field] = value;
        saveJSON(KEY_PAYCHECK, next);
        clearTimeout(window._paycheckSaveTimer);
        window._paycheckSaveTimer = setTimeout(function () {
          SupabaseAPI.saveUserConfig(next).catch(function (e) {
            console.error('Falha ao salvar config no Supabase', e);
          });
        }, 1000);
        return next;
      });
    }

    function applyHours(parsed) {
      /* Limpa horas anteriores antes de aplicar */
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

    function handleWorkSummaryImport(ev) {
      /* Delegado ao handleFileImport com forceType image */
      handleFileImport(ev, 'image');
    }

    function handleFileImport(ev, forceType, skipUpload) {
      var file = ev.target.files[0];
      if (!file) return;
      ev.target.value = '';
      setImportErr('');
      setImportMsg('');

      /* Usa forceType do botão para determinar o fluxo */
      if (forceType === 'image') {
        setImportingWS(true);
        setImportMsg('Lendo imagem com IA...');
        parseWorkSummaryWithGemini(file).then(function (parsed) {
          setImportingWS(false);
          setImportMsg('');
          if (!parsed || (!parsed.regHours && !parsed.otHours && !parsed.ot2Hours)) {
            setImportErr('Gemini não extraiu horas da imagem. Raw: ' + JSON.stringify(parsed).slice(0, 80));
            return;
          }
          /* Limpa grossDiff antes de aplicar novos dados da imagem */
          var cfgBeforeImg = loadJSON(KEY_PAYCHECK, defaultPaycheckConfig);
          var cfgClearedImg = Object.assign({}, cfgBeforeImg, { grossDiff: 0 });
          saveJSON(KEY_PAYCHECK, cfgClearedImg);
          setCfg(cfgClearedImg);

          applyHours(parsed);
          if (parsed.periodStart) setPeriodStart(parsed.periodStart);
          if (parsed.periodEnd) setPeriodEnd(parsed.periodEnd);
          if (parsed.paymentDate) setPayDate(parsed.paymentDate);
          if (parsed.hoursWorked) setHoursWorked(parsed.hoursWorked);
          if (parsed.periodStart || parsed.periodEnd || parsed.paymentDate) {
            /* Salva imediatamente sem debounce para garantir que persiste */
            setTimeout(function () {
              var currentCfg = loadJSON(KEY_PAYCHECK, defaultPaycheckConfig);
              var next = Object.assign({}, currentCfg, {
                lastPayDate: parsed.paymentDate || '',
                lastPeriodStart: parsed.periodStart || '',
                lastPeriodEnd: parsed.periodEnd || '',
                lastHoursWorked: null
              });
              saveJSON(KEY_PAYCHECK, next);
              SupabaseAPI.saveUserConfig(next).catch(function () {});
            }, 600);
          }
          setImportMsg('✓ Horas importadas do Work Summary!');
          setTimeout(function () { setImportMsg(''); }, 3000);
        }).catch(function (e) {
          setImportingWS(false);
          setImportMsg('');
          setImportErr('Erro ao processar imagem: ' + e.message);
        });
        return;
      }

      /* PDF flow */
      setImporting(true);
      setImportMsg('Extraindo texto do PDF...');

      extractPdfText(file).catch(function (e) {
        throw new Error('leitura do PDF — ' + e.message);
      }).then(function (text) {
        if (!text || !text.trim()) throw new Error('PDF sem texto extraivel (pode ser digitalizado)');
        setImportMsg('Interpretando com IA... (' + text.length + ' chars extraídos)');
        console.log('PDF TEXT EXTRACTED:', text.length, 'chars |', text.slice(0, 300));
        return parsePayStubWithGemini(text).catch(function (e) {
          throw new Error('IA — ' + e.message);
        });
      }).then(function (parsed) {
        setImporting(false);
        setImportMsg('');

        /* Valida que o parsed tem dados úteis ANTES de limpar qualquer coisa */
        /* Valida que o parsed tem pelo menos um dado útil */
        var hasData = parsed && (
          parsed.paymentDate || parsed.gross || parsed.net ||
          parsed.regHours || parsed.otHours || parsed.ot2Hours ||
          parsed.sickHours || parsed.vacationHours || parsed.additionalHours ||
          parsed.holHours || parsed.wrkHolHours
        );
        if (!hasData) {
          setImportErr('Gemini não extraiu dados. Raw: ' + JSON.stringify(parsed).slice(0, 100));
          return;
        }

        /* Só limpa DEPOIS de confirmar que tem dados válidos */
        setPayDate('');
        setPeriodStart('');
        setPeriodEnd('');
        setHoursWorked(null);

        /* Preenche data do pagamento, período e horas */
        if (parsed.paymentDate) setPayDate(parsed.paymentDate);
        if (parsed.periodStart) setPeriodStart(parsed.periodStart);
        if (parsed.periodEnd) setPeriodEnd(parsed.periodEnd);
        if (parsed.hoursWorked) setHoursWorked(parsed.hoursWorked);
        /* Aplica horas */
        applyHours(parsed);

        /* Ajusta grossDiff para que net do app bata com net do PDF.
           Usa forma funcional do setCfg para nao perder updates concorrentes
           do state do React (a causa do valor zerar sozinho). */
        if (parsed.net) {
          setTimeout(function () {
            setCfg(function (prevCfg) {
              var r2 = calcPaycheck(prevCfg);
              var netDiff = parsed.net - r2.net;
              if (Math.abs(netDiff) <= 0.02) return prevCfg;
              var nextCfg2 = Object.assign({}, prevCfg, { grossDiff: parseFloat(netDiff.toFixed(2)) });
              saveJSON(KEY_PAYCHECK, nextCfg2);
              SupabaseAPI.saveUserConfig(nextCfg2).catch(function(){});
              return nextCfg2;
            });
          }, 800);
        }

        /* Atualiza alíquotas no CONFIG se extraídas do PDF */
        if (parsed.withholdingTax && parsed.taxableGross && parsed.taxableGross > 0) {
          var fedPct = (parsed.withholdingTax / parsed.taxableGross) * 100;
          var contrib401kPctReal = (parsed.contrib401k && parsed.gross) ? (parsed.contrib401k / parsed.gross) * 100 : null;
          var currentCfgTax = loadJSON(KEY_PAYCHECK, defaultPaycheckConfig);
          var nextTax = Object.assign({}, currentCfgTax, { fedWithholdingPct: parseFloat(fedPct.toFixed(4)) });
          if (contrib401kPctReal) nextTax.contrib401kPct = parseFloat(contrib401kPctReal.toFixed(2));
          /* Atualiza imputed income — extrai valor atual (pode ser 0) */
          if (parsed.eerGrossUp !== undefined && parsed.eerGrossUp !== null) {
            nextTax.imputedEerGrossUp = parseFloat(parsed.eerGrossUp) || 0;
          }
          if (parsed.gtlImputed !== undefined && parsed.gtlImputed !== null) {
            nextTax.imputedGtl = parseFloat(parsed.gtlImputed) || 0.92;
          }
          saveJSON(KEY_PAYCHECK, nextTax);
          SupabaseAPI.saveUserConfig(nextTax).catch(function(){});
          console.log('Tax rates updated: Fed', fedPct.toFixed(2) + '%', '401k', contrib401kPctReal ? contrib401kPctReal.toFixed(2) + '%' : '-');
        }

        /* Persiste data/período no Supabase após aplicar horas */
        setTimeout(function () {
          persistDateFields(parsed.paymentDate, parsed.periodStart, parsed.periodEnd, parsed.hoursWorked);
        }, 500);

        /* Upload do PDF para o Supabase Storage */
        (function () {
          /* Origem ja e um arquivo do bucket (lista/Drive) — nao reenvia */
          if (skipUpload) return;
          var dateForFile = parsed.paymentDate || payDate || '';
          var dateParts = dateForFile.split('-');
          var dateStr = dateParts.length === 3 ? dateParts[1] + dateParts[2] + dateParts[0] : '';
          if (!dateStr) { console.warn('No paymentDate for filename, skipping upload'); return; }
          var fileName = 'Paycheck-' + dateStr + '.pdf';
          SupabaseAPI.uploadPayStub(file, fileName).then(function () {
            return SupabaseAPI.listPayStubs();
          }).then(function (list) {
            setStubs(list);
          }).catch(function (e) { console.error('Upload paystub failed:', e); });
        })();

        /* Verifica deduções */
        var changes = compareDeductions(parsed, cfg);
        if (changes.length > 0) {
          setPendingImport(parsed);
          setDedChanges(changes);
        } else {
          /* Sem mudanças de deduções — verifica duplicidade antes de mostrar modal */
          if (parsed.gross || parsed.net) {
            checkAndAddToPay(parsed);
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
        var d2check = parsed.paymentDate || '';
        checkAndAddToPay(parsed);
      }
    }

    function handleDedSkip() {
      var parsed = pendingImport;
      setDedChanges(null);
      setPendingImport(null);
      if (parsed && (parsed.gross || parsed.net)) {
        checkAndAddToPay(parsed);
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
      dupWarning ? h('div', { style: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.75)', zIndex: 999,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
      }},
        h('div', { style: { background: '#111827', borderRadius: 16, padding: 20, maxWidth: 380, width: '100%', border: '1px solid #7F1D1D' } },
          h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#FB7185', fontWeight: 700, marginBottom: 10 } }, '⚠ PAGAMENTO JÁ EXISTE'),
          h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#D1D5DB', marginBottom: 16 } },
            'Já existe um lançamento na aba Pay com a data ' + (dupWarning ? dupWarning.date : '') + '. Deseja atualizar os valores existentes?'
          ),
          h('div', { style: { display: 'flex', gap: 10 } },
            h('button', { style: Object.assign({}, S.submitBtn, { background: '#0F766E', flex: 1 }), onClick: function () {
              var d = dupWarning ? dupWarning.data : null;
              setDupWarning(null);
              if (d) setAddToPayData(d);
            }}, 'SIM, ATUALIZAR'),
            h('button', { style: Object.assign({}, S.addBtn, { color: '#B0B7C3', borderColor: '#374151', flex: 1 }), onClick: function () { setDupWarning(null); } }, 'NÃO')
          )
        )
      ) : null,

      addToPayData ? h(AddToPayModal, { data: addToPayData, onConfirm: handleAddToPay, onSkip: function () { setAddToPayData(null); }, saving: addingToPay }) : null,

      /* PDF Viewer Modal */


      viewerUrl ? h(PdfViewer, {
        url: viewerUrl,
        title: selectedStub.replace('.pdf', ''),
        onClose: function () { setViewerUrl(null); }
      }) : null,

      /* Input file hidden */
      h('input', {
        id: 'paystub-pdf-input', type: 'file', accept: '.pdf', style: { display: 'none' },
        onChange: function (ev) { handleFileImport(ev, 'pdf'); }
      }),
      h('input', {
        id: 'paystub-img-input', type: 'file', accept: 'image/*', style: { display: 'none' },
        onChange: function (ev) { handleFileImport(ev, 'image'); }
      }),

      /* ---- Prévia ---- */
      h('div', { style: S.gaugeCard },
        h('div', { style: S.gaugeLabel }, (periodStart && periodEnd) ? ('PERÍODO: ' + formatDateLabel(periodStart) + ' – ' + formatDateLabel(periodEnd)) : (periodStart || periodEnd ? 'PERÍODO: --/-- – --/--' : 'PRÉVIA · PRÓXIMO PAYCHECK')),
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
        /* Botão adicionar no Pay — fixo no card de prévia */
        h('div', { style: { marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' } },
          h('div', { style: { flex: 1 } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
              h('div', { style: S.gaugeDate }, 'TOTAL DESCONTOS: ' + formatUSD(r.totalDeductions)),
              hoursWorked ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#D1D5DB' } }, hoursWorked + 'h TRABALHADAS') : null
            ),
            (periodStart && periodEnd) ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#B0B7C3', marginTop: 4 } },
              'PERÍODO: ' + formatDateLabel(periodStart) + ' – ' + formatDateLabel(periodEnd)
            ) : null
          ),
          h('button', {
            style: Object.assign({}, S.addBtn, { flexShrink: 0, background: '#134E4A', borderColor: '#5EEAD4', color: '#5EEAD4' }),
            onClick: function () {
              /* Valida data antes de qualquer ação */
              if (!payDate || payDate.trim() === '') {
                setImportErr('Informe a DATA DO PAGAMENTO antes de adicionar na aba Pay.');
                return;
              }
              var dateToCheck = payDate;
              var data = { paymentDate: dateToCheck, gross: r.gross, net: r.net, contrib401k: r.contrib401k, profitSharing: r.profitSharing };
              /* Verifica duplicidade antes de abrir o modal */
              SupabaseAPI.fetchPayEntries().then(function (entries) {
                var exists = entries.some(function (e) { return e.date === dateToCheck; });
                if (exists) {
                  setDupWarning(dateToCheck);
                } else {
                  setAddToPayData(data);
                }
              }).catch(function () {
                /* Se falhar a verificação, abre o modal mesmo assim */
                setAddToPayData(data);
              });
            },
            title: 'Adicionar na aba Pay'
          }, h(Icon, { name: 'plus', size: 16 }))
        )
      ),

      /* ---- Horas ---- */
      h('div', { style: S.card },
        h('div', { style: S.cardHeader },
          h('span', { style: S.cardTitle }, 'HORAS DA QUINZENA')
        ),
        h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#B0B7C3', letterSpacing: 1, marginBottom: 6 } }, 'IMPORTAR:'),
        h('div', { style: { display: 'flex', gap: 8, marginBottom: 14 } },
          h('button', {
            style: Object.assign({}, S.addBtn, { flex: 1, justifyContent: 'center', fontSize: 10, padding: '8px 4px' }, importing ? { opacity: 0.6 } : {}),
            onClick: function () { if (!importing) document.getElementById('paystub-pdf-input').click(); },
            disabled: importing
          }, h(Icon, { name: 'receipt', size: 12 }), importing ? '...' : 'PDF'),
          h('button', {
            style: Object.assign({}, S.addBtn, { flex: 1, justifyContent: 'center', fontSize: 10, padding: '8px 4px' }, importingWS ? { opacity: 0.6 } : {}),
            onClick: function () { if (!importingWS) document.getElementById('paystub-img-input').click(); },
            disabled: importingWS
          }, h(Icon, { name: 'chart', size: 12 }), importingWS ? '...' : 'JPG'),
          h('button', {
            style: Object.assign({}, S.addBtn, { flex: 1, justifyContent: 'center', fontSize: 10, padding: '8px 4px', color: '#FB7185', borderColor: '#7F1D1D' }),
            onClick: clearAllHours
          }, h(Icon, { name: 'reset', size: 12 }), 'LIMPAR')
        ),
        /* Mensagem de status do import */
        (importing || importingWS) && importMsg ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#B0B7C3', marginBottom: 6 } }, importMsg) : null,

        importErr ? h('div', { style: S.errorText }, importErr) : null,

        /* Data do pagamento */
        h('div', { style: S.formRow },
          h('label', { style: S.formLabel }, 'DATA DO PAGAMENTO'),
          h('input', { type: 'date', value: payDate, style: Object.assign({}, S.input, { height: 44, lineHeight: '44px' }), onChange: function (ev) { setPayDate(ev.target.value); persistDateFields(ev.target.value, undefined, undefined, undefined); } })
        ),

        h('div', { style: S.formRow2 },
          h(NumField, { label: 'REG / TRP / OTS (h)',          value: cfg.regHours,          step: '0.01', onChange: function (v) { update('regHours', v); } }),
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
        h('div', { style: S.formRow2 },
          h(NumField, { label: 'LUNCH-P (h)', value: cfg.lunchPenaltyHours, step: '0.01', onChange: function (v) { update('lunchPenaltyHours', v); } }),
          h(NumField, { label: 'GROSS DIF ($)', value: cfg.grossDiff || 0, step: '0.01', onChange: function (v) { update('grossDiff', v); } })
        ),

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

      /* ---- PAYCHECK VIEWER ---- */
      h('div', { style: S.card },
        h('div', { style: S.cardHeader },
          h('span', { style: S.cardTitle }, 'PAYCHECK VIEWER'),
          stubsLoading
            ? h('span', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#B0B7C3' } }, 'CARREGANDO...')
            : (cfg.driveFolderId ? h('button', {
                style: Object.assign({}, S.smallAddBtn, {
                  color: driveSync === 'erro' ? '#FF6B81' : '#00FFB2',
                  borderColor: driveSync === 'erro' ? '#7F1D1D' : '#00AA55',
                  opacity: driveSync === 'sync' ? 0.6 : 1
                }),
                disabled: driveSync === 'sync',
                onClick: sincronizarDrive
              },
                driveSync === 'sync' ? 'SYNC...'
                  : driveSync === 'erro' ? 'ERRO'
                  : driveSync === 'ok' ? 'ATUALIZADO'
                  : driveSync ? (driveSync + ' NOVO')
                  : '\u21bb DRIVE'
              ) : null)
        ),
        allStubs.length === 0 ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#B0B7C3', padding: '8px 0' } },
          'Nenhum pay stub importado ainda. Importe um PDF para salvá-lo aqui.'
        ) : h('div', null,
          h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 } },
            h('select', {
              value: selectedStub,
              style: Object.assign({}, S.input, {
                flex: 1, margin: 0, minWidth: 0,
                fontSize: 11, padding: '9px 8px',
                textOverflow: 'ellipsis'
              }),
              onChange: function (ev) { setSelectedStub(ev.target.value); setViewerUrl(null); }
            },
              h('option', { value: '' }, 'Selecione um pay stub...'),
              allStubs.map(function (s) {
                return h('option', { key: s.path || s.driveId, value: s.name }, rotuloStub(s));
              })
            ),
            (function () {
              var sel = allStubs.find(function (s) { return s.name === selectedStub; });
              return (selectedStub && sel && sel.source !== 'drive');
            })() ? h('button', {
              style: Object.assign({}, S.deleteBtn, { flexShrink: 0 }),
              onClick: deleteStub,
              title: 'Deletar arquivo'
            }, h(Icon, { name: 'trash', size: 15 })) : null
          ),
          selectedStub ? h('div', { style: { display: 'flex', gap: 8, marginTop: 8 } },
            h('button', {
              style: Object.assign({}, S.submitBtn, {
                flex: 1, marginTop: 0, minWidth: 0,
                fontSize: 11, letterSpacing: 0, padding: '10px 6px',
                whiteSpace: 'nowrap', overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5
              }),
              onClick: function () {
                var stub = allStubs.find(function (s) { return s.name === selectedStub; });
                if (stub) openPayStubViewer(stub);
              },
              disabled: viewerLoading || importing
            }, viewerLoading ? 'ABRINDO...' : h(React.Fragment, null, h(Icon, { name: 'receipt', size: 13 }), 'ABRIR PDF')),
            h('button', {
              style: Object.assign({}, S.submitBtn, {
                flex: 1, marginTop: 0, minWidth: 0,
                fontSize: 11, letterSpacing: 0, padding: '10px 6px',
                whiteSpace: 'nowrap', overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                background: 'transparent', color: '#00FFB2', border: '1px solid #00AA55'
              }),
              onClick: importStubFromList,
              disabled: importing || viewerLoading
            }, importing ? 'IMPORTANDO...' : h(React.Fragment, null, h(Icon, { name: 'plus', size: 13 }), 'IMPORTAR'))
          ) : null
        )
      ),

      h('div', { style: S.footer }, 'REGRAS BASEADAS NO PAY STUB REAL · AA FLEET SERVICE/RAMP · TWU · SHIFT 2')
    );
  }

  window.PaycheckTab = PaycheckTab;
  window.calcPaycheck = calcPaycheck;
})();
