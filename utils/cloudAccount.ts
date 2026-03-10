import { supabase } from '../supabaseClient';
import type {
  CompanyMembership,
  CompanyMembershipStatus,
  CompanyProfile,
  CreateCompanyInput,
  UserRole,
} from '../types';

type CompanyRow = {
  id: string;
  name: string | null;
  created_at?: string | null;
};

export type CloudProfileRow = {
  id: string;
  full_name: string | null;
  role: UserRole | null;
  company_id: string | null;
  companies?: CompanyRow | CompanyRow[] | null;
};

type CloudMembershipRow = {
  id: string;
  user_id: string;
  company_id: string;
  role: UserRole | null;
  status: CompanyMembershipStatus | null;
  created_at: string | null;
  companies?: CompanyRow | CompanyRow[] | null;
};

const addDaysIso = (dateIso: string, days: number): string => {
  const date = new Date(dateIso);
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

export const normalizeRole = (value: string | null | undefined): UserRole => {
  if (value === 'ADMIN' || value === 'ACCOUNTANT' || value === 'VIEWER') return value;
  return 'ADMIN';
};

const normalizeMembershipStatus = (value: string | null | undefined): CompanyMembershipStatus => {
  return value === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
};

const getRowCompany = <T extends { companies?: CompanyRow | CompanyRow[] | null }>(row: T | null): CompanyRow | null => {
  if (!row?.companies) return null;
  return Array.isArray(row.companies) ? row.companies[0] || null : row.companies;
};

export const getCloudProfileCompany = (profile: CloudProfileRow | null): CompanyProfile | null => {
  const row = getRowCompany(profile);
  if (!row?.id) return null;
  const createdAt = row.created_at || new Date().toISOString();
  return {
    id: row.id,
    name: row.name || '',
    taxNumber: '',
    address: '',
    phone: '',
    logoUrl: '',
    createdAt,
    trialEndsAt: addDaysIso(createdAt, 14),
  };
};

const mapCompanyRowToProfile = (row: CompanyRow): CompanyProfile => {
  const createdAt = row.created_at || new Date().toISOString();
  return {
    id: row.id,
    name: row.name || '',
    taxNumber: '',
    address: '',
    phone: '',
    logoUrl: '',
    createdAt,
    trialEndsAt: addDaysIso(createdAt, 14),
  };
};

const mapMembershipRow = (row: CloudMembershipRow): CompanyMembership => ({
  id: row.id,
  userId: row.user_id,
  companyId: row.company_id,
  role: normalizeRole(row.role),
  status: normalizeMembershipStatus(row.status),
  createdAt: row.created_at || new Date().toISOString(),
  company: getRowCompany(row) ? mapCompanyRowToProfile(getRowCompany(row) as CompanyRow) : null,
});

export const getCloudProfile = async (userId: string): Promise<CloudProfileRow | null> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, company_id, companies(id, name, created_at)')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message || 'Unable to read profile.');
  return (data as CloudProfileRow | null) ?? null;
};

export const getCloudMemberships = async (userId: string): Promise<CompanyMembership[]> => {
  const { data, error } = await supabase
    .from('company_memberships')
    .select('id, user_id, company_id, role, status, created_at, companies(id, name, created_at)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message || 'Unable to read company memberships.');

  return ((data as CloudMembershipRow[] | null) ?? [])
    .map(mapMembershipRow)
    .filter((membership) => !!membership.company?.id);
};

export const ensureLegacyMembership = async (
  userId: string,
  profile: CloudProfileRow | null,
): Promise<CompanyMembership[]> => {
  if (!profile?.company_id) return [];

  const { error } = await supabase
    .from('company_memberships')
    .upsert([{
      user_id: userId,
      company_id: profile.company_id,
      role: normalizeRole(profile.role),
      status: 'ACTIVE',
    }], { onConflict: 'user_id,company_id' });

  if (error) throw new Error(error.message || 'Unable to migrate the legacy company link.');
  return getCloudMemberships(userId);
};

export const getCloudAccountState = async (userId: string): Promise<{
  profile: CloudProfileRow | null;
  memberships: CompanyMembership[];
}> => {
  const profile = await getCloudProfile(userId);
  let memberships = await getCloudMemberships(userId);
  if (!memberships.length && profile?.company_id) {
    memberships = await ensureLegacyMembership(userId, profile);
  }
  return { profile, memberships };
};

export const upsertCloudProfile = async (input: { id: string; fullName: string }): Promise<void> => {
  const { error } = await supabase
    .from('profiles')
    .upsert([{
      id: input.id,
      full_name: input.fullName,
    }], { onConflict: 'id' });

  if (error) throw new Error(error.message || 'Unable to save the user profile.');
};

export const createCloudCompany = async (input: CreateCompanyInput): Promise<CompanyProfile> => {
  const payload = {
    name: input.name.trim(),
    subscription_plan: 'FREE_TRIAL',
    status: 'ACTIVE',
  };

  const { data, error } = await supabase
    .from('companies')
    .insert([payload])
    .select('id, name, created_at')
    .single();

  if (error || !data) throw new Error(error?.message || 'Unable to create the company.');
  return mapCompanyRowToProfile(data as CompanyRow);
};

export const createCloudCompanyMembership = async (input: {
  userId: string;
  company: CreateCompanyInput;
  role?: UserRole;
}): Promise<{ company: CompanyProfile; membership: CompanyMembership }> => {
  const company = await createCloudCompany(input.company);
  const membershipRole = input.role || 'ADMIN';

  const { data, error } = await supabase
    .from('company_memberships')
    .insert([{
      user_id: input.userId,
      company_id: company.id,
      role: membershipRole,
      status: 'ACTIVE',
    }])
    .select('id, user_id, company_id, role, status, created_at, companies(id, name, created_at)')
    .single();

  if (error || !data) throw new Error(error?.message || 'Unable to create the company membership.');
  return {
    company,
    membership: mapMembershipRow(data as CloudMembershipRow),
  };
};
