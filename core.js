/* =========================================================
   401k Tracker — Flight Deck
   App único com 3 abas: Tracker / Paycheck / Projeção
   JS puro (sem JSX/Babel) para máxima compatibilidade Safari iOS
   Variáveis aqui ficam no escopo global propositalmente,
   pois os arquivos tab-*.js e app.js dependem delas.
   ========================================================= */
var h = React.createElement;

  /* ---------- Storage keys ---------- */
  var KEY_ENTRIES = '401k-entries';
  var KEY_PAYCHECK = '401k-paycheck-config';
  var KEY_PROJECTION = '401k-projection-config';
  var KEY_ACTIVE_TAB = '401k-active-tab';

  /* ---------- Seed: histórico de saldo (Tracker) ---------- */
  var initialEntries = [
    { id: '1', date: '2026-06-07', balance: 17141.23 },
    { id: '2', date: '2026-06-15', balance: 17704.06 },
    { id: '3', date: '2026-06-17', balance: 17873.69 },
    { id: '4', date: '2026-06-18', balance: 17707.98 },
    { id: '5', date: '2026-06-19', balance: 17866.49 }
  ];

  /* ---------- Seed: regras de paycheck (AA Fleet Service/Ramp, Shift 2) ---------- */
  var defaultPaycheckConfig = {
    baseRate: 23.28,
    shift2RegDiff: 0.51,
    shift2OtMultiplier: 1.5, // OT diff = regDiff * 1.5
    contrib401kPct: 4,
    fixedPretax: 245.52,     // Section 125 (médico+dental+visão+AD&D)
    fixedPosttax: 60.68,
    ssRate: 6.2,
    medicareRate: 1.45,
    fedWithholdingPct: 1.2316,  // efetivo verificado em pay stub real ($31.27 em $2,539.82 taxable)
    regHours: 80,
    otHours: 0,
    ot2Hours: 0,
    holHours: 0,
    wrkHolHours: 0,
    lunchPenaltyHours: 0
  };

  /* ---------- Seed: configuração de projeção 401k ---------- */
  var defaultProjectionConfig = {
    allocPctLargeCap: 20.26,        // % no US Large Cap Stock Index
    returnLargeCap: 15.67,          // retorno real 10 anos (prospecto NetBenefits, AS OF 05/31/2026)
    returnTargetDate: 11.27,        // retorno real 10 anos (prospecto NetBenefits, AS OF 05/31/2026)
    employeeContribPct: 4,
    companyMatchPct: 4,
    companyExtraPct: 5,
    biweeklyGross: 2752.39,         // gross biweekly de referência p/ projeção (editável)
    annualRaisePct: 0,              // aumento anual hipotético além da tabela
    horizons: [10, 15, 20, 25, 30]
  };

  /* ---------- Helpers ---------- */
  function formatUSD(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
  }

  function formatUSDShort(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    if (Math.abs(n) >= 1000000) return '$' + (n / 1000000).toFixed(2) + 'M';
    if (Math.abs(n) >= 1000) return '$' + (n / 1000).toFixed(1) + 'k';
    return formatUSD(n);
  }

  function formatDateLabel(iso) {
    var parts = iso.split('-');
    var months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    return months[parseInt(parts[1], 10) - 1] + ' ' + parseInt(parts[2], 10);
  }

  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return Object.assign({}, fallback, parsed);
      }
    } catch (e) {}
    return Object.assign({}, fallback);
  }

  function loadEntries() {
    try {
      var raw = localStorage.getItem(KEY_ENTRIES);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return initialEntries;
  }

  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function num(v, fallback) {
    var n = parseFloat(v);
    return isNaN(n) ? (fallback || 0) : n;
  }

  /* ---------- Icons ---------- */
  var ICON_PATHS = {
    plane: 'M21.5 15.5L15 12.7V7.2c0-1-.6-1.9-1.5-2.2-.3-.1-.6 0-.8.2L11 7.3 8.3 5.2c-.2-.2-.5-.3-.8-.2-.9.3-1.5 1.2-1.5 2.2v5.5L0 15.5v1.5l6-1.8v2.3l-1.7 1.3v1.2l3.2-1 .5-.1.5.1 3.2 1v-1.2L10 17.2v-2.3l6 1.8v-1.2z',
    up: 'M3 17l6-6 4 4 8-8 M14 7h7v7',
    down: 'M3 7l6 6 4-4 8 8 M21 10v7h-7',
    plus: 'M12 5v14 M5 12h14',
    trash: 'M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6 M10 11v6 M14 11v6',
    gauge: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 12l4-4 M12 6v2',
    dollar: 'M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
    chart: 'M3 3v18h18 M18.7 8l-5.1 5.2-3-3L7 13.6',
    reset: 'M1 4v6h6 M3.51 15a9 9 0 1 0 2.13-9.36L1 10'
  };

  function Icon(props) {
    var path = ICON_PATHS[props.name] || '';
    return h('svg', {
      width: props.size || 14,
      height: props.size || 14,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: props.color || 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      style: Object.assign({ display: 'inline-flex', flexShrink: 0, verticalAlign: 'middle' }, props.style || {})
    }, h('path', { d: path }));
  }

  /* ---------- Shared dependency-free line chart ---------- */
  function MiniChart(props) {
    var data = props.data;
    var width = props.width || 320, height = props.height || 180, padX = 30, padY = 20;
    var lineColor = props.color || '#5EEAD4';
    if (!data || data.length === 0) return h('div', { style: { color: '#6B7280', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', padding: 20, textAlign: 'center' } }, 'Sem dados');

    var values = data.map(function (d) { return d.value; });
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var range = (max - min) || 1;
    var pad = range * 0.15 || 100;
    min -= pad; max += pad; range = max - min;

    var stepX = data.length > 1 ? (width - padX * 2) / (data.length - 1) : 0;
    function xAt(i) { return padX + i * stepX; }
    function yAt(v) { return height - padY - ((v - min) / range) * (height - padY * 2); }

    var points = data.map(function (d, i) { return xAt(i) + ',' + yAt(d.value); }).join(' ');
    var firstLineY = yAt(data[0].value);

    var gridLines = [0, 0.25, 0.5, 0.75, 1].map(function (t, idx) {
      var y = padY + t * (height - padY * 2);
      return h('line', { key: 'grid' + idx, x1: padX, x2: width - padX, y1: y, y2: y, stroke: '#1F2937', strokeDasharray: '3 3', strokeWidth: 1 });
    });

    var dots = data.map(function (d, i) {
      return h('circle', { key: 'dot' + i, cx: xAt(i), cy: yAt(d.value), r: 4, fill: '#0B1120', stroke: lineColor, strokeWidth: 2 });
    });

    var labels = data.map(function (d, i) {
      if (data.length > 6 && i % Math.ceil(data.length / 6) !== 0 && i !== data.length - 1) return null;
      return h('text', { key: 'lbl' + i, x: xAt(i), y: height - 4, fontSize: 9, fill: '#6B7280', textAnchor: 'middle', fontFamily: 'JetBrains Mono, monospace' }, d.label);
    });

    return h('svg', { width: '100%', height: height, viewBox: '0 0 ' + width + ' ' + height, preserveAspectRatio: 'xMidYMid meet' },
      gridLines,
      h('line', { x1: padX, x2: width - padX, y1: firstLineY, y2: firstLineY, stroke: '#374151', strokeDasharray: '4 4', strokeWidth: 1 }),
      h('polyline', { points: points, fill: 'none', stroke: lineColor, strokeWidth: 2.5, strokeLinejoin: 'round', strokeLinecap: 'round' }),
      dots,
      labels
    );
  }

  /* ============================================================
     SHARED STYLES
     ============================================================ */
  var S = {
    app: { minHeight: '100vh', background: '#0B1120', color: '#E5E7EB', fontFamily: "'Inter', sans-serif", margin: '0 auto', maxWidth: 480, display: 'flex', flexDirection: 'column' },
    scrollArea: { flex: 1, paddingBottom: 90, overflowY: 'auto' },
    headerStrip: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #1F2937', position: 'sticky', top: 0, background: '#0B1120', zIndex: 10 },
    headerLeft: { display: 'flex', alignItems: 'center', gap: 8 },
    headerLabel: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 1.5, color: '#9CA3AF' },
    headerRight: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#4B5563', letterSpacing: 1 },

    card: { margin: '14px 16px 0', padding: '16px', background: '#111827', border: '1px solid #1F2937', borderRadius: 16 },
    cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    cardTitle: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 1.5, color: '#9CA3AF' },
    cardSub: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#4B5563' },

    gaugeCard: { margin: '20px 16px 0', padding: '24px 20px', background: 'linear-gradient(160deg, #111827 0%, #0B1120 100%)', border: '1px solid #1F2937', borderRadius: 16 },
    gaugeLabel: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 2, color: '#6B7280', marginBottom: 6 },
    gaugeValue: { fontFamily: "'JetBrains Mono', monospace", fontSize: 38, fontWeight: 700, color: '#F9FAFB', letterSpacing: -1, lineHeight: 1.1 },
    gaugeValueSm: { fontFamily: "'JetBrains Mono', monospace", fontSize: 28, fontWeight: 700, color: '#F9FAFB', letterSpacing: -0.5, lineHeight: 1.1 },
    gaugeDate: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#4B5563', letterSpacing: 1, marginTop: 4, marginBottom: 18 },

    deltaRow: { display: 'flex', alignItems: 'stretch', gap: 16 },
    deltaBox: { flex: 1 },
    deltaDivider: { width: 1, background: '#1F2937' },
    deltaLabel: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: 1, color: '#6B7280', marginBottom: 4 },
    deltaValue: { fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
    deltaPct: { fontSize: 11, opacity: 0.7, marginLeft: 2 },

    addBtn: { display: 'flex', alignItems: 'center', gap: 4, background: '#134E4A', color: '#5EEAD4', border: '1px solid #115E59', borderRadius: 8, padding: '6px 10px', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 0.5, cursor: 'pointer' },
    ghostBtn: { display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', color: '#6B7280', border: '1px solid #1F2937', borderRadius: 8, padding: '6px 10px', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 0.5, cursor: 'pointer' },

    formBox: { background: '#0B1120', border: '1px solid #1F2937', borderRadius: 12, padding: 14, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 },
    formRow: { display: 'flex', flexDirection: 'column', gap: 4 },
    formRow2: { display: 'flex', gap: 10 },
    formLabel: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: 1, color: '#6B7280' },
    input: { background: '#111827', border: '1px solid #374151', borderRadius: 8, padding: '10px 12px', color: '#F9FAFB', fontFamily: "'JetBrains Mono', monospace", fontSize: 14, outline: 'none', WebkitAppearance: 'none', width: '100%' },
    errorText: { color: '#FB7185', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" },
    submitBtn: { background: '#5EEAD4', color: '#0B1120', border: 'none', borderRadius: 8, padding: '10px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 12, letterSpacing: 1, cursor: 'pointer', marginTop: 2 },

    entryList: { display: 'flex', flexDirection: 'column', gap: 2 },
    entryRow: { display: 'grid', gridTemplateColumns: '64px 1fr 100px 24px', alignItems: 'center', padding: '10px 4px', borderBottom: '1px solid #1A2333', gap: 8 },
    entryDate: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#9CA3AF' },
    entryBalance: { fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600, color: '#F9FAFB' },
    entryDiff: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, textAlign: 'right' },
    deleteBtn: { background: 'transparent', border: 'none', color: '#4B5563', cursor: 'pointer', padding: 4, display: 'flex' },

    footer: { textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#374151', letterSpacing: 1, margin: '20px 0' },

    /* Bottom nav */
    bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: 480, margin: '0 auto', background: 'rgba(11,17,32,0.95)', backdropFilter: 'blur(12px)', borderTop: '1px solid #1F2937', display: 'flex', paddingBottom: 'env(safe-area-inset-bottom)', zIndex: 100 },
    navBtn: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '10px 0 8px', background: 'transparent', border: 'none', cursor: 'pointer' },
    navLabel: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: 0.5 },

    /* Paycheck specific */
    sectionLabel: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 1.5, color: '#5EEAD4', marginTop: 6, marginBottom: 8 },
    grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
    lineItemRow: { display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #1A2333', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 },
    lineItemLabel: { color: '#9CA3AF' },
    lineItemValue: { color: '#F9FAFB', fontWeight: 600 },
    totalRow: { display: 'flex', justifyContent: 'space-between', padding: '10px 0 4px', fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700 },
    importBox: { background: '#0B1120', border: '1px dashed #374151', borderRadius: 12, padding: 14, marginBottom: 14, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#6B7280', lineHeight: 1.6 },

    /* Projection specific */
    tierBadge: { display: 'inline-flex', alignItems: 'center', gap: 4, background: '#134E4A', color: '#5EEAD4', borderRadius: 6, padding: '3px 8px', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600 },
    table: { width: '100%', borderCollapse: 'collapse', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 },
    th: { textAlign: 'left', color: '#6B7280', fontSize: 9, letterSpacing: 1, padding: '6px 4px', borderBottom: '1px solid #1F2937' },
    td: { padding: '8px 4px', borderBottom: '1px solid #1A2333', color: '#E5E7EB' },
    tdBold: { padding: '8px 4px', borderBottom: '1px solid #1A2333', color: '#F9FAFB', fontWeight: 700 }
  };
