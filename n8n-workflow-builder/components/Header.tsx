"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { createClient } from "@/lib/supabase-client";
import { User } from "@supabase/supabase-js";

type HeaderVariant = "landing" | "default";

export function Header({ variant }: { variant?: HeaderVariant }) {
  const pathname = usePathname();
  const computedVariant: HeaderVariant =
    variant ?? (pathname === "/" ? "landing" : "default");
  const [isScrolled, setIsScrolled] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Check authentication status
  useEffect(() => {
    const supabase = createClient();
    
    // Get initial user
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const base = "sticky top-0 z-40 transition-colors";
  const landingTop = "bg-transparent text-white";
  // Non-landing pages: use solid header immediately to match light backgrounds
  const defaultTop = "bg-white text-neutral-900 border-b border-neutral-200";
  const scrolled = "bg-white text-neutral-900 border-b border-neutral-200";

  const headerClass = cn(
    base,
    isScrolled
      ? scrolled
      : computedVariant === "landing"
      ? landingTop
      : defaultTop
  );

  const handleLogin = () => {
    window.location.href = '/api/auth/login';
  };

  return (
    <header className={headerClass}>
      <div className="max-w-screen-lg mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-base sm:text-lg font-semibold tracking-tight hover:opacity-80 transition-opacity">
          n8nBuilder.ghostteam.ai
        </Link>
        <nav className="hidden sm:flex items-center gap-4 text-sm">
          <Link 
            href="/" 
            className={cn(
              "px-3 py-1 border rounded-md font-semibold transition-all hover:opacity-80",
              isScrolled || computedVariant === "default"
                ? "border-neutral-900"
                : "border-white"
            )}
          >
            Directory
          </Link>
          
          <div className="flex items-center h-8">
            {loading ? (
              <div className="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-700 animate-pulse" />
            ) : user ? (
              <UserAvatar user={user} />
            ) : (
              <Button
                onClick={handleLogin}
                className={cn(
                  "border-0 shadow-sm font-semibold transition-all",
                  isScrolled || computedVariant === "default"
                    ? "bg-neutral-900 hover:bg-neutral-800 text-white"
                    : "bg-white hover:bg-white/90 text-emerald-500"
                )}
                size="sm"
              >
                Login
              </Button>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}