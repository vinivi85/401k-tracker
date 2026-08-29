// Vercel Serverless Function — 401K Tracker
// Sincroniza saldo Fidelity via Plaid e salva leitura diária no Tracker

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

    // 1. Get connection
    const connRes = await supa(`plaid_401k_connections?user_id=eq.${userId}&select=*&limit=1`);
    const connections = await connRes.json();
    if (!connections.length) { res.status(404).json({ error: 'No connection found' }); return; }
    const conn = connections[0];

    // 2. Fetch updated balances from Plaid
    const holdingsRes = await fetch(`${plaidBaseUrl()}/investments/holdings/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, secret, access_token: conn.plaid_access_token })
    });
    const holdingsData = await holdingsRes.json();
    if (!holdingsRes.ok) { res.status(holdingsRes.status).json({ error: holdingsData.error_message }); return; }

    const accounts = holdingsData.accounts || [];
    const totalBalance = accounts.reduce((s, a) => s + (a.balances?.current || 0), 0);
    const today = new Date().toISOString().split('T')[0];

    // 3. Update plaid_401k_connections
    await supa(`plaid_401k_connections?user_id=eq.${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        current_balance: totalBalance,
        accounts: JSON.stringify(accounts.map(a => ({
          id: a.account_id, name: a.name,
          balance: a.balances?.current || 0,
          type: a.type, subtype: a.subtype
        }))),
        last_synced_at: new Date().toISOString()
      })
    });

    // 4. Upsert tracker_entries — uma leitura por dia, não duplica
    // Verifica se já existe leitura hoje
    const existingRes = await supa(
      `tracker_entries?user_id=eq.${userId}&date=eq.${today}&select=id,balance&limit=1`
    );
    const existing = existingRes.ok ? await existingRes.json() : [];

    if (existing.length > 0) {
      // Atualiza leitura existente do dia
      await supa(`tracker_entries?user_id=eq.${userId}&date=eq.${today}`, {
        method: 'PATCH',
        body: JSON.stringify({ balance: totalBalance })
      });
    } else {
      // Cria nova leitura
      await supa('tracker_entries', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, date: today, balance: totalBalance })
      });
    }

    res.status(200).json({
      ok: true,
      total_balance: totalBalance,
      synced_at: new Date().toISOString(),
      tracker_updated: true,
      action: existing.length > 0 ? 'updated' : 'created'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
