import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { CF_ACCOUNT_ID, CF_R2_ACCESS_KEY_ID, CF_R2_SECRET_ACCESS_KEY, CF_R2_BUCKET, CF_R2_PUBLIC_URL } = process.env;
  if (!CF_ACCOUNT_ID || !CF_R2_ACCESS_KEY_ID || !CF_R2_SECRET_ACCESS_KEY) {
    return res.status(500).json({ error: 'Missing R2 credentials' });
  }

  const { filename, client: clientSlug, contentType } = req.body || {};
  if (!filename) return res.status(400).json({ error: 'Missing filename' });

  const bucket = CF_R2_BUCKET || 'revize-media';
  const key = (clientSlug || 'shared') + '/' + filename;

  const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: CF_R2_ACCESS_KEY_ID,
      secretAccessKey: CF_R2_SECRET_ACCESS_KEY,
    },
  });

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType || 'video/mp4',
  });

  const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 3600 });
  const publicUrl = (CF_R2_PUBLIC_URL || '') + '/' + key;

  return res.status(200).json({ uploadUrl, publicUrl, key });
}
