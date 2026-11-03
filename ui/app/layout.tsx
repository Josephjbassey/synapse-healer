import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SynapseHealer | Autonomous Dead-Letter & Schema Healer",
  description: "Enterprise Interoperability DLQ Autonomous Healer on InterSystems IRIS 2027.1 AI Hub",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="carbon-canvas text-zinc-100 min-h-screen selection:bg-cyan-500/20 selection:text-cyan-200 antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
