import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LabPrint - System Ready",
  description: "LabPrint AI pH Analysis System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
