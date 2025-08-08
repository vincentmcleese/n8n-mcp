"use client";
import React, { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const outcomes: { label: string; prompt: string }[] = [
  {
    label: "I want to spend less time on email",
    prompt:
      "Categorize incoming emails, generate a daily summary, and send it at 5pm.",
  },
  {
    label: "I want to get more leads from SEO",
    prompt:
      "Capture organic contact form submissions, enrich with Clearbit, add to HubSpot, and alert Slack.",
  },
  {
    label: "I want to stay hyperinformed on a topic",
    prompt:
      "Watch RSS feeds for 'AI regulation', summarize daily, and post to Slack.",
  },
];

export default function StartPage() {
  const [prompt, setPrompt] = useState("");
  const disabled = prompt.trim().length === 0;

  const onUseExample = (e: string) => setPrompt(e);
  const onSubmit = () => {
    // Placeholder: navigate to a session or to /test for now
    window.location.href = "/test";
  };
  const onKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (!disabled) onSubmit();
    }
  };

  return (
    <div className="min-h-[calc(100vh-60px)]">
      <section className="relative overflow-hidden">
        <div className="max-w-screen-md mx-auto container-padding section-padding">
          <div className="card-glass text-center p-8 sm:p-10">
            <div className="flex justify-center">
              <div className="card-icon">
                <i className="fa-solid fa-rocket" />
              </div>
            </div>
            <h1 className="hero-title mt-4">Build your workflow</h1>
            <p className="hero-subtitle mt-2">
              Describe what you want to automate — we’ll find nodes, configure
              them, and assemble a workflow for you.
            </p>

            <div className="mt-6 text-left">
              <div className="group relative rounded-2xl border border-neutral-200 bg-white/80 backdrop-blur-sm shadow-sm transition-spring ring-0 focus-within:ring-1 focus-within:ring-neutral-300">
                <Textarea
                  placeholder="e.g., Send a Slack message when a new GitHub issue is created"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={onKeyDown}
                  className="min-h-[112px] w-full resize-none bg-transparent border-0 focus:outline-none focus:ring-0 text-base sm:text-lg leading-relaxed placeholder-neutral-400"
                />
              </div>
              <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div
                  className="flex flex-wrap justify-center sm:justify-start gap-2 animate-slide-in"
                  style={{ animationDelay: "80ms" }}
                >
                  {outcomes.map((ex) => (
                    <button
                      key={ex.label}
                      onClick={() => onUseExample(ex.prompt)}
                      className="tag"
                      type="button"
                      aria-label={`Use example: ${ex.label}`}
                    >
                      <i className="fa-solid fa-wand-magic-sparkles icon-sm" />{" "}
                      {ex.label}
                    </button>
                  ))}
                </div>
                <div className="flex justify-center sm:justify-end">
                  <button
                    className="btn btn-primary"
                    onClick={onSubmit}
                    disabled={disabled}
                  >
                    <i className="fa-solid fa-bolt icon-sm" /> Start
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
