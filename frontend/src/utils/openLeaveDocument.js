let activeObjectUrl = null;

export function closeLeaveDocumentPreview() {
  const root = document.getElementById('leave-doc-preview-root');
  if (root) root.remove();
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = null;
  }
}

async function parseBlobError(blob) {
  try {
    const text = await blob.text();
    const parsed = JSON.parse(text);
    if (parsed.code === 'NOT_FOUND') {
      return 'Document file not found. It may have been removed after a server restart—please upload again.';
    }
    return parsed.message || 'Could not load document.';
  } catch {
    return 'Could not load document.';
  }
}

/**
 * Fetch a leave attachment with auth and show it in a full-screen preview.
 * @param {import('axios').AxiosInstance} client
 * @param {string} url
 */
export async function openLeaveDocument(client, url) {
  closeLeaveDocumentPreview();

  let res;
  try {
    res = await client.get(url, { responseType: 'blob' });
  } catch (err) {
    const blob = err.response?.data;
    if (blob instanceof Blob) {
      throw new Error(await parseBlobError(blob));
    }
    if (err.response?.status === 404) {
      throw new Error(
        'Document file not found. Please submit the leave request again with the document.'
      );
    }
    throw err;
  }

  const contentType = (res.headers['content-type'] || '').toLowerCase();

  if (contentType.includes('application/json') || contentType.includes('text/html')) {
    throw new Error(await parseBlobError(res.data));
  }

  const mime = contentType.split(';')[0].trim() || 'image/jpeg';
  const blob =
    res.data instanceof Blob
      ? res.data.type
        ? res.data
        : new Blob([await res.data.arrayBuffer()], { type: mime })
      : new Blob([res.data], { type: mime });

  if (!blob.size) {
    throw new Error('Document file is empty or missing on the server.');
  }

  activeObjectUrl = URL.createObjectURL(blob);

  const root = document.createElement('div');
  root.id = 'leave-doc-preview-root';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.style.cssText =
    'position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.92);display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.id = 'leave-doc-close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.style.cssText =
    'position:absolute;top:16px;right:20px;color:#fff;font-size:32px;line-height:1;background:transparent;border:none;cursor:pointer;padding:4px 12px';

  const img = document.createElement('img');
  img.src = activeObjectUrl;
  img.alt = 'Leave supporting document';
  img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.4)';

  root.appendChild(closeBtn);
  root.appendChild(img);
  document.body.appendChild(root);

  const onClose = () => closeLeaveDocumentPreview();
  closeBtn.addEventListener('click', onClose);
  root.addEventListener('click', (e) => {
    if (e.target === root) onClose();
  });
  document.addEventListener(
    'keydown',
    function onKey(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKey);
        onClose();
      }
    },
    { once: true }
  );
}
