import Stripe from 'stripe';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

  if (!STRIPE_SECRET) return res.status(500).end('Missing Stripe config');

  const stripe = new Stripe(STRIPE_SECRET);

  // Read raw body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks);

  let event;
  if (WEBHOOK_SECRET) {
    const sig = req.headers['stripe-signature'];
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
    } catch (e) {
      return res.status(400).end('Webhook signature verification failed');
    }
  } else {
    event = JSON.parse(rawBody.toString());
  }

  // When a subscription is created, schedule cancellation after 12 weeks
  if (event.type === 'customer.subscription.created') {
    const subscription = event.data.object;
    const cancelAt = Math.floor(Date.now() / 1000) + (12 * 7 * 24 * 60 * 60);
    try {
      await stripe.subscriptions.update(subscription.id, { cancel_at: cancelAt });
    } catch (e) {
      console.error('Failed to set cancel_at:', e.message);
    }
  }

  return res.status(200).json({ received: true });
}
