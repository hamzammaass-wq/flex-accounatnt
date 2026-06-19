/**
 * Centralized account ID helper functions to prevent company data overlap
 * All account IDs in database are prefixed with company ID: {companyId}_{cleanId}
 */
/**
 * Prefix an account ID with company ID
 * @param companyId - Company ID (e.g., "cmp_abc123")
 * @param id - Account ID (may already be prefixed)
 * @returns Prefixed account ID: "cmp_abc123_accountId" or null
 */
export const prefixAccountId = (companyId, id) => {
    if (!id)
        return null;
    // Extract clean ID if already prefixed with ANY company ID
    let cleanId = id;
    const match = id.match(/^cmp_[a-zA-Z0-9]+_(.+)$/);
    if (match) {
        cleanId = match[1];
    }
    // If already correctly prefixed with THIS company ID, return as-is
    if (cleanId.startsWith(companyId + '_'))
        return cleanId;
    // Return prefixed ID
    return `${companyId}_${cleanId}`;
};
/**
 * Remove company ID prefix from account ID
 * @param companyId - Company ID
 * @param id - Account ID (may be prefixed)
 * @returns Clean account ID without prefix or null
 */
export const unprefixAccountId = (companyId, id) => {
    if (!id)
        return null;
    // Extract clean ID if prefixed with ANY company ID
    const match = id.match(/^cmp_[a-zA-Z0-9]+_(.+)$/);
    if (match) {
        return match[1];
    }
    // Remove THIS company's prefix if present
    const prefix = companyId + '_';
    if (id.startsWith(prefix)) {
        return id.substring(prefix.length);
    }
    return id;
};
/**
 * Resolve account ID in database (with auto-create fallback)
 * This ensures account exists in DB before using it in foreign keys
 * @param client - Database client (for transaction safety)
 * @param companyId - Company ID
 * @param accountId - Account ID (may be prefixed or unprefixed)
 * @returns Database account ID (prefixed) or null
 */
export const resolveDbAccountId = async (client, companyId, accountId) => {
    if (!accountId)
        return null;
    // Extract clean ID if prefixed with ANY company ID
    let cleanId = accountId;
    const match = accountId.match(/^cmp_[a-zA-Z0-9]+_(.+)$/);
    if (match) {
        cleanId = match[1];
    }
    const prefixed = `${companyId}_${cleanId}`;
    // Check if account exists (try both prefixed and clean ID for migration compatibility)
    const res = await client.query(`SELECT id FROM accounts WHERE company_id = $1 AND (id = $2 OR id = $3)`, [companyId, prefixed, cleanId]);
    if (res.rows.length > 0) {
        return res.rows[0].id;
    }
    // Auto-create placeholder account to prevent foreign key constraint violations
    try {
        const defaultType = cleanId.toLowerCase().includes('expense') ? 'EXPENSE' :
            cleanId.toLowerCase().includes('revenue') || cleanId.toLowerCase().includes('sales') ? 'REVENUE' :
                cleanId.toLowerCase().includes('liability') ? 'LIABILITY' :
                    cleanId.toLowerCase().includes('equity') ? 'EQUITY' : 'ASSET';
        const code = cleanId.substring(0, 30);
        const name = cleanId.replace(/_/g, ' ');
        await client.query(`INSERT INTO accounts (id, company_id, code, name, type, currency, is_active)
       VALUES ($1, $2, $3, $4, $5, 'ILS', true)
       ON CONFLICT (company_id, id) DO NOTHING`, [prefixed, companyId, code, name, defaultType]);
        console.log(`[resolveDbAccountId] Auto-created placeholder account ${prefixed}`);
    }
    catch (err) {
        console.error(`[resolveDbAccountId] Failed to auto-create placeholder account ${prefixed}:`, err);
    }
    return prefixed;
};
