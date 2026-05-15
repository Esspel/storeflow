import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/butiker")({
  component: StoresRedirect,
});

function StoresRedirect() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.role === "admin") {
      navigate({ to: "/admin/butiker" });
    } else {
      navigate({ to: "/" });
    }
  }, [user, navigate]);

  return null;
}
