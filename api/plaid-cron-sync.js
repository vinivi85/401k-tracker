// Vercel Cron Job — roda diariamente para sincronizar todos os saldos Plaid
// Configurado em vercel.json como cron

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

async function syncOne(clientId, secret, userId, conn, plaidAccountId, walletId) {
  const balRes = await fetch(`${plaidBaseUrl()}/accounts/balance/get`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, secret, access_token: conn.plaid_access_token })
  });
  if (!balRes.ok) return;
  const balData = await balRes.json();
  const accounts = balData.accounts || [];

  let balance = 0;
  if (plaidAccountId) {
    const acc = accounts.find(a => a.account_id === plaidAccountId);
    balance = acc ? (acc.balances?.current || 0) : accounts.reduce((s,a) => s+(a.balances?.current||0), 0);
  } else {
    balance = accounts.reduce((s,a) => s+(a.balances?.current||0), 0);
  }

  const today = new Date().toISOString().split('T')[0];

  if (walletId === '401k') {
    const ex = await supa(`tracker_entries?user_id=eq.${userId}&date=eq.${today}&select=id&limit=1`);
    const existing = ex.ok ? await ex.json() : [];
    if (existing.length > 0) {
      await supa(`tracker_entries?user_id=eq.${userId}&date=eq.${today}`, { method: 'PATCH', body: JSON.stringify({ balance }) });
    } else {
      await supa('tracker_entries', { method: 'POST', body: JSON.stringify({ user_id: userId, date: today, balance }) });
    }
  } else if (walletId) {
    const ex = await supa(`wallet_entries?user_id=eq.${userId}&wallet_name=eq.${walletId}&date=eq.${today}&select=id&limit=1`);
    const existing = ex.ok ? await ex.json() : [];
    if (existing.length > 0) {
      await supa(`wallet_entries?user_id=eq.${userId}&wallet_name=eq.${walletId}&date=eq.${today}`, { method: 'PATCH', body: JSON.stringify({ balance }) });
    } else {
      await supa('wallet_entries', { method: 'POST', body: JSON.stringify({ user_id: userId, wallet_name: walletId, date: today, balance }) });
    }
  }
  return balance;
}

export default async function handler(req, res) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' }); return;
  }

  const clientId = process.env.PLAID_CLIENT_ID;
  const secret   = process.env.PLAID_SECRET;
  const results = [];

  try {
    // Get all wallet connections
    const connsRes = await supa('plaid_wallet_connections?select=id,user_id,plaid_item_id,plaid_access_token');
    const conns = connsRes.ok ? await connsRes.json() : [];

    // Get all account associations
    const accsRes = await supa('plaid_wallet_accounts?select=item_id,plaid_account_id,wallet_id,plaid_account_id&wallet_id=not.is.null');
    const accs = accsRes.ok ? await accsRes.json() : [];

    for (const conn of conns) {
      const connAccs = accs.filter(a => a.item_id === conn.id);
      for (const acc of connAccs) {
        try {
          const bal = await syncOne(clientId, secret, conn.user_id, conn, acc.plaid_account_id, acc.wallet_id);
          results.push({ item: conn.plaid_item_id, wallet: acc.wallet_id, balance: bal });
        } catch(e) {
          results.push({ item: conn.plaid_item_id, wallet: acc.wallet_id, error: e.message });
        }
      }
    }

    // Also sync 401k connections
    const k401Res = await supa('plaid_401k_connections?select=user_id,plaid_access_token,current_balance');
    const k401 = k401Res.ok ? await k401Res.json() : [];
    for (const conn of k401) {
      try {
        const balRes = await fetch(`${plaidBaseUrl()}/investments/holdings/get`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: clientId, secret, access_token: conn.plaid_access_token })
        });
        if (balRes.ok) {
          const balData = await balRes.json();
          const total = (balData.accounts||[]).reduce((s,a)=>s+(a.balances?.current||0),0);
          const today = new Date().toISOString().split('T')[0];
          await supa(`plaid_401k_connections?user_id=eq.${conn.user_id}`, {
            method: 'PATCH', body: JSON.stringify({ current_balance: total, last_synced_at: new Date().toISOString() })
          });
          // Save tracker entry
          const ex = await supa(`tracker_entries?user_id=eq.${conn.user_id}&date=eq.${today}&select=id&limit=1`);
          const existing = ex.ok ? await ex.json() : [];
          if (existing.length > 0) {
            await supa(`tracker_entries?user_id=eq.${conn.user_id}&date=eq.${today}`, { method: 'PATCH', body: JSON.stringify({ balance: total }) });
          } else {
            await supa('tracker_entries', { method: 'POST', body: JSON.stringify({ user_id: conn.user_id, date: today, balance: total }) });
          }
          results.push({ type: '401k', user: conn.user_id, balance: total });
        }
      } catch(e) { results.push({ type: '401k', error: e.message }); }
    }

    res.status(200).json({ ok: true, synced: results.length, results });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
