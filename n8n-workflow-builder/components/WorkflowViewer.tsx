// components/WorkflowViewer.tsx

"use client";

import { WorkflowNode, WorkflowConnection } from "@/types/workflow";
import { NodeIcon } from "./NodeIcon";
import { resolveIconName } from "@/lib/icon-aliases";

interface WorkflowViewerProps {
  workflow: {
    nodes: WorkflowNode[];
    connections: WorkflowConnection[];
    settings?: any;
  };
}

/**
 * Read-only workflow viewer component
 * Displays workflow structure in a clean, organized way
 */
export function WorkflowViewer({ workflow }: WorkflowViewerProps) {
  if (!workflow || !workflow.nodes) {
    return (
      <div className="text-center py-8 text-neutral-500">
        No workflow data available
      </div>
    );
  }

  // Group nodes by their approximate vertical position (rows)
  const nodeRows = workflow.nodes.reduce((rows, node) => {
    const row = Math.floor(node.position[1] / 200); // Assuming ~200px per row
    if (!rows[row]) rows[row] = [];
    rows[row].push(node);
    return rows;
  }, {} as Record<number, WorkflowNode[]>);

  // Sort rows and nodes within each row
  const sortedRows = Object.entries(nodeRows)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([_, nodes]) => nodes.sort((a, b) => a.position[0] - b.position[0]));

  return (
    <div className="space-y-6">
      {sortedRows.map((row, rowIndex) => (
        <div key={rowIndex} className="flex flex-wrap gap-4">
          {row.map((node) => (
            <WorkflowNodeCard key={node.id} node={node} />
          ))}
        </div>
      ))}

      {/* Connection Summary */}
      {workflow.connections && Object.keys(workflow.connections).length > 0 && (
        <div className="mt-6 pt-6 border-t border-neutral-200">
          <h3 className="text-sm font-medium text-neutral-700 mb-2">
            Connections
          </h3>
          <div className="text-sm text-neutral-600">
            {Object.entries(workflow.connections).map(([source, targets]) => (
              <div key={source} className="mb-1">
                {source} → {JSON.stringify(targets)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Individual node card component
 */
function WorkflowNodeCard({ node }: { node: WorkflowNode }) {
  // Extract icon name from node type
  const getIconName = (nodeType: string) => {
    const base = nodeType
      .replace("n8n-nodes-base.", "")
      .replace("nodes-base.", "")
      .split(".")[0];
    return resolveIconName(base);
  };

  const iconName = getIconName(node.type);

  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-4 min-w-[200px]">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <NodeIcon name={iconName} className="w-8 h-8" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-neutral-900 truncate">{node.name}</h4>
          <p className="text-sm text-neutral-500 truncate">
            {node.type.replace("n8n-nodes-base.", "")}
          </p>
          {node.category && (
            <span className="inline-block mt-1 px-2 py-0.5 bg-neutral-100 text-neutral-600 text-xs rounded">
              {node.category}
            </span>
          )}
        </div>
      </div>

      {/* Show key parameters */}
      {node.parameters && Object.keys(node.parameters).length > 0 && (
        <div className="mt-3 pt-3 border-t border-neutral-100">
          <div className="text-xs text-neutral-500">
            {Object.keys(node.parameters).slice(0, 3).join(", ")}
            {Object.keys(node.parameters).length > 3 &&
              ` +${Object.keys(node.parameters).length - 3} more`}
          </div>
        </div>
      )}
    </div>
  );
}
