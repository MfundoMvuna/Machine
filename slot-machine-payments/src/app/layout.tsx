import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Slot Machine | Secure Payment Gateway Demo",
  description:
    "A FinTech portfolio project demonstrating payment gateway integration, server-side game logic, secure webhook handling, and transaction persistence.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning className="antialiased min-h-screen bg-[#0a0a0a]">
        {children}
      </body>
    </html>
  );
}
