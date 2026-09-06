// Google Drive OAuth + file listing for paystub PDFs

async function supa(path, opts = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, ...(opts.headers || {}) }
  });
}

async function getTokens(userId) {
  const r = await supa(`google_drive_tokens?user_id=eq.${userId}&select=access_token,refresh_token,expires_at&limit=1`);
  const rows = r.ok ? await r.json() : [];
  return rows[0] || null;
}

async function refreshAccessToken(userId, refreshToken) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error_description || 'Token refresh failed');
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
  await supa(`google_drive_tokens?user_id=eq.${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ access_token: data.access_token, expires_at: expiresAt })
  });
  return data.access_token;
}

async function getValidToken(userId) {
  const tokens = await getTokens(userId);
  if (!tokens) throw new Error('Not authenticated with Google Drive');
  if (new Date(tokens.expires_at) > new Date(Date.now() + 60000)) return tokens.access_token;
  return refreshAccessToken(userId, tokens.refresh_token);
}

async function listFiles(accessToken, folderId) {
  const q = encodeURIComponent(`'${folderId}' in parents and mimeType='application/pdf' and trashed=false`);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime desc`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || 'Drive list failed');
  return data.files || [];
}

async function listFolders(accessToken, parentId) {
  const q = encodeURIComponent(`'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&orderBy=name desc`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || 'Drive list folders failed');
  return data.files || [];
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const action = req.query.action || req.body?.action;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = (process.env.APP_URL || 'https://401k-tracker.vercel.app').trim().replace(/\/+$/, '');
  const redirectUri = `${appUrl}/api/google-callback`;

  try {
    if (action === 'auth-url') {
      // Generate OAuth URL
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        access_type: 'offline',
        prompt: 'consent',
        state: req.body?.userId || ''
      });
      res.status(200).json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, redirect_uri: redirectUri });

    } else if (action === 'status') {
      const { userId } = req.query;
      const tokens = await getTokens(userId);
      res.status(200).json({ connected: !!tokens });

    } else if (action === 'list-folders') {
      const { userId, folderId } = req.body;
      const token = await getValidToken(userId);
      const folders = await listFolders(token, folderId);
      res.status(200).json({ folders });

    } else if (action === 'list-files') {
      const { userId, folderId } = req.body;
      const token = await getValidToken(userId);
      const files = await listFiles(token, folderId);
      res.status(200).json({ files });

    } else if (action === 'download') {
      const { userId, fileId } = req.body;
      const token = await getValidToken(userId);
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!r.ok) { res.status(r.status).json({ error: 'Download failed' }); return; }
      const buffer = await r.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      res.status(200).json({ base64, mimeType: 'application/pdf' });

    } else if (action === 'disconnect') {
      const { userId } = req.body;
      await supa(`google_drive_tokens?user_id=eq.${userId}`, { method: 'DELETE' });
      res.status(200).json({ ok: true });

    } else {
      res.status(400).json({ error: 'Unknown action' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
