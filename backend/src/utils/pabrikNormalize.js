const { AppError } = require('./errors');

function normalizePabrikCode(value) {
  const code = String(value ?? '').trim();
  if (!code || !/^[A-Za-z0-9_-]+$/.test(code)) {
    throw new AppError(
      'Pabrik code may only contain letters, numbers, hyphen, and underscore.',
      400,
      'VALIDATION'
    );
  }
  if (code.length > 32) {
    throw new AppError('Pabrik code is too long.', 400, 'VALIDATION');
  }
  return code;
}

function normalizeNamaPabrik(value) {
  const name = String(value ?? '').trim();
  if (!name) throw new AppError('Factory name is required.', 400, 'VALIDATION');
  if (name.length > 255) throw new AppError('Factory name is too long.', 400, 'VALIDATION');
  return name;
}

function normalizeKodeBarang(value) {
  const code = String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
  if (!code) throw new AppError('Item code is required.', 400, 'VALIDATION');
  if (code.length > 64) throw new AppError('Item code is too long.', 400, 'VALIDATION');
  return code;
}

module.exports = { normalizePabrikCode, normalizeNamaPabrik, normalizeKodeBarang };
