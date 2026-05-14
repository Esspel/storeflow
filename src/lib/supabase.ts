import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type AppUser = {
  id: string;
  username: string;
  display_name: string;
  role: "admin" | "manager" | "employee";
  store_id: string | null;
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
};
