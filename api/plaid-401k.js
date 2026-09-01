// Consolidated: link-token, exchange, sync, status, disconnect for Fidelity 401K

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

async function createLinkToken(userId) {
  const body = {
    client_id: process.env.PLAID_CLIENT_ID, secret: process.env.PLAID_SECRET,
    client_name: '401K Tracker', language: 'en', country_codes: ['US'],
    user: { client_user_id: userId || '401k-user' }, products: ['investments'],
  };
  const r = await fetch(`${plaidBaseUrl()}/link/token/create`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error_message || 'link token error');
  return data.link_token;
}

async function exchange(public_token, institution_name, userId) {
  const clientId = process.env.PLAID_CLIENT_ID, secret = process.env.PLAID_SECRET;
  const exR = await fetch(`${plaidBaseUrl()}/item/public_token/exchange`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, secret, public_token })
  });
  const exData = await exR.json();
  if (!exR.ok) throw new Error(exData.error_message);
  const { access_token, item_id } = exData;

  const holdingsR = await fetch(`${plaidBaseUrl()}/investments/holdings/get`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, secret, access_token })
  });
  const holdingsData = await holdingsR.json();
  const accounts = holdingsData.accounts || [];
  const total = accounts.reduce((s, a) => s + (a.balances?.current || 0), 0);
  const today = new Date().toISOString().split('T')[0];

  await supa('plaid_401k_connections', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ user_id: userId, plaid_item_id: item_id, plaid_access_token: access_token,
      institution_name: institution_name || 'Fidelity', current_balance: total,
      accounts: JSON.stringify(accounts.map(a => ({ id: a.account_id, name: a.name, balance: a.balances?.current || 0 }))),
      last_synced_at: new Date().toISOString() })
  });

  const ex = await supa(`tracker_entries?user_id=eq.${userId}&entry_date=eq.${today}&select=id&limit=1`);
  const existing = ex.ok ? await ex.json() : [];
  if (existing.length > 0) {
    await supa(`tracker_entries?user_id=eq.${userId}&entry_date=eq.${today}`, { method: 'PATCH', body: JSON.stringify({ balance: total }) });
  } else if (total > 0) {
    await supa('tracker_entries', { method: 'POST', body: JSON.stringify({ user_id: userId, date: today, balance: total }) });
  }
  return { total, accounts: accounts.length };
}

async function syncBalance(userId) {
  const clientId = process.env.PLAID_CLIENT_ID, secret = process.env.PLAID_SECRET;
  const connR = await supa(`plaid_401k_connections?user_id=eq.${userId}&select=*&limit=1`);
  const conns = await connR.json();
  if (!conns.length) throw new Error('No connection');
  const conn = conns[0];

  const holdingsR = await fetch(`${plaidBaseUrl()}/investments/holdings/get`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, secret, access_token: conn.plaid_access_token })
  });
  const holdingsData = await holdingsR.json();
  if (!holdingsR.ok) throw new Error(holdingsData.error_message);
  const accounts = holdingsData.accounts || [];
  const total = accounts.reduce((s, a) => s + (a.balances?.current || 0), 0);
  const today = new Date().toISOString().split('T')[0];

  await supa(`plaid_401k_connections?user_id=eq.${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ current_balance: total, last_synced_at: new Date().toISOString() })
  });

  /* Only save tracker entry if value changed */
  const lastR = await supa(`tracker_entries?user_id=eq.${userId}&order=entry_date.desc&select=balance&limit=1`);
  const lastRows = lastR.ok ? await lastR.json() : [];
  const lastBalance = lastRows.length ? parseFloat(lastRows[0].balance) : null;
  if (lastBalance !== null && Math.abs(lastBalance - total) < 0.01) {
    return { total, synced_at: new Date().toISOString(), action: 'skipped', reason: 'no change', lastBalance };
  }
  const ex = await supa(`tracker_entries?user_id=eq.${userId}&entry_date=eq.${today}&select=id&limit=1`);
  const existing = ex.ok ? await ex.json() : [];
  if (existing.length > 0) {
    await supa(`tracker_entries?user_id=eq.${userId}&entry_date=eq.${today}`, { method: 'PATCH', body: JSON.stringify({ balance: total }) });
  } else {
    await supa('tracker_entries', { method: 'POST', body: JSON.stringify({ user_id: userId, entry_date: today, balance: total }) });
  }
  return { total, synced_at: new Date().toISOString(), action: existing.length > 0 ? 'updated' : 'created' };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const action = req.query.action || req.body?.action;
  const clientId = process.env.PLAID_CLIENT_ID, secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) { res.status(500).json({ error: 'Plaid not configured' }); return; }

  try {
    if (action === 'link-token') {
      const token = await createLinkToken(req.body?.userId);
      res.status(200).json({ link_token: token });

    } else if (action === 'exchange') {
      const { public_token, institution_name, userId } = req.body;
      const result = await exchange(public_token, institution_name, userId);
      res.status(200).json({ ok: true, ...result });

    } else if (action === 'sync') {
      const result = await syncBalance(req.body?.userId);
      res.status(200).json({ ok: true, ...result });

    } else if (action === 'status') {
      const userId = req.query.userId || req.body?.userId;
      const r = await supa(`plaid_401k_connections?user_id=eq.${userId}&select=institution_name,current_balance,accounts,last_synced_at&limit=1`);
      const rows = r.ok ? await r.json() : [];
      if (!rows.length) { res.status(200).json({ connected: false }); return; }
      const conn = rows[0];
      res.status(200).json({ connected: true, ...conn, accounts: typeof conn.accounts === 'string' ? JSON.parse(conn.accounts) : conn.accounts });

    } else if (action === 'disconnect') {
      const userId = req.body?.userId;
      const r = await supa(`plaid_401k_connections?user_id=eq.${userId}&select=plaid_access_token&limit=1`);
      const rows = r.ok ? await r.json() : [];
      if (rows.length) {
        await fetch(`${plaidBaseUrl()}/item/remove`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: clientId, secret, access_token: rows[0].plaid_access_token })
        });
      }
      await supa(`plaid_401k_connections?user_id=eq.${userId}`, { method: 'DELETE' });
      res.status(200).json({ ok: true });

    } else {
      res.status(400).json({ error: 'Unknown action' });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
}
