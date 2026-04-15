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
  const { amount, description, clientName, clientEmail, paymentPlan } = req.body || {};

  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

  const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || '';

  try {
    if (paymentPlan) {
      // Weekly payment plan: $100/week × 12 weeks
      const weeklyAmount = 10000; // $100 in cents
      const totalWeeks = 12;

      // Create a recurring price
      const price = await stripe.prices.create({
        currency: 'aud',
        unit_amount: weeklyAmount,
        recurring: { interval: 'week' },
        product_data: {
          name: 'Revize — ' + (description || 'Complete Package') + ' (Payment Plan)',
          metadata: { client_name: clientName || '' },
        },
      });

      // Auto-cancel after 12 weeks
      const cancelAt = Math.floor(Date.now() / 1000) + (totalWeeks * 7 * 24 * 60 * 60);

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price: price.id, quantity: 1 }],
        mode: 'subscription',
        subscription_data: {
          cancel_at: cancelAt,
          metadata: {
            client_name: clientName || '',
            description: description || '',
            total_payments: totalWeeks.toString(),
          },
        },
        customer_email: clientEmail || undefined,
        success_url: origin + '/?paid=success',
        cancel_url: origin + '/?paid=cancel',
      });

      return res.status(200).json({ url: session.url });
    } else {
      // One-time payment
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
        success_url: origin + '/?paid=success',
        cancel_url: origin + '/?paid=cancel',
      });

      return res.status(200).json({ url: session.url });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
