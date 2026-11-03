import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SynapseHealer | Autonomous Dead-Letter & Schema Healer",
  description: "AI Agent in Interoperability Workflows on InterSystems IRIS",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 min-h-screen selection:bg-blue-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
