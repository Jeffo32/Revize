async function fetchFiles(folderId, apiKey) {
  let allFiles = [];
  let pageToken = '';
  do {
    const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&fields=files(id,name,mimeType,thumbnailLink,imageMediaMetadata(width,height),videoMediaMetadata(width,height)),nextPageToken&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true&key=${apiKey}` + (pageToken ? `&pageToken=${pageToken}` : '');
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

async function fetchAllRecursive(folderId, apiKey, depth = 0) {
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const folderId = req.query.folder || process.env.DRIVE_FOLDER_ID;
  const apiKey   = process.env.DRIVE_API_KEY;

  if (!folderId || !apiKey) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  try {
    const allFiles = await fetchAllRecursive(folderId, apiKey);
    const videos = allFiles.filter(f => f.mimeType && f.mimeType.startsWith('video/'));
    if (videos.length) {
      console.log('drive api videos', {
        folderId,
        count: videos.length,
        withThumb: videos.filter(v => v.thumbnailLink).length,
        sample: videos.slice(0, 5).map(v => ({
          id: v.id,
          name: v.name,
          mimeType: v.mimeType,
          hasThumb: !!v.thumbnailLink,
          thumbHost: v.thumbnailLink ? new URL(v.thumbnailLink).host : null,
        })),
      });
    }
    return res.status(200).json({ files: allFiles });
  } catch (e) {
    console.error('drive api error', { folderId, message: e.message, stack: e.stack });
    return res.status(500).json({ error: e.message });
  }
}
