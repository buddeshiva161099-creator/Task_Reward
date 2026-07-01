export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'hr_manager' | 'assistant_hr_manager' | 'manager' | 'assistant_manager' | 'employee' | 'platform_owner';
  reward_points: number;
  is_active: boolean;
  created_at: string;
  tenant_id?: string | null;
  primary_company_id?: string | null;
  scope_company_ids?: string[];
  business_unit_id?: string | null;
  mobile?: string;
  alternate_mobile?: string;
  must_change_password?: boolean;
  profile_picture?: string | null;
}

export interface RemarkEntry {
  user_id: string;
  user_name: string;
  text: string;
  timestamp: string;
}

export interface Task {
  id: string;
  work_description: string;
  assigned_to: string;
  assigned_to_name: string | null;
  created_by: string;
  created_by_name: string | null;
  status: 'pending' | 'assigned' | 'in_progress' | 'under_review' | 'completed' | 'completed_late' | 'overdue' | 'delayed' | 'rejected';
  priority: 'low' | 'regular' | 'medium' | 'high' | 'critical';
  task_type: 'assigned' | 'personal';
  deadline: string;
  completed_at: string | null;
  reward_given: boolean;
  reward_points: number;
  tenant_id: string | null;
  tenant_name: string | null;
  company_id?: string | null;
  company_name?: string | null;
  remarks: RemarkEntry[];
  category_ids: string[];
  category_names: string[];
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  is_active: boolean;
  created_at: string;
}

export interface TenantPolicy {
  work_days: string[];
  work_start_time: string;
  work_end_time: string;
  work_type: string;
  flexible_hours: number;
  cut_out_time: string;
  office_lat: number | null;
  office_lng: number | null;
  geofence_radius_meters: number;
  geofence_policy: string;
  min_session_minutes: number;
  auto_checkout_enabled: boolean;
  location_drift_threshold_km: number;
  sick_leave_limit?: number;
  earned_leave_limit?: number;
  casual_leave_limit?: number;
  max_paid_casual_leaves_per_month?: number;
  half_day_min_hours?: number;
  full_day_min_hours?: number;
  task_priority_points?: any;
  delay_penalties?: any;
  early_completion_multiplier?: number;
  quality_multipliers?: any;
  attendance_points?: any;
  attendance_bonus_threshold?: number;
  attendance_bonus_percentage?: number;
  performance_incentive_pool_percentage?: number;
  performance_bonus_threshold?: number;
  performance_bonus_percentage?: number;
  performance_bonus_amount?: number;
}

