export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).end('Missing id');

  const apiKey = process.env.DRIVE_API_KEY;
  if (!apiKey) return res.status(500).end('Missing API key');

  // Redirect to Drive API streaming URL — browser streams directly from Google CDN
  const streamUrl = `https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${apiKey}`;
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.redirect(302, streamUrl);
}
