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
  role_manually_set: boolean;
  employee_group: string;
  store_id: string | null;
  active_store_id: string | null;
  is_active: boolean;
  must_change_password: boolean;
  last_login: string | null;
  created_at: string;
  // Enterprise hierarchy
  hierarchy_level?: "admin" | "hk" | "forening" | "distrikt" | "chef" | "anvandare";
  forening_id?: string | null;
  distrikt_id?: string | null;
};

export const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Chef",
  employee: "Anställd",
};

export const HIERARCHY_LABELS: Record<string, string> = {
  admin: "Admin",
  hk: "Huvudkontor",
  forening: "Förening",
  distrikt: "Distrikt",
  chef: "Butikschef",
  anvandare: "Användare",
};

export type Forening = {
  id: string;
  name: string;
  short_code: string;
  created_at: string;
};

export type Distrikt = {
  id: string;
  forening_id: string;
  name: string;
  created_at: string;
  forening?: Forening;
};

export type Store = {
  id: string;
  name: string;
  city: string;
  region: string;
  region_id: string | null;
  address: string;
  phone: string;
  email: string;
  is_active: boolean;
  sap_site_id: string | null;
  created_at: string;
  // Enterprise hierarchy
  forening_id?: string | null;
  distrikt_id?: string | null;
  forening?: Forening;
  distrikt?: Distrikt;
  // CSV store directory fields (all 32 columns)
  butiks_nr?: string | null;
  bolag?: string | null;
  koncept?: string | null;
  kommentar?: string | null;
  butik_enhet?: string | null;
  foretag?: string | null;
  enhet?: string | null;
  organisationsnummer?: string | null;
  franchise?: boolean;
  gatuadress?: string | null;
  postnr?: string | null;
  postadress?: string | null;
  email_sm_chef?: string | null;
  butikschef?: string | null;
  telefon_butik?: string | null;
  bc_telefon?: string | null;
  mobil?: string | null;
  direktor_forsaljning?: string | null;
  forsaljningschef?: string | null;
  marknadsomrade?: string | null;
  distriktschef?: string | null;
  distrikt_namn?: string | null;
  k_stalle?: string | null;
  namn2?: string | null;
  gamla_butiksnummer?: string | null;
  saljplan?: string | null;
  sak_kval_samordnare?: string | null;
  kommun?: string | null;
  hr_generalist?: string | null;
  bemanningsspecialist?: string | null;
  site_id?: string | null;
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
  status: "todo" | "progress" | "done" | "late" | "cancelled";
  due_date: string | null;
  recurring: string | null;
  recurrence_rule: string | null;
  recurrence_days: number[] | null;
  recurrence_interval: number | null;
  recurrence_start: string | null;
  recurrence_end: string | null;
  parent_task_id: string | null;
  last_spawned_at: string | null;
  recurrence_period_start: string | null;
  completed_at: string | null;
  sap_article_id: string | null;
  created_at: string;
  store?: Store;
  assignee?: AppUser;
  steps?: TaskStep[];
  questions?: TaskQuestion[];
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
  responsible_user_id: string | null;
  responsible_group_id: string | null;
  priority: "Låg" | "Medel" | "Hög" | "Kritisk";
  status: "open" | "in_progress" | "escalated" | "resolved" | "closed";
  sla_deadline: string | null;
  resolved_at: string | null;
  has_photo: boolean;
  sap_article_id: string | null;
  source: string | null;
  created_at: string;
  store?: Store;
  reporter?: AppUser;
  responsible?: AppUser;
  responsible_group?: UserGroup;
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
  priority: string;
  recurrence_rule: string | null;
  recurrence_days: number[] | null;
  recurrence_interval: number | null;
  due_date_offset: number | null;
  created_by: string | null;
  is_global: boolean;
  locked_by_admin: boolean;
  is_system_locked?: boolean;
  hierarchy_scope?: "store" | "hk" | "forening" | null;
  forening_id?: string | null;
  distrikt_id?: string | null;
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

export type ChecklistTemplateQuestion = {
  id: string;
  template_id: string;
  label: string;
  question_type: "text" | "yes_no";
  is_required: boolean;
  sort_order: number;
};

export type TaskQuestion = {
  id: string;
  task_id: string;
  label: string;
  answer: string;
  question_type: "text" | "yes_no";
  is_required: boolean;
  sort_order: number;
  answered_by: string | null;
  answered_at: string | null;
  created_at: string;
};

export type TaskQuestionAnswer = {
  id: string;
  task_question_id: string;
  task_id: string;
  answer: string;
  answered_by: string | null;
  created_at: string;
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

export type UserGroup = {
  id: string;
  name: string;
  store_id: string | null;
  created_at: string;
  members?: UserGroupMember[];
};

export type UserGroupMember = {
  id: string;
  group_id: string;
  user_id: string;
  created_at: string;
  user?: AppUser;
};

export type TaskAssignee = {
  id: string;
  task_id: string;
  user_id: string | null;
  group_id: string | null;
  created_at: string;
  user?: AppUser;
  group?: UserGroup;
};

export type TaskImage = {
  id: string;
  task_id: string;
  step_id: string | null;
  storage_path: string;
  uploaded_by: string | null;
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

const PUSH_EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-push`;
const PUSH_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function firePush(userIds: string[], title: string, body: string, url: string) {
  if (!userIds.length) return;
  fetch(PUSH_EDGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${PUSH_ANON_KEY}` },
    body: JSON.stringify({ user_ids: userIds, title, body, url }),
  })
    .then(async (res) => {
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        console.error("firePush failed:", res.status, json);
      } else if (json?.errors?.length) {
        console.warn("firePush partial errors:", json.errors);
      }
    })
    .catch((err) => console.error("firePush network error:", err));
}

