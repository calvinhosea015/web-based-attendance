const { AppError } = require('../utils/errors');
const { getCoordinatesFromLink } = require('../utils/mapsLink');

class OfficeService {
  constructor(officeRepository) {
    this.officeRepository = officeRepository;
  }

  async list() {
    return this.officeRepository.listAll();
  }

  async resolveCoordsFromLink(locationLink) {
    let coords;
    try {
      coords = await getCoordinatesFromLink(locationLink);
    } catch (e) {
      throw new AppError(e.message || 'Could not resolve map link', 400, 'MAP_LINK');
    }
    if (!coords) {
      throw new AppError('Could not parse coordinates from the Google Maps link.', 400, 'MAP_PARSE');
    }
    return coords;
  }

  async createFromMapsLink({ name, locationLink }) {
    if (!name || !locationLink) {
      throw new AppError('Office name and Google Maps link are required.', 400, 'OFFICE_FIELDS');
    }
    const coords = await this.resolveCoordsFromLink(locationLink);
    return this.officeRepository.create({
      name,
      lat: coords.lat,
      lng: coords.lng,
      link: locationLink,
    });
  }

  async updateFromMapsLink(id, { name, locationLink }) {
    if (!name || !locationLink) {
      throw new AppError('Office name and Google Maps link are required.', 400, 'OFFICE_FIELDS');
    }
    const existing = await this.officeRepository.findById(id);
    if (!existing) {
      throw new AppError('Office not found.', 404, 'OFFICE_NOT_FOUND');
    }
    const coords = await this.resolveCoordsFromLink(locationLink);
    const row = await this.officeRepository.update(id, {
      name,
      lat: coords.lat,
      lng: coords.lng,
      link: locationLink,
    });
    if (!row) {
      throw new AppError('Office not found.', 404, 'OFFICE_NOT_FOUND');
    }
    return row;
  }

  async delete(id) {
    await this.officeRepository.delete(id);
  }
}

module.exports = { OfficeService };
