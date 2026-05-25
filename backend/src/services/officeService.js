const { AppError } = require('../utils/errors');
const { getCoordinatesFromLink } = require('../utils/mapsLink');

class OfficeService {
  constructor(officeRepository) {
    this.officeRepository = officeRepository;
  }

  async list() {
    return this.officeRepository.listAll();
  }

  async createFromMapsLink({ name, locationLink }) {
    if (!name || !locationLink) {
      throw new AppError('Office name and Google Maps link are required.', 400, 'OFFICE_FIELDS');
    }
    let coords;
    try {
      coords = await getCoordinatesFromLink(locationLink);
    } catch (e) {
      throw new AppError(e.message || 'Could not resolve map link', 400, 'MAP_LINK');
    }
    if (!coords) {
      throw new AppError('Could not parse coordinates from the Google Maps link.', 400, 'MAP_PARSE');
    }
    return this.officeRepository.create({
      name,
      lat: coords.lat,
      lng: coords.lng,
      link: locationLink,
    });
  }

  async update(id, { name, locationLink }) {
    if (!name || !locationLink) {
      throw new AppError('Office name and Google Maps link are required.', 400, 'OFFICE_FIELDS');
    }
    let coords;
    try {
      coords = await getCoordinatesFromLink(locationLink);
    } catch (e) {
      throw new AppError(e.message || 'Could not resolve map link', 400, 'MAP_LINK');
    }
    if (!coords) {
      throw new AppError('Could not parse coordinates from the Google Maps link.', 400, 'MAP_PARSE');
    }
    const updated = await this.officeRepository.update(id, {
      name,
      lat: coords.lat,
      lng: coords.lng,
      link: locationLink,
    });
    if (!updated) {
      throw new AppError('Office not found.', 404, 'OFFICE_NOT_FOUND');
    }
    return updated;
  }

  async delete(id) {
    await this.officeRepository.delete(id);
  }
}

module.exports = { OfficeService };
