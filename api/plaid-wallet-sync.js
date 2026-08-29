// Sincroniza saldos de todas as carteiras conectadas
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
    const { userId } = req.body;
    const itemsR = await supa(`plaid_wallet_connections?user_id=eq.${userId}&select=id,plaid_access_token,institution_name`);
    const items = itemsR.ok ? await itemsR.json() : [];

    const results = [];
    for (const item of items) {
      try {
        const balR = await fetch(`${plaidBaseUrl()}/accounts/balance/get`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: clientId, secret, access_token: item.plaid_access_token })
        });
        if (!balR.ok) continue;
        const balData = await balR.json();
        const accounts = balData.accounts || [];

        for (const acc of accounts) {
          await supa(`plaid_wallet_accounts?item_id=eq.${item.id}&plaid_account_id=eq.${acc.account_id}`, {
            method: 'PATCH',
            body: JSON.stringify({ current_balance: acc.balances?.current || 0, last_synced_at: new Date().toISOString() })
          });
        }
        results.push({ institution: item.institution_name, accounts: accounts.length });
      } catch(e) { results.push({ institution: item.institution_name, error: e.message }); }
    }

    res.status(200).json({ ok: true, synced: results });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
