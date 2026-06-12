import type { Request, Response, NextFunction } from 'express';
import admin from 'firebase-admin';
import { query } from '../config/db.js';

// Initialize Firebase Admin SDK
// Firebase Admin needs credentials. If running in Google Cloud, it initializes automatically.
// Otherwise, it relies on GOOGLE_APPLICATION_CREDENTIALS environment variable or default configuration.
if (admin.apps.length === 0) {
  try {
    admin.initializeApp();
    console.log('[Firebase Admin] Connected successfully.');
  } catch (error) {
    console.warn('[Firebase Admin] Initialization warning: Ensure correct environment variables are set for Firebase Admin. Using credentials-free setup.');
    admin.initializeApp({
      projectId: process.env.VITE_FIREBASE_PROJECT_ID
    });
  }
}

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email: string;
    name?: string;
    picture?: string;
  };
}

export const authenticateUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  // Local bypass for testing without service accounts
  if (process.env.BYPASS_AUTH === 'true') {
    const uid = 'dev_user_1';
    const email = 'developer@system.local';
    const name = 'Developer User';
    
    await query(
      `INSERT INTO users (id, email, name, role)
       VALUES ($1, $2, $3, 'USER')
       ON CONFLICT (id) DO NOTHING`,
      [uid, email, name]
    );

    req.user = { uid, email, name };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid authorization header' });
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Check if user exists in the local database, if not, upsert them
    const email = decodedToken.email || '';
    const uid = decodedToken.uid;
    const name = decodedToken.name || email.split('@')[0];
    const picture = decodedToken.picture || '';
    const role = 'USER';

    await query(
      `INSERT INTO users (id, email, name, picture, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email, name = COALESCE(users.name, EXCLUDED.name), picture = EXCLUDED.picture
       RETURNING *`,
      [uid, email, name, picture, role]
    );

    req.user = {
      uid,
      email,
      name,
      picture
    };
    
    next();
  } catch (error: any) {
    console.error('[Auth Middleware] Verification failed:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token', details: error.message });
  }
};

// Check if user has membership in the requested company
export const verifyCompanyMembership = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const companyId = req.params.companyId || req.body.companyId || req.query.companyId;
  const uid = req.user?.uid;

  if (!companyId) {
    return res.status(400).json({ error: 'Bad Request: Missing companyId' });
  }

  if (!uid) {
    return res.status(401).json({ error: 'Unauthorized: User not authenticated' });
  }

  try {
    let result = await query(
      `SELECT role, status, permissions FROM memberships WHERE company_id = $1 AND user_id = $2`,
      [companyId, uid]
    );

    if (result.rows.length === 0) {
      console.log(`[Auth Middleware] Membership not found in PG for user ${uid} and company ${companyId}. Checking Firestore...`);
      const db = admin.firestore();
      const userDoc = await db.collection('users').doc(uid).get();
      const userData = userDoc.exists ? userDoc.data() : null;
      const firestoreCompanies = userData?.companies || [];
      const firestoreCompany = firestoreCompanies.find((fc: any) => fc.id === companyId);

      if (firestoreCompany) {
        console.log(`[Auth Middleware] User ${uid} has Firestore access to ${companyId}. Auto-creating PG company and membership...`);
        
        // Ensure company exists in PG
        await query(
          `INSERT INTO companies (id, name, settings)
           VALUES ($1, $2, '{}'::jsonb)
           ON CONFLICT (id) DO NOTHING`,
          [companyId, firestoreCompany.name || 'شركة غير مسمى']
        );

        // Ensure user exists in users table in PG
        await query(
          `INSERT INTO users (id, email, name, role)
           VALUES ($1, $2, $3, 'USER')
           ON CONFLICT (id) DO NOTHING`,
          [uid, req.user?.email || `user_${uid}@system.local`, req.user?.name || `User_${uid}`]
        );

        // Check Firestore company subscription to determine ownership
        let role = 'MEMBER';
        if (companyId === `cmp_${uid}`) {
          role = 'OWNER';
        } else {
          try {
            const subDoc = await db.collection('company_subscriptions').doc(companyId).get();
            if (subDoc.exists && subDoc.data()?.ownerUserId === uid) {
              role = 'OWNER';
            }
          } catch (subErr) {
            console.error('[Auth Middleware] Failed to check company subscription owner:', subErr);
          }
        }

        // Create membership
        await query(
          `INSERT INTO memberships (company_id, user_id, role, status)
           VALUES ($1, $2, $3, 'ACTIVE')
           ON CONFLICT (company_id, user_id) DO NOTHING`,
          [companyId, uid, role]
        );

        // Re-query membership
        result = await query(
          `SELECT role, status, permissions FROM memberships WHERE company_id = $1 AND user_id = $2`,
          [companyId, uid]
        );
      } else {
        return res.status(403).json({ error: 'Forbidden: You are not a member of this company' });
      }
    }

    const membership = result.rows[0];
    if (membership.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Forbidden: Your membership is inactive' });
    }

    // Auto-repair/promote membership if they are actually the owner in Firestore
    if (membership.role === 'MEMBER') {
      let shouldBeOwner = companyId === `cmp_${uid}`;
      if (!shouldBeOwner) {
        try {
          const db = admin.firestore();
          const subDoc = await db.collection('company_subscriptions').doc(companyId).get();
          if (subDoc.exists && subDoc.data()?.ownerUserId === uid) {
            shouldBeOwner = true;
          }
        } catch (subErr) {
          console.error('[Auth Middleware] Failed to check company subscription owner for promotion:', subErr);
        }
      }

      if (shouldBeOwner) {
        console.log(`[Auth Middleware] Promoting user ${uid} to OWNER for company ${companyId}`);
        try {
          await query(
            `UPDATE memberships SET role = 'OWNER' WHERE company_id = $1 AND user_id = $2`,
            [companyId, uid]
          );
          membership.role = 'OWNER';
        } catch (updateErr) {
          console.error('[Auth Middleware] Failed to update membership role to OWNER:', updateErr);
        }
      }
    }

    // Set permissions/role on the request object for down-stream route access control if needed
    (req as any).membership = membership;

    next();
  } catch (error) {
    console.error('[Membership Middleware] Failed:', error);
    return res.status(500).json({ error: 'Internal server error verifying company membership' });
  }
};
