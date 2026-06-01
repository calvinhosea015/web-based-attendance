/** Normalize PostgreSQL BYTEA / Buffer JSON shapes into a Node Buffer. */
function attachmentBuffer(row) {
  const raw = row?.attachment_data;
  if (raw == null) return null;

  let buf;
  if (Buffer.isBuffer(raw)) {
    buf = raw;
  } else if (typeof raw === 'string' && raw.startsWith('\\x')) {
    buf = Buffer.from(raw.slice(2), 'hex');
  } else if (typeof raw === 'object' && raw.type === 'Buffer' && Array.isArray(raw.data)) {
    buf = Buffer.from(raw.data);
  } else if (raw instanceof Uint8Array) {
    buf = Buffer.from(raw);
  } else {
    buf = Buffer.from(raw);
  }

  return buf.length > 0 ? buf : null;
}

function stripAttachmentData(row) {
  if (!row || typeof row !== 'object') return row;
  const { attachment_data, ...rest } = row;
  return rest;
}

function stripAttachmentDataList(rows) {
  return rows.map(stripAttachmentData);
}

module.exports = { attachmentBuffer, stripAttachmentData, stripAttachmentDataList };
