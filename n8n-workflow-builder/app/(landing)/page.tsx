"use client";

import React, { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase-client";
import { nanoid } from "nanoid";

const outcomes: { label: string; prompt: string }[] = [
  {
    label: "spend less time on email",
    prompt:
      "Categorize incoming emails, generate a daily summary, and send it at 5pm.",
  },
  {
    label: "get more leads from SEO",
    prompt:
      "Capture organic contact form submissions, enrich with Clearbit, add to HubSpot, and alert Slack.",
  },
  {
    label: "stay hyperinformed on a topic",
    prompt:
      "Watch RSS feeds for 'AI regulation', summarize daily, and post to Slack.",
  },
  {
    label: "sync sales leads to my CRM",
    prompt:
      "Parse new form fills, enrich with Clearbit, dedupe, and add to HubSpot with a Slack alert.",
  },
  {
    label: "get alerts for VIP customer tickets",
    prompt:
      "When a Zendesk ticket from VIP domains arrives, notify Slack, tag ticket, and create a follow-up task.",
  },
  {
    label: "post weekly changelogs",
    prompt:
      "Collect merged PR titles from GitHub, summarize, and post to Slack and Notion each Friday.",
  },
  {
    label: "back up invoices automatically",
    prompt:
      "When a new invoice PDF is emailed, save to Google Drive, rename, and log to a spreadsheet.",
  },
  {
    label: "track mentions on social",
    prompt:
      "Monitor Twitter mentions, classify sentiment, and post a daily digest to Slack.",
  },
  {
    label: "summarize NPS responses",
    prompt:
      "Collect NPS responses from Typeform, summarize themes by score, and email a weekly report.",
  },
];

// All landing page body text uses a single paragraph size
const PARAGRAPH_TEXT_CLASS = "text-base";

export default function Home() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hoverPrompt, setHoverPrompt] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const disabled = prompt.trim().length === 0 || loading;
  const inputWrapperRef = useRef<HTMLDivElement | null>(null);
  const supabase = createClient();

  useEffect(() => {
    // Check if user is authenticated
    const checkUser = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setUser(user);
      } catch (error) {
        console.error("Error checking auth:", error);
      } finally {
        setCheckingAuth(false);
      }
    };

    checkUser();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  const onUseExample = (e: string) => setPrompt(e);
  const pulseInputRing = () => {
    const el = inputWrapperRef.current;
    if (!el) return;
    el.classList.remove("pulse-emerald-ring");
    // force reflow to allow re-adding animation class
    void el.offsetWidth;
    el.classList.add("pulse-emerald-ring");
    window.setTimeout(() => {
      el.classList.remove("pulse-emerald-ring");
    }, 800);
  };
  const handleUseExample = (e: string) => {
    onUseExample(e);
    setHoverPrompt(null);
    pulseInputRing();
  };
  const onKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (!disabled) void onSubmit();
    }
  };

  const onSubmit = async () => {
    try {
      setLoading(true);
      setError("");

      // Check if user is authenticated
      if (!user) {
        // Generate a workflow session ID upfront
        const timestamp = Date.now();
        const random = nanoid(10);
        const workflowSessionId = `wf_${timestamp}_${random}`;

        // Generate a session token for anonymous user
        const sessionToken = `anon_${nanoid(16)}`;

        // Store the prompt data in the sessions table
        const tempPromptData = {
          prompt,
          workflowSessionId, // Store the workflow session ID
          returnUrl: `/workflow/${workflowSessionId}`,
          timestamp: new Date().toISOString(),
        };

        // Store in Supabase sessions table
        const { error: sessionError } = await supabase.from("sessions").insert({
          id: sessionToken,
          session_token: sessionToken,
          temp_prompt_data: tempPromptData,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
          created_at: new Date().toISOString(),
          last_activity: new Date().toISOString(),
        });

        if (sessionError) {
          console.error("Failed to store session:", sessionError);
          throw new Error("Failed to save your workflow prompt");
        }

        // Store session token in localStorage for retrieval after auth
        localStorage.setItem("pending_workflow_session", sessionToken);

        // Redirect to login page with the workflow session ID
        router.push(`/auth/login?returnUrl=/workflow/${workflowSessionId}`);
        return;
      }

      // User is authenticated, create workflow directly
      const res = await fetch("/api/workflow/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error("Failed to create workflow");
      const data = await res.json();
      router.push(`/workflow/${data.sessionId}`);
    } catch (e: any) {
      setError(e.message || "Failed to create workflow. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 -z-10 bg-emerald-gradient" />
      <div className="min-h-[calc(100vh-60px)]">
        <section className="relative overflow-hidden pt-6 sm:pt-10 md:pt-14">
          <div className="max-w-screen-md mx-auto container-padding section-padding">
            <div className="card text-center p-8 sm:p-10 rounded-none sm:rounded-2xl bg-white/60 border border-neutral-200 shadow-sm">
              <div className="flex justify-center">
                <div className="card-icon bg-[rgba(27,200,140,0.12)] text-emerald-700">
                  <i className="fa-solid fa-rocket" />
                </div>
              </div>
              <h1 className="mt-4 text-3xl sm:text-4xl font-semibold tracking-tight text-neutral-900">
                Power growth with n8n
              </h1>
              <p className={`mt-2 ${PARAGRAPH_TEXT_CLASS} text-neutral-700`}>
                Describe what you want to automate — we’ll find nodes, configure
                them, and assemble a workflow for you.
              </p>

              <div className="mt-6 text-left">
                <div
                  ref={inputWrapperRef}
                  className="group relative rounded-2xl border border-neutral-200 bg-white/80 backdrop-blur-sm shadow-sm transition-spring ring-0 focus-within:ring-1 focus-within:ring-neutral-300"
                >
                  <Textarea
                    placeholder="e.g., Send a Slack message when a new GitHub issue is created"
                    value={hoverPrompt ?? prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={onKeyDown}
                    className={`min-h-[112px] w-full resize-none bg-transparent border-0 focus:outline-none focus:ring-0 ${PARAGRAPH_TEXT_CLASS} leading-relaxed placeholder-neutral-400`}
                  />
                </div>
                <div className="mt-4 flex justify-center">
                  <Button
                    className="btn btn-primary"
                    onClick={onSubmit}
                    disabled={disabled || checkingAuth}
                  >
                    <i className="fa-solid fa-bolt icon-sm" />{" "}
                    {loading
                      ? checkingAuth
                        ? "Checking..."
                        : "Starting..."
                      : "Start"}
                  </Button>
                </div>
                {error && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg">
                    {error}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="max-w-screen-md mx-auto container-padding">
            <div
              className={`mt-6 mb-1 text-center ${PARAGRAPH_TEXT_CLASS} font-medium tracking-wide text-white/90`}
            >
              Need an idea?{" "}
              <span className="opacity-90">I&apos;d like to…</span>
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-1 sm:gap-1.5">
              {outcomes.map((ex) => (
                <button
                  key={ex.label}
                  onClick={() => handleUseExample(ex.prompt)}
                  onMouseEnter={() => setHoverPrompt(ex.prompt)}
                  onMouseLeave={() => setHoverPrompt(null)}
                  className={`inline-flex items-center gap-1 rounded-full border border-emerald-500 bg-emerald-500 text-white transition-all hover:bg-emerald-400 hover:-translate-y-0.5 shadow-[0_2px_8px_rgba(27,200,140,0.25)] hover:shadow-[0_4px_12px_rgba(27,200,140,0.35)] px-2.5 py-1 ${PARAGRAPH_TEXT_CLASS}`}
                  type="button"
                  aria-label={`Use example: ${ex.label}`}
                >
                  <i className="fa-solid fa-wand-magic-sparkles text-current leading-none" />
                  <span>{ex.label}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
