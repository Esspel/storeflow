import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─── Core Types ────────────────────────────────────────────────────────────

export type UserRole = "admin" | "manager" | "employee";
export type HierarchyLevel = "admin" | "hk" | "forening" | "distrikt" | "chef" | "anvandare";

export interface AppUser {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  hierarchy_level: HierarchyLevel;
  role_manually_set: boolean;
  employee_group: string;
  store_id: string | null;
  active_store_id: string | null;
  forening_id: string | null;
  distrikt_id: string | null;
  is_active: boolean;
  must_change_password: boolean;
  last_login: string | null;
  created_at: string;
  quick_pin_hash?: string | null;
  barcode_id?: string | null;
}

export interface Store {
  id: string;
  name: string;
  city: string;
  region: string;
  address: string;
  phone: string;
  email: string;
  is_active: boolean;
  sap_store_number?: string;
  created_at: string;
  updated_at: string;
  // Enterprise fields
  butiks_nr?: string;
  site_id?: string;
  bolag?: string;
  forening_id?: string | null;
  distrikt_id?: string | null;
  koncept?: string;
  kommentar?: string;
  butik_enhet?: string;
  foretag?: string;
  enhet?: string;
  organisationsnummer?: string;
  franchise?: string;
  gatuadress?: string;
  postnr?: string;
  postadress?: string;
  email_sm_chef?: string;
  butikschef?: string;
  bc_telefon?: string;
  mobil?: string;
  direktor_forsaljning?: string;
  forsaljningschef?: string;
  marknadsomrade?: string;
  distriktschef?: string;
  distrikt_name?: string;
  k_stalle?: string;
  namn2?: string;
  gamla_butiksnummer?: string;
  saljplan?: string;
  sak_kval_samordnare?: string;
  kommun?: string;
  hr_generalist?: string;
  bemanningsspecialist?: string;
  // Relations
  foreningar?: Forening;
  distrikt?: Distrikt;
}

export interface Forening {
  id: string;
  name: string;
  short_code: string;
  region: string;
  contact_email: string;
  is_active: boolean;
  created_at: string;
}

export interface Distrikt {
  id: string;
  name: string;
  forening_id: string | null;
  distriktschef_name: string;
  is_active: boolean;
  created_at: string;
  foreningar?: Forening;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  category: string;
  store_id: string | null;
  assigned_to: string | null;
  created_by: string | null;
  priority: "Låg" | "Medel" | "Hög" | "Kritisk";
  status: "todo" | "progress" | "done" | "late";
  due_date: string | null;
  recurring: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  template_task_id?: string | null;
  app_users?: { display_name: string } | null;
  stores?: { name: string } | null;
  task_steps?: TaskStep[];
  task_assignees?: { user_id: string; app_users?: { display_name: string } }[];
}

export interface TaskStep {
  id: string;
  task_id: string;
  label: string;
  is_done: boolean;
  requires_photo: boolean;
  sort_order: number;
  step_id?: string | null;
}

export interface TaskQuestion {
  id: string;
  task_id: string;
  question_text: string;
  question_type: "yes_no" | "text";
  answer: string | null;
  sort_order: number;
}

export interface Incident {
  id: string;
  ref_number: string;
  title: string;
  description: string;
  category: string;
  priority: "Låg" | "Medel" | "Hög" | "Kritisk";
  status: "open" | "in_progress" | "escalated" | "resolved" | "closed";
  store_id: string | null;
  reported_by: string | null;
  assigned_to: string | null;
  sla_deadline: string | null;
  resolved_at: string | null;
  source?: string;
  responsible_group_id?: string | null;
  created_at: string;
  updated_at: string;
  app_users?: { display_name: string } | null;
  stores?: { name: string } | null;
}

export interface ChecklistTemplate {
  id: string;
  title: string;
  description: string;
  category: string;
  created_by: string | null;
  is_global: boolean;
  is_frozen: boolean;
  is_system_locked: boolean;
  is_store_specific: boolean;
  hierarchy_scope: string;
  forening_id: string | null;
  distrikt_id: string | null;
  created_at: string;
  updated_at: string;
  checklist_template_items?: TemplateItem[];
}

export interface TemplateItem {
  id: string;
  template_id: string;
  label: string;
  requires_photo: boolean;
  sort_order: number;
  question_type?: "yes_no" | "text" | null;
}

