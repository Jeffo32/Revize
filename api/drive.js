export async function fetchFiles(folderId, apiKey) {
  let allFiles = [];
  let pageToken = '';
  do {
    const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&fields=files(id,name,mimeType,createdTime,thumbnailLink,imageMediaMetadata(width,height),videoMediaMetadata(width,height)),nextPageToken&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true&key=${apiKey}` + (pageToken ? `&pageToken=${pageToken}` : '');
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Drive API ${res.status} for folder ${folderId}: ${body.slice(0, 500)}`);
    }
    const data = await res.json();
    allFiles = allFiles.concat(data.files || []);
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return allFiles;
}

export async function fetchAllRecursive(folderId, apiKey, depth = 0) {
  if (depth > 5) return []; // safety limit
  const items = await fetchFiles(folderId, apiKey);
  const results = [];
  for (const item of items) {
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      const children = await fetchAllRecursive(item.id, apiKey, depth + 1);
      results.push(...children);
    } else if (item.mimeType.startsWith('image/') || item.mimeType.startsWith('video/')) {
      results.push(item);
    }
  }
  return results;
}

// List a folder's media grouped by its immediate subfolders. Root-level loose
// media becomes a synthetic "Main" group. Each returned file is tagged with
// _folderId / _folder so the client can render subfolder tabs. When the folder
// has no subfolders this just returns a single flat group (legacy behaviour).
export async function fetchGrouped(rootId, apiKey) {
  const items = await fetchFiles(rootId, apiKey);
  const subfolders = items.filter(i => i.mimeType === 'application/vnd.google-apps.folder');
  const rootMedia = items.filter(i => i.mimeType && (i.mimeType.startsWith('image/') || i.mimeType.startsWith('video/')));
  // Natural sort so "Set 2" comes before "Set 10"; prefix names with numbers to control order.
  subfolders.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }));

  const files = [];
  const folders = [];

  if (rootMedia.length) {
    rootMedia.forEach(f => files.push({ ...f, _folderId: '__root__', _folder: 'Main' }));
    folders.push({ id: '__root__', name: 'Main', count: rootMedia.length });
  }

  const subFiles = await Promise.all(
    subfolders.map(s => fetchAllRecursive(s.id, apiKey).catch(() => []))
  );
  subfolders.forEach((sub, i) => {
    const fs = subFiles[i];
    if (!fs.length) return;
    fs.forEach(f => files.push({ ...f, _folderId: sub.id, _folder: sub.name }));
    folders.push({ id: sub.id, name: sub.name, count: fs.length });
  });

  return { files, folders };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const folderId = req.query.folder || process.env.DRIVE_FOLDER_ID;
  const apiKey   = process.env.DRIVE_API_KEY;

  if (!folderId || !apiKey) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  try {
    const { files, folders } = await fetchGrouped(folderId, apiKey);
    return res.status(200).json({ files, folders });
  } catch (e) {
    console.error('drive api error', { folderId, message: e.message, stack: e.stack });
    return res.status(500).json({ error: e.message });
  }
}
