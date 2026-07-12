const { query } = require('../db/pool');

class FieldDeliveryBackdateRepository {
  async findById(id) {
    const r = await query(`SELECT * FROM field_delivery_backdate_requests WHERE id = $1`, [id]);
    return r.rows[0] || null;
  }

  async hasPendingForDelivery(deliveryId) {
    const r = await query(
      `SELECT 1 FROM field_delivery_backdate_requests
       WHERE delivery_id = $1 AND approval_status = 'pending' LIMIT 1`,
      [deliveryId]
    );
    return r.rowCount > 0;
  }

  async create({ employeeId, deliveryId, fromValidOn, requestedValidOn, reason }) {
    try {
      const r = await query(
        `INSERT INTO field_delivery_backdate_requests
          (employee_id, delivery_id, from_valid_on, requested_valid_on, reason)
         VALUES ($1, $2, $3::date, $4::date, $5)
         RETURNING *`,
        [employeeId, deliveryId, fromValidOn, requestedValidOn, reason]
      );
      return r.rows[0];
    } catch (err) {
      if (err && (err.code === '23505' || String(err.message || '').includes('uq_field_delivery_backdate_pending'))) {
        const conflict = new Error('BACKDATE_PENDING');
        conflict.code = 'BACKDATE_PENDING';
        throw conflict;
      }
      throw err;
    }
  }

  async listByEmployee(employeeId) {
    const r = await query(
      `SELECT b.*, fde.checkout_code, fde.pabrik_code, fde.bonus_amount, fde.valid_on AS current_valid_on
       FROM field_delivery_backdate_requests b
       JOIN field_delivery_entries fde ON fde.id = b.delivery_id
       WHERE b.employee_id = $1
       ORDER BY b.created_at DESC
       LIMIT 50`,
      [employeeId]
    );
    return r.rows;
  }

  async listPending() {
    const r = await query(
      `SELECT b.*, e.full_name, e.employee_id AS employee_code,
              fde.checkout_code, fde.pabrik_code, fde.bonus_amount, fde.berat_bersih,
              fde.valid_on AS current_valid_on
       FROM field_delivery_backdate_requests b
       JOIN employees e ON e.id = b.employee_id
       JOIN field_delivery_entries fde ON fde.id = b.delivery_id
       WHERE b.approval_status = 'pending'
       ORDER BY b.created_at DESC`
    );
    return r.rows;
  }

  async setDecision(id, { status, decidedBy }) {
    const r = await query(
      `UPDATE field_delivery_backdate_requests SET
        approval_status = $2,
        decided_by = $3,
        decided_at = NOW()
       WHERE id = $1 AND approval_status = 'pending'
       RETURNING *`,
      [id, status, decidedBy]
    );
    return r.rows[0] || null;
  }

  async pendingDeliveryIdsForEmployee(employeeId, deliveryIds) {
    if (!deliveryIds?.length) return new Set();
    const r = await query(
      `SELECT delivery_id FROM field_delivery_backdate_requests
       WHERE employee_id = $1 AND approval_status = 'pending'
         AND delivery_id = ANY($2::int[])`,
      [employeeId, deliveryIds]
    );
    return new Set(r.rows.map((row) => row.delivery_id));
  }
}

module.exports = { FieldDeliveryBackdateRepository };
