async function fetchFiles(folderId, apiKey) {
  let allFiles = [];
  let pageToken = '';
  do {
    const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&fields=files(id,name,mimeType),nextPageToken&pageSize=200&key=${apiKey}` + (pageToken ? `&pageToken=${pageToken}` : '');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Drive API ${res.status}`);
    const data = await res.json();
    allFiles = allFiles.concat(data.files || []);
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return allFiles;
}

async function fetchAllRecursive(folderId, apiKey, depth = 0) {
  if (depth > 5) return [];
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const folderId = req.query.folder || process.env.DRIVE_ORIGINALS_FOLDER_ID;
  const apiKey = process.env.DRIVE_API_KEY;

  if (!folderId || !apiKey) {
    return res.status(500).json({ error: 'Missing config' });
  }

  try {
    const files = await fetchAllRecursive(folderId, apiKey);
    const map = {};
    files.forEach(f => {
      const cleanName = f.name
        .replace(/[\s_-]*(watermarked|wm|preview|draft)[\s_-]*/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      map[cleanName] = { id: f.id, name: f.name, mimeType: f.mimeType };
      map[f.name.toLowerCase()] = { id: f.id, name: f.name, mimeType: f.mimeType };
    });
    return res.status(200).json({ files, map });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
