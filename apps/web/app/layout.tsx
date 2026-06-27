import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { getActiveWorkspace } from "@/lib/branding/workspace";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/components/shared/theme-provider";

const ws = getActiveWorkspace();

// Sistema tipográfico (V4.2.6): Inter como única familia UI (limpia, tecnológica,
// con buen peso de producto — no editorial). Datos en JetBrains Mono. La "display"
// es Inter en pesos altos + tracking apretado (utilidad font-display), no otra familia.
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], display: "swap", variable: "--font-mono" });

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
    <html lang="es" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable}`}>
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
