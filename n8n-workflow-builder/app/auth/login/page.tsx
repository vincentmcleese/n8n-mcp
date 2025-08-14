"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-client";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [checkingSession, setCheckingSession] = useState(true);
  const returnUrl = searchParams.get("returnUrl") || "/";
  const supabase = createClient();

  useEffect(() => {
    // Check if user is already authenticated
    const checkAuth = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          // User is already authenticated
          const pendingSession = localStorage.getItem(
            "pending_workflow_session"
          );

          if (pendingSession && returnUrl === "/workflow/create") {
            // User has a pending workflow, redirect to create it
            router.push("/workflow/create");
          } else {
            // Redirect to return URL
            router.push(returnUrl);
          }
        }
      } catch (error) {
        console.error("Error checking auth:", error);
      } finally {
        setCheckingSession(false);
      }
    };

    checkAuth();
  }, [router, returnUrl, supabase.auth]);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setError("");

      // Store the pending session info for retrieval after OAuth
      const pendingSession = localStorage.getItem("pending_workflow_session");
      if (pendingSession) {
        // Store it in sessionStorage too as backup
        sessionStorage.setItem("pending_workflow_session", pendingSession);
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${
            window.location.origin
          }/api/auth/callback?redirectTo=${encodeURIComponent(returnUrl)}`,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (error) {
        throw error;
      }
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err.message || "Failed to sign in. Please try again.");
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto"></div>
          <p className="mt-4 text-neutral-600">Checking session...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 -z-10 bg-emerald-gradient" />
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="card p-8 rounded-2xl bg-white/80 backdrop-blur-sm border border-neutral-200 shadow-lg">
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="card-icon bg-[rgba(27,200,140,0.12)] text-emerald-700">
                  <i className="fa-solid fa-lock" />
                </div>
              </div>

              <h1 className="text-2xl font-semibold text-neutral-900 mb-2">
                Sign in to continue
              </h1>

              <p className="text-base text-neutral-600 mb-8">
                {returnUrl === "/workflow/create"
                  ? "Sign in to create your workflow automation"
                  : "Sign in to access your workflows"}
              </p>

              <div className="space-y-4">
                <Button
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full btn btn-primary flex items-center justify-center gap-3"
                >
                  {!loading && (
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                  )}
                  {loading ? "Signing in..." : "Continue with Google"}
                </Button>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
                    {error}
                  </div>
                )}
              </div>

              <p className="mt-6 text-sm text-neutral-500">
                By signing in, you agree to our Terms of Service and Privacy
                Policy
              </p>
            </div>
          </div>

          <div className="mt-4 text-center">
            <button
              onClick={() => router.push("/")}
              className="text-white/90 hover:text-white text-sm transition-colors"
            >
              ← Back to home
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
