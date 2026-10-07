import type { Metadata } from "next";
import "./globals.css";
import ReadingProgress from "@/components/reading-progress";
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
      <body>
        <ReadingProgress />

        <div className="shell">
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}