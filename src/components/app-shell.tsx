import { Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { LogOut, Menu, Settings, User, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Översikt" },
  { to: "/uppgifter", label: "Uppgifter" },
  { to: "/avvikelser", label: "Avvikelser" },
  { to: "/rapporter", label: "Rapporter" },
];

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const isActive = (to: string) =>
    to === "/" ? pathname === "/" : pathname.startsWith(to);

  const handleLogout = async () => {
    await logout();
    navigate({ to: "/login" });
  };

  const initials = user?.display_name
    ? user.display_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-card">
        <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-6 px-5 md:px-8">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <div className="flex flex-col leading-none">
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                Store
              </span>
              <span className="text-2xl font-black tracking-tight text-primary">
                Flow
              </span>
            </div>
          </Link>

          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "relative rounded-full px-3.5 py-2 text-sm font-medium text-foreground/70 transition-colors hover:text-primary",
                  isActive(item.to) && "text-primary",
                )}
              >
                {item.label}
                {isActive(item.to) && (
                  <span className="absolute inset-x-3.5 -bottom-[14px] h-[3px] rounded-t-full bg-primary" />
                )}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-xl border-border/80"
                  aria-label="Konto"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-soft text-[10px] font-bold text-primary">
                    {initials}
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user?.display_name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/installningar" className="cursor-pointer">
                    <Settings className="mr-2 h-4 w-4" />
                    Inställningar
                  </Link>
                </DropdownMenuItem>
                {user?.role === "admin" && (
                  <DropdownMenuItem asChild>
                    <Link to="/personal" className="cursor-pointer">
                      <User className="mr-2 h-4 w-4" />
                      Administration
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer text-destructive focus:text-destructive"
                  onClick={handleLogout}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Logga ut
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline"
              size="icon"
              className="rounded-xl border-border/80 md:hidden"
              onClick={() => setOpen((o) => !o)}
              aria-label="Meny"
            >
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {open && (
          <div className="border-t border-border/60 bg-card px-5 py-3 md:hidden">
            <nav className="flex flex-col">
              {nav.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "rounded-lg px-3 py-2.5 text-sm font-medium text-foreground/80",
                    isActive(item.to) && "bg-primary-soft text-primary",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
