// Sincroniza todos os saldos Plaid do usuário logado (chamado pelo Tracker)
function plaidBaseUrl() {
  const env = process.env.PLAID_ENV || 'sandbox';
  return env === 'production' ? 'https://production.plaid.com' : 'https://sandbox.plaid.com';
}

async function supa(path, opts = {}) {
  const url = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, ...(opts.headers||{}) }
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret   = process.env.PLAID_SECRET;
  const { userId } = req.body;
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }

  const today = new Date().toISOString().split('T')[0];
  const results = [];

  try {
    // Sync wallet connections (Robinhood, Marcus, etc.)
    const connsRes = await supa(`plaid_wallet_connections?user_id=eq.${userId}&select=id,plaid_access_token`);
    const conns = connsRes.ok ? await connsRes.json() : [];

    for (const conn of conns) {
      const accsRes = await supa(`plaid_wallet_accounts?item_id=eq.${conn.id}&wallet_id=not.is.null&select=plaid_account_id,wallet_id`);
      const accs = accsRes.ok ? await accsRes.json() : [];

      if (!accs.length) continue;

      const balRes = await fetch(`${plaidBaseUrl()}/accounts/balance/get`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, secret, access_token: conn.plaid_access_token })
      });
      if (!balRes.ok) continue;
      const balData = await balRes.json();
      const plaidAccounts = balData.accounts || [];

      for (const acc of accs) {
        const plaidAcc = plaidAccounts.find(a => a.account_id === acc.plaid_account_id);
        const balance = plaidAcc ? (plaidAcc.balances?.current || 0) : 0;

        if (acc.wallet_id === '401k') {
          const ex = await supa(`tracker_entries?user_id=eq.${userId}&date=eq.${today}&select=id&limit=1`);
          const existing = ex.ok ? await ex.json() : [];
          if (existing.length > 0) {
            await supa(`tracker_entries?user_id=eq.${userId}&date=eq.${today}`, { method: 'PATCH', body: JSON.stringify({ balance }) });
          } else {
            await supa('tracker_entries', { method: 'POST', body: JSON.stringify({ user_id: userId, date: today, balance }) });
          }
        } else {
          const ex = await supa(`wallet_entries?user_id=eq.${userId}&wallet_name=eq.${acc.wallet_id}&date=eq.${today}&select=id&limit=1`);
          const existing = ex.ok ? await ex.json() : [];
          if (existing.length > 0) {
            await supa(`wallet_entries?user_id=eq.${userId}&wallet_name=eq.${acc.wallet_id}&date=eq.${today}`, { method: 'PATCH', body: JSON.stringify({ balance }) });
          } else {
            await supa('wallet_entries', { method: 'POST', body: JSON.stringify({ user_id: userId, wallet_name: acc.wallet_id, date: today, balance }) });
          }
        }
        results.push({ wallet: acc.wallet_id, balance });
      }
    }

    res.status(200).json({ ok: true, synced: results.length, results, date: today });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
