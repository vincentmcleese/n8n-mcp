interface WorkflowResultPageProps {
  params: {
    sessionId: string;
  };
}

export default function WorkflowResultPage({ params }: WorkflowResultPageProps) {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Workflow Result</h1>
      <p className="text-gray-600">Session ID: {params.sessionId}</p>
      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Generated Workflow</h2>
        {/* Workflow result will be displayed here */}
      </div>
    </div>
  );
}