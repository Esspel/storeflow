import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Mutable session token used to stamp every PostgREST request header
let _sessionToken: string | null = null;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (url, options = {}) => {
      const headers = new Headers((options.headers as HeadersInit) ?? {});
      if (_sessionToken) headers.set("x-session-token", _sessionToken);
      return fetch(url, { ...options, headers });
    },
  },
});

// Call after login / on session restore so RLS policies can validate the caller
export function setSessionToken(token: string | null) {
  _sessionToken = token;
}

export type AppUser = {
  id: string;
  username: string;
  display_name: string;
  role: "admin" | "manager" | "employee";
  store_id: string | null;
  active_store_id: string | null;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
};

export type Store = {
  id: string;
  name: string;
  city: string;
  region: string;
  address: string;
  phone: string;
  email: string;
  is_active: boolean;
  created_at: string;
};

export type UserStore = {
  id: string;
  user_id: string;
  store_id: string;
  is_primary: boolean;
  created_at: string;
  store?: Store;
};

export type Task = {
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
  recurrence_rule: string | null;
  recurrence_days: number[] | null;
  recurrence_interval: number | null;
  recurrence_start: string | null;
  recurrence_end: string | null;
  parent_task_id: string | null;
  completed_at: string | null;
  created_at: string;
  store?: Store;
  assignee?: AppUser;
  steps?: TaskStep[];
};

export type TaskStep = {
  id: string;
  task_id: string;
  label: string;
  is_done: boolean;
  requires_photo: boolean;
  sort_order: number;
};

export type Incident = {
  id: string;
  ref_number: string;
  title: string;
  description: string;
  category: string;
  store_id: string | null;
  reported_by: string | null;
  assigned_to: string | null;
  priority: "Låg" | "Medel" | "Hög" | "Kritisk";
  status: "open" | "in_progress" | "escalated" | "resolved" | "closed";
  sla_deadline: string | null;
  resolved_at: string | null;
  has_photo: boolean;
  created_at: string;
  store?: Store;
  reporter?: AppUser;
  comments?: IncidentComment[];
  images?: IncidentImage[];
};

export type IncidentComment = {
  id: string;
  incident_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author?: AppUser;
};

export type IncidentImage = {
  id: string;
  incident_id: string;
  storage_path: string;
  uploaded_by: string | null;
  created_at: string;
};

export type ChecklistTemplate = {
  id: string;
  title: string;
  description: string;
  category: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  items?: ChecklistTemplateItem[];
  stores?: Store[];
};

export type ChecklistTemplateItem = {
  id: string;
  template_id: string;
  label: string;
  requires_photo: boolean;
  sort_order: number;
};

export type Notification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  link: string;
  is_read: boolean;
  created_at: string;
};

export type AuditLog = {
  id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  actor?: AppUser;
};

// Helper: write an audit log entry (fire-and-forget)
export function logAudit(
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  meta: Record<string, unknown> = {},
) {
  supabase
    .from("audit_log")
    .insert({ actor_id: actorId, action, entity, entity_id: entityId, meta })
    .then(() => {});
}

// Helper: create a notification
export function createNotification(
  userId: string,
  type: string,
  title: string,
  body = "",
  link = "",
) {
  supabase
    .from("notifications")
    .insert({ user_id: userId, type, title, body, link })
    .then(() => {});
}
