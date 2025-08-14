"use client";

import React, { useState, useEffect, useRef, memo } from "react";
import { cn } from "@/lib/utils";

// Types and Interfaces
export interface NodeIconProps {
  // Core props
  name: string; // Exact icon name from API
  size?: "xs" | "sm" | "md" | "lg" | "xl" | number;
  className?: string;

  // Appearance
  color?: string; // SVG fill color
  strokeColor?: string; // SVG stroke color
  showBackground?: boolean; // Show background for dark variant icons (default: true)
  backgroundClassName?: string; // Custom background styling

  // Performance
  loading?: "lazy" | "eager"; // Loading strategy (default: eager for API-driven)

  // Accessibility
  title?: string; // Accessible title
  decorative?: boolean; // Mark as decorative (aria-hidden)

  // Behavior
  fallback?: React.ReactNode; // Custom fallback UI
  onLoad?: () => void; // Success callback
  onError?: (error: Error) => void; // Error callback
  onVariantDetected?: (isDark: boolean) => void; // Callback when variant is detected

  // Force background wrapper even if not dark variant
  forceBackground?: boolean;
}

// Simple cache for loaded SVGs
const svgCache = new Map<string, string>();

// Helper function to process SVG inline
function processInlineSVG(
  svgString: string,
  options: {
    size: NodeIconProps["size"];
    color?: string;
    strokeColor?: string;
    title?: string;
    decorative?: boolean;
  }
): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const svg = doc.querySelector("svg");

  if (!svg) return svgString;

  // Normalize symbol/use → inline nodes to avoid rendering quirks
  const useEl = svg.querySelector("use");
  if (useEl) {
    const href = useEl.getAttribute("xlink:href") || useEl.getAttribute("href");
    if (href && href.startsWith("#")) {
      const symbol = svg.querySelector(href) as SVGSymbolElement | null;
      if (symbol) {
        const group = doc.createElementNS("http://www.w3.org/2000/svg", "g");
        const x = parseFloat(useEl.getAttribute("x") || "0");
        const y = parseFloat(useEl.getAttribute("y") || "0");
        if (x !== 0 || y !== 0) {
          group.setAttribute("transform", `translate(${x}, ${y})`);
        }
        // Move all children from symbol into group
        Array.from(symbol.childNodes).forEach((n) =>
          group.appendChild(n.cloneNode(true))
        );
        useEl.replaceWith(group);
        symbol.remove();
      }
    }
  }

  // Remove default dimensions and normalize viewBox
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  const vb = svg.getAttribute("viewBox");
  if (!vb) {
    // Fallback to 24 box if missing
    svg.setAttribute("viewBox", "0 0 24 24");
  }

  // Apply size
  const sizeMap = { xs: 16, sm: 20, md: 24, lg: 32, xl: 48 };
  const sizeValue =
    typeof options.size === "number"
      ? options.size
      : sizeMap[options.size || "md"];

  svg.setAttribute("width", String(sizeValue));
  svg.setAttribute("height", String(sizeValue));
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  // Apply colors
  if (options.color) {
    const fillColor = options.color as string;
    svg.setAttribute("fill", fillColor);
    // Also apply to all path elements
    svg.querySelectorAll("path").forEach((path) => {
      if (!path.getAttribute("fill") || path.getAttribute("fill") !== "none") {
        path.setAttribute("fill", fillColor);
      }
    });
  }

  if (options.strokeColor) {
    const stroke = options.strokeColor as string;
    svg.setAttribute("stroke", stroke);
    svg.querySelectorAll("path").forEach((path) => {
      if (path.getAttribute("stroke")) {
        path.setAttribute("stroke", stroke);
      }
    });
  }

  // Accessibility
  if (options.decorative) {
    svg.setAttribute("aria-hidden", "true");
  } else {
    svg.setAttribute("role", "img");
    if (options.title) {
      svg.setAttribute("aria-label", options.title);

      // Add title element for tooltip
      const titleEl = doc.createElement("title");
      titleEl.textContent = options.title;
      svg.prepend(titleEl);
    }
  }

  // Add focus styling
  svg.setAttribute("focusable", "false");
  svg.setAttribute("style", "overflow:visible;display:block");

  return new XMLSerializer().serializeToString(doc);
}

