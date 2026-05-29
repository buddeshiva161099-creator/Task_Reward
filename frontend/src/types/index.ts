export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'hr_manager' | 'assistant_hr_manager' | 'manager' | 'assistant_manager' | 'employee';
  reward_points: number;
  is_active: boolean;
  created_at: string;
  company_id?: string;
  mobile?: string;
  alternate_mobile?: string;
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
  company_id: string | null;
  company_name: string | null;
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

export interface Company {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
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
  created_at: string;
  sick_leave_limit?: number;
  earned_leave_limit?: number;
  casual_leave_limit?: number;
  max_paid_casual_leaves_per_month?: number;
  task_priority_points?: any;
  delay_penalties?: any;
  early_completion_multiplier?: number;
  quality_multipliers?: any;
  attendance_points?: any;
  attendance_bonus_threshold?: number;
  attendance_bonus_percentage?: number;
  performance_incentive_pool_percentage?: number;
}

export interface Attendance {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  user_reward_points?: number;
  company_id: string;
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
  raw_password?: string;
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
}

export interface CreateTaskRequest {
  work_description: string;
  assigned_to?: string;
  assigned_to_list?: string[];
  priority: string;
  deadline: string;
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
