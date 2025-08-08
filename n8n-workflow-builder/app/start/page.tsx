"use client";
import React, { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const examples = [
  "send a Slack message when a new GitHub issue is created",
  "parse incoming emails and add order details to Airtable",
  "watch Stripe payments and add paying users to MailerLite",
  "receive a webhook, transform JSON, and post to Notion",
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
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(1200px_400px_at_50%_-100px,rgba(99,102,241,0.25),transparent_60%)]" />
        <div className="max-w-screen-md mx-auto px-4 py-14">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-neutral-900">
            What would you like to automate?
          </h1>
          <div className="mt-2 text-sm text-neutral-600">
            Describe your workflow.
          </div>

          <div className="mt-6">
            <div className="group relative rounded-2xl border border-neutral-200 bg-white/80 backdrop-blur-sm shadow-sm transition ring-0 focus-within:ring-1 focus-within:ring-neutral-300">
              <Textarea
                placeholder="e.g., Send a Slack message when a new GitHub issue is created"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={onKeyDown}
                className="min-h-[112px] w-full resize-none bg-transparent border-0 focus:outline-none focus:ring-0 text-base sm:text-lg leading-relaxed placeholder-neutral-400"
              />
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div
                className="flex flex-wrap gap-1.5 animate-slide-in"
                style={{ animationDelay: "80ms" }}
              >
                {examples.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => onUseExample(`I want to ${ex}`)}
                    className="px-2.5 py-1 rounded-full text-[11px] bg-white text-neutral-700 border border-neutral-200 shadow-sm hover:border-neutral-300 hover:shadow transition"
                    type="button"
                    aria-label={`Use example: I want to ${ex}`}
                  >
                    <span className="text-neutral-500">I want to</span>
                    <span className="mx-1">·</span>
                    <span className="font-medium text-neutral-800">{ex}</span>
                  </button>
                ))}
              </div>
              <Button
                onClick={onSubmit}
                disabled={disabled}
                variant="brand"
                size="xl"
                className="animate-fade-in"
                style={{ animationDelay: "120ms" }}
              >
                Start
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
