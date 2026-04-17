import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

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

const CONFIG_KEY = '_config/team.json';

async function readConfig(r2, bucket) {
  try {
    const res = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: CONFIG_KEY }));
    const body = await res.Body.transformToString();
    return JSON.parse(body);
  } catch (e) {
    if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) {
      return { members: [], assignments: {} };
    }
    throw e;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { client: r2, bucket } = getR2();

    if (req.method === 'GET') {
      const config = await readConfig(r2, bucket);
      return res.status(200).json(config);
    }

    if (req.method === 'POST') {
      const { members, assignments } = req.body || {};
      const config = await readConfig(r2, bucket);
      if (members) config.members = members;
      if (assignments) config.assignments = assignments;
      await r2.send(new PutObjectCommand({
        Bucket: bucket,
        Key: CONFIG_KEY,
        Body: JSON.stringify(config),
        ContentType: 'application/json',
      }));
      return res.status(200).json(config);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
