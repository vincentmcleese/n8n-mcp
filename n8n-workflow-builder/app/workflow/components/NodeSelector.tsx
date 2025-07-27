'use client';

export function NodeSelector() {
  return (
    <div className="p-4 border rounded-lg">
      <h3 className="text-lg font-semibold mb-4">Available Nodes</h3>
      <div className="space-y-2">
        {/* Node list will be populated here */}
        <p className="text-gray-500 text-sm">No nodes available yet.</p>
      </div>
    </div>
  );
}