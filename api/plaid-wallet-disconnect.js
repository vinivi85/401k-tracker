// Vercel Serverless Function — desconecta um item Plaid específico
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
  try {
    const { itemId, userId } = req.body;
    const clientId = process.env.PLAID_CLIENT_ID;
    const secret   = process.env.PLAID_SECRET;

    if (itemId) {
      // Get access token
      const r = await supa(`plaid_wallet_connections?plaid_item_id=eq.${itemId}&select=plaid_access_token&limit=1`);
      const rows = r.ok ? await r.json() : [];
      if (rows.length && clientId && secret) {
        await fetch(`${plaidBaseUrl()}/item/remove`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: clientId, secret, access_token: rows[0].plaid_access_token })
        });
      }
      await supa(`plaid_wallet_connections?plaid_item_id=eq.${itemId}`, { method: 'DELETE' });
    }

    res.status(200).json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
