import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../middleware/async-handler.js';

export const healthRouter = Router();

healthRouter.get('/', asyncHandler(async (_req, res) => {
  const [rows] = await pool.query('SELECT 1 AS ok');
  res.json({ status: 'ok', db: rows[0]?.ok === 1 ? 'ok' : 'down' });
}));
