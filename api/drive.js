async function fetchFiles(folderId, apiKey) {
  const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&fields=files(id,name,mimeType)&pageSize=200&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Drive API ${res.status}`);
  const data = await res.json();
  return data.files || [];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const folderId = process.env.DRIVE_FOLDER_ID;
  const apiKey   = process.env.DRIVE_API_KEY;

  if (!folderId || !apiKey) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  try {
    // Get top-level items
    const topLevel = await fetchFiles(folderId, apiKey);

    const allFiles = [];

    for (const item of topLevel) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        // It's a subfolder — fetch its contents
        const children = await fetchFiles(item.id, apiKey);
        children.forEach(f => {
          if (f.mimeType.startsWith('image/') || f.mimeType.startsWith('video/')) {
            allFiles.push(f);
          }
        });
      } else if (item.mimeType.startsWith('image/') || item.mimeType.startsWith('video/')) {
        allFiles.push(item);
      }
    }

    return res.status(200).json({ files: allFiles });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
