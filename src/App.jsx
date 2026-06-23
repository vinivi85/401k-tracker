import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Plus, TrendingUp, TrendingDown, Trash2, Plane } from 'lucide-react';

const STORAGE_KEY = '401k-entries';

const initialEntries = [
  { id: '1', date: '2026-06-07', balance: 17141.23 },
  { id: '2', date: '2026-06-15', balance: 17704.06 },
  { id: '3', date: '2026-06-17', balance: 17873.69 },
  { id: '4', date: '2026-06-18', balance: 17707.98 },
  { id: '5', date: '2026-06-19', balance: 17866.49 },
];

function formatUSD(n) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

function formatDateLabel(iso) {
  const [y, m, d] = iso.split('-');
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${months[parseInt(m,10)-1]} ${parseInt(d,10)}`;
}

export default function Tracker401k() {
  const [entries, setEntries] = useState(initialEntries);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newBalance, setNewBalance] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const result = await window.storage.get(STORAGE_KEY);
        if (result && result.value) {
          const parsed = JSON.parse(result.value);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setEntries(parsed);
          } else {
            await window.storage.set(STORAGE_KEY, JSON.stringify(initialEntries));
          }
        } else {
          await window.storage.set(STORAGE_KEY, JSON.stringify(initialEntries));
        }
      } catch (e) {
        // first run, key doesn't exist yet
        try {
          await window.storage.set(STORAGE_KEY, JSON.stringify(initialEntries));
        } catch (e2) {
          console.error('Storage init failed', e2);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persist = async (next) => {
    setSaving(true);
    try {
      await window.storage.set(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      console.error('Storage save failed', e);
    } finally {
      setSaving(false);
    }
  };

  const sorted = useMemo(
    () => [...entries].sort((a, b) => new Date(a.date) - new Date(b.date)),
    [entries]
  );

  const latest = sorted[sorted.length - 1];
  const first = sorted[0];
  const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;

  const totalChange = latest && first ? latest.balance - first.balance : 0;
  const totalChangePct = latest && first && first.balance ? (totalChange / first.balance) * 100 : 0;
  const dayChange = latest && prev ? latest.balance - prev.balance : 0;
  const dayChangePct = latest && prev && prev.balance ? (dayChange / prev.balance) * 100 : 0;

  const chartData = sorted.map((e) => ({
    date: e.date,
    label: formatDateLabel(e.date),
    balance: e.balance,
  }));

  const minBal = sorted.length ? Math.min(...sorted.map((e) => e.balance)) : 0;
  const maxBal = sorted.length ? Math.max(...sorted.map((e) => e.balance)) : 0;
  const pad = (maxBal - minBal) * 0.15 || 100;

  const handleAdd = async () => {
    setError('');
    if (!newDate) {
      setError('Selecione uma data.');
      return;
    }
    if (!newBalance || isNaN(parseFloat(newBalance))) {
      setError('Informe um saldo válido.');
      return;
    }
    const entry = {
      id: Date.now().toString(),
      date: newDate,
      balance: parseFloat(newBalance),
    };
    const next = [...entries.filter((e) => e.date !== newDate), entry];
    setEntries(next);
    await persist(next);
    setNewDate('');
    setNewBalance('');
    setShowForm(false);
  };

  const handleDelete = async (id) => {
    const next = entries.filter((e) => e.id !== id);
    setEntries(next);
    await persist(next);
  };

  if (loading) {
    return (
      <div style={styles.loadingScreen}>
        <div style={styles.loadingText}>CARREGANDO PAINEL...</div>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <style>{fontImports}</style>

      {/* Header strip */}
      <div style={styles.headerStrip}>
        <div style={styles.headerLeft}>
          <Plane size={16} color="#5EEAD4" style={{ transform: 'rotate(45deg)' }} />
          <span style={styles.headerLabel}>AA 401(K) · FLIGHT DECK</span>
        </div>
        <div style={styles.headerRight}>{saving ? 'SALVANDO…' : 'SINCRONIZADO'}</div>
      </div>

      {/* Main gauge */}
      <div style={styles.gaugeCard}>
        <div style={styles.gaugeLabel}>SALDO ATUAL</div>
        <div style={styles.gaugeValue}>{latest ? formatUSD(latest.balance) : '—'}</div>
        <div style={styles.gaugeDate}>
          {latest ? `ÚLTIMA LEITURA · ${formatDateLabel(latest.date).toUpperCase()} 2026` : 'SEM DADOS'}
        </div>

        <div style={styles.deltaRow}>
          <div style={styles.deltaBox}>
            <div style={styles.deltaLabel}>DESDE ÚLTIMA LEITURA</div>
            <div style={{ ...styles.deltaValue, color: dayChange >= 0 ? '#5EEAD4' : '#FB7185' }}>
              {dayChange >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {dayChange >= 0 ? '+' : ''}{formatUSD(dayChange)}
              <span style={styles.deltaPct}>({dayChangePct >= 0 ? '+' : ''}{dayChangePct.toFixed(2)}%)</span>
            </div>
          </div>
          <div style={styles.deltaDivider} />
          <div style={styles.deltaBox}>
            <div style={styles.deltaLabel}>DESDE O INÍCIO</div>
            <div style={{ ...styles.deltaValue, color: totalChange >= 0 ? '#5EEAD4' : '#FB7185' }}>
              {totalChange >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {totalChange >= 0 ? '+' : ''}{formatUSD(totalChange)}
              <span style={styles.deltaPct}>({totalChangePct >= 0 ? '+' : ''}{totalChangePct.toFixed(2)}%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Altimeter chart */}
      <div style={styles.chartCard}>
        <div style={styles.chartHeader}>
          <span style={styles.chartTitle}>ALTÍMETRO DE SALDO</span>
          <span style={styles.chartSub}>{sorted.length} leituras</span>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="lineGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5EEAD4" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#5EEAD4" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1F2937" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#6B7280', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
              axisLine={{ stroke: '#1F2937' }}
              tickLine={false}
            />
            <YAxis
              domain={[minBal - pad, maxBal + pad]}
              tick={{ fill: '#6B7280', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
              width={38}
            />
            <Tooltip
              contentStyle={{
                background: '#0B1120',
                border: '1px solid #1F2937',
                borderRadius: 8,
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 12,
              }}
              labelStyle={{ color: '#9CA3AF' }}
              formatter={(value) => [formatUSD(value), 'Saldo']}
            />
            {first && (
              <ReferenceLine y={first.balance} stroke="#374151" strokeDasharray="4 4" />
            )}
            <Line
              type="monotone"
              dataKey="balance"
              stroke="#5EEAD4"
              strokeWidth={2.5}
              dot={{ fill: '#0B1120', stroke: '#5EEAD4', strokeWidth: 2, r: 4 }}
              activeDot={{ fill: '#5EEAD4', r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Log */}
      <div style={styles.logCard}>
        <div style={styles.logHeader}>
          <span style={styles.chartTitle}>REGISTRO DE LEITURAS</span>
          <button style={styles.addBtn} onClick={() => setShowForm((s) => !s)}>
            <Plus size={14} />
            {showForm ? 'CANCELAR' : 'NOVA LEITURA'}
          </button>
        </div>

        {showForm && (
          <div style={styles.formBox}>
            <div style={styles.formRow}>
              <label style={styles.formLabel}>DATA</label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                style={styles.input}
                max="2026-12-31"
              />
            </div>
            <div style={styles.formRow}>
              <label style={styles.formLabel}>SALDO (USD)</label>
              <input
                type="number"
                step="0.01"
                placeholder="17866.49"
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
                style={styles.input}
              />
            </div>
            {error && <div style={styles.errorText}>{error}</div>}
            <button style={styles.submitBtn} onClick={handleAdd}>
              REGISTRAR LEITURA
            </button>
          </div>
        )}

        <div style={styles.entryList}>
          {sorted
            .slice()
            .reverse()
            .map((e, idx) => {
              const sortedIdx = sorted.length - 1 - idx;
              const prevEntry = sortedIdx > 0 ? sorted[sortedIdx - 1] : null;
              const diff = prevEntry ? e.balance - prevEntry.balance : 0;
              return (
                <div key={e.id} style={styles.entryRow}>
                  <div style={styles.entryDate}>{formatDateLabel(e.date)} '26</div>
                  <div style={styles.entryBalance}>{formatUSD(e.balance)}</div>
                  <div style={{
                    ...styles.entryDiff,
                    color: !prevEntry ? '#6B7280' : diff >= 0 ? '#5EEAD4' : '#FB7185'
                  }}>
                    {prevEntry ? `${diff >= 0 ? '+' : ''}${formatUSD(diff)}` : 'BASE'}
                  </div>
                  <button style={styles.deleteBtn} onClick={() => handleDelete(e.id)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
        </div>
      </div>

      <div style={styles.footer}>DADOS SALVOS LOCALMENTE · NETBENEFITS / FIDELITY</div>
    </div>
  );
}

const fontImports = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
`;

const styles = {
  app: {
    minHeight: '100vh',
    background: '#0B1120',
    color: '#E5E7EB',
    fontFamily: "'Inter', sans-serif",
    padding: '0 0 32px 0',
    maxWidth: 480,
    margin: '0 auto',
  },
  loadingScreen: {
    minHeight: '100vh',
    background: '#0B1120',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#5EEAD4',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13,
    letterSpacing: 2,
  },
  headerStrip: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #1F2937',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  headerLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    letterSpacing: 1.5,
    color: '#9CA3AF',
  },
  headerRight: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    color: '#4B5563',
    letterSpacing: 1,
  },
  gaugeCard: {
    margin: '20px 16px 0',
    padding: '24px 20px',
    background: 'linear-gradient(160deg, #111827 0%, #0B1120 100%)',
    border: '1px solid #1F2937',
    borderRadius: 16,
  },
  gaugeLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    letterSpacing: 2,
    color: '#6B7280',
    marginBottom: 6,
  },
  gaugeValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 40,
    fontWeight: 700,
    color: '#F9FAFB',
    letterSpacing: -1,
    lineHeight: 1.1,
  },
  gaugeDate: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    color: '#4B5563',
    letterSpacing: 1,
    marginTop: 4,
    marginBottom: 18,
  },
  deltaRow: {
    display: 'flex',
    alignItems: 'stretch',
    gap: 16,
  },
  deltaBox: {
    flex: 1,
  },
  deltaDivider: {
    width: 1,
    background: '#1F2937',
  },
  deltaLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    letterSpacing: 1,
    color: '#6B7280',
    marginBottom: 4,
  },
  deltaValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 15,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  deltaPct: {
    fontSize: 11,
    opacity: 0.7,
    marginLeft: 2,
  },
  chartCard: {
    margin: '14px 16px 0',
    padding: '16px 8px 8px 12px',
    background: '#111827',
    border: '1px solid #1F2937',
    borderRadius: 16,
  },
  chartHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0 8px 4px 4px',
  },
  chartTitle: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    letterSpacing: 1.5,
    color: '#9CA3AF',
  },
  chartSub: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    color: '#4B5563',
  },
  logCard: {
    margin: '14px 16px 0',
    padding: '16px',
    background: '#111827',
    border: '1px solid #1F2937',
    borderRadius: 16,
  },
  logHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    background: '#134E4A',
    color: '#5EEAD4',
    border: '1px solid #115E59',
    borderRadius: 8,
    padding: '6px 10px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    letterSpacing: 0.5,
    cursor: 'pointer',
  },
  formBox: {
    background: '#0B1120',
    border: '1px solid #1F2937',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  formRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  formLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    letterSpacing: 1,
    color: '#6B7280',
  },
  input: {
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: 8,
    padding: '10px 12px',
    color: '#F9FAFB',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 14,
    outline: 'none',
  },
  errorText: {
    color: '#FB7185',
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
  },
  submitBtn: {
    background: '#5EEAD4',
    color: '#0B1120',
    border: 'none',
    borderRadius: 8,
    padding: '10px',
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: 1,
    cursor: 'pointer',
    marginTop: 2,
  },
  entryList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  entryRow: {
    display: 'grid',
    gridTemplateColumns: '64px 1fr 100px 24px',
    alignItems: 'center',
    padding: '10px 4px',
    borderBottom: '1px solid #1A2333',
    gap: 8,
  },
  entryDate: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: '#9CA3AF',
  },
  entryBalance: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13,
    fontWeight: 600,
    color: '#F9FAFB',
  },
  entryDiff: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    textAlign: 'right',
  },
  deleteBtn: {
    background: 'transparent',
    border: 'none',
    color: '#4B5563',
    cursor: 'pointer',
    padding: 4,
    display: 'flex',
  },
  footer: {
    textAlign: 'center',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    color: '#374151',
    letterSpacing: 1,
    marginTop: 20,
  },
};
