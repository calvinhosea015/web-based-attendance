const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { FieldCheckoutCodeService } = require('../src/services/fieldCheckoutCodeService');
const { validateFieldCheckoutCode } = require('../src/utils/fieldCheckoutPayload');
const { computeLineOmset, computeLineBonus } = require('../src/utils/fieldOfficerBonus');
const { AppError } = require('../src/utils/errors');

describe('field officer omset = berat bersih × harga per item', () => {
  it('uses price per item × berat bersih when a price is set', () => {
    // tonase 5 should be ignored when price 1000 is present.
    assert.equal(computeLineOmset(5, 90, 1000), 90000);
    assert.equal(computeLineBonus(5, 90, 1000), 1800); // 2% of 90000
  });

  it('falls back to tonase per item × berat bersih when no price', () => {
    assert.equal(computeLineOmset(5, 90, 0), 450);
    assert.equal(computeLineBonus(5, 90, 0), 9); // 2% of 450
  });
});

describe('validateFieldCheckoutCode selisih', () => {
  it('accepts berat bersih greater than kotor (selisih is the absolute difference)', () => {
    const parsed = validateFieldCheckoutCode('2*02020*1999*06326*L 8393 UP*0*SB*0*2510');
    assert.equal(parsed.kotor, 0);
    assert.equal(parsed.berat_bersih, 2510);
    assert.equal(parsed.selisih, 2510);
  });

  it('keeps the normal case unchanged (kotor >= berat bersih)', () => {
    const parsed = validateFieldCheckoutCode('1*12345*1*1*NOPOL*0*ITEM*100*90');
    assert.equal(parsed.selisih, 10);
  });
});

describe('FieldCheckoutCodeService submit', () => {
  it('rejects delivery data when employee has not checked in today', async () => {
    const attendanceRepository = {
      countTodaySegments: async () => 0,
    };
    const service = new FieldCheckoutCodeService(
      { createEntry: async () => ({}) },
      {},
      null,
      null,
      attendanceRepository
    );

    await assert.rejects(
      () =>
        service.submit(
          { role: 'field_officer', employeeId: 1 },
          { code: '1*12345*A*B*C*D*E*100*90' }
        ),
      (err) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, 'CHECK_IN_REQUIRED');
        return true;
      }
    );
  });
});

describe('FieldCheckoutCodeService updateDeliveryAsAdmin', () => {
  it('recomputes selisih/omset/bonus from the edited net weight and catalog rate', async () => {
    let saved = null;
    const fieldDeliveryRepository = {
      findById: async () => ({
        id: 7,
        pabrik_code: 'P1',
        kode_barang: 'ITEM',
        norek: '00000',
        nomor_tanda_terima: 'A',
        nomor_surat_jalan: 'B',
        nopol: 'L 1 AB',
        no_bs: '0',
        kotor: 100,
        berat_bersih: 90,
        selisih: 10,
        tonase_per_item: 5,
        price_per_item: 0,
        omset_amount: 450,
        bonus_amount: 9,
      }),
      updateEntry: async (id, fields) => {
        saved = { id, ...fields };
        return saved;
      },
    };
    const pabrikItemRateRepository = {
      findByPabrikAndBarang: async () => ({ tonase_per_item: 5, price_per_item: 1000 }),
    };
    const service = new FieldCheckoutCodeService(
      fieldDeliveryRepository,
      pabrikItemRateRepository
    );

    const res = await service.updateDeliveryAsAdmin({ role: 'admin' }, 7, { berat_bersih: 80 });

    assert.equal(saved.berat_bersih, 80);
    assert.equal(saved.kotor, 100);
    assert.equal(saved.selisih, 20); // |100 - 80|
    assert.equal(saved.price_per_item, 1000); // catalog rate wins over stored
    assert.equal(saved.omset_amount, 80000); // 1000 × 80
    assert.equal(saved.bonus_amount, 1600); // 2% of 80000
    assert.equal(res.code, 'DELIVERY_UPDATED');
  });

  it('rejects non-admin callers', async () => {
    const service = new FieldCheckoutCodeService({}, {});
    await assert.rejects(
      () => service.updateDeliveryAsAdmin({ role: 'field_officer' }, 1, {}),
      (err) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 403);
        return true;
      }
    );
  });
});

describe('FieldCheckoutCodeService deleteDeliveryAsAdmin', () => {
  it('deletes an existing entry', async () => {
    let deletedId = null;
    const service = new FieldCheckoutCodeService({
      deleteEntry: async (id) => {
        deletedId = id;
        return { id };
      },
    });
    const res = await service.deleteDeliveryAsAdmin({ role: 'admin' }, 7);
    assert.equal(deletedId, 7);
    assert.equal(res.code, 'DELIVERY_DELETED');
  });

  it('404s when the entry does not exist', async () => {
    const service = new FieldCheckoutCodeService({ deleteEntry: async () => null });
    await assert.rejects(
      () => service.deleteDeliveryAsAdmin({ role: 'admin' }, 99),
      (err) => err instanceof AppError && err.statusCode === 404
    );
  });

  it('rejects non-admin callers', async () => {
    const service = new FieldCheckoutCodeService({ deleteEntry: async () => ({ id: 1 }) });
    await assert.rejects(
      () => service.deleteDeliveryAsAdmin({ role: 'field_officer' }, 1),
      (err) => err instanceof AppError && err.statusCode === 403
    );
  });
});

describe('FieldCheckoutCodeService assertReadyForCheckout', () => {
  it('lets a field officer check out with no delivery data (does not throw)', async () => {
    let createEntryCalls = 0;
    const service = new FieldCheckoutCodeService({
      countForEmployeeOnDate: async () => 0,
      createEntry: async () => {
        createEntryCalls += 1;
        return {};
      },
    });

    await service.assertReadyForCheckout({ role: 'field_officer', employeeId: 1 }, undefined);
    assert.equal(createEntryCalls, 0);
  });
});
