import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  // Bygg ett fristående ArrayBuffer (TS 5.7+ skiljer på ArrayBuffer vs SharedArrayBuffer)
  const bytes = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    bytes[i] = rawData.charCodeAt(i);
  }
  return bytes;
}

// Gamla FCM-endpointen (deprecated sedan juni 2024) släpper meddelanden tyst.
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
  const [permissionState, setPermissionState] = useState<NotificationPermission | "unknown">(
    "unknown",
  );

  const isSupported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    !!VAPID_PUBLIC_KEY;

  // Kontrollera prenumerationsstatus och åtgärda deprecated endpoints vid mount
  useEffect(() => {
    let isMounted = true;

    if (!isSupported || !user) {
      setIsLoading(false);
      return;
    }

    setPermissionState(Notification.permission);

    const checkSubscription = async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();

        if (!sub) {
          if (isMounted) setIsSubscribed(false);
          return;
        }

        // 1. Hantera föråldrad FCM-endpoint
        if (isDeprecatedEndpoint(sub.endpoint)) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          await sub.unsubscribe();
          if (isMounted) {
            setIsSubscribed(false);
            toast.info(
              "Notisprenumerationen behövde förnyas. Aktivera notiser igen i inställningarna.",
            );
          }
          return;
        }

        // 2. Synka prenumerationen mot Supabase för nuvarande användare
        const { error: upsertErr } = await supabase.from("push_subscriptions").upsert(
          {
            user_id: user.id,
            endpoint: sub.endpoint,
            subscription_json: sub.toJSON(),
            user_agent: navigator.userAgent,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "endpoint" },
        );

        if (upsertErr) {
          // Om unikt villkor fallerar (t.ex. ägs av annan användare på samma enhet), skapa ny
          await sub.unsubscribe();

          const freshSub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
          });

          const { error: insertErr } = await supabase.from("push_subscriptions").insert({
            user_id: user.id,
            endpoint: freshSub.endpoint,
            subscription_json: freshSub.toJSON(),
            user_agent: navigator.userAgent,
          });

          if (insertErr) {
            console.error("Registrering av ny push-prenumeration misslyckades:", insertErr);
            if (isMounted) setIsSubscribed(false);
            return;
          }
        }

        if (isMounted) setIsSubscribed(true);
      } catch (err) {
        console.error("Fel vid kontroll av push-prenumeration:", err);
        if (isMounted) setIsSubscribed(false);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    checkSubscription();

    return () => {
      isMounted = false;
    };
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

      // Rensa eventuell befintlig prenumeration i webbläsaren först för en ren endpoint
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
      console.error("Aktivering av push-notiser misslyckades:", err);
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
      console.error("Inaktivering av push-notiser misslyckades:", err);
      toast.error("Kunde inte inaktivera push-notiser.");
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  return { isSupported, isSubscribed, isLoading, permissionState, subscribe, unsubscribe };
}
