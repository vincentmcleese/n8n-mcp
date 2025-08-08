"use client";
import React from "react";
import { NodeCard, type NodeCardProps } from "./NodeCard";

export function NodeGrid({ nodes }: { nodes: NodeCardProps[] }) {
  return (
    <div className="w-full max-w-screen-lg mx-auto px-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {nodes.map((n, idx) => (
          <NodeCard key={n.id ?? idx} {...n} />
        ))}
      </div>
    </div>
  );
}
