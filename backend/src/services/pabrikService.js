const { AppError } = require('../utils/errors');

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

  async updateGoogleMaps(id, payload) {
    const pabrikId = Number(id);
    if (!Number.isFinite(pabrikId) || pabrikId < 1) {
      throw new AppError('Invalid pabrik id.', 400, 'VALIDATION');
    }
    const google_maps_url = normalizeGoogleMapsUrl(payload.google_maps_url);
    const saved = await this.pabrikRepository.updateGoogleMaps(pabrikId, google_maps_url);
    if (!saved) throw new AppError('Pabrik not found.', 404, 'NOT_FOUND');
    return saved;
  }
}

module.exports = { PabrikService };
