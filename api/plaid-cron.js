// Consolidated cron: sync all users (scheduled) or specific user (from app)
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

async function saveToTracker(userId, walletId, balance, walletUuid = null) {
  const today = new Date().toISOString().split('T')[0];
  if (walletId === '401k') {
    /* Only save if value changed */
    const lastR = await supa(`tracker_entries?user_id=eq.${userId}&order=entry_date.desc&select=balance&limit=1`);
    const lastRows = lastR.ok ? await lastR.json() : [];
    const lastBalance = lastRows.length ? parseFloat(lastRows[0].balance) : null;
    if (lastBalance !== null && Math.abs(lastBalance - balance) < 0.01) {
      return { action: 'skipped', reason: 'no change', balance };
    }
    const ex = await supa(`tracker_entries?user_id=eq.${userId}&entry_date=eq.${today}&select=id&limit=1`);
    const existing = ex.ok ? await ex.json() : [];
    if (existing.length > 0) {
      await supa(`tracker_entries?user_id=eq.${userId}&entry_date=eq.${today}`, { method: 'PATCH', body: JSON.stringify({ balance }) });
      return { action: 'updated', balance };
    } else {
      await supa('tracker_entries', { method: 'POST', body: JSON.stringify({ user_id: userId, entry_date: today, balance }) });
      return { action: 'created', balance };
    }
  } else if (walletId) {
    let wId = walletUuid || null;
    if (!wId) {
      const walletR = await supa(`wallets?user_id=eq.${userId}&name=eq.${encodeURIComponent(walletId)}&select=id&limit=1`);
      const walletRows = walletR.ok ? await walletR.json() : [];
      if (!walletRows.length) return { action: 'error', error: 'Wallet not found' };
      wId = walletRows[0].id;
    }
    /* Only save if value changed */
    const lastR = await supa(`wallet_entries?wallet_id=eq.${wId}&order=entry_date.desc&select=balance&limit=1`);
    const lastRows = lastR.ok ? await lastR.json() : [];
    const lastBalance = lastRows.length ? parseFloat(lastRows[0].balance) : null;
    if (lastBalance !== null && Math.abs(lastBalance - balance) < 0.01) {
      return { action: 'skipped', reason: 'no change', balance };
    }
    const ex = await supa(`wallet_entries?wallet_id=eq.${wId}&entry_date=eq.${today}&select=id&limit=1`);
    const existing = ex.ok ? await ex.json() : [];
    if (existing.length > 0) {
      await supa(`wallet_entries?wallet_id=eq.${wId}&entry_date=eq.${today}`, { method: 'PATCH', body: JSON.stringify({ balance }) });
      return { action: 'updated', balance };
    } else {
      await supa('wallet_entries', { method: 'POST', body: JSON.stringify({ wallet_id: wId, entry_date: today, balance }) });
      return { action: 'created', balance };
    }
  }
  return { action: 'skipped' };
}

async function syncUser(userId, clientId, secret) {
  const results = [];
  // Wallet connections
  const connsR = await supa(`plaid_wallet_connections?user_id=eq.${userId}&select=id,plaid_access_token`);
  const conns = connsR.ok ? await connsR.json() : [];
  for (const conn of conns) {
    const accsR = await supa(`plaid_wallet_accounts?item_id=eq.${conn.id}&wallet_id=not.is.null&select=plaid_account_id,wallet_id,wallet_uuid`);
    const accs = accsR.ok ? await accsR.json() : [];
    if (!accs.length) continue;
    const balR = await fetch(`${plaidBaseUrl()}/accounts/balance/get`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, secret, access_token: conn.plaid_access_token })
    });
    if (!balR.ok) continue;
    const balData = await balR.json();
    for (const acc of accs) {
      const plaidAcc = balData.accounts?.find(a => a.account_id === acc.plaid_account_id);
      const balance = plaidAcc ? (plaidAcc.balances?.current || 0) : 0;
      const result = await saveToTracker(userId, acc.wallet_id, balance, acc.wallet_uuid || null);
      results.push({ wallet: acc.wallet_id, balance, action: result?.action });
    }
  }
  return results;
}

export default async function handler(req, res) {
  const clientId = process.env.PLAID_CLIENT_ID, secret = process.env.PLAID_SECRET;
  const action = req.query.action || req.body?.action;

  try {
    if (action === 'sync-user') {
      // Called from Tracker button — sync current user
      const { userId } = req.body;
      if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
      const results = await syncUser(userId, clientId, secret);
      res.status(200).json({ ok: true, synced: results.length, results });

    } else {
      // Called by Vercel cron — sync all users
      const auth = req.headers['authorization'];
      if (auth !== `Bearer ${process.env.CRON_SECRET}`) { res.status(401).json({ error: 'Unauthorized' }); return; }

      const connsR = await supa('plaid_wallet_connections?select=user_id');
      const conns = connsR.ok ? await connsR.json() : [];
      const userIds = [...new Set(conns.map(c => c.user_id))];
      const allResults = [];
      for (const uid of userIds) {
        const r = await syncUser(uid, clientId, secret);
        allResults.push(...r);
      }
      res.status(200).json({ ok: true, users: userIds.length, synced: allResults.length });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
}
