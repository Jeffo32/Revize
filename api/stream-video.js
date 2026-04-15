export const config = { api: { responseLimit: false } };

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).end('Missing id');

  const apiKey = process.env.DRIVE_API_KEY;
  if (!apiKey) return res.status(500).end('Missing API key');

  try {
    // Use Drive API to get the file content directly
    const url = `https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${apiKey}`;
    const driveRes = await fetch(url);

    if (!driveRes.ok) {
      return res.status(driveRes.status).end('Drive error: ' + driveRes.status);
    }

    const contentType = driveRes.headers.get('content-type') || 'video/mp4';
    const contentLength = driveRes.headers.get('content-length');

    res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Accept-Ranges', 'none');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const buf = Buffer.from(await driveRes.arrayBuffer());
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(500).end(e.message);
  }
}
