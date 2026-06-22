const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { haversineMeters } = require('../src/utils/geo');
const {
  allowedRadiusMeters,
  findCheckInOffice,
  nearestAssignedOffice,
} = require('../src/utils/officeAttendance');

describe('geo', () => {
  it('returns zero distance for identical coordinates', () => {
    assert.equal(haversineMeters(-7.29, 112.73, -7.29, 112.73), 0);
  });

  it('computes plausible distance between two points', () => {
    const d = haversineMeters(-7.29, 112.73, -7.3, 112.74);
    assert.ok(d > 1000 && d < 20000);
  });
});

describe('officeAttendance', () => {
  const config = {
    officeRadiusMeters: 500,
    officeRadiusGpsBufferCapMeters: 200,
  };

  it('adds GPS accuracy buffer capped by config', () => {
    assert.equal(allowedRadiusMeters(50, config), 550);
    assert.equal(allowedRadiusMeters(400, config), 700);
    assert.equal(allowedRadiusMeters(1000, config), 700);
  });

  it('finds office within allowed radius', () => {
    const offices = [{ id: 1, name: 'HQ', lat: -7.29, lng: 112.73 }];
    const hit = findCheckInOffice(-7.29001, 112.73001, 30, offices, config);
    assert.ok(hit);
    assert.equal(hit.office.id, 1);
  });

  it('returns null when all offices are too far', () => {
    const offices = [{ id: 1, name: 'HQ', lat: -7.29, lng: 112.73 }];
    const hit = findCheckInOffice(-7.5, 113.0, 30, offices, config);
    assert.equal(hit, null);
  });

  it('picks nearest assigned office for preview', () => {
    const offices = [
      { id: 1, name: 'Far', lat: -7.35, lng: 112.8 },
      { id: 2, name: 'Near', lat: -7.2901, lng: 112.7301 },
    ];
    const near = nearestAssignedOffice(-7.29, 112.73, offices);
    assert.equal(near.office.id, 2);
  });
});
