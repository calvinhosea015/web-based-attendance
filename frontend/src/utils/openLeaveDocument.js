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
 * Fetch a leave attachment with auth and show it in a modal preview.
 * @param {import('axios').AxiosInstance} client
 * @param {string} url
 * @param {{ title?: string, closeLabel?: string, downloadLabel?: string }} [labels]
 */
export async function openLeaveDocument(client, url, labels = {}) {
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
  const title = labels.title || 'Supporting document';
  const closeLabel = labels.closeLabel || 'Close';
  const downloadLabel = labels.downloadLabel || 'Download';

  const root = document.createElement('div');
  root.id = 'leave-doc-preview-root';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', title);
  root.style.cssText =
    'position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.75);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box';

  const panel = document.createElement('div');
  panel.style.cssText =
    'display:flex;flex-direction:column;max-width:min(960px,100%);max-height:min(92vh,100%);width:100%;background:#fff;border-radius:16px;box-shadow:0 25px 50px -12px rgba(0,0,0,.35);border:1px solid #e2e8f0;overflow:hidden';

  const header = document.createElement('div');
  header.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid #e2e8f0;background:#f8fafc';

  const heading = document.createElement('h2');
  heading.textContent = title;
  heading.style.cssText = 'margin:0;font-size:1rem;font-weight:600;color:#0f172a;font-family:system-ui,sans-serif';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = closeLabel;
  closeBtn.setAttribute('aria-label', closeLabel);
  closeBtn.style.cssText =
    'flex-shrink:0;padding:8px 14px;font-size:0.875rem;font-weight:500;color:#334155;background:#fff;border:1px solid #cbd5e1;border-radius:8px;cursor:pointer;font-family:system-ui,sans-serif';

  const body = document.createElement('div');
  body.style.cssText =
    'flex:1;overflow:auto;padding:20px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;min-height:200px';

  const frame = document.createElement('div');
  frame.style.cssText =
    'width:100%;max-height:calc(92vh - 140px);padding:12px;background:#fff;border:2px solid #e2e8f0;border-radius:12px;box-shadow:inset 0 1px 2px rgba(0,0,0,.04);display:flex;align-items:center;justify-content:center';

  const img = document.createElement('img');
  img.src = activeObjectUrl;
  img.alt = title;
  img.style.cssText = 'max-width:100%;max-height:calc(92vh - 180px);object-fit:contain;border-radius:6px;display:block';

  const footer = document.createElement('div');
  footer.style.cssText =
    'display:flex;justify-content:flex-end;gap:10px;padding:12px 18px;border-top:1px solid #e2e8f0;background:#f8fafc';

  const downloadLink = document.createElement('a');
  downloadLink.href = activeObjectUrl;
  downloadLink.download = 'leave-document.jpg';
  downloadLink.textContent = downloadLabel;
  downloadLink.style.cssText =
    'padding:8px 14px;font-size:0.875rem;font-weight:500;color:#fff;background:#2563eb;border-radius:8px;text-decoration:none;font-family:system-ui,sans-serif';

  header.appendChild(heading);
  header.appendChild(closeBtn);
  frame.appendChild(img);
  body.appendChild(frame);
  footer.appendChild(downloadLink);
  panel.appendChild(header);
  panel.appendChild(body);
  panel.appendChild(footer);
  root.appendChild(panel);
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