export interface Company {
  id: string;
  name: string;
  description: string | null;
  tenant_id: string;
  is_active: boolean;
  is_default: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Attendance {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  user_reward_points?: number;
  tenant_id: string;
  check_in: string;
  check_out: string | null;
  location_in: { lat: number; lng: number } | null;
  location_out: { lat: number; lng: number } | null;
  address_in: string | null;
  address_out: string | null;
  status: string;
  remarks: string | null;
  location_drift_km: number | null;
  distance_from_office_in: number | null;
  distance_from_office_out: number | null;
  flags: string[];
  is_auto_closed: boolean;
  device_fingerprint: string | null;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  role: string;
  reward_points: number;
  is_active: boolean;
  created_at: string;
  mobile?: string;
  alternate_mobile?: string;
  reporting_manager_id?: string;
  hr_reporting_manager_id?: string;
  identity_card_type?: string;
  identity_card_url?: string;
  emergency_contact?: string;
  job_title?: string;
  department?: string;
  branch?: string;
  hiring_date?: string;
  hiring_company?: string;
  business_unit_id?: string | null;
  business_unit_name?: string | null;
  primary_company_id?: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface CreateEmployeeRequest {
  name: string;
  email: string;
  password: string;
  role?: string;
  mobile?: string;
  alternate_mobile?: string;
  reporting_manager_id?: string;
  hr_reporting_manager_id?: string;
  identity_card_type?: string;
  identity_card_url?: string;
  emergency_contact?: string;
  job_title?: string;
  department?: string;
  branch?: string;
  hiring_date?: string;
  hiring_company?: string;
  business_unit_id?: string | null;
}

export interface UpdateEmployeeRequest {
  name?: string;
  email?: string;
  role?: string;
  mobile?: string;
  alternate_mobile?: string;
  reporting_manager_id?: string;
  hr_reporting_manager_id?: string;
  identity_card_type?: string;
  identity_card_url?: string;
  emergency_contact?: string;
  job_title?: string;
  department?: string;
  branch?: string;
  hiring_date?: string;
  hiring_company?: string;
  business_unit_id?: string | null;
}

export interface CreateTaskRequest {
  work_description: string;
  assigned_to?: string;
  assigned_to_list?: string[];
  priority: string;
  deadline: string;
  tenant_id?: string;
  company_id?: string;
  company_id_list?: string[];
  for_all?: boolean;
  is_recurrent?: boolean;
  recurrence?: {
    type: string;
    interval: number;
    weekdays?: number[];
    month_day?: number;
    end_type: string;
    end_value?: string;
  };
  category_ids?: string[];
}

export interface UpdateTaskRequest {
  work_description?: string;
  status?: string;
  priority?: string;
  deadline?: string;
  remarks?: string;
}

export interface RoleStats {
  total: number;
  present: number;
  absent: number;
}

export interface DashboardStats {
  employees: {
    total: number;
    active: number;
    role_counts?: {
      employee: RoleStats;
      manager: RoleStats;
      assistant_manager: RoleStats;
      hr_manager: RoleStats;
      assistant_hr_manager: RoleStats;
      admin: RoleStats;
      total_all_inclusive: RoleStats;
    };
  };
  tasks: {
    total: number;
    completed: number;
    completed_late: number;
    pending: number;
    in_progress: number;
    overdue: number;
  };
  priority_distribution: {
    critical: number;
    high: number;
    medium: number;
    regular: number;
  };
  leaderboard: LeaderboardEntry[];
  recent_activity: ActivityEntry[];
  total_rewards_given: number;
  attendance_today: {
    present: number;
    absent: number;
    total: number;
  };
}

export interface EmployeeDashboard {
  user: {
    name: string;
    email: string;
    reward_points: number;
  };
  tasks: {
    total: number;
    completed: number;
    completed_late: number;
    pending: number;
    in_progress: number;
    overdue: number;
  };
  recent_activity: ActivityEntry[];
  rewards_earned: number;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  email: string;
  reward_points: number;
}

export interface ActivityEntry {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  details: string | null;
  timestamp: string;
}

export type TenantStatus = 'trial' | 'active' | 'suspended' | 'cancelled';

export interface PlatformOwner {
  id: string;
  name: string;
  email: string;
  role: 'platform_owner';
  must_change_password: boolean;
  last_login_at?: string | null;
}

export interface Tenant {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  tenant_status: TenantStatus;
  plan_id: string | null;
  plan_code: string | null;
  trial_ends_at: string | null;
  activated_at: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  cancelled_at: string | null;
  max_employees: number;
  created_at: string;
  onboarded_by_owner_id: string | null;
  employee_count?: number;
  admin_count?: number;
  active_admin_count?: number;
  work_days?: string[];
  work_type?: string;
  work_start_time?: string;
  work_end_time?: string;
  cut_out_time?: string;
  flexible_hours?: number;
  task_priority_points?: any;
  delay_penalties?: any;
  early_completion_multiplier?: number;
  quality_multipliers?: any;
  attendance_points?: any;
  attendance_bonus_threshold?: number;
  attendance_bonus_percentage?: number;
  performance_incentive_pool_percentage?: number;
  performance_bonus_threshold?: number;
  performance_bonus_percentage?: number;
  performance_bonus_amount?: number;
  sick_leave_limit?: number;
  earned_leave_limit?: number;
  casual_leave_limit?: number;
  max_paid_casual_leaves_per_month?: number;
  half_day_min_hours?: number;
  full_day_min_hours?: number;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  code: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  max_employees: number;
  max_admins: number;
  storage_gb: number;
  trial_days: number;
  is_active: boolean;
  is_default: boolean;
  feature_flags: string[];
  sort_order: number;
}

export interface PlatformMetrics {
  tenants: {
    total: number;
    active: number;
    trial: number;
    suspended: number;
    cancelled: number;
    new_last_30_days: number;
  };
  users: {
    total: number;
    admins: number;
    employees: number;
  };
  plans: {
    total_plans: number;
    by_code: Record<string, number>;
  };
  recent_signups: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    tenant_id: string | null;
    created_at: string | null;
  }>;
  mrr?: number;
  db_stats?: {
    collections: number;
    objects: number;
    data_size_mb: number;
    storage_size_mb: number;
    index_size_mb: number;
  };
  engagement?: {
    total_tasks: number;
    completed_tasks: number;
    total_attendance: number;
    total_reward_points: number;
  };
}

export interface PlatformAuditEntry {
  id: string;
  actor_email: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  tenant_id: string | null;
  description: string | null;
  ip_address: string | null;
  user_agent?: string | null;
  timestamp: string | null;
}

export interface OnboardTenantRequest {
  tenant_name: string;
  admin_name: string;
  admin_email: string;
  plan_code?: string;
  trial_days?: number;
  work_days?: string[];
  work_start_time?: string;
  work_end_time?: string;
  office_lat?: number;
  office_lng?: number;
}

export interface OnboardTenantResponse {
  tenant: Tenant;
  admin: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  temp_password: string;
  trial_ends_at: string | null;
  warning: string;
}

export interface TenantAdmin {
  id: string;
  name: string;
  email: string;
  role: 'admin';
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string | null;
}

export interface ResetAdminPasswordResponse {
  admin_id: string;
  admin_email: string;
  temp_password: string;
  must_change_password: boolean;
  warning: string;
}

export interface BusinessUnitSummary {
  id: string;
  name: string;
  type: 'hq' | 'branch' | 'department' | 'subsidiary';
  is_active: boolean;
  is_default: boolean;
}

export interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  status: string;
  tenant_status: TenantStatus;
  suspended_reason: string | null;
  plan_code: string | null;
  plan_name: string | null;
  employee_count: number;
  admin_count: number;
  active_admin_count: number;
  business_unit_count: number;
  business_unit_summary: BusinessUnitSummary[];
  company_count?: number;
  company_summary?: Company[];
  created_at: string | null;
  trial_ends_at: string | null;
  max_employees: number;
  storage_used_mb: number;
  onboarded_by_owner_id: string | null;
}

export interface BusinessUnit {
  id: string;
  tenant_id: string;
  company_id: string;
  name: string;
  type: 'hq' | 'branch' | 'department' | 'subsidiary';
  code: string | null;
  description: string | null;
  is_active: boolean;
  is_default: boolean;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  timezone: string | null;
  currency: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  work_days: string[] | null;
  work_start_time: string | null;
  work_end_time: string | null;
  employee_count: number;
  created_at: string;
  updated_at: string;
}

export interface BusinessUnitList {
  items: BusinessUnit[];
  total: number;
}
