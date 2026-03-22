import { CompanyProfile } from '../types';
import { normalizeEntityNameKey } from './entityNameMatching';

export const findCompanyProfileNameConflict = (
  list: CompanyProfile[],
  candidateName: string,
  excludeId?: string
) => {
  const normalizedCandidate = normalizeEntityNameKey(candidateName);
  if (!normalizedCandidate) return undefined;

  return list.find((company) => (
    company.id !== excludeId &&
    normalizeEntityNameKey(company.name) === normalizedCandidate
  ));
};

type CompanyDeletionResolution =
  | { ok: true; target: CompanyProfile; fallback: CompanyProfile }
  | { ok: false; reason: 'NOT_FOUND' | 'LAST_COMPANY' | 'NO_FALLBACK'; target: CompanyProfile | null; fallback: CompanyProfile | null };

export const resolveCompanyDeletionTarget = (
  list: CompanyProfile[],
  companyId: string
): CompanyDeletionResolution => {
  const target = list.find((company) => company.id === companyId) || null;
  if (!target) {
    return { ok: false, reason: 'NOT_FOUND', target: null, fallback: null };
  }

  if (list.length <= 1) {
    return { ok: false, reason: 'LAST_COMPANY', target, fallback: null };
  }

  const fallback = list.find((company) => company.id !== companyId) || null;
  if (!fallback) {
    return { ok: false, reason: 'NO_FALLBACK', target, fallback: null };
  }

  return { ok: true, target, fallback };
};

export const shouldBootstrapMissingCompanySubscription = (
  list: Array<Pick<CompanyProfile, 'id'>>,
  companyId: string,
  deletingCompanyIds?: Iterable<string>
): boolean => {
  if (!companyId) return false;

  const pendingDeletionIds = deletingCompanyIds ? new Set(deletingCompanyIds) : null;
  if (pendingDeletionIds?.has(companyId)) {
    return false;
  }

  return list.some((company) => company.id === companyId);
};
