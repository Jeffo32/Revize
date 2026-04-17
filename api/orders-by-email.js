import Stripe from 'stripe';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET) return res.status(500).json({ error: 'Missing Stripe config' });

  const email = (req.query.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Email required' });

  const stripe = new Stripe(STRIPE_SECRET);

  try {
    // Find all checkout sessions for this email
    const sessions = await stripe.checkout.sessions.list({
      customer_details: { email },
      status: 'complete',
      limit: 50,
    });

    const orders = sessions.data
      .filter(s => s.payment_status === 'paid' && s.metadata)
      .map(s => {
        const meta = s.metadata;
        const photos = [];
        const videos = [];
        for (const [key, val] of Object.entries(meta)) {
          if (key.startsWith('photos_')) photos.push(...val.split(', '));
          if (key.startsWith('videos_')) videos.push(...val.split(', '));
        }
        return {
          sessionId: s.id,
          date: new Date(s.created * 1000).toLocaleDateString('en-AU'),
          description: meta.description || '',
          clientName: meta.client_name || '',
          photoFolder: meta.photo_folder || '',
          photoCount: photos.length,
          videoCount: videos.length,
        };
      });

    return res.status(200).json({ orders });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
