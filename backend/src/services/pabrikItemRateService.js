const { AppError } = require('../utils/errors');
const { normalizePabrikCode, normalizeKodeBarang } = require('../utils/pabrikNormalize');

function normalizeTonase(value) {
  return Math.max(0, Number(value) || 0);
}

function normalizePrice(value) {
  return Math.max(0, Number(value) || 0);
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
        `Unknown factory code "${pabrik_code}". Add the factory in Field operations first.`,
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
    const tonase_per_item = normalizeTonase(payload.tonase_per_item);
    const price_per_item = normalizePrice(payload.price_per_item);
    const existing = await this.pabrikItemRateRepository.findByPabrikAndBarang(
      pabrik_code,
      kode_barang
    );
    if (existing) {
      throw new AppError('This pabrik and item code already exists.', 409, 'PABRIK_ITEM_EXISTS');
    }
    return this.pabrikItemRateRepository.create({
      pabrik_code,
      kode_barang,
      tonase_per_item,
      price_per_item,
    });
  }

  async update(id, payload) {
    const rateId = Number(id);
    if (!Number.isFinite(rateId) || rateId < 1) {
      throw new AppError('Invalid rate id.', 400, 'VALIDATION');
    }
    const pabrik_code = normalizePabrikCode(payload.pabrik_code);
    await this.assertPabrikExists(pabrik_code);
    const kode_barang = normalizeKodeBarang(payload.kode_barang);
    const tonase_per_item = normalizeTonase(payload.tonase_per_item);
    const price_per_item = normalizePrice(payload.price_per_item);
    const saved = await this.pabrikItemRateRepository.update(rateId, {
      pabrik_code,
      kode_barang,
      tonase_per_item,
      price_per_item,
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