// Helper: create a notification
export function createNotification(
  userId: string,
  type: string,
  title: string,
  body = "",
  link = "",
) {
  supabase.from("notifications").insert({ user_id: userId, type, title, body, link }).then(() => {});
  firePush([userId], title, body, link || "/");
}

// Helper: notify multiple users
export function notifyUsers(
  userIds: string[],
  type: string,
  title: string,
  body = "",
  link = "",
) {
  if (userIds.length === 0) return;
  const rows = userIds.map((uid) => ({ user_id: uid, type, title, body, link }));
  supabase.from("notifications").insert(rows).then(() => {});
  firePush(userIds, title, body, link || "/");
}

// Helper: get public URL for a storage path
export function getPublicUrl(path: string) {
  return supabase.storage.from("attachments").getPublicUrl(path).data.publicUrl;
}

// Helper: delete old notifications (>3 days) for a user
export async function cleanOldNotifications(userId: string) {
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from("notifications").delete().eq("user_id", userId).lt("created_at", cutoff);
}

// Compress an image and strip all EXIF metadata before uploading.
// Drawing through canvas discards GPS, camera model, and timestamp metadata —
// only raw pixel data is written to the output JPEG. Resizes to max 1920px.
// Non-image files are returned unchanged.
export async function compressImage(file: File, maxPx = 1920, quality = 0.82): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        if (width >= height) { height = Math.round((height / width) * maxPx); width = maxPx; }
        else { width = Math.round((width / height) * maxPx); height = maxPx; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }) : file),
        "image/jpeg",
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

// Helper: upload file to attachments bucket (compresses images automatically)
export async function uploadAttachment(file: File, folder: string): Promise<string | null> {
  const toUpload = await compressImage(file);
  const ext = toUpload.name.split(".").pop() ?? "bin";
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("attachments").upload(path, toUpload);
  if (error) return null;
  return path;
}

// Helper: remove storage files for a list of paths (fire-and-forget, best-effort)
export function deleteStorageFiles(paths: string[]) {
  if (paths.length === 0) return;
  supabase.storage.from("attachments").remove(paths).then(() => {});
}

export type KundrundaZone = {
  id: string;
  name: string;
  sort_order: number;
  icon: string | null;
  created_at: string;
  checkpoints?: KundrundaCheckpoint[];
};

export type KundrundaCheckpoint = {
  id: string;
  zone_id: string;
  label: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  images?: KundrundaCheckpointImage[];
};

export type KundrundaCheckpointImage = {
  id: string;
  checkpoint_id: string;
  storage_path: string;
  uploaded_by: string | null;
  created_at: string;
};

export type KundrundaCommonDefect = {
  id: string;
  store_id: string | null;
  checkpoint_id: string | null;
  label: string;
  sort_order: number;
  created_at: string;
  checkpoint_ids?: string[];
};

export type KundrundaSession = {
  id: string;
  store_id: string | null;
  conducted_by: string | null;
  started_at: string;
  completed_at: string | null;
  status: "in_progress" | "completed";
  total_score: number;
  max_score: number;
  created_at: string;
  store?: Store;
  conductor?: AppUser;
  responses?: KundrundaResponse[];
};

export type KundrundaResponse = {
  id: string;
  session_id: string;
  checkpoint_id: string;
  zone_id: string;
  result: "ok" | "avvikelse" | null;
  defect_description: string | null;
  action_taken: string | null;
  responsible_user_id: string | null;
  sap_article_id: string | null;
  created_task_id: string | null;
  incident_id: string | null;
  created_at: string;
  images?: KundrundaResponseImage[];
};

export type KundrundaResponseImage = {
  id: string;
  response_id: string;
  session_id: string;
  storage_path: string;
  uploaded_by: string | null;
  created_at: string;
};

export type MeetingType = {
  id: string;
  value: string;
  label: string;
  description: string;
  default_duration_min: number;
  default_agenda: { title: string; duration: number }[];
  sort_order: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
};

export type CommonDefect = {
  id: string;
  store_id: string | null;
  label: string;
  sort_order: number;
  checkpoint_ids: string[];
  created_at: string;
};

export type CustomerRequest = {
  id: string;
  store_id: string;
  product_name: string;
  article_number: string | null;
  notes: string | null;
  requested_by: string | null;
  status: "open" | "ordered" | "declined" | "fulfilled";
  priority: "low" | "normal" | "high";
  created_at: string;
  requester?: { display_name: string };
  store?: { name: string };
};

export type Meeting = {
  id: string;
  meeting_type: string;
  title: string;
  store_id: string | null;
  scheduled_at: string;
  started_at: string | null;
  ended_at: string | null;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  moderator_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  store?: Store;
  moderator?: AppUser;
  agenda_items?: MeetingAgendaItem[];
  decisions?: MeetingDecision[];
};

export type MeetingAgendaItem = {
  id: string;
  meeting_id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  sort_order: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type MeetingDecision = {
  id: string;
  meeting_id: string;
  description: string;
  responsible_user_id: string | null;
  due_date: string | null;
  created_task_id: string | null;
  created_by: string | null;
  created_at: string;
  responsible?: AppUser;
};

// Retry wrapper for transient network errors — waits 2^attempt * 200ms between retries
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 200));
      }
    }
  }
  throw lastError;
}

// Helper: build a Mitt Coop deep-link for an SAP article
// Returns null if either ID is missing
export function mittCoopUrl(sapArticleId: string | null | undefined, sapSiteId: string | null | undefined): string | null {
  if (!sapArticleId?.trim() || !sapSiteId?.trim()) return null;
  return `https://mittcoop.coop.se/sortiment/articles/${sapArticleId.trim()}?siteId=${sapSiteId.trim()}`;
}
