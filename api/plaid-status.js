// Vercel Serverless Function — 401K Tracker
// Retorna status da conexão Plaid e saldo atual

async function supaFetch(path, opts = {}) {
  const url = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, ...(opts.headers || {}) },
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    const userId = req.method === 'GET' ? req.query.userId : req.body?.userId;
    const connRes = await supaFetch(`plaid_401k_connections?user_id=eq.${userId}&select=institution_name,current_balance,accounts,last_synced_at&limit=1`);
    const connections = await connRes.json();

    if (!connections.length) {
      res.status(200).json({ connected: false });
      return;
    }

    const conn = connections[0];
    res.status(200).json({
      connected: true,
      institution_name: conn.institution_name,
      current_balance: conn.current_balance,
      accounts: typeof conn.accounts === 'string' ? JSON.parse(conn.accounts) : conn.accounts,
      last_synced_at: conn.last_synced_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
