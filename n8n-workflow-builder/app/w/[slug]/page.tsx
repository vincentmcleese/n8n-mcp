// app/w/[slug]/page.tsx

import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getWorkflowQueries } from "@/lib/db/workflow-queries";
import { Button } from "@/components/ui/button";
import { NodeIcon } from "@/components/ui/node-icon";
import { resolveIconName } from "@/lib/icon-aliases";
import { VettedBadge } from "@/components/ui/vetted-badge";
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

  const { seo, workflow, sessionId, createdAt, userPrompt, configAnalysis } =
    workflowData;
  const nodeCount = workflow?.nodes?.length || 0;
  const orderedNodes = Array.isArray(workflow?.nodes)
    ? workflow.nodes.filter((node: any) => {
        const base = String(node?.type || "")
          .replace("n8n-nodes-base.", "")
          .replace("nodes-base.", "")
          .split(".")[0];
        return base !== "stickyNote";
      })
    : [];
  const getIconName = (nodeType: string) => {
    const base = nodeType
      .replace("n8n-nodes-base.", "")
      .replace("nodes-base.", "")
      .split(".")[0];
    return resolveIconName(base);
  };

  return (
    <div className="min-h-[calc(100vh-60px)] bg-neutral-50">
      <div className="max-w-screen-lg mx-auto px-4 pt-7 sm:pt-8 md:pt-10 pb-8">
        {/* Action buttons row */}
        <div className="flex justify-end gap-2 mb-4">
          <a
            href={`/api/workflow/${sessionId}/export`}
            download={`${seo?.slug || "workflow"}.json`}
          >
            <Button>
              <Download className="mr-2 h-4 w-4" /> Download JSON
            </Button>
          </a>
          <Button variant="secondary">
            <Import className="mr-2 h-4 w-4" /> Import into n8n
          </Button>
        </div>

        {/* Title directly on grey background */}
        <h1 className="text-2xl font-bold text-neutral-900 mb-6">
          {seo?.title || workflow?.settings?.name || "Workflow"}
        </h1>

        {/* Main two-column layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left (2/3) - scrolls with page */}
          <div className="md:col-span-2 space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
              <h2 className="text-lg font-semibold text-neutral-900 mb-3">
                Description
              </h2>
              <p className="text-sm text-neutral-700 mb-3">
                {seo?.description || "Automated workflow built with n8n"}
              </p>
              {userPrompt && (
                <>
                  <h3 className="text-sm font-semibold text-neutral-900 mb-2">
                    Original Request
                  </h3>
                  <p className="text-sm text-neutral-700">{userPrompt}</p>
                </>
              )}
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
              <h2 className="text-lg font-semibold text-neutral-900 mb-1">
                Guide
              </h2>
              <p className="text-sm text-neutral-600 mb-4">
                Node by node setup guide
              </p>
              {orderedNodes.length > 0 ? (
                <ol className="space-y-3">
                  {orderedNodes.map((node: any, idx: number) => (
                    <li key={node.id ?? idx} className="flex items-start gap-3">
                      <div className="mt-0.5">
                        <NodeIcon
                          name={getIconName(node.type)}
                          size={20}
                          className="h-6 w-6"
                          forceBackground
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-neutral-900 truncate">
                          {node.name ||
                            node.type.replace("n8n-nodes-base.", "")}
                        </div>
                        <div className="text-xs text-neutral-500 truncate">
                          {node.type.replace("n8n-nodes-base.", "")}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-neutral-500">No nodes found</p>
              )}
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
              <h2 className="text-lg font-semibold text-neutral-900 mb-3">
                Integrations
              </h2>
              <div className="flex flex-wrap gap-2">
                {seo?.integrations?.length > 0 ? (
                  seo.integrations.map((integration, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 bg-neutral-100 text-neutral-700 rounded-full text-sm"
                    >
                      {integration}
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-neutral-500">
                    No integrations specified
                  </p>
                )}
              </div>
            </div>

            {/* Configuration Analysis Card moved to left column */}
            {configAnalysis && (
              <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
                <h2 className="text-lg font-semibold text-neutral-900 mb-3">
                  Configuration Status
                </h2>
                <div className="mb-4 p-3 bg-neutral-50 rounded-md">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Overall Status</span>
                    <span
                      className={`text-sm font-semibold ${
                        configAnalysis.isComplete
                          ? "text-green-600"
                          : "text-orange-600"
                      }`}
                    >
                      {configAnalysis.isComplete
                        ? "Ready"
                        : "Needs Configuration"}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-600">
                    {configAnalysis.configuredNodes} of{" "}
                    {configAnalysis.totalNodes} nodes configured
                  </div>
                  {configAnalysis.missingCredentials?.length > 0 && (
                    <div className="mt-2 text-xs text-orange-600">
                      Missing credentials:{" "}
                      {configAnalysis.missingCredentials.join(", ")}
                    </div>
                  )}
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Node Details
                  </div>
                  {configAnalysis.nodes?.map((node: any) => (
                    <div
                      key={node.id}
                      className="p-2 bg-neutral-50 rounded text-xs"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-medium text-neutral-900">
                          {node.name}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-xs ${
                            node.status === "configured"
                              ? "bg-green-100 text-green-700"
                              : node.status === "needs_credentials"
                              ? "bg-orange-100 text-orange-700"
                              : node.status === "needs_decisions"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {node.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="text-neutral-600 text-xs">
                        {node.purpose}
                      </div>
                      {node.needsCredentials?.length > 0 && (
                        <div className="mt-1 text-orange-600">
                          Needs:{" "}
                          {node.needsCredentials
                            .map((c: any) => c.variable)
                            .join(", ")}
                        </div>
                      )}
                      {node.needsDecisions?.length > 0 && (
                        <div className="mt-1 text-blue-600">
                          Decisions: {node.needsDecisions.length} required
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right (1/3) - sticky on desktop, with padding under header */}
          <div className="md:col-span-1 md:sticky md:top-[76px] md:self-start">
            <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
              {workflowData.isVetted && (
                <div className="mb-4">
                  <VettedBadge className="w-full justify-center" />
                </div>
              )}
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
