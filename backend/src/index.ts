import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import { authenticateUser, type AuthenticatedRequest } from './middleware/auth.js';

// Load routes
import companyRouter from './routes/companies.js';
import accountRouter from './routes/accounts.js';
import transactionRouter from './routes/transactions.js';
import invoiceRouter from './routes/invoices.js';
import reportRouter from './routes/reports.js';
import syncRouter from './routes/sync.js';
import migrateRouter from './routes/migrate.js';

import { getClient, query } from './config/db.js';

dotenv.config();

const prefixAccountId = (companyId: string, id: string | null | undefined): string | null => {
  if (!id) return null;
  if (id.startsWith(companyId + '_')) return id;
  return `${companyId}_${id}`;
};

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for frontend web client (dev environment and production firebase hosting URL)
app.use(cors({
  origin: '*', // For development. Replace with specific domains in production
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' })); // Support large JSON payloads during imports or syncs

// Public endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Authenticated Routes
app.use('/api/companies', authenticateUser, companyRouter);
app.use('/api/companies/:companyId/accounts', authenticateUser, accountRouter);
app.use('/api/companies/:companyId/transactions', authenticateUser, transactionRouter);
app.use('/api/companies/:companyId/invoices', authenticateUser, invoiceRouter);
app.use('/api/companies/:companyId/reports', authenticateUser, reportRouter);
app.use('/api/companies/:companyId/collections', authenticateUser, syncRouter);
app.use('/api/migrate-database', authenticateUser, migrateRouter);

app.post('/api/companies/:companyId/users/:userId/change-password', authenticateUser, async (req: AuthenticatedRequest, res) => {
  const { companyId, userId } = req.params;
  const { newPassword } = req.body;
  const callerUid = req.user?.uid;

  if (!callerUid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  try {
    let isAuthorized = false;

    // Check if caller is changing their own password, or if they are the program owner
    if (callerUid === userId || req.user?.email === 'hamza.mm.aa.ss@gmail.com') {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return res.status(403).json({ error: 'Forbidden: Only the program owner can change user passwords' });
    }

    // Update password in Firebase Auth
    await admin.auth().updateUser(userId, { password: newPassword });

    // Update password in Firestore
    const db = admin.firestore();
    await db.collection('users').doc(userId).set({ password: newPassword }, { merge: true });

    res.json({ ok: true });
  } catch (error: any) {
    console.error('[Change Password Error]', error);
    res.status(500).json({ error: error.message || 'Failed to change password' });
  }
});

app.get('/api/admin/users', authenticateUser, async (req: AuthenticatedRequest, res) => {
  if (req.user?.email !== 'hamza.mm.aa.ss@gmail.com') {
    return res.status(403).json({ error: 'Forbidden: Only the program owner can list all users' });
  }

  try {
    const db = admin.firestore();
    
    // Fetch all Firestore users
    const snapshot = await db.collection('users').get();
    const firestoreUsers: Record<string, any> = {};
    snapshot.forEach(doc => {
      firestoreUsers[doc.id] = doc.data();
    });

    // Fetch all Auth users
    const authList = await admin.auth().listUsers();
    const mergedUsers = authList.users.map(authUser => {
      const fsData = firestoreUsers[authUser.uid] || {};
      
      const email = authUser.email || fsData.email || '';
      const isCode = email.startsWith('code_') && email.endsWith('@smart.local');
      const accountCode = fsData.accountCode || (isCode ? email.substring(5, email.indexOf('@')) : '');

      return {
        id: authUser.uid,
        name: authUser.displayName || fsData.name || authUser.email || '',
        email: email,
        role: fsData.role || 'ACCOUNTANT',
        status: fsData.status || 'ACTIVE',
        accountCode: accountCode,
        password: fsData.password || ''
      };
    });

    res.json({ users: mergedUsers });
  } catch (error: any) {
    console.error('[List Users Error]', error);
    res.status(500).json({ error: error.message || 'Failed to list users' });
  }
});

app.post('/api/companies/:companyId/users/create', authenticateUser, async (req: AuthenticatedRequest, res) => {
  const { companyId } = req.params;
  const { accountCode, fullName, password, role } = req.body;
  const callerUid = req.user?.uid;

  if (!callerUid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!accountCode || !fullName || !password || !role) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Validate account code pattern
  if (!/^[a-zA-Z0-9_.-]{3,}$/.test(accountCode)) {
    return res.status(400).json({ error: 'Invalid account code pattern' });
  }

  try {
    if (req.user?.email !== 'hamza.mm.aa.ss@gmail.com') {
      return res.status(403).json({ error: 'Forbidden: Only the program owner can create users' });
    }

    const db = admin.firestore();
    const normalizedCode = accountCode.trim().toLowerCase();

    // Check if account code already exists in mapping
    const mappingDoc = await db.collection('account_codes').doc(normalizedCode).get();
    if (mappingDoc.exists) {
      return res.status(400).json({ error: 'ACCOUNT_CODE_EXISTS' });
    }

    // Create Firebase Auth user
    const email = `code_${normalizedCode}@smart.local`;
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: fullName
    });

    // Write mapping document
    await db.collection('account_codes').doc(normalizedCode).set({
      email,
      userId: userRecord.uid,
      createdAt: new Date().toISOString()
    });

    // Write user profile document
    await db.collection('users').doc(userRecord.uid).set({
      companies: [
        {
          id: companyId,
          name: req.body.companyName || 'Company'
        }
      ],
      accountCode: normalizedCode,
      password: password
    });

    res.json({ ok: true, uid: userRecord.uid, email });
  } catch (error: any) {
    console.error('[Create User Error]', error);
    res.status(500).json({ error: error.message || 'Failed to create user' });
  }
});

app.post('/api/firestore-write-proxy', authenticateUser, async (req, res) => {
  const { operations } = req.body || {};
  if (!Array.isArray(operations)) {
    return res.status(400).json({ error: 'Operations must be an array' });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    for (const op of operations) {
      const { type, path, data } = op;
      if (!path) continue;

      const match = path.match(/users\/([^\/]+)\/companies\/([^\/]+)\/([^\/]+)\/([^\/]+)/);
      if (!match) continue;

      const companyId = match[2];
      const collectionName = match[3];
      const itemId = match[4];

      if (type === 'delete') {
        if (collectionName === 'transactions') {
          await client.query('DELETE FROM journal_entries WHERE company_id = $1 AND id = $2', [companyId, itemId]);
        } else if (collectionName === 'invoices') {
          await client.query('DELETE FROM invoices WHERE company_id = $1 AND id = $2', [companyId, itemId]);
        }
      } else if (type === 'set' && data) {
        if (collectionName === 'transactions') {
          // Construct lines dynamically if not present (simple transactions with debit/credit account IDs)
          let lines = data.lines;
          if (!Array.isArray(lines) || lines.length === 0) {
            lines = [];
            if (data.debitAccountId) {
              lines.push({
                accountId: data.debitAccountId,
                debit: Number(data.amount || 0),
                credit: 0,
                note: data.description || null
              });
            }
            if (data.creditAccountId) {
              lines.push({
                accountId: data.creditAccountId,
                debit: 0,
                credit: Number(data.amount || 0),
                note: data.description || null
              });
            }
          }

          // Total balance check
          const totalDebit = lines.reduce((sum: number, l: any) => sum + Number(l.debit || 0), 0);
          const totalCredit = lines.reduce((sum: number, l: any) => sum + Number(l.credit || 0), 0);
          if (Math.abs(totalDebit - totalCredit) > 0.001) {
            throw new Error(`Unbalanced transaction ${data.id}: Debit ${totalDebit} != Credit ${totalCredit}`);
          }

          // Insert/Update Transaction Header
          await client.query(
            `INSERT INTO journal_entries (id, company_id, voucher_id, amount, description, category, type, date, invoice_id, contact_id, employee_id, asset_id, check_id, currency, exchange_rate, status, reversal_of_id, reversed_by_id, is_reversal)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
             ON CONFLICT (company_id, id) DO UPDATE
             SET voucher_id = EXCLUDED.voucher_id, amount = EXCLUDED.amount, description = EXCLUDED.description,
                 category = EXCLUDED.category, type = EXCLUDED.type, date = EXCLUDED.date, status = EXCLUDED.status,
                 invoice_id = EXCLUDED.invoice_id, contact_id = EXCLUDED.contact_id, employee_id = EXCLUDED.employee_id,
                 asset_id = EXCLUDED.asset_id, check_id = EXCLUDED.check_id, currency = EXCLUDED.currency,
                 exchange_rate = EXCLUDED.exchange_rate, reversal_of_id = EXCLUDED.reversal_of_id,
                 reversed_by_id = EXCLUDED.reversed_by_id, is_reversal = EXCLUDED.is_reversal`,
            [
              data.id, companyId, data.voucherId || null, Number(data.amount || 0), data.description || '',
              data.category || '', data.type, new Date(data.date), data.invoiceId || null, data.contactId || null,
              data.employeeId || null, data.assetId || null, data.checkId || null, data.currency, Number(data.exchangeRate || 1.0),
              data.status || 'POSTED', data.reversalOfId || null, data.reversedById || null, !!data.isReversal
            ]
          );

          // Clear lines and re-insert
          await client.query(`DELETE FROM journal_lines WHERE company_id = $1 AND entry_id = $2`, [companyId, data.id]);
          for (const line of lines) {
            await client.query(
              `INSERT INTO journal_lines (company_id, entry_id, account_id, debit, credit, currency, exchange_rate, note)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [companyId, data.id, prefixAccountId(companyId, line.accountId), Number(line.debit || 0), Number(line.credit || 0), line.currency || data.currency, Number(line.exchangeRate || data.exchangeRate || 1.0), line.note || null]
            );
          }
        } else if (collectionName === 'invoices') {
          await client.query(
            `INSERT INTO invoices (id, company_id, invoice_number, customer_id, linked_invoice_id, type, category, date, due_date, sub_total, tax_rate, tax_amount, tax_mode, discount_amount, total_amount, status, posting_status, payment_type, payment_account_id, is_partner_drawings, partner_drawings_mode, notes, currency, exchange_rate, warehouse_id, reversal_of_id, reversed_by_id, is_reversal)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
              ON CONFLICT (company_id, id) DO UPDATE
              SET invoice_number = EXCLUDED.invoice_number, customer_id = EXCLUDED.customer_id, linked_invoice_id = EXCLUDED.linked_invoice_id,
                  type = EXCLUDED.type, category = EXCLUDED.category, date = EXCLUDED.date, due_date = EXCLUDED.due_date,
                  sub_total = EXCLUDED.sub_total, tax_rate = EXCLUDED.tax_rate, tax_amount = EXCLUDED.tax_amount, tax_mode = EXCLUDED.tax_mode,
                  discount_amount = EXCLUDED.discount_amount, total_amount = EXCLUDED.total_amount, status = EXCLUDED.status,
                  posting_status = EXCLUDED.posting_status, payment_type = EXCLUDED.payment_type, payment_account_id = EXCLUDED.payment_account_id,
                  is_partner_drawings = EXCLUDED.is_partner_drawings, partner_drawings_mode = EXCLUDED.partner_drawings_mode,
                  notes = EXCLUDED.notes, currency = EXCLUDED.currency, exchange_rate = EXCLUDED.exchange_rate,
                  warehouse_id = EXCLUDED.warehouse_id, reversal_of_id = EXCLUDED.reversal_of_id, reversed_by_id = EXCLUDED.reversed_by_id,
                  is_reversal = EXCLUDED.is_reversal`,
            [
              data.id, companyId, data.invoiceNumber, data.customerId || null, data.linkedInvoiceId || null,
              data.type, data.category || '', new Date(data.date), data.dueDate ? new Date(data.dueDate) : null,
              Number(data.subTotal || 0), Number(data.taxRate || 0), Number(data.taxAmount || 0), data.taxMode || 'NONE',
              Number(data.discountAmount || 0), Number(data.totalAmount || 0), data.status || 'PENDING', data.postingStatus || 'DRAFT',
              data.paymentType || 'CREDIT', prefixAccountId(companyId, data.paymentAccountId), !!data.isPartnerDrawings, data.partnerDrawingsMode || null,
              data.notes || '', data.currency, Number(data.exchangeRate || 1.0), data.warehouseId || null, data.reversalOfId || null,
              data.reversedById || null, !!data.isReversal
            ]
          );

          // Clear items and re-insert
          await client.query(`DELETE FROM invoice_items WHERE company_id = $1 AND invoice_id = $2`, [companyId, data.id]);
          if (Array.isArray(data.items)) {
            for (const details of data.items) {
              await client.query(
                `INSERT INTO invoice_items (id, company_id, invoice_id, product_id, account_id, description, quantity, unit_price, total, returned, width, length)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                [details.id, companyId, data.id, details.productId || null, prefixAccountId(companyId, details.accountId), details.description || '', Number(details.quantity || 0), Number(details.unitPrice || 0), Number(details.total || 0), !!details.returned, details.width ? Number(details.width) : null, details.length ? Number(details.length) : null]
              );
            }
          }
        }
      }
    }

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('[Write Proxy Error]', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});



// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Global Error Handler]', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

export { app };

if (!process.env.FUNCTIONS_EMULATOR && !process.env.FUNCTION_TARGET && !process.env.FIREBASE_CONFIG) {
  app.listen(PORT, () => {
    console.log(`[Smart Accountant Server] Running on port ${PORT}`);
  });
}
