import Stripe from 'stripe';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET) return res.status(500).json({ error: 'Missing Stripe config' });

  const sessionId = req.query.session_id;
  if (!sessionId || !sessionId.startsWith('cs_')) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  const stripe = new Stripe(STRIPE_SECRET);

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return res.status(402).json({ error: 'Payment not completed' });
    }

    const meta = session.metadata || {};

    // Reconstruct photo and video names from chunked metadata keys
    const photos = [];
    const videos = [];
    for (const [key, val] of Object.entries(meta)) {
      if (key.startsWith('photos_')) photos.push(...val.split(', '));
      if (key.startsWith('videos_')) videos.push(...val.split(', '));
    }

    return res.status(200).json({
      clientName: meta.client_name || '',
      description: meta.description || '',
      photoFolder: meta.photo_folder || '',
      photos,
      videos,
    });
  } catch (e) {
    if (e.code === 'resource_missing') {
      return res.status(404).json({ error: 'Order not found' });
    }
    return res.status(500).json({ error: e.message });
  }
}
