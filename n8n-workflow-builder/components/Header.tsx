"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type HeaderVariant = "landing" | "default";

export function Header({ variant }: { variant?: HeaderVariant }) {
  const pathname = usePathname();
  const computedVariant: HeaderVariant =
    variant ?? (pathname === "/" ? "landing" : "default");
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const base = "sticky top-0 z-40 transition-colors";
  const landingTop = "bg-transparent text-white";
  const defaultTop = "bg-transparent text-neutral-900";
  const scrolled = "bg-white text-neutral-900 border-b border-neutral-200";

  const headerClass = cn(
    base,
    isScrolled
      ? scrolled
      : computedVariant === "landing"
      ? landingTop
      : defaultTop
  );

  return (
    <header className={headerClass}>
      <div className="max-w-screen-lg mx-auto px-4 py-3 flex items-center justify-between">
        <div className="text-base sm:text-lg font-semibold tracking-tight">
          n8nBuilder.ghostteam.ai
        </div>
        <nav className="hidden sm:flex items-center gap-4 text-sm">
          <Link href="/" className="hover:opacity-80">
            Home
          </Link>
        </nav>
      </div>
    </header>
  );
}
