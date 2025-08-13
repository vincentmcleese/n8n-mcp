// app/w/[slug]/page.tsx

import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getWorkflowQueries } from "@/lib/db/workflow-queries";
import { Button } from "@/components/ui/button";
import { Download, Import } from "lucide-react";

// Generate metadata for SEO
export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const queries = getWorkflowQueries();
  const workflow = await queries.findBySlug(params.slug);

  if (!workflow?.seo) {
    return {
      title: "Workflow Not Found",
      description: "The requested workflow could not be found.",
    };
  }

  return {
    title: workflow.seo.title,
    description: workflow.seo.description,
    keywords: workflow.seo.keywords,
  };
}

export default async function WorkflowPublicPage({
  params,
}: {
  params: { slug: string };
}) {
  // Fetch workflow data from Supabase
  const queries = getWorkflowQueries();
  const workflowData = await queries.findBySlug(params.slug);

  if (!workflowData) {
    notFound();
  }

  const { seo, workflow, sessionId, createdAt, userPrompt } = workflowData;
  const nodeCount = workflow?.nodes?.length || 0;

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="max-w-screen-lg mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6 mb-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-neutral-900 mb-1 line-clamp-2">
                {seo?.title || workflow?.settings?.name || "Workflow"}
              </h1>
              <p className="text-neutral-600">
                {seo?.description || "Automated workflow built with n8n"}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
              <a
                href={`/api/workflow/${sessionId}/export`}
                download={`${seo?.slug || "workflow"}.json`}
              >
                <Button className="w-full sm:w-auto">
                  <Download className="mr-2 h-4 w-4" /> Download JSON
                </Button>
              </a>
              <Button variant="secondary" className="w-full sm:w-auto">
                <Import className="mr-2 h-4 w-4" /> Import into n8n
              </Button>
            </div>
          </div>
        </div>

        {/* Main two-column layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left (2/3) - scrolls with page */}
          <div className="md:col-span-2 space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
              <h2 className="text-lg font-semibold text-neutral-900 mb-3">Information</h2>
              <p className="text-sm text-neutral-700">
                {userPrompt || "This workflow automates your process efficiently."}
              </p>
              {seo?.businessValue && (
                <div className="mt-4 flex items-center gap-2">
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium">
                    {seo.businessValue}
                  </span>
                  {seo?.category && (
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                      {seo.category}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
              <h2 className="text-lg font-semibold text-neutral-900 mb-3">Integrations</h2>
              <div className="flex flex-wrap gap-2">
                {seo?.integrations?.length > 0 ? (
                  seo.integrations.map((integration, i) => (
                    <span key={i} className="px-3 py-1 bg-neutral-100 text-neutral-700 rounded-full text-sm">
                      {integration}
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-neutral-500">No integrations specified</p>
                )}
              </div>
            </div>
          </div>

          {/* Right (1/3) - sticky on desktop, stacks to bottom on mobile */}
          <div className="md:col-span-1 md:sticky md:top-4 md:self-start">
            <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
              <h3 className="text-sm font-semibold text-neutral-900">
                Details
              </h3>
              <dl className="mt-3 text-sm text-neutral-700 space-y-2">
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Category</dt>
                  <dd>{seo?.category || "Automation"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Created at</dt>
                  <dd>{new Date(createdAt).toLocaleDateString()}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Nodes</dt>
                  <dd>{nodeCount}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
