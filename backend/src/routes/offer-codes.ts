import { Router } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { query } from '../config/db.js';

const router = Router();

const PROGRAM_OWNER_EMAIL = 'hamza.mm.aa.ss@gmail.com';

// ─── List offer codes (owner only) ───────────────────────────
router.get('/', async (req: AuthenticatedRequest, res) => {
  if (req.user?.email !== PROGRAM_OWNER_EMAIL) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const result = await query(
      'SELECT * FROM workspace_offer_codes ORDER BY created_at DESC LIMIT 200'
    );
    res.json({ codes: result.rows });
  } catch (error: any) {
    console.error('[Offer Codes] List error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Create a new offer code (owner only) ────────────────────
router.post('/', async (req: AuthenticatedRequest, res) => {
  if (req.user?.email !== PROGRAM_OWNER_EMAIL) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { code, kind, discountPercent, freeDays, companyCount, expiresAt, notes } = req.body;
  if (!code || !kind) {
    return res.status(400).json({ error: 'code and kind are required' });
  }

  try {
    await query(
      `INSERT INTO workspace_offer_codes
        (code, status, kind, discount_percent, free_days, company_count, created_by_user_id, created_by_email, expires_at, notes)
       VALUES ($1, 'AVAILABLE', $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (code) DO NOTHING`,
      [
        code,
        kind,
        discountPercent || null,
        freeDays || null,
        companyCount || null,
        req.user?.uid || null,
        req.user?.email || null,
        expiresAt || null,
        notes || null
      ]
    );
    res.json({ ok: true, code });
  } catch (error: any) {
    console.error('[Offer Codes] Create error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Validate / lookup a code (any authenticated user) ───────
router.get('/:codeId', async (req: AuthenticatedRequest, res) => {
  const { codeId } = req.params;
  try {
    const result = await query(
      'SELECT * FROM workspace_offer_codes WHERE code = $1',
      [codeId.trim().toUpperCase()]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Code not found' });
    }
    res.json({ offer: result.rows[0] });
  } catch (error: any) {
    console.error('[Offer Codes] Lookup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Redeem a code (any authenticated user) ──────────────────
router.post('/:codeId/redeem', async (req: AuthenticatedRequest, res) => {
  const { codeId } = req.params;
  const normalizedCode = codeId.trim().toUpperCase();

  try {
    // Atomic check-and-consume with a single UPDATE
    const result = await query(
      `UPDATE workspace_offer_codes
       SET status = 'USED',
           used_at = NOW(),
           used_by_user_id = $2,
           used_by_email = $3
       WHERE code = $1
         AND status = 'AVAILABLE'
         AND (expires_at IS NULL OR expires_at > NOW())
       RETURNING *`,
      [normalizedCode, req.user?.uid || null, req.user?.email || null]
    );

    if (result.rows.length === 0) {
      // Check why it failed
      const existing = await query(
        'SELECT status, expires_at FROM workspace_offer_codes WHERE code = $1',
        [normalizedCode]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Offer code is invalid.' });
      }
      const row = existing.rows[0];
      if (row.status !== 'AVAILABLE') {
        return res.status(400).json({ error: 'This offer code is no longer available.' });
      }
      if (row.expires_at && new Date(row.expires_at) < new Date()) {
        return res.status(400).json({ error: 'This offer code has expired.' });
      }
      return res.status(400).json({ error: 'Could not redeem offer code.' });
    }

    res.json({ ok: true, offer: result.rows[0] });
  } catch (error: any) {
    console.error('[Offer Codes] Redeem error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
