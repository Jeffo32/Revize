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
  const { amount, description, clientName, clientEmail, paymentPlan, selectedPhotos, selectedVideos } = req.body || {};

  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

  // Build metadata with selected file names (Stripe limits: 50 keys, 500 chars per value)
  function buildFileMetadata(prefix, names) {
    const meta = {};
    if (!names || !names.length) return meta;
    let chunk = '', idx = 1;
    for (const name of names) {
      const entry = chunk ? ', ' + name : name;
      if ((chunk + entry).length > 500) {
        meta[`${prefix}_${idx}`] = chunk;
        idx++;
        chunk = name;
      } else {
        chunk += entry;
      }
    }
    if (chunk) meta[`${prefix}_${idx}`] = chunk;
    return meta;
  }

  const fileMetadata = {
    ...buildFileMetadata('photos', selectedPhotos),
    ...buildFileMetadata('videos', selectedVideos),
  };

  const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || '';

  try {
    if (paymentPlan) {
      // Create recurring price for $100/week
      const price = await stripe.prices.create({
        currency: 'aud',
        unit_amount: 10000, // $100
        recurring: { interval: 'week' },
        product_data: {
          name: 'Revize — ' + (description || 'Complete Package') + ' (Payment Plan)',
        },
      });

      // Calculate cancel timestamp: 12 weeks from now
      const cancelAt = Math.floor(Date.now() / 1000) + (12 * 7 * 24 * 60 * 60);

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price: price.id, quantity: 1 }],
        mode: 'subscription',
        customer_email: clientEmail || undefined,
        metadata: {
          client_name: clientName || '',
          description: description || '',
          ...fileMetadata,
        },
        subscription_data: {
          metadata: {
            client_name: clientName || '',
            description: description || '',
            ...fileMetadata,
          },
        },
        success_url: origin + '/?paid=success',
        cancel_url: origin + '/?paid=cancel',
      });

      // After session creation, we can't set cancel_at yet because
      // the subscription doesn't exist until the customer completes checkout.
      // We'll store the cancel_at intent in metadata and handle it via webhook,
      // OR we set it after the first payment. For now, return the session URL
      // and we'll set up auto-cancel via a separate endpoint.

      return res.status(200).json({ url: session.url, subscriptionCancelAt: cancelAt });
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
          ...fileMetadata,
        },
        payment_intent_data: {
          metadata: {
            client_name: clientName || '',
            description: description || '',
            ...fileMetadata,
          },
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
