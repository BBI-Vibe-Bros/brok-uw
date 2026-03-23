"use client";

import Link from "next/link";
import { useRef } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Shield, Settings, LogOut, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const DISCLAIMER =
  "This tool provides informational guidance only. Always confirm underwriting decisions directly with the carrier before submitting an application.";

function getInitials(fullName: string | null | undefined, email: string): string {
  if (fullName?.trim()) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export type ChatPageHeaderProps = {
  profile: {
    full_name: string | null;
    npn: string | null;
    role: string | null;
  } | null;
  userEmail: string;
};

export function ChatPageHeader({ profile, userEmail }: ChatPageHeaderProps) {
  const logoutRef = useRef<HTMLFormElement>(null);
  const displayName = profile?.full_name || userEmail;
  const isAdmin = profile?.role === "admin";

  return (
    <header className="flex shrink-0 items-center justify-between border-b bg-white px-3 py-2 sm:px-4">
      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
        <Shield className="h-5 w-5 shrink-0 text-blue-600" aria-hidden />
        <span className="truncate font-semibold text-sm">BrokUW</span>
        <div className="md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-transparent text-amber-700 outline-none transition-colors hover:bg-amber-50 focus-visible:ring-2 focus-visible:ring-ring"
              )}
              aria-label="Disclaimer"
            >
              <AlertCircle className="h-5 w-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-[min(calc(100vw-2rem),20rem)] border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900"
            >
              {DISCLAIMER}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {isAdmin && (
          <Link
            href="/admin"
            className="hidden md:inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <Settings className="h-3.5 w-3.5" />
            Admin
          </Link>
        )}

        <div className="hidden items-center gap-3 md:flex">
          <span className="max-w-[240px] truncate text-xs text-muted-foreground">
            {displayName}
            {profile?.npn && ` · NPN ${profile.npn}`}
          </span>
          <form action="/api/auth/signout" method="POST">
            <Button variant="ghost" size="sm" type="submit" aria-label="Log out">
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </form>
        </div>

        <div className="md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Account menu"
            >
              <Avatar size="sm" className="size-8">
                <AvatarFallback className="bg-blue-100 text-xs font-medium text-blue-800">
                  {getInitials(profile?.full_name, userEmail)}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="font-normal">
                  <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
                  {profile?.npn && (
                    <p className="truncate text-xs text-muted-foreground">NPN {profile.npn}</p>
                  )}
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={() => logoutRef.current?.requestSubmit()}
                  className="gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <form
            ref={logoutRef}
            action="/api/auth/signout"
            method="POST"
            className="sr-only"
            aria-hidden
          />
        </div>
      </div>
    </header>
  );
}
