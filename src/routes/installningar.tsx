import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Settings, Bell, Shield, Moon, Sun, Store, User, Key,
  LogOut, ChevronRight, Check, X, Smartphone,
} from "lucide-react";
import { supabase, VAPID_PUBLIC_KEY, getSessionToken } from "@/lib/supabase";
import { useAuth, useIsAdmin } from "@/lib/auth-context";
import { changePassword } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/installningar")({
  beforeLoad: () => { if (!getSessionToken()) throw redirect({ to: "/login" }); },
  component: InstallningarPage,
});

function InstallningarPage() {
  const { user, activeStore, logout } = useAuth();
  const isAdmin = useIsAdmin();
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light"
  );
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    checkPushStatus();
  }, []);

  async function checkPushStatus() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    setPushEnabled(!!sub);
  }

  function toggleTheme() {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    document.documentElement.classList.toggle("dark", newTheme === "dark");
    localStorage.setItem("theme", newTheme);
  }

  async function togglePush() {
    if (!user) return;
    setPushLoading(true);
    try {
      if (pushEnabled) {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          setPushEnabled(false);
          toast.success("Push-notiser avaktiverade");
        }
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") { toast.error("Behörighet nekad"); setPushLoading(false); return; }

        let reg = await navigator.serviceWorker.getRegistration();
        if (!reg) reg = await navigator.serviceWorker.register("/sw.js");

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });

        await supabase.from("push_subscriptions").upsert({
          user_id: user.id,
          endpoint: sub.endpoint,
          subscription_json: sub.toJSON(),
          user_agent: navigator.userAgent,
        }, { onConflict: "endpoint" });

        setPushEnabled(true);
        toast.success("Push-notiser aktiverade");
      }
    } catch (e: unknown) {
      toast.error("Fel: " + String(e));
    }
    setPushLoading(false);
  }

  async function savePassword() {
    if (!user) return;
    if (newPw.length < 6) { toast.error("Lösenord måste vara minst 6 tecken"); return; }
    if (newPw !== confirmPw) { toast.error("Lösenorden matchar inte"); return; }
    setSavingPw(true);
    try {
      await changePassword(user.id, newPw);
      toast.success("Lösenord ändrat");
      setShowChangePw(false);
      setNewPw("");
      setConfirmPw("");
    } catch (e: unknown) {
      toast.error("Fel: " + String(e));
    }
    setSavingPw(false);
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-foreground">Inställningar</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Konto och appinställningar</p>
      </div>

      {/* Profile */}
      <Section title="Profil">
        <div className="flex items-center gap-3 p-4">
          <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-lg font-bold text-primary-foreground shrink-0">
            {user?.display_name?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground">{user?.display_name}</p>
            <p className="text-sm text-muted-foreground">@{user?.username}</p>
            <p className="text-xs text-muted-foreground capitalize">{user?.role} · {user?.hierarchy_level}</p>
          </div>
        </div>
        <Divider />
        <SettingRow
          icon={<Key className="w-4 h-4" />}
          label="Ändra lösenord"
          onClick={() => setShowChangePw(!showChangePw)}
        />
        {showChangePw && (
          <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
            <input
              type="password"
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              placeholder="Nytt lösenord"
              className="w-full h-10 px-3 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="password"
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              placeholder="Bekräfta lösenord"
              className="w-full h-10 px-3 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button onClick={savePassword} disabled={savingPw} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-70">
              {savingPw ? "Sparar..." : "Spara lösenord"}
            </button>
          </div>
        )}
      </Section>

      {/* Butik */}
      {activeStore && (
        <Section title="Aktiv butik">
          <div className="px-4 py-3 flex items-center gap-3">
            <Store className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{activeStore.name}</p>
              <p className="text-xs text-muted-foreground">{activeStore.butiks_nr ?? activeStore.city}</p>
            </div>
          </div>
        </Section>
      )}

      {/* Notifications */}
      <Section title="Notifikationer">
        <SettingRow
          icon={<Bell className="w-4 h-4" />}
          label="Push-notiser"
          sub={pushEnabled ? "Aktiva" : "Inaktiva"}
          right={
            <button
              onClick={togglePush}
              disabled={pushLoading}
              className={cn(
                "w-11 h-6 rounded-full transition-all relative",
                pushEnabled ? "bg-primary" : "bg-muted",
                pushLoading && "opacity-50 cursor-not-allowed"
              )}
            >
              <span className={cn(
                "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
                pushEnabled ? "translate-x-5" : "translate-x-0.5"
              )} />
            </button>
          }
        />
      </Section>

      {/* Appearance */}
      <Section title="Utseende">
        <SettingRow
          icon={theme === "dark" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          label={theme === "dark" ? "Mörkt läge" : "Ljust läge"}
          right={
            <button
              onClick={toggleTheme}
              className={cn("w-11 h-6 rounded-full transition-all relative", theme === "dark" ? "bg-primary" : "bg-muted")}
            >
              <span className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform", theme === "dark" ? "translate-x-5" : "translate-x-0.5")} />
            </button>
          }
        />
      </Section>

      {/* Security */}
      <Section title="Säkerhet">
        <SettingRow icon={<Shield className="w-4 h-4" />} label="Tvåfaktorsautentisering" sub="Ej aktiverad" />
        <Divider />
        <SettingRow icon={<Smartphone className="w-4 h-4" />} label="Aktiva sessioner" sub="Se inloggade enheter" />
      </Section>

      {/* Sign out */}
      <button
        onClick={logout}
        className="w-full flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-2xl text-destructive hover:bg-red-50 transition-colors"
      >
        <LogOut className="w-4 h-4" />
        <span className="text-sm font-medium">Logga ut</span>
      </button>

      <p className="text-center text-xs text-muted-foreground pb-4">StoreFlow · Version 1.0</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">{title}</p>
      <div className="bg-card border border-border rounded-2xl overflow-hidden">{children}</div>
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-border mx-4" />;
}

function SettingRow({ icon, label, sub, right, onClick }: {
  icon: React.ReactNode; label: string; sub?: string;
  right?: React.ReactNode; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 text-left",
        onClick && "hover:bg-muted/50 transition-colors cursor-pointer",
        !onClick && "cursor-default"
      )}
    >
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground">{label}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      {right ?? (onClick && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />)}
    </button>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData, c => c.charCodeAt(0));
}
