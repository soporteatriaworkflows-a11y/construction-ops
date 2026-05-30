import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Construction Ops",
  description: "Plataforma interna de gestión de costos y seguimiento de obra.",
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
