let activeObjectUrl = null;

export function closeLeaveDocumentPreview() {
  const root = document.getElementById('leave-doc-preview-root');
  if (root) root.remove();
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = null;
  }
}

async function readErrorMessage(data, status) {
  if (data == null) {
    if (status === 404) {
      return 'Document not found. Submit a new leave request with the photo (older uploads may be missing after a server update).';
    }
    return `Could not load document (HTTP ${status || 'error'}).`;
  }

  let text = '';
  if (typeof data === 'string') {
    text = data;
  } else if (data instanceof Blob) {
    text = await data.text();
  } else if (data instanceof ArrayBuffer) {
    text = new TextDecoder().decode(data);
  }

  const trimmed = text.trim();
  if (trimmed.startsWith('<')) {
    return 'Could not load document. The app may be calling the wrong API URL (received a web page instead of the image).';
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.code === 'NOT_FOUND') {
      return (
        parsed.message ||
        'Document not found. Submit a new leave request with the photo.'
      );
    }
    return parsed.message || `Could not load document (HTTP ${status || 'error'}).`;
  } catch {
    if (trimmed) return trimmed.slice(0, 300);
    return `Could not load document (HTTP ${status || 'error'}).`;
  }
}

function isImageBuffer(buffer) {
  if (!buffer || buffer.byteLength < 4) return false;
  const u8 = new Uint8Array(buffer);
  if (u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) return true;
  if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) return true;
  if (u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46) return true;
  if (u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46) return true;
  return false;
}

function mimeFromBuffer(buffer, headerMime) {
  const fromHeader = (headerMime || '').split(';')[0].trim();
  if (fromHeader && fromHeader.startsWith('image/')) return fromHeader;
  if (!buffer) return 'image/jpeg';
  const u8 = new Uint8Array(buffer);
  if (u8[0] === 0xff && u8[1] === 0xd8) return 'image/jpeg';
  if (u8[0] === 0x89 && u8[1] === 0x50) return 'image/png';
  if (u8[0] === 0x47 && u8[1] === 0x49) return 'image/gif';
  if (u8[0] === 0x52 && u8[1] === 0x49) return 'image/webp';
  return fromHeader || 'image/jpeg';
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
    res = await client.get(url, { responseType: 'arraybuffer' });
  } catch (err) {
    throw new Error(
      await readErrorMessage(err.response?.data, err.response?.status)
    );
  }

  const contentType = (res.headers['content-type'] || '').toLowerCase();
  const buffer = res.data;

  if (contentType.includes('application/json') || contentType.includes('text/html')) {
    throw new Error(await readErrorMessage(buffer, res.status));
  }

  if (!isImageBuffer(buffer)) {
    throw new Error(
      await readErrorMessage(buffer, res.status)
    );
  }

  const mime = mimeFromBuffer(buffer, contentType);
  const blob = new Blob([buffer], { type: mime });

  if (!blob.size) {
    throw new Error('Document file is empty. Please submit the leave request again with the photo.');
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
  img.style.cssText =
    'max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.4)';

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
