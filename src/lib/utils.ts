import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!dateStr) return "–";
  return new Intl.DateTimeFormat("sv-SE", opts ?? { dateStyle: "short" }).format(new Date(dateStr));
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "–";
  return new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "short" }).format(new Date(dateStr));
}

export function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function priorityColor(priority: string): string {
  switch (priority) {
    case "Kritisk": return "text-red-600 bg-red-50";
    case "Hög": return "text-orange-600 bg-orange-50";
    case "Medel": return "text-yellow-600 bg-yellow-50";
    case "Låg": return "text-green-600 bg-green-50";
    default: return "text-gray-600 bg-gray-50";
  }
}

export function statusColor(status: string): string {
  switch (status) {
    case "todo": return "text-gray-600 bg-gray-100";
    case "progress": return "text-blue-600 bg-blue-50";
    case "done": return "text-green-600 bg-green-50";
    case "late": return "text-red-600 bg-red-50";
    case "open": return "text-orange-600 bg-orange-50";
    case "in_progress": return "text-blue-600 bg-blue-50";
    case "escalated": return "text-red-600 bg-red-50";
    case "resolved": return "text-green-600 bg-green-50";
    case "closed": return "text-gray-600 bg-gray-100";
    default: return "text-gray-600 bg-gray-100";
  }
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    todo: "Att göra",
    progress: "Pågående",
    done: "Klar",
    late: "Sen",
    open: "Öppen",
    in_progress: "Pågående",
    escalated: "Eskalerad",
    resolved: "Löst",
    closed: "Stängd",
    scheduled: "Planerat",
    completed: "Avslutat",
    cancelled: "Avbrutet",
  };
  return labels[status] ?? status;
}

export function hierarchyLabel(level: string): string {
  const labels: Record<string, string> = {
    admin: "Administratör",
    hk: "Huvudkontor",
    forening: "Förening",
    distrikt: "Distrikt",
    chef: "Butikschef",
    anvandare: "Användare",
  };
  return labels[level] ?? level;
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
}

// Offline queue
export interface OfflineItem {
  id: string;
  action: string;
  payload: unknown;
  timestamp: number;
}

export function getOfflineQueue(): OfflineItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem("offline_queue") ?? "[]");
  } catch {
    return [];
  }
}

export function addToOfflineQueue(action: string, payload: unknown) {
  if (typeof window === "undefined") return;
  const queue = getOfflineQueue();
  queue.push({ id: crypto.randomUUID(), action, payload, timestamp: Date.now() });
  localStorage.setItem("offline_queue", JSON.stringify(queue));
}

export function clearOfflineQueue() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("offline_queue");
}
