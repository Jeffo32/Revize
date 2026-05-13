import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { fetchAllRecursive } from './drive.js';

const CONFIG_KEY = '_config/team.json';

function getR2() {
  const { CF_ACCOUNT_ID, CF_R2_ACCESS_KEY_ID, CF_R2_SECRET_ACCESS_KEY, CF_R2_BUCKET } = process.env;
  if (!CF_ACCOUNT_ID || !CF_R2_ACCESS_KEY_ID || !CF_R2_SECRET_ACCESS_KEY)
    throw new Error('Missing R2 credentials');
  return {
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: CF_R2_ACCESS_KEY_ID, secretAccessKey: CF_R2_SECRET_ACCESS_KEY },
    }),
    bucket: CF_R2_BUCKET || 'revize-media',
  };
}

async function readTeamConfig() {
  const { client, bucket } = getR2();
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: CONFIG_KEY }));
    const body = await res.Body.transformToString();
    return JSON.parse(body);
  } catch (e) {
    if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) return { galleries: [] };
    throw e;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const apiKey = process.env.DRIVE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Missing DRIVE_API_KEY' });

  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
  const refresh = req.query.refresh === '1';

  try {
    const config = await readTeamConfig();
    const galleries = (config.galleries || []).filter(g => g && g.pf);

    const results = await Promise.allSettled(
      galleries.map(async g => {
        const files = await fetchAllRecursive(g.pf, apiKey);
        return files.map(f => ({ ...f, _gallery: g.name }));
      })
    );

    const all = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') all.push(...r.value);
      else console.error('drive-recent folder failed', { gallery: galleries[i]?.name, pf: galleries[i]?.pf, message: r.reason?.message });
    });

    all.sort((a, b) => (b.createdTime || '').localeCompare(a.createdTime || ''));
    const top = all.slice(0, limit);

    if (!refresh) {
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    }
    return res.status(200).json({ files: top, generatedAt: new Date().toISOString(), totalScanned: all.length });
  } catch (e) {
    console.error('drive-recent error', { message: e.message, stack: e.stack });
    return res.status(500).json({ error: e.message });
  }
}
