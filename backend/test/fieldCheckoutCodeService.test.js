const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { FieldCheckoutCodeService } = require('../src/services/fieldCheckoutCodeService');
const { validateFieldCheckoutCode } = require('../src/utils/fieldCheckoutPayload');
const {
  computeLineOmset,
  computeLineBonus,
  resolveFieldOfficerBonusRate,
} = require('../src/utils/fieldOfficerBonus');
const { AppError } = require('../src/utils/errors');

describe('field officer omset = berat bersih × harga per item', () => {
  it('uses price per item × berat bersih', () => {
    assert.equal(computeLineOmset(0, 90, 1000), 90000);
    assert.equal(computeLineBonus(0, 90, 1000), 1800); // default 2% of 90000
  });

  it('returns zero omset when no price is set', () => {
    assert.equal(computeLineOmset(5, 90, 0), 0);
    assert.equal(computeLineBonus(5, 90, 0), 0);
  });

  it('uses the pabrik bonus_omset_rate when provided', () => {
    assert.equal(resolveFieldOfficerBonusRate(0.01), 0.01);
    assert.equal(computeLineBonus(0, 90, 1000, 0.01), 900); // 1% of 90000
    assert.equal(resolveFieldOfficerBonusRate(0.02), 0.02);
    assert.equal(resolveFieldOfficerBonusRate(undefined), 0.02);
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
        tonase_per_item: 0,
        price_per_item: 0,
        omset_amount: 0,
        bonus_amount: 0,
      }),
      updateEntry: async (id, fields) => {
        saved = { id, ...fields };
        return saved;
      },
    };
    const pabrikItemRateRepository = {
      findByPabrikAndBarang: async () => ({
        tonase_per_item: 0,
        price_per_item: 1000,
        nama_barang: 'Test item',
      }),
    };
    const pabrikRepository = {
      findByCode: async () => ({ bonus_omset_rate: 0.02 }),
    };
    const service = new FieldCheckoutCodeService(
      fieldDeliveryRepository,
      pabrikItemRateRepository,
      null,
      null,
      null,
      pabrikRepository
    );

    const res = await service.updateDeliveryAsAdmin({ role: 'admin' }, 7, { berat_bersih: 80 });

    assert.equal(saved.berat_bersih, 80);
    assert.equal(saved.kotor, 100);
    assert.equal(saved.selisih, 20); // |100 - 80|
    assert.equal(saved.price_per_item, 1000); // catalog rate wins over stored
    assert.equal(saved.tonase_per_item, 0);
    assert.equal(saved.omset_amount, 80000); // 1000 × 80
    assert.equal(saved.bonus_amount, 1600); // 2% of 80000
    assert.equal(res.code, 'DELIVERY_UPDATED');
  });

  it('uses the factory bonus_omset_rate when recomputing bonus', async () => {
    let saved = null;
    const service = new FieldCheckoutCodeService(
      {
        findById: async () => ({
          id: 8,
          pabrik_code: '3',
          kode_barang: 'ITEM',
          norek: '00000',
          nomor_tanda_terima: 'A',
          nomor_surat_jalan: 'B',
          nopol: 'L 1 AB',
          no_bs: '0',
          kotor: 100,
          berat_bersih: 90,
          selisih: 10,
          tonase_per_item: 0,
          price_per_item: 1000,
          omset_amount: 90000,
          bonus_amount: 1800,
        }),
        updateEntry: async (id, fields) => {
          saved = { id, ...fields };
          return saved;
        },
      },
      {
        findByPabrikAndBarang: async () => ({
          tonase_per_item: 0,
          price_per_item: 1000,
        }),
      },
      null,
      null,
      null,
      { findByCode: async () => ({ bonus_omset_rate: 0.01 }) }
    );

    await service.updateDeliveryAsAdmin({ role: 'admin' }, 8, { berat_bersih: 90 });
    assert.equal(saved.omset_amount, 90000);
    assert.equal(saved.bonus_amount, 900); // 1% of 90000
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

describe('FieldCheckoutCodeService listMyDeliveriesForPeriod', () => {
  it('returns own lines and bonus total for the payroll cycle', async () => {
    const entries = [
      { id: 1, bonus_amount: 1000, omset_amount: 50000 },
      { id: 2, bonus_amount: 500, omset_amount: 25000 },
    ];
    const service = new FieldCheckoutCodeService({
      listForEmployeeBetween: async (employeeId, start, end) => {
        assert.equal(employeeId, 7);
        assert.equal(start, '2026-06-25');
        assert.equal(end, '2026-07-24');
        return entries;
      },
      sumBonusBetween: async () => 1500,
      sumOmsetBetween: async () => 75000,
    });

    const data = await service.listMyDeliveriesForPeriod(
      { role: 'field_officer', employeeId: 7 },
      '2026-07'
    );
    assert.equal(data.payroll_period, '2026-07');
    assert.equal(data.delivery_count, 2);
    assert.equal(data.bonus_total, 1500);
    assert.equal(data.omset_total, 75000);
    assert.equal(data.entries.length, 2);
  });

  it('rejects non-field-officer callers', async () => {
    const service = new FieldCheckoutCodeService({});
    await assert.rejects(
      () => service.listMyDeliveriesForPeriod({ role: 'employee', employeeId: 1 }, '2026-07'),
      (err) => err instanceof AppError && err.code === 'NOT_FIELD_OFFICER'
    );
  });

  it('rejects invalid period', async () => {
    const service = new FieldCheckoutCodeService({});
    await assert.rejects(
      () =>
        service.listMyDeliveriesForPeriod({ role: 'field_officer', employeeId: 1 }, 'not-a-period'),
      (err) => err instanceof AppError && err.code === 'PAYROLL_PERIOD'
    );
  });
});
