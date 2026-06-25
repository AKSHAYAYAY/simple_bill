import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';

export const daybookRouter = Router({ mergeParams: true });

daybookRouter.get('/', asyncHandler(async (req, res) => {
  const { date_from, date_to, type, payment_mode } = req.query;
  const params = [req.businessId];
  let sql = 'SELECT * FROM day_book WHERE business_id = ?';

  if (date_from && date_to) {
    sql += ' AND entry_date BETWEEN ? AND ?';
    params.push(date_from, date_to);
  }
  
  if (type) {
    sql += ' AND entry_type = ?';
    params.push(type);
  }

  if (payment_mode) {
    sql += ' AND payment_mode = ?';
    params.push(payment_mode);
  }

  sql += ' ORDER BY entry_date DESC, created_at DESC LIMIT 200';

  const [rows] = await req.tenantDb.execute(sql, params);

  // Quick aggregates for the dashboard view
  const aggregates = rows.reduce((acc, row) => {
    acc.cash_in += Number(row.cash_in || 0);
    acc.cash_out += Number(row.cash_out || 0);
    acc.bank_in += Number(row.bank_in || 0);
    acc.bank_out += Number(row.bank_out || 0);
    return acc;
  }, { cash_in: 0, cash_out: 0, bank_in: 0, bank_out: 0 });

  res.json({ 
    success: true, 
    data: rows,
    summary: {
      total_cash_in: aggregates.cash_in,
      total_cash_out: aggregates.cash_out,
      net_cash: aggregates.cash_in - aggregates.cash_out,
      total_bank_in: aggregates.bank_in,
      total_bank_out: aggregates.bank_out,
      net_bank: aggregates.bank_in - aggregates.bank_out
    }
  });
}));
