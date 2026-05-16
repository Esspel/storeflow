import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (c) => c.charCodeAt(0));
}

// The old FCM endpoint format (deprecated June 2024) accepts push requests but
// silently drops all messages. Subscriptions using it must be replaced.
function isDeprecatedEndpoint(endpoint: string): boolean {
  return endpoint.includes("fcm.googleapis.com/fcm/send/");
}

export type PushNotificationState = {
  isSupported: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
  permissionState: NotificationPermission | "unknown";
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
};

export function usePushNotifications(): PushNotificationState {
  const { user } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [permissionState, setPermissionState] = useState<NotificationPermission | "unknown">("unknown");

  const isSupported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    !!VAPID_PUBLIC_KEY;

  // On mount: check subscription state and auto-fix deprecated endpoints.
  useEffect(() => {
    if (!isSupported || !user) {
      setIsLoading(false);
      return;
    }

    setPermissionState(Notification.permission);

    navigator.serviceWorker.ready
      .then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();

        if (!sub) {
          setIsSubscribed(false);
          return;
        }

        // If the browser still holds a subscription with the deprecated FCM
        // endpoint, unsubscribe from it and remove from the database so the
        // user is prompted to re-subscribe and get a valid V1 endpoint.
        if (isDeprecatedEndpoint(sub.endpoint)) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          await sub.unsubscribe();
          setIsSubscribed(false);
          toast.info("Notisprenumerationen behövde förnyas. Aktivera notiser igen i inställningarna.");
          return;
        }

        setIsSubscribed(true);

        // Ensure this valid subscription is recorded in the database
        // (covers cases where the DB row was deleted but browser still has it).
        supabase.from("push_subscriptions").upsert(
          {
            user_id: user.id,
            endpoint: sub.endpoint,
            subscription_json: sub.toJSON(),
            user_agent: navigator.userAgent,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "endpoint" },
        ).then(() => {});
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [isSupported, user]);

  const subscribe = useCallback(async () => {
    if (!isSupported || !user) return;
    if (!VAPID_PUBLIC_KEY) {
      toast.error("Push-notiser är inte konfigurerade ännu.");
      return;
    }

    setIsLoading(true);
    try {
      const permission = await Notification.requestPermission();
      setPermissionState(permission);

      if (permission !== "granted") {
        toast.error("Notiser blockerades. Tillåt notiser i webbläsarinställningarna.");
        return;
      }

      const reg = await navigator.serviceWorker.ready;

      // Unsubscribe from any existing (possibly deprecated) subscription first
      // so the browser always creates a fresh endpoint.
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", existing.endpoint);
        await existing.unsubscribe();
      }

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: user.id,
          endpoint: subscription.endpoint,
          subscription_json: subscription.toJSON(),
          user_agent: navigator.userAgent,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" },
      );

      if (error) throw error;

      setIsSubscribed(true);
      toast.success("Push-notiser aktiverade!");
    } catch (err) {
      console.error("Push subscribe failed:", err);
      toast.error("Kunde inte aktivera push-notiser. Försök igen.");
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, user]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return;
    setIsLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
      toast.success("Push-notiser inaktiverade.");
    } catch (err) {
      console.error("Push unsubscribe failed:", err);
      toast.error("Kunde inte inaktivera push-notiser.");
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  return { isSupported, isSubscribed, isLoading, permissionState, subscribe, unsubscribe };
}
