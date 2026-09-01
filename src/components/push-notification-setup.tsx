import * as React from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/use-push-notifications";

export function PushNotificationSetup() {
  const { isSupported, isSubscribed, isLoading, permissionState, subscribe, unsubscribe } =
    usePushNotifications();

  // Om webbläsaren/enheten saknar stöd för Push API
  if (!isSupported) return null;

  // Om användaren har blockerat notiser i webbläsaren
  if (permissionState === "denied") {
    return (
      <div
        role="alert"
        className="flex items-center gap-2.5 rounded-lg border border-coop-orange-500/30 bg-coop-orange-500/10 px-3 py-2 text-xs text-coop-orange-900 dark:text-coop-orange-200"
      >
        <BellOff className="h-4 w-4 shrink-0 text-coop-orange-600 dark:text-coop-orange-400" />
        <span>Notiser är blockerade. Ändra i webbläsarens inställningar för att aktivera.</span>
      </div>
    );
  }

  return (
    <Button
      variant={isSubscribed ? "outline" : "default"}
      size="sm"
      onClick={isSubscribed ? unsubscribe : subscribe}
      disabled={isLoading}
      aria-busy={isLoading}
      aria-label={isSubscribed ? "Inaktivera push-notiser" : "Aktivera push-notiser"}
      className="gap-2 transition-colors"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" />
      ) : isSubscribed ? (
        <BellOff className="h-4 w-4 shrink-0 text-coop-gray-600" />
      ) : (
        <Bell className="h-4 w-4 shrink-0" />
      )}

      <span>
        {isLoading ? (
          <>
            Uppdaterar
            <span className="sr-only" aria-busy="true">
              Laddar…
            </span>
          </>
        ) : isSubscribed ? (
          "Notiser aktiverade"
        ) : (
          "Aktivera notiser"
        )}
      </span>
    </Button>
  );
}
