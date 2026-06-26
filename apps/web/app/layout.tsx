import type { Metadata } from "next";
import "./globals.css";
import { getActiveWorkspace } from "@/lib/branding/workspace";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/components/shared/theme-provider";

const ws = getActiveWorkspace();

export const metadata: Metadata = {
  title: { default: `${ws.productName} · ${ws.workspaceName}`, template: `%s · ${ws.productName}` },
  description: `${ws.descriptor} — ${ws.workspaceName}.`,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Aplica el tema antes del paint (anti-FOUC / anti hydration mismatch). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
