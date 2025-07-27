'use client';

export function WorkflowPreview() {
  return (
    <div className="p-4 border rounded-lg h-full">
      <h3 className="text-lg font-semibold mb-4">Workflow Preview</h3>
      <div className="bg-gray-50 rounded p-4 h-[calc(100%-3rem)]">
        <p className="text-gray-500 text-center mt-8">
          Your workflow will appear here as it&apos;s being built.
        </p>
      </div>
    </div>
  );
}