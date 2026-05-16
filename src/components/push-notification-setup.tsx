import { Bell, BellOff, Loader as Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/use-push-notifications";

export function PushNotificationSetup() {
  const { isSupported, isSubscribed, isLoading, permissionState, subscribe, unsubscribe } =
    usePushNotifications();

  if (!isSupported) return null;

  if (permissionState === "denied") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
        <BellOff className="h-4 w-4 shrink-0" />
        <span>Notiser blockerade i webbläsaren. Ändra i webbläsarinställningarna för att aktivera.</span>
      </div>
    );
  }

  return (
    <Button
      variant={isSubscribed ? "outline" : "default"}
      size="sm"
      onClick={isSubscribed ? unsubscribe : subscribe}
      disabled={isLoading}
      className="gap-2"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isSubscribed ? (
        <BellOff className="h-4 w-4" />
      ) : (
        <Bell className="h-4 w-4" />
      )}
      {isLoading ? "Laddar..." : isSubscribed ? "Notiser på" : "Aktivera notiser"}
    </Button>
  );
}
