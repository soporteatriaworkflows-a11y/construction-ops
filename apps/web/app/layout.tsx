import type { Metadata } from "next";
import "./globals.css";
import { getActiveWorkspace } from "@/lib/branding/workspace";

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
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
