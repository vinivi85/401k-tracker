// Sincroniza saldo de uma conta Plaid específica e salva no Tracker/Carteira
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

  try {
    const { userId, itemId, walletId, plaidAccountId } = req.body;
    if (!userId || !itemId) { res.status(400).json({ error: 'userId and itemId required' }); return; }

    // Get access token from Supabase
    const connRes = await supa(`plaid_wallet_connections?plaid_item_id=eq.${itemId}&select=plaid_access_token&limit=1`);
    const conns = connRes.ok ? await connRes.json() : [];
    if (!conns.length) { res.status(404).json({ error: 'Connection not found' }); return; }

    const accessToken = conns[0].plaid_access_token;

    // Fetch balances from Plaid
    const balRes = await fetch(`${plaidBaseUrl()}/accounts/balance/get`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, secret, access_token: accessToken })
    });
    const balData = await balRes.json();
    if (!balRes.ok) { res.status(balRes.status).json({ error: balData.error_message }); return; }

    const accounts = balData.accounts || [];
    // Get specific account balance or total
    let balance = 0;
    if (plaidAccountId) {
      const acc = accounts.find(a => a.account_id === plaidAccountId);
      balance = acc ? (acc.balances?.current || 0) : 0;
    } else {
      balance = accounts.reduce((s, a) => s + (a.balances?.current || 0), 0);
    }

    const today = new Date().toISOString().split('T')[0];

    // Save to tracker based on walletId
    if (walletId === '401k') {
      // Save to tracker_entries (401k readings)
      const existRes = await supa(`tracker_entries?user_id=eq.${userId}&date=eq.${today}&select=id&limit=1`);
      const existing = existRes.ok ? await existRes.json() : [];
      if (existing.length > 0) {
        await supa(`tracker_entries?user_id=eq.${userId}&date=eq.${today}`, {
          method: 'PATCH', body: JSON.stringify({ balance })
        });
      } else {
        await supa('tracker_entries', {
          method: 'POST', body: JSON.stringify({ user_id: userId, date: today, balance })
        });
      }
    } else if (walletId) {
      // Save to wallet_entries
      const existRes = await supa(`wallet_entries?user_id=eq.${userId}&wallet_name=eq.${walletId}&date=eq.${today}&select=id&limit=1`);
      const existing = existRes.ok ? await existRes.json() : [];
      if (existing.length > 0) {
        await supa(`wallet_entries?user_id=eq.${userId}&wallet_name=eq.${walletId}&date=eq.${today}`, {
          method: 'PATCH', body: JSON.stringify({ balance })
        });
      } else {
        await supa('wallet_entries', {
          method: 'POST', body: JSON.stringify({ user_id: userId, wallet_name: walletId, date: today, balance })
        });
      }
    }

    res.status(200).json({ ok: true, balance, date: today, wallet: walletId });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
