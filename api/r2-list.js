export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
  const R2_TOKEN = process.env.CF_R2_TOKEN;
  const BUCKET = process.env.CF_R2_BUCKET || 'revize-media';
  const PUBLIC_URL = process.env.CF_R2_PUBLIC_URL || '';
  const client = req.query.client || 'shared';
  if (!ACCOUNT_ID || !R2_TOKEN) return res.status(500).json({ error: 'Missing config' });
  try {
    const url = 'https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT_ID + '/r2/buckets/' + BUCKET + '/objects?prefix=' + encodeURIComponent(client + '/');
    const r2Res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + R2_TOKEN } });
    if (!r2Res.ok) return res.status(500).json({ error: await r2Res.text() });
    const data = await r2Res.json();
    const objects = data.result?.objects || [];
    const videos = objects.filter(o => /\.(mp4|mov|webm|m4v)$/i.test(o.key)).map(o => ({ key: o.key, name: o.key.split('/').pop(), url: PUBLIC_URL + '/' + o.key }));
    return res.status(200).json({ videos });
  } catch(e) { return res.status(500).json({ error: e.message }); }
}