const NodeIcon = memo(
  ({
    name,
    size = "md",
    className,
    color,
    strokeColor,
    showBackground = true,
    backgroundClassName,
    loading = "eager",
    title,
    decorative = false,
    fallback,
    onLoad,
    onError,
    onVariantDetected,
    forceBackground = false,
    ...props
  }: NodeIconProps) => {
    const [svgContent, setSvgContent] = useState<string | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isDarkVariant, setIsDarkVariant] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      // Check cache first
      const cacheKey = `${name}-${size}-${color}-${strokeColor}-${isDarkVariant}`;
      if (svgCache.has(cacheKey)) {
        setSvgContent(svgCache.get(cacheKey)!);
        setIsLoading(false);
        onLoad?.();
        return;
      }

      // Try to load regular SVG first, then fallback to dark variant
      fetch(`/demo-icons/icons/nodes/svgs/${name}.svg`)
        .then((res) => {
          if (!res.ok) {
            // Try dark variant
            return fetch(`/demo-icons/icons/nodes/svgs/${name}.dark.svg`).then(
              (darkRes) => {
                if (darkRes.ok) {
                  setIsDarkVariant(true);
                  onVariantDetected?.(true);
                  return darkRes;
                }
                throw new Error(`Icon ${name} not found`);
              }
            );
          }
          setIsDarkVariant(false);
          onVariantDetected?.(false);
          return res;
        })
        .then((res) => res.text())
        .then((svg) => {
          // Apply inline optimizations
          const optimized = processInlineSVG(svg, {
            size,
            color,
            strokeColor,
            title,
            decorative,
          });
          svgCache.set(cacheKey, optimized);
          setSvgContent(optimized);
          setIsLoading(false);
          onLoad?.();
        })
        .catch((err) => {
          console.error(`Failed to load icon: ${name}`, err);
          setError(err);
          setIsLoading(false);
          onError?.(err);
        });
    }, [
      name,
      size,
      color,
      strokeColor,
      title,
      decorative,
      onLoad,
      onError,
      onVariantDetected,
    ]);

    const sizeClasses = {
      xs: "w-4 h-4",
      sm: "w-5 h-5",
      md: "w-6 h-6",
      lg: "w-8 h-8",
      xl: "w-12 h-12",
    };

    const sizeClass = typeof size === "number" ? undefined : sizeClasses[size];

    // Error state - use n8n icon as default fallback
    if (error) {
      if (fallback) return <>{fallback}</>;

      // If the n8n icon itself fails, show a simple placeholder
      if (name === "n8n") {
        return (
          <div
            className={cn(
              "inline-flex items-center justify-center bg-gray-200 rounded",
              sizeClass,
              className
            )}
            style={
              typeof size === "number"
                ? { width: size, height: size }
                : undefined
            }
            title={`Failed to load ${name} icon`}
          />
        );
      }

      // Use n8n icon as default fallback for other icons
      return (
        <NodeIcon
          name="n8n"
          size={size}
          className={className}
          color={color || "#EA4B71"} // n8n brand color as default
          strokeColor={strokeColor}
          title={title || `${name} (using n8n fallback)`}
          decorative={decorative}
        />
      );
    }

    // Loading state
    if (isLoading) {
      return (
        <div
          ref={containerRef}
          className={cn(
            "inline-flex items-center justify-center animate-pulse bg-gray-200 rounded",
            sizeClass,
            className
          )}
          style={
            typeof size === "number" ? { width: size, height: size } : undefined
          }
        />
      );
    }

    // Loaded state - wrap in background if dark variant or forced
    if ((isDarkVariant && showBackground) || forceBackground) {
      return (
        <div
          ref={containerRef}
          className={cn(
            "inline-flex items-center justify-center p-1.5 rounded overflow-visible",
            isDarkVariant ? "bg-gray-800" : "bg-neutral-100",
            backgroundClassName,
            className
          )}
          {...props}
        >
          <div
            className="inline-flex items-center justify-center"
            dangerouslySetInnerHTML={{ __html: svgContent! }}
          />
        </div>
      );
    }

    // Regular icon without background
    return (
      <div
        ref={containerRef}
        className={cn("inline-flex items-center justify-center", className)}
        dangerouslySetInnerHTML={{ __html: svgContent! }}
        {...props}
      />
    );
  }
);

NodeIcon.displayName = "NodeIcon";

export { NodeIcon };
