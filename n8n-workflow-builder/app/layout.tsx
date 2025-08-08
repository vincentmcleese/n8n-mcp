import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "n8n Workflow Builder",
  description: "Create powerful automation workflows with AI assistance",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="min-h-screen bg-emerald-gradient">
          <header className="sticky top-0 z-40 bg-[rgba(236,244,240,0.7)] backdrop-blur border-b border-neutral-200">
            <div className="max-w-screen-lg mx-auto px-4 py-3 flex items-center justify-between">
              <div className="text-base sm:text-lg font-semibold tracking-tight text-neutral-900">
                n8n Workflow Builder
              </div>
              <nav className="hidden sm:flex items-center gap-4 text-sm text-neutral-600">
                <a href="/start" className="hover:text-neutral-900">
                  Start
                </a>
                <a href="/test" className="hover:text-neutral-900">
                  Demo
                </a>
              </nav>
            </div>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
