import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Castle Chaos — A most uncivilised siege",
  description:
    "One castle. Questionable allies. Very real grudges. A 3D turn-based castle siege for 2–4 rulers.",
  icons: { icon: "/favicon.svg" },
  other: { "theme-color": "#111a15" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
