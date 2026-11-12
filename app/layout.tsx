import type { Metadata } from "next";
import "./globals.css";
import ReadingProgress from "@/components/reading-progress";
import DarkModeToggle from "@/components/dark-mode-toggle";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: {
    default: site.name,
    template: `%s — ${site.name}`,
  },
  description: site.description,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <ReadingProgress />

        <div className="shell">
          <header className="site-header">
            <div className="site-title">
              <a href="/">{site.name}</a>
            </div>
            <nav className="site-nav" aria-label="Main navigation">
              <DarkModeToggle />
            </nav>
          </header>
          <main>{children}</main>
          <footer className="site-footer">
            <p>Built with Next.js • Deployed on Vercel</p>
          </footer>
        </div>
      </body>
    </html>
  );
}