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

function today() {
  return new Date().toISOString().slice(0, 10);
}

// Migrate a legacy gallery record to the canonical schema.
// Returns { record, changed } or null if the record can't be salvaged.
function migrateGallery(g) {
  if (!g || typeof g !== 'object' || !g.name) return null;
  const pf = g.pf || g.folder || '';
  const vf = (g.vf || '').toString();
  const team = typeof g.team === 'string'
    ? [g.team]
    : (Array.isArray(g.team) ? g.team : []);
  const category = ((g.category || 'other') + '').toLowerCase();
  const created = g.created || '';
  const changed =
    !g.pf || 'folder' in g ||
    typeof g.team === 'string' || !Array.isArray(g.team) ||
    !g.category || g.category !== category ||
    !('created' in g) || !('vf' in g);
  return { record: { name: g.name, pf, vf, category, created, team }, changed };
}

function migrateGalleries(list) {
  let changed = false;
  const out = [];
  for (const g of list || []) {
    const r = migrateGallery(g);
    if (!r) { changed = true; continue; }
    if (r.changed) changed = true;
    out.push(r.record);
  }
  return { galleries: out, changed };
}

async function readConfig(r2, bucket) {
  try {
    const res = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: CONFIG_KEY }));
    const body = await res.Body.transformToString();
    const config = JSON.parse(body);
    if (!config.galleries) config.galleries = [];
    if (!config.assignments) config.assignments = {};
    const { galleries, changed } = migrateGalleries(config.galleries);
    config.galleries = galleries;
    return { config, migrated: changed };
  } catch (e) {
    if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) {
      return { config: { members: [], assignments: {}, galleries: [] }, migrated: false };
    }
    throw e;
  }
}

async function writeConfig(r2, bucket, config) {
  await r2.send(new PutObjectCommand({
    Bucket: bucket,
    Key: CONFIG_KEY,
    Body: JSON.stringify(config),
    ContentType: 'application/json',
  }));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { client: r2, bucket } = getR2();

    if (req.method === 'GET') {
      const { config, migrated } = await readConfig(r2, bucket);
      // Self-heal the store on read: persist any normalized records so
      // future reads don't need to re-migrate.
      if (migrated) {
        try { await writeConfig(r2, bucket, config); } catch (e) {}
      }
      return res.status(200).json(config);
    }

    if (req.method === 'POST') {
      const { members, assignments, galleries, addGallery, deleteGallery } = req.body || {};
      const { config } = await readConfig(r2, bucket);

      if (members) config.members = members;
      if (assignments) config.assignments = { ...config.assignments, ...assignments };
      if (galleries) {
        config.galleries = migrateGalleries(galleries).galleries;
      }

      // Add a single gallery — validate + normalize incoming payload so
      // external tooling can't recreate the legacy bad shape.
      if (addGallery) {
        if (!addGallery || typeof addGallery !== 'object') {
          return res.status(400).json({ error: 'addGallery must be an object' });
        }
        const name = addGallery.name;
        const pf = addGallery.pf || addGallery.folder;
        if (!name || !pf) {
          return res.status(400).json({ error: 'addGallery requires name and pf' });
        }
        const team = typeof addGallery.team === 'string'
          ? [addGallery.team]
          : (Array.isArray(addGallery.team) ? addGallery.team : []);
        const normalized = {
          name,
          pf,
          vf: (addGallery.vf || '').toString().replace(/^\/+|\/+$/g, ''),
          category: ((addGallery.category || 'other') + '').toLowerCase(),
          created: addGallery.created || today(),
          team,
        };
        config.galleries = config.galleries.filter(g => g.name !== normalized.name);
        config.galleries.push(normalized);
        if (team.length) {
          config.assignments[normalized.name] = team;
        }
      }

      // Delete a gallery
      if (deleteGallery) {
        config.galleries = config.galleries.filter(g => g.name !== deleteGallery);
        delete config.assignments[deleteGallery];
      }

      await writeConfig(r2, bucket, config);
      return res.status(200).json(config);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
