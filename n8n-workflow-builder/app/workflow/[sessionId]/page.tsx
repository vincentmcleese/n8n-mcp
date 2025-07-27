interface WorkflowSessionPageProps {
  params: {
    sessionId: string;
  };
}

export default function WorkflowSessionPage({ params }: WorkflowSessionPageProps) {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Workflow Session</h1>
      <p className="text-gray-600">Session ID: {params.sessionId}</p>
    </div>
  );
}