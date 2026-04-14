import Stripe from 'stripe';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET) return res.status(500).json({ error: 'Missing Stripe config' });

  const stripe = new Stripe(STRIPE_SECRET);
  const { amount, description, clientName, clientEmail } = req.body || {};

  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'aud',
          product_data: {
            name: 'Revize — ' + (description || 'Gallery Selection'),
            description: 'Photography & Video by Wolfe Productions',
          },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      customer_email: clientEmail || undefined,
      metadata: {
        client_name: clientName || '',
        description: description || '',
      },
      success_url: req.headers.origin + '/?paid=success',
      cancel_url: req.headers.origin + '/?paid=cancel',
    });

    return res.status(200).json({ url: session.url });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
