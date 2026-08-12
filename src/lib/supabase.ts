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
  barcode_id?: string | null;
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
  due_date_time: string | null;
  recurring: string | null;
  recurrence_rule: string | null;
  recurrence_days: number[] | null;
  recurrence_interval: number | null;
  recurrence_start: string | null;
  recurrence_end: string | null;
  parent_task_id: string | null;
  last_spawned_at: string | null;
  recurrence_period_start: string | null;
  deleted_periods: string[] | null;
  completed_at: string | null;
  sap_article_id: string | null;
  // Sub-task / process fields
  completion_mode: "manual" | "auto_from_children" | "auto_complete_children";
  sub_task_order: number | null;
  process_id: string | null;
  process_instance_id: string | null;
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
  condition_question_id?: string | null;
  condition_answer?: string | null;
  link_url?: string | null;
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
  recurrence_months?: number[] | null;
  recurrence_month_day?: number | null;
  recurrence_start?: string | null;
  recurrence_end?: string | null;
  due_date_offset: number | null;
  due_date_time: string | null;
  time_slots?: string[] | null;
  // Ownership & status
  status: "active" | "review" | "deprecated" | "archived";
  version: number;
  owner_id: string | null;
  updated_by: string | null;
  created_by: string | null;
  // Hierarchy
  is_global: boolean;
  locked_by_admin: boolean;
  is_system_locked?: boolean;
  hierarchy_scope?: "store" | "hk" | "forening" | null;
  forening_id?: string | null;
  distrikt_id?: string | null;
  // Inheritance
  parent_template_id?: string | null;
  inherit_mode?: "copy" | "variant" | null;
  hidden_step_ids?: string[] | null;
  overridden_steps?: Array<{ parent_step_id: string; label: string; requires_photo: boolean }> | null;
  created_at: string;
  updated_at: string;
  items?: ChecklistTemplateItem[];
  stores?: Store[];
};

export type TemplateVersion = {
  id: string;
  template_id: string;
  version: number;
  snapshot: ChecklistTemplate & { items?: ChecklistTemplateItem[]; questions?: ChecklistTemplateQuestion[] };
  change_summary: string;
  saved_by: string | null;
  saved_at: string;
  saver?: AppUser;
};

export type TemplatePackage = {
  id: string;
  name: string;
  description: string;
  store_id: string | null;
  created_by: string | null;
  created_at: string;
  items?: TemplatePackageItem[];
};

export type TemplatePackageItem = {
  id: string;
  package_id: string;
  template_id: string;
  sort_order: number;
};

export type ChecklistTemplateItem = {
  id: string;
  template_id: string;
  label: string;
  requires_photo: boolean;
  sort_order: number;
  condition_question_id?: string | null;
  condition_answer?: string | null;
  link_url?: string | null;
};

export type ChecklistTemplateQuestion = {
  id: string;
  template_id: string;
  label: string;
  question_type: "text" | "yes_no";
  is_required: boolean;
  sort_order: number;
  link_url?: string | null;
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
  link_url?: string | null;
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

// Offline queue integration
import { enqueue, getQueueLength } from "@/lib/offline-queue";

export function getOfflineQueueLength(): number {
  return getQueueLength();
}

export async function mutateWithQueue<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const isNetwork = /failed to fetch|network|timeout/i.test(String(err));
    if (isNetwork && typeof navigator !== "undefined" && !navigator.onLine) {
      enqueue({
        fn: fn.name || "anonymous",
        args: {},
        timestamp: Date.now(),
        retryCount: 0,
      });
      throw new Error("offline-queued");
    }
    throw err;
  }
}

export function errorToSwedish(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/jwt expired|token.*expired|401/i.test(msg)) {
    return "Inloggning utgången – logga in igen";
  }
  if (/failed to fetch|network|timeout|offline/i.test(msg)) {
    return "Ingen internetuppkoppling – sparas offline";
  }
  if (/500|502|503|504|server/i.test(msg)) {
    return "Servern svarar inte – försök om en minut";
  }
  return msg || "Något gick fel – försök igen";
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

