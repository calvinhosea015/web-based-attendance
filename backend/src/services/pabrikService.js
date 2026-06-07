const { AppError } = require('../utils/errors');
const { normalizePabrikCode, normalizeNamaPabrik } = require('../utils/pabrikNormalize');

function normalizeGoogleMapsUrl(value) {
  if (value == null || value === '') return null;
  const url = String(value).trim();
  if (!url) return null;
  if (url.length > 2000) {
    throw new AppError('Google Maps link is too long.', 400, 'VALIDATION');
  }
  return url;
}

class PabrikService {
  constructor(pabrikRepository) {
    this.pabrikRepository = pabrikRepository;
  }

  async listWithItems() {
    return this.pabrikRepository.listWithItems();
  }

  async create(payload) {
    const pabrik_code = normalizePabrikCode(payload.pabrik_code);
    const nama_pabrik = normalizeNamaPabrik(payload.nama_pabrik);
    const google_maps_url = normalizeGoogleMapsUrl(payload.google_maps_url);
    const existing = await this.pabrikRepository.findByCode(pabrik_code);
    if (existing) {
      throw new AppError('Factory code already exists.', 409, 'PABRIK_EXISTS');
    }
    const sort_order = await this.pabrikRepository.nextSortOrder();
    return this.pabrikRepository.create({
      pabrik_code,
      nama_pabrik,
      google_maps_url,
      sort_order,
    });
  }

  async update(id, payload) {
    const pabrikId = Number(id);
    if (!Number.isFinite(pabrikId) || pabrikId < 1) {
      throw new AppError('Invalid pabrik id.', 400, 'VALIDATION');
    }
    const updates = {};
    if (payload.google_maps_url !== undefined) {
      updates.google_maps_url = normalizeGoogleMapsUrl(payload.google_maps_url);
    }
    if (payload.nama_pabrik !== undefined) {
      updates.nama_pabrik = normalizeNamaPabrik(payload.nama_pabrik);
    }
    const saved = await this.pabrikRepository.updateById(pabrikId, updates);
    if (!saved) throw new AppError('Pabrik not found.', 404, 'NOT_FOUND');
    return saved;
  }

  async updateGoogleMaps(id, payload) {
    return this.update(id, payload);
  }

  async remove(id) {
    const pabrikId = Number(id);
    if (!Number.isFinite(pabrikId) || pabrikId < 1) {
      throw new AppError('Invalid pabrik id.', 400, 'VALIDATION');
    }
    const deleted = await this.pabrikRepository.deleteById(pabrikId);
    if (!deleted) throw new AppError('Pabrik not found.', 404, 'NOT_FOUND');
    return { ok: true };
  }
}

module.exports = { PabrikService };
