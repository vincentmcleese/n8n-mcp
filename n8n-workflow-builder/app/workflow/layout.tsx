export default function WorkflowLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <nav className="border-b bg-background">
        <div className="container mx-auto px-4 py-4">
          <h2 className="text-xl font-semibold">n8n Workflow Builder</h2>
        </div>
      </nav>
      <main>{children}</main>
    </div>
  );
}