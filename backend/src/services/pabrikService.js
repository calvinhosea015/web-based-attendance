const { AppError } = require('../utils/errors');
const { normalizePabrikCode, normalizeNamaPabrik } = require('../utils/pabrikNormalize');
const { FIELD_OFFICER_BONUS_RATE } = require('../utils/fieldOfficerBonus');

function normalizeGoogleMapsUrl(value) {
  if (value == null || value === '') return null;
  const url = String(value).trim();
  if (!url) return null;
  if (url.length > 2000) {
    throw new AppError('Google Maps link is too long.', 400, 'VALIDATION');
  }
  return url;
}

function normalizeOfficeId(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const officeId = Number(value);
  if (!Number.isFinite(officeId) || officeId < 1) {
    throw new AppError('Invalid office id.', 400, 'VALIDATION');
  }
  return officeId;
}

// Empty/null clears the override (falls back to the global default radius).
function normalizeRadiusMeters(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const radius = Number(value);
  if (!Number.isInteger(radius) || radius < 1 || radius > 100000) {
    throw new AppError('Radius must be a whole number of meters between 1 and 100000.', 400, 'VALIDATION');
  }
  return radius;
}

/** Fraction 0–1 (e.g. 0.02 = 2%). Empty on create uses the global default. */
function normalizeBonusOmsetRate(value, { required = false } = {}) {
  if (value === undefined) return undefined;
  if (value === null || value === '') {
    if (required) return FIELD_OFFICER_BONUS_RATE;
    return undefined;
  }
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new AppError(
      'Bonus omset rate must be between 0 and 1 (e.g. 0.02 for 2%).',
      400,
      'VALIDATION'
    );
  }
  return Math.round(rate * 10000) / 10000;
}

class PabrikService {
  constructor(pabrikRepository, officeRepository = null) {
    this.pabrikRepository = pabrikRepository;
    this.officeRepository = officeRepository;
  }

  async listWithItems() {
    return this.pabrikRepository.listWithItems();
  }

  async assertOfficeExists(officeId) {
    if (!this.officeRepository) {
      throw new AppError('Office linking is not available.', 503, 'UNAVAILABLE');
    }
    const office = await this.officeRepository.findById(officeId);
    if (!office) throw new AppError('Office not found.', 404, 'OFFICE_NOT_FOUND');
    if (!office.link) {
      throw new AppError(
        'Selected office has no Google Maps link. Add a map link to the office first.',
        400,
        'OFFICE_NO_MAP'
      );
    }
    return office;
  }

  async create(payload) {
    const pabrik_code = normalizePabrikCode(payload.pabrik_code);
    const nama_pabrik = normalizeNamaPabrik(payload.nama_pabrik);
    const office_id = normalizeOfficeId(payload.office_id);
    const radius_meters = normalizeRadiusMeters(payload.radius_meters);
    const bonus_omset_rate = normalizeBonusOmsetRate(payload.bonus_omset_rate, {
      required: true,
    });
    let google_maps_url = null;
    if (office_id != null) {
      await this.assertOfficeExists(office_id);
    } else {
      google_maps_url = normalizeGoogleMapsUrl(payload.google_maps_url);
    }
    const existing = await this.pabrikRepository.findByCode(pabrik_code);
    if (existing) {
      throw new AppError('Factory code already exists.', 409, 'PABRIK_EXISTS');
    }
    const sort_order = await this.pabrikRepository.nextSortOrder();
    return this.pabrikRepository.create({
      pabrik_code,
      nama_pabrik,
      google_maps_url,
      office_id: office_id ?? null,
      radius_meters: radius_meters ?? null,
      bonus_omset_rate: bonus_omset_rate ?? FIELD_OFFICER_BONUS_RATE,
      sort_order,
    });
  }

  async update(id, payload) {
    const pabrikId = Number(id);
    if (!Number.isFinite(pabrikId) || pabrikId < 1) {
      throw new AppError('Invalid pabrik id.', 400, 'VALIDATION');
    }
    const updates = {};
    if (payload.nama_pabrik !== undefined) {
      updates.nama_pabrik = normalizeNamaPabrik(payload.nama_pabrik);
    }
    const radius_meters = normalizeRadiusMeters(payload.radius_meters);
    if (radius_meters !== undefined) {
      updates.radius_meters = radius_meters;
    }
    const bonus_omset_rate = normalizeBonusOmsetRate(payload.bonus_omset_rate);
    if (bonus_omset_rate !== undefined) {
      updates.bonus_omset_rate = bonus_omset_rate;
    }
    const office_id = normalizeOfficeId(payload.office_id);
    if (office_id !== undefined) {
      if (office_id != null) {
        await this.assertOfficeExists(office_id);
      }
      updates.office_id = office_id;
    } else if (payload.google_maps_url !== undefined) {
      updates.google_maps_url = normalizeGoogleMapsUrl(payload.google_maps_url);
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
