import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const {
    CF_ACCOUNT_ID,
    CF_R2_ACCESS_KEY_ID,
    CF_R2_SECRET_ACCESS_KEY,
    CF_R2_BUCKET,
    CF_R2_PUBLIC_URL,
  } = process.env;

  if (!CF_ACCOUNT_ID || !CF_R2_ACCESS_KEY_ID || !CF_R2_SECRET_ACCESS_KEY) {
    return res.status(500).json({ error: 'Missing R2 credentials' });
  }

  const bucket = CF_R2_BUCKET || 'revize-media';
  const publicUrl = CF_R2_PUBLIC_URL || '';
  const prefix = (req.query.client || 'shared').replace(/^\/+|\/+$/g, '') + '/';

  const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: CF_R2_ACCESS_KEY_ID,
      secretAccessKey: CF_R2_SECRET_ACCESS_KEY,
    },
  });

  try {
    const out = await r2.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
    }));
    const objects = out.Contents || [];
    const videos = objects
      .filter(o => /\.(mp4|mov|webm|m4v)$/i.test(o.Key))
      .map(o => ({
        key: o.Key,
        name: o.Key.split('/').pop(),
        url: publicUrl ? publicUrl.replace(/\/+$/, '') + '/' + o.Key : '',
      }));
    return res.status(200).json({ videos });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
