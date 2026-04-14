export const config = { api: { responseLimit: false } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { type, id, key } = req.query;

  if (type === 'drive' && id) {
    // Proxy Google Drive download
    const url = 'https://drive.google.com/uc?export=download&id=' + id;
    try {
      const r = await fetch(url, { redirect: 'follow' });
      if (!r.ok) return res.status(r.status).end();
      const ct = r.headers.get('content-type') || 'application/octet-stream';
      res.setHeader('Content-Type', ct);
      const buf = Buffer.from(await r.arrayBuffer());
      return res.status(200).send(buf);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (type === 'r2' && key) {
    const PUBLIC_URL = process.env.CF_R2_PUBLIC_URL || '';
    const url = PUBLIC_URL + '/' + key;
    try {
      const r = await fetch(url);
      if (!r.ok) return res.status(r.status).end();
      const ct = r.headers.get('content-type') || 'application/octet-stream';
      res.setHeader('Content-Type', ct);
      const buf = Buffer.from(await r.arrayBuffer());
      return res.status(200).send(buf);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'Missing type/id/key' });
}
