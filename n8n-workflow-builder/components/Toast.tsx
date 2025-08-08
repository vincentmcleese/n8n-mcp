"use client";
import React from "react";

export function Toast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
      <div className="rounded-full bg-neutral-900/90 text-white px-4 py-2 text-sm shadow-lg">
        {message}
      </div>
    </div>
  );
}
