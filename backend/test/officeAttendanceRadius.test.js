const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { allowedRadiusMeters, findCheckInOffice } = require('../src/utils/officeAttendance');
const { haversineMeters } = require('../src/utils/geo');

const config = { officeRadiusMeters: 500, officeRadiusGpsBufferCapMeters: 200 };

describe('officeAttendance per-pabrik radius', () => {
  it('uses the global default when the office has no radius override', () => {
    assert.equal(allowedRadiusMeters(0, config), 500);
    assert.equal(allowedRadiusMeters(0, config, { radius_meters: null }), 500);
  });

  it('uses the per-office radius when set (plus capped GPS buffer)', () => {
    assert.equal(allowedRadiusMeters(0, config, { radius_meters: 800 }), 800);
    assert.equal(allowedRadiusMeters(300, config, { radius_meters: 800 }), 1000);
  });

  it('matches an office only reachable because of its larger radius', () => {
    const officeLng = 0.006; // ~668 m east of (0,0)
    const dist = haversineMeters(0, 0, 0, officeLng);
    assert.ok(dist > 500 && dist < 800, `expected ~668m, got ${dist}`);

    const offices = (radius) => [{ id: 1, lat: 0, lng: officeLng, radius_meters: radius }];

    assert.equal(findCheckInOffice(0, 0, 0, offices(null), config), null);
    const match = findCheckInOffice(0, 0, 0, offices(800), config);
    assert.ok(match);
    assert.equal(match.office.id, 1);
  });
});