export interface ScheduleShift {
  id: string;
  store_id: string | null;
  import_id: string | null;
  employee_id: string | null;
  date: string;
  start_time: string;
  end_time: string;
  is_lended: boolean;
  is_borrowed: boolean;
  break_start?: string | null;
  break_end?: string | null;
  created_at: string;
  schedule_employees?: { name: string; employee_number?: string };
}

export interface ScheduleEmployee {
  id: string;
  import_id: string;
  store_id: string | null;
  name: string;
  employee_number?: string;
  created_at: string;
}

export interface ScheduleImport {
  id: string;
  store_id: string | null;
  import_date: string;
  file_name: string;
  created_at: string;
}

export interface EmployeeMapping {
  id: string;
  store_id: string;
  schedule_employee_id: string;
  app_user_id: string;
  created_at: string;
  schedule_employees?: ScheduleEmployee;
  app_users?: { display_name: string };
}

export interface DeliveryPlan {
  id: string;
  store_id: string | null;
  delivery_date: string;
  week_number?: number | null;
  year?: number | null;
  is_special_week: boolean;
  is_default_template: boolean;
  holiday_name?: string;
  notes?: string;
  created_at: string;
  delivery_items?: DeliveryItem[];
}

export interface DeliveryItem {
  id: string;
  plan_id: string;
  article_name: string;
  quantity: number;
  unit: string;
  scheduled_time?: string | null;
  created_at: string;
}

export interface KundrundaSession {
  id: string;
  store_id: string;
  conducted_by: string | null;
  started_at: string;
  completed_at: string | null;
  status: "in_progress" | "completed";
  total_score: number;
  max_score: number;
  created_at: string;
  stores?: { name: string };
  app_users?: { display_name: string };
}

export interface KundrundaZone {
  id: string;
  name: string;
  sort_order: number;
  icon?: string | null;
  kundrunda_checkpoints?: KundrundaCheckpoint[];
}

export interface KundrundaCheckpoint {
  id: string;
  zone_id: string;
  title: string;
  description: string;
  reference_photo_url?: string | null;
  sort_order: number;
  hierarchy_scope?: string;
  forening_id?: string | null;
}

export interface KundrundaResponse {
  id: string;
  session_id: string;
  checkpoint_id: string;
  result: "ok" | "avvikelse" | null;
  defect_description?: string | null;
  action_taken?: string | null;
  responsible_user_id?: string | null;
  created_task_id?: string | null;
  created_at: string;
}

export interface Meeting {
  id: string;
  meeting_type: "ledningsgrupp" | "saljledare" | "daglig_styrning" | "veckostamning";
  title: string;
  store_id: string | null;
  scheduled_at: string;
  started_at: string | null;
  ended_at: string | null;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  moderator_id: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  meeting_agenda_items?: MeetingAgendaItem[];
  stores?: { name: string };
}

export interface MeetingAgendaItem {
  id: string;
  meeting_id: string;
  title: string;
  description: string;
  duration_minutes: number;
  sort_order: number;
  started_at: string | null;
  completed_at: string | null;
}

export interface UserGroup {
  id: string;
  name: string;
  store_id: string;
  display_name: string;
  created_at: string;
  user_group_members?: { user_id: string; app_users?: { display_name: string } }[];
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  link?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface PushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  subscription_json: object;
  user_agent: string;
  created_at: string;
}

// ─── Session helpers ────────────────────────────────────────────────────────

export function getSessionToken(): string | null {
  return localStorage.getItem("session_token");
}

export function setSessionToken(token: string) {
  localStorage.setItem("session_token", token);
}

export function clearSessionToken() {
  localStorage.removeItem("session_token");
  localStorage.removeItem("current_user");
}

export function getCurrentUser(): AppUser | null {
  const raw = localStorage.getItem("current_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AppUser;
  } catch {
    return null;
  }
}

export function setCurrentUser(user: AppUser) {
  localStorage.setItem("current_user", JSON.stringify(user));
}

// Supabase client configured with session token header
export function getAuthHeaders(): Record<string, string> {
  const token = getSessionToken();
  if (!token) return {};
  return { "x-session-token": token };
}

// ─── DB helpers with session header ─────────────────────────────────────────

export async function dbSelect<T>(
  table: string,
  query: (q: ReturnType<typeof supabase.from>) => Promise<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const token = getSessionToken();
  if (token) {
    supabase.functions.setAuth(token);
  }
  const result = await query(supabase.from(table));
  if (result.error) throw result.error;
  return result.data ?? [];
}

// Edge function URL helper
export function edgeFnUrl(name: string): string {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`;
}

export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;
