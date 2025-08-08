"use client";
import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

export function ClarificationSheet({
  open,
  question,
  onSubmit,
}: {
  open: boolean;
  question: string;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <Dialog open={open}>
      <DialogContent className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-screen-sm rounded-t-2xl border border-neutral-200 bg-white p-4 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-medium text-neutral-900">
            Quick question
          </DialogTitle>
        </DialogHeader>
        <div className="text-sm text-neutral-600 mb-3">{question}</div>
        <div className="flex items-center gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Your answer…"
            className="flex-1"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && value.trim()) onSubmit(value.trim());
            }}
          />
          <Button
            onClick={() => value.trim() && onSubmit(value.trim())}
            disabled={!value.trim()}
          >
            Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
