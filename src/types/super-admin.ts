export type TenantAccessMode = "both" | "mobile_only" | "web_only";

export interface SuperAdminOverviewMetrics {
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  mobileOnlyTenants: number;
  webOnlyTenants: number;
  dualAccessTenants: number;
  totalMembers: number;
  totalProducts: number;
  totalSalesRevenue: number;
}

export interface TenantGrowthPoint {
  monthKey: string;
  monthLabel: string;
  shortMonth: string;
  newTenants: number;
  cumulativeTenants: number;
}

export interface TenantSummaryItem {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  accessMode: TenantAccessMode;
  currency: string;
  ownerUserId: string | null;
  ownerUsername: string;
  ownerEmail: string;
  ownerFullname: string;
  memberCount: number;
  adminCount: number;
  productCount: number;
  salesCount: number;
  salesRevenue: number;
  activeSessionCount: number;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
  isDefaultTenant: boolean;
}

export interface TenantMemberItem {
  id: string;
  tenantId: string;
  username: string;
  email: string;
  firstname: string;
  lastname: string;
  fullname: string;
  phonenumber: string;
  role: "admin" | "member";
  twoFactorEnabled: boolean;
  twoFactorMethod: "email" | "sms";
  failedLoginAttempts: number;
  lockedUntil: string | null;
  activeSessionsCount: number;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  isTenantOwner: boolean;
}

export interface TenantDetailData {
  tenant: TenantSummaryItem & {
    businessAddress: string;
    businessPhone: string;
    businessEmail: string;
  };
  members: TenantMemberItem[];
}

export interface PlatformMobileServerConfig {
  serverUrl: string;
  configuredBySuperAdmin: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}