// Validate a file's true MIME type by inspecting its magic bytes.
// Returns the detected MIME or null if the signature is not one of the allowed types.
// Allowed: image/jpeg, image/png, image/webp
export async function detectImageMimeFromBytes(file: File): Promise<"image/jpeg" | "image/png" | "image/webp" | null> {
  const header = await file.slice(0, 12).arrayBuffer();
  const bytes = new Uint8Array(header);

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";

  // WebP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";

  return null;
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

// Helper: upload file to attachments bucket.
// For image uploads, validates the true MIME type via magic bytes (JPEG/PNG/WebP only),
// compresses, and strips all EXIF metadata before sending to storage.
// Returns null if the file is rejected or the upload fails.
export async function uploadAttachment(file: File, folder: string): Promise<string | null> {
  if (file.type.startsWith("image/")) {
    const detectedMime = await detectImageMimeFromBytes(file);
    if (!detectedMime) return null; // Reject files whose bytes don't match an allowed image type
  }
  let toUpload: File;
  try {
    toUpload = await compressImage(file);
  } catch {
    toUpload = file;
  }
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
  version: number;
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

// Retry wrapper for transient network errors — waits 2^attempt * 200ms between retries

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
  internal_notes: string | null;
  staff_comment: string | null;
  source: string | null;
  requested_by: string | null;
  status: "open" | "ordered" | "declined" | "fulfilled" | "not_in_assortment" | "discontinued";
  priority: "low" | "normal" | "high";
  mitt_coop_category_id: number | null;
  mitt_coop_status_code: number | null;
  created_at: string;
  requester?: { display_name: string };
  store?: { name: string };
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

// Mitt Coop article status codes
export const MITT_COOP_STATUS_CODES: { code: number; label: string }[] = [
  { code: 2, label: "Kommande" },
  { code: 3, label: "Aktiv" },
  { code: 4, label: "Brist" },
  { code: 5, label: "Ska utgå" },
  { code: 6, label: "Har utgått" },
  { code: 7, label: "Produktspärr" },
  { code: 8, label: "Slut säsong" },
  { code: 9, label: "Långtidsrestad" },
  { code: 10, label: "Orderblock" },
  { code: 13, label: "Tidig förhands" },
];

// Mitt Coop product categories
export const MITT_COOP_CATEGORIES: { id: number; label: string }[] = [
  { id: 1000, label: "FRUKT & BÄR" },
  { id: 1001, label: "GRÖNSAKER" },
  { id: 1101, label: "MATBRÖD MJUKT FÄRSKT" },
  { id: 1102, label: "HÅRT BRÖD & MATKEX" },
  { id: 1103, label: "FIKABRÖD KOLONIALT" },
  { id: 1104, label: "BUTIKSBAKAT FRYST" },
  { id: 1105, label: "BUTIKSBAKAT FÄRSKT" },
  { id: 1106, label: "MATBRÖD MJUKT TINA & SÄLJ" },
  { id: 1107, label: "MATBRÖD MJUKT KOLONIAL" },
  { id: 1108, label: "FIKABRÖD TINA & SÄLJ" },
  { id: 1109, label: "FIKABRÖD FÄRSKT" },
  { id: 1110, label: "MATCHARK" },
  { id: 1111, label: "MANUELL CHARK" },
  { id: 1112, label: "PÅLÄGGSCHARK" },
  { id: 1113, label: "DELI KONSUMENTPACK" },
  { id: 1120, label: "MATOST" },
  { id: 1121, label: "PÅLÄGGSOST" },
  { id: 1122, label: "MANUELL OST" },
  { id: 1123, label: "DESSERTOST" },
  { id: 1130, label: "FISK & SKALDJURSKONSERV KYLD" },
  { id: 1131, label: "FISK & SKALDJUR PACKAD FÄRSK" },
  { id: 1132, label: "MANUELL FISK & SKALDJUR" },
  { id: 1140, label: "MANUELL BUTIKSGRILLAD" },
  { id: 1141, label: "FÄRDIGLAGAD MAT & TILLBEHÖR" },
  { id: 1142, label: "TILLBEHÖR SALLADER" },
  { id: 1143, label: "MANUELL FÄRDIGMAT" },
  { id: 1144, label: "VEGETARISKA PROTEINER" },
  { id: 1150, label: "KÖTT FÄRSKT MANUELL" },
  { id: 1151, label: "KÖTT FÄRSKT KPK" },
  { id: 1152, label: "FÅGEL FÄRSK" },
  { id: 1153, label: "KÖTTRÅVAROR" },
  { id: 1160, label: "SMÅMÅL MEJERI" },
  { id: 1161, label: "VEG. MEJERI KYLT" },
  { id: 1162, label: "MATFETT" },
  { id: 1163, label: "ÄGG" },
  { id: 1164, label: "MEJERI – MJÖLK" },
  { id: 1165, label: "JUICE & FRUKTDRYCK KYLD" },
  { id: 1166, label: "MEJERI – LAKTOSFRITT" },
  { id: 1167, label: "VEG. MEJERI OKYLT" },
  { id: 1168, label: "MEJERI – MATLAGNING" },
  { id: 1169, label: "MEJERI – FRUKOST" },
  { id: 1201, label: "FRYST FRUKT & BÄR" },
  { id: 1202, label: "FRYST GRÖNSAKER" },
  { id: 1210, label: "FRYST BRÖD" },
  { id: 1211, label: "FRYST DESSERT" },
  { id: 1212, label: "FRYST FÄRDIGLAGAT" },
  { id: 1213, label: "FRYST POTATIS" },
  { id: 1214, label: "FRYST VEGETARISK" },
  { id: 1215, label: "GLASS" },
  { id: 1216, label: "MATÖVERKÄNSLIGHET DJUPFRYST" },
  { id: 1220, label: "FRYST FISK & SKALDJUR" },
  { id: 1221, label: "FRYST FÅGEL" },
  { id: 1222, label: "FRYST KÖTT" },
  { id: 1310, label: "GODIS" },
  { id: 1311, label: "LÖSGODIS" },
  { id: 1312, label: "SNACKS" },
  { id: 1313, label: "NATURGODIS LÖSVIKT" },
  { id: 1320, label: "KRYDDOR" },
  { id: 1321, label: "OLJA & VINÄGER" },
  { id: 1322, label: "SMAKSÄTTARE" },
  { id: 1330, label: "GRÖNSAKSKONSERVER" },
  { id: 1331, label: "MELLANMÅL & EFTERRÄTTER" },
  { id: 1332, label: "PASTA, RIS & MOS" },
  { id: 1333, label: "FÄRDIGMAT & FISKKONSERVER" },
  { id: 1334, label: "BAKNING" },
  { id: 1335, label: "MATÖVERKÄNSLIGHET TORR" },
  { id: 1336, label: "TLLBH BUTIKSTILLAGAT" },
  { id: 1337, label: "VÄRLDENS MAT" },
  { id: 1350, label: "FLINGOR, GRYN & VÄLLING" },
  { id: 1351, label: "SYLT, MOS & MARMELAD" },
  { id: 1360, label: "ÖL, VIN & CIDER" },
  { id: 1361, label: "LÄSK & SAFT" },
  { id: 1362, label: "VATTEN" },
  { id: 1363, label: "FUNKTIONSDRYCKER" },
  { id: 1364, label: "JUICE & FRUKTDRYCK OKYLD" },
  { id: 1370, label: "BARNMAT, MELLANMÅL & DRYCK" },
  { id: 1371, label: "BARNVÄLLING, GRÖT & ERSÄTTNING" },
  { id: 1380, label: "KAFFE" },
  { id: 1381, label: "TE & CHOKLAD" },
  { id: 1400, label: "FÖRBUTIK & CAFE 12% moms" },
  { id: 1401, label: "RESTAURANG 25% moms" },
  { id: 1402, label: "TAKE AWAY 12% moms" },
  { id: 1410, label: "BUTIKSBAGERI" },
  { id: 2000, label: "TRÄDGÅRDSPLANTOR & VÄXTER" },
  { id: 2001, label: "BLOMMOR" },
  { id: 2002, label: "LÖKAR & FRÖER" },
  { id: 2010, label: "KRUKOR" },
  { id: 2011, label: "INOMHUS BLOMJORD & VÄXTNÄRING" },
  { id: 2100, label: "TIDSKRIFTER" },
  { id: 2101, label: "DAGSTIDNINGAR" },
  { id: 2110, label: "BÖCKER" },
  { id: 2111, label: "GRATTISKORT & PRESENTPAPPER" },
  { id: 2200, label: "CIGARETTER" },
  { id: 2201, label: "SNUS" },
  { id: 2202, label: "TOBAKSTILLBEHÖR" },
  { id: 2203, label: "TOBAKSFRIA NIK.PR" },
  { id: 2210, label: "PORTO" },
  { id: 2211, label: "TELE KONTANTKORT" },
  { id: 2212, label: "UPPLEVELSER & PRESENTKORT" },
  { id: 2213, label: "FÄRDBEVIS" },
  { id: 2214, label: "BÄRKASSAR" },
  { id: 2300, label: "LJUS" },
  { id: 2301, label: "SERVETTER & ENGÅNGSMATERIAL" },
  { id: 2310, label: "LJUSKÄLLOR" },
  { id: 2311, label: "BATTERIER & SÄKRINGAR" },
  { id: 2320, label: "MINIHEMMAFIXAREN" },
  { id: 2321, label: "GRILLKOL & VED" },
  { id: 2400, label: "TVÄTTMEDEL & SKÖLJMEDEL" },
  { id: 2401, label: "RENGÖRING" },
  { id: 2410, label: "HUSHÅLL & TOAPAPPER" },
  { id: 2411, label: "MATEMBALLAGE" },
  { id: 2520, label: "BLÖJOR" },
  { id: 2521, label: "BARNTILLBEHÖR" },
  { id: 2522, label: "BABYVÅRD" },
  { id: 2600, label: "HÄLSA" },
  { id: 2601, label: "RECEPTFRIA LÄKEMEDEL" },
  { id: 2602, label: "APOTEKSVAROR" },
  { id: 2610, label: "KROPPSVÅRD" },
  { id: 2611, label: "ANSIKTSVÅRD" },
  { id: 2612, label: "MUNVÅRD" },
  { id: 2613, label: "HÅRVÅRD" },
  { id: 2614, label: "INTIMHYGIEN" },
  { id: 2615, label: "RAKVÅRD" },
  { id: 2616, label: "MAKEUP & ACCESSOARER" },
  { id: 2700, label: "DJURMAT" },
  { id: 2701, label: "DJURTILLBEHÖR" },
  { id: 3000, label: "BYGG" },
  { id: 3100, label: "SKRIV & KONTOR" },
  { id: 3101, label: "HOBBY, SY & STICKA" },
  { id: 3110, label: "HEMTEXTIL" },
  { id: 3111, label: "INREDNING" },
  { id: 3112, label: "HÖGTIDER & FEST" },
  { id: 3120, label: "STÄDA, TVÄTT & STRYK" },
  { id: 3130, label: "MUSIK" },
  { id: 3131, label: "FILM" },
  { id: 3200, label: "MATFÖRVARING" },
  { id: 3201, label: "KOK & STEKKÄRL" },
  { id: 3202, label: "KÖKSREDSKAP" },
  { id: 3210, label: "DUKNING" },
  { id: 3211, label: "KÖKSTEXTIL" },
  { id: 3300, label: "EL - STÄDA" },
  { id: 3301, label: "EL - SKÖNHET" },
  { id: 3302, label: "EL - KÖKSMASKINER" },
  { id: 3400, label: "UNDERKLÄDER & STRUMPOR" },
  { id: 3401, label: "JEANS" },
  { id: 3402, label: "KLÄDER" },
  { id: 3403, label: "SKOR" },
  { id: 3404, label: "BARNUNDERKLÄDER & STRUMPOR" },
  { id: 3500, label: "VÄSKOR" },
  { id: 3501, label: "CYKLAR" },
  { id: 3502, label: "ÖVRIG SPECIAL" },
  { id: 3510, label: "TRÄDGÅRDSMÖBLER" },
  { id: 3511, label: "UTOMHUSJORD & BEKÄMPNING" },
  { id: 3512, label: "REDSKAP" },
  { id: 3513, label: "GRILLAR & TILLBEHÖR" },
  { id: 3800, label: "LEGO" },
  { id: 3801, label: "LEKSAKER" },
  { id: 3802, label: "SPORT" },
  { id: 3810, label: "BARNRUMMET" },
  { id: 3811, label: "BARNSKÖTSEL" },
];

export type ArticleIdType = "mat-nr" | "ean" | "bnr";

// Decode the stored article_number string into its type and raw value
export function decodeArticleNumber(stored: string | null | undefined): { type: ArticleIdType; value: string } | null {
  if (!stored?.trim()) return null;
  if (stored.startsWith("EAN:")) return { type: "ean", value: stored.slice(4) };
  if (stored.startsWith("BNR:")) return { type: "bnr", value: stored.slice(4) };
  return { type: "mat-nr", value: stored };
}

// Encode an article id with its type prefix for storage
export function encodeArticleNumber(value: string, type: ArticleIdType): string {
  if (type === "ean") return `EAN:${value.trim()}`;
  if (type === "bnr") return `BNR:${value.trim()}`;
  return value.trim();
}

export type MittCoopUrlOpts = {
  categoryId?: number | null;
  statusCode?: number | null;
};

// Helper: build a Mitt Coop product catalog deep-link for an article
// Returns null if either ID is missing
export function mittCoopUrl(
  sapArticleId: string | null | undefined,
  sapSiteId: string | null | undefined,
  opts?: MittCoopUrlOpts,
): string | null {
  if (!sapArticleId?.trim() || !sapSiteId?.trim()) return null;
  let url = `https://mittcoop.coop.se/sortiment/articles/${sapArticleId.trim()}?siteId=${sapSiteId.trim()}`;
  if (opts?.categoryId) url += `&categoryIds=${opts.categoryId}`;
  if (opts?.statusCode) url += `&statusCodes=${opts.statusCode}`;
  return url;
}

// Build a Mitt Coop search URL from a search term (EAN, BNR, free text)
export function mittCoopSearchUrl(
  search: string | null | undefined,
  sapSiteId: string | null | undefined,
  opts?: MittCoopUrlOpts,
): string | null {
  if (!search?.trim() || !sapSiteId?.trim()) return null;
  let url = `https://mittcoop.coop.se/sortiment/artiklar?siteId=${sapSiteId.trim()}&search=${encodeURIComponent(search.trim())}`;
  if (opts?.categoryId) url += `&categoryIds=${opts.categoryId}`;
  if (opts?.statusCode) url += `&statusCodes=${opts.statusCode}`;
  return url;
}

// Keep the old name as an alias so existing callers don't break
export const mittCoopEanUrl = mittCoopSearchUrl;

// Build the correct Mitt Coop URL from a stored article_number string
export function mittCoopUrlFromStored(
  stored: string | null | undefined,
  sapSiteId: string | null | undefined,
  opts?: MittCoopUrlOpts,
): string | null {
  const decoded = decodeArticleNumber(stored);
  if (!decoded) return null;
  if (decoded.type === "mat-nr") return mittCoopUrl(decoded.value, sapSiteId, opts);
  return mittCoopSearchUrl(decoded.value, sapSiteId, opts);
}

// Returns true if the value looks like an EAN (8 or 13 digits)
export function looksLikeEan(value: string): boolean {
  return /^\d{8}$|^\d{13}$/.test(value.trim());
}

export type ParsedMittCoopUrl = {
  article_number?: string;
  article_type?: ArticleIdType;
  product_name?: string;
};

// Parse a Mitt Coop URL (e.g. from sortiment) to extract article number, article type, and/or product name
export function parseMittCoopUrl(inputUrl: string): ParsedMittCoopUrl | null {
  if (!inputUrl || typeof inputUrl !== "string") return null;
  let cleanUrl = inputUrl.trim();
  if (!cleanUrl) return null;

  if (!/^https?:\/\//i.test(cleanUrl)) {
    cleanUrl = "https://" + cleanUrl;
  }

  try {
    const url = new URL(cleanUrl);
    const result: ParsedMittCoopUrl = {};

    const articleMatch = url.pathname.match(/(?:^|\/)articles\/([^\/]+)/i);
    if (articleMatch && articleMatch[1]) {
      const rawVal = decodeURIComponent(articleMatch[1]).trim();
      if (rawVal.toUpperCase().startsWith("EAN:")) {
        result.article_number = rawVal.slice(4).trim();
        result.article_type = "ean";
      } else if (rawVal.toUpperCase().startsWith("BNR:")) {
        result.article_number = rawVal.slice(4).trim();
        result.article_type = "bnr";
      } else {
        const digitsOnly = rawVal.replace(/\D/g, "");
        if (digitsOnly.length === 8 || digitsOnly.length === 13) {
          result.article_number = digitsOnly;
          result.article_type = "ean";
        } else if (digitsOnly.length > 0) {
          result.article_number = digitsOnly;
          result.article_type = "mat-nr";
        } else if (rawVal) {
          result.article_number = rawVal;
          result.article_type = "mat-nr";
        }
      }
    }

    const params = url.searchParams;
    const eanParam = params.get("ean");
    const bnrParam = params.get("bnr");
    const matnrParam = params.get("matnr") || params.get("articleId") || params.get("article_number") || params.get("article");
    const searchParam = params.get("search") || params.get("q") || params.get("query");
    const nameParam = params.get("name") || params.get("title") || params.get("product_name") || params.get("product") || params.get("productName");

    if (eanParam) {
      result.article_number = eanParam.replace(/\D/g, "");
      result.article_type = "ean";
    } else if (bnrParam) {
      result.article_number = bnrParam.replace(/\D/g, "");
      result.article_type = "bnr";
    } else if (matnrParam) {
      result.article_number = matnrParam.replace(/\D/g, "");
      result.article_type = "mat-nr";
    } else if (searchParam && !result.article_number) {
      const decodedSearch = decodeURIComponent(searchParam.replace(/\+/g, " ")).trim();
      const upper = decodedSearch.toUpperCase();
      if (upper.startsWith("BNR")) {
        result.article_number = upper.replace(/\D/g, "");
        result.article_type = "bnr";
      } else if (upper.startsWith("EAN")) {
        result.article_number = upper.replace(/\D/g, "");
        result.article_type = "ean";
      } else {
        const digitsOnly = decodedSearch.replace(/\D/g, "");
        if (/^\d+$/.test(decodedSearch)) {
          if (digitsOnly.length === 8 || digitsOnly.length === 13) {
            result.article_number = digitsOnly;
            result.article_type = "ean";
          } else {
            result.article_number = digitsOnly;
            result.article_type = "mat-nr";
          }
        } else if (decodedSearch) {
          if (!nameParam) {
            result.product_name = decodedSearch;
          }
        }
      }
    }

    if (nameParam) {
      result.product_name = decodeURIComponent(nameParam.replace(/\+/g, " ")).trim();
    }

    if (result.article_number || result.product_name) {
      return result;
    }
  } catch (err) {
    // Return null if invalid URL
  }
  return null;
}

export type SupportTicket = {
  id: string;
  user_id: string | null;
  store_id: string | null;
  app_version: string | null;
  user_agent: string | null;
  offline_queue_length: number;
  last_error: string | null;
  idb_usage: string | null;
  message: string | null;
  components: string[] | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
};

export type KundrundaAssignment = {
  id: string;
  store_id: string | null;
  week_start: string;
  day_of_week: number;
  assigned_user_id: string | null;
  created_by: string | null;
  created_at: string;
};

export async function insertSupportTicket(
  data: Omit<SupportTicket, "id" | "status" | "created_at" | "resolved_at">,
): Promise<void> {
  const { error } = await supabase.from("support_tickets").insert(data);
  if (error) throw error;
}

export async function upsertKundrundaAssignment(data: {
  store_id: string;
  week_start: string;
  day_of_week: number;
  assigned_user_id: string;
  created_by: string;
}): Promise<void> {
  const { error } = await supabase
    .from("kundrunda_assignments")
    .upsert(data, { onConflict: "store_id,week_start,day_of_week" });
  if (error) throw error;
}

export async function getKundrundaAssignmentsThisWeek(
  storeId: string,
  userId?: string,
): Promise<KundrundaAssignment[]> {
  const now = new Date();
  const day = now.getDay(); // 0=Sun .. 6=Sat
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  const weekStart = monday.toISOString().slice(0, 10);
  let q = supabase
    .from("kundrunda_assignments")
    .select("*")
    .eq("store_id", storeId)
    .eq("week_start", weekStart);
  if (userId) q = q.eq("assigned_user_id", userId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as KundrundaAssignment[];
}
