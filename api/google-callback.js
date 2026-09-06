// OAuth callback — exchanges code for tokens and saves to Supabase

async function supa(path, opts = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, ...(opts.headers || {}) }
  });
}

export default async function handler(req, res) {
  const { code, state: userId, error } = req.query;
  const appUrl = (process.env.APP_URL || 'https://401k-tracker.vercel.app').trim().replace(/\/+$/, '');

  if (error) {
    res.redirect(`${appUrl}?google_error=${encodeURIComponent(error)}`);
    return;
  }
  if (!code || !userId) {
    res.redirect(`${appUrl}?google_error=missing_params`);
    return;
  }

  try {
    const redirectUri = `${appUrl}/api/google-callback`;
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code, redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error_description || 'Token exchange failed');

    const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

    // Upsert tokens
    await supa('google_drive_tokens', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        user_id: userId,
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: expiresAt
      })
    });

    res.redirect(`${appUrl}?google_connected=1`);
  } catch (err) {
    res.redirect(`${appUrl}?google_error=${encodeURIComponent(err.message)}`);
  }
}
