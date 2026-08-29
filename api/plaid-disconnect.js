// Vercel Serverless Function — 401K Tracker
// Remove conexão Plaid

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

  try {
    const { userId } = req.body;
    const clientId = process.env.PLAID_CLIENT_ID;
    const secret   = process.env.PLAID_SECRET;

    // Get access token to remove from Plaid
    const connRes = await supaFetch(`plaid_401k_connections?user_id=eq.${userId}&select=plaid_access_token&limit=1`);
    const connections = await connRes.json();

    if (connections.length && clientId && secret) {
      // Remove item from Plaid
      await fetch(`${plaidBaseUrl()}/item/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, secret, access_token: connections[0].plaid_access_token }),
      });
    }

    // Delete from Supabase
    await supaFetch(`plaid_401k_connections?user_id=eq.${userId}`, { method: 'DELETE' });

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
