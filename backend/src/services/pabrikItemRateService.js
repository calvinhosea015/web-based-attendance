const { AppError } = require('../utils/errors');

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

function normalizeKodeBarang(value) {
  const code = String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
  if (!code) throw new AppError('Item code is required.', 400, 'VALIDATION');
  if (code.length > 64) throw new AppError('Item code is too long.', 400, 'VALIDATION');
  return code;
}

class PabrikItemRateService {
  constructor(pabrikItemRateRepository, pabrikRepository = null) {
    this.pabrikItemRateRepository = pabrikItemRateRepository;
    this.pabrikRepository = pabrikRepository;
  }

  async assertPabrikExists(pabrik_code) {
    if (!this.pabrikRepository) return;
    const pabrik = await this.pabrikRepository.findByCode(pabrik_code);
    if (!pabrik) {
      throw new AppError(
        `Unknown pabrik code "${pabrik_code}". Use kode pabrik 1–12 from the factory list.`,
        400,
        'PABRIK_NOT_FOUND'
      );
    }
  }

  async list() {
    return this.pabrikItemRateRepository.listAll();
  }

  async create(payload) {
    const pabrik_code = normalizePabrikCode(payload.pabrik_code);
    await this.assertPabrikExists(pabrik_code);
    const kode_barang = normalizeKodeBarang(payload.kode_barang);
    const tonase_per_item = Math.max(0, Number(payload.tonase_per_item) || 0);
    const existing = await this.pabrikItemRateRepository.findByPabrikAndBarang(
      pabrik_code,
      kode_barang
    );
    if (existing) {
      throw new AppError('This pabrik and item code already exists.', 409, 'PABRIK_ITEM_EXISTS');
    }
    return this.pabrikItemRateRepository.create({ pabrik_code, kode_barang, tonase_per_item });
  }

  async update(id, payload) {
    const rateId = Number(id);
    if (!Number.isFinite(rateId) || rateId < 1) {
      throw new AppError('Invalid rate id.', 400, 'VALIDATION');
    }
    const pabrik_code = normalizePabrikCode(payload.pabrik_code);
    await this.assertPabrikExists(pabrik_code);
    const kode_barang = normalizeKodeBarang(payload.kode_barang);
    const tonase_per_item = Math.max(0, Number(payload.tonase_per_item) || 0);
    const saved = await this.pabrikItemRateRepository.update(rateId, {
      pabrik_code,
      kode_barang,
      tonase_per_item,
    });
    if (!saved) throw new AppError('Rate not found.', 404, 'NOT_FOUND');
    return saved;
  }

  async remove(id) {
    const rateId = Number(id);
    if (!Number.isFinite(rateId) || rateId < 1) {
      throw new AppError('Invalid rate id.', 400, 'VALIDATION');
    }
    const deleted = await this.pabrikItemRateRepository.delete(rateId);
    if (!deleted) throw new AppError('Rate not found.', 404, 'NOT_FOUND');
    return { ok: true };
  }
}

module.exports = { PabrikItemRateService };
