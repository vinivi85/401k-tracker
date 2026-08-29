// Vercel Serverless Function — 401K Tracker
// Troca public_token por access_token e busca contas de investimento

function plaidBaseUrl() {
  const env = process.env.PLAID_ENV || 'sandbox';
  return env === 'production' ? 'https://production.plaid.com' : 'https://sandbox.plaid.com';
}

async function supaFetch(path, opts = {}) {
  const url = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, ...(opts.headers || {}) },
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const clientId = process.env.PLAID_CLIENT_ID;
  const secret   = process.env.PLAID_SECRET;
  if (!clientId || !secret || !process.env.SUPABASE_URL) {
    res.status(500).json({ error: 'Environment variables not configured' });
    return;
  }

  try {
    const { public_token, institution_name, userId } = req.body;
    if (!public_token) { res.status(400).json({ error: 'public_token required' }); return; }

    // 1. Exchange token
    const exchangeRes = await fetch(`${plaidBaseUrl()}/item/public_token/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, secret, public_token }),
    });
    const exchangeData = await exchangeRes.json();
    if (!exchangeRes.ok) { res.status(exchangeRes.status).json({ error: exchangeData.error_message }); return; }

    const accessToken = exchangeData.access_token;
    const itemId      = exchangeData.item_id;

    // 2. Get investment accounts
    const holdingsRes = await fetch(`${plaidBaseUrl()}/investments/holdings/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, secret, access_token: accessToken }),
    });
    const holdingsData = await holdingsRes.json();
    const accounts = holdingsData.accounts || [];
    const totalBalance = accounts.reduce((s, a) => s + (a.balances?.current || 0), 0);

    // 3. Save to Supabase
    const saveRes = await supaFetch('plaid_401k_connections', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: userId,
        plaid_item_id: itemId,
        plaid_access_token: accessToken,
        institution_name: institution_name || 'Fidelity',
        current_balance: totalBalance,
        accounts: JSON.stringify(accounts.map(a => ({
          id: a.account_id,
          name: a.name,
          balance: a.balances?.current || 0,
          type: a.type,
          subtype: a.subtype,
        }))),
        last_synced_at: new Date().toISOString(),
      }),
    });

    if (!saveRes.ok) {
      const err = await saveRes.text();
      res.status(500).json({ error: 'Error saving connection: ' + err });
      return;
    }

    res.status(200).json({ ok: true, institution_name, total_balance: totalBalance, accounts: accounts.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
