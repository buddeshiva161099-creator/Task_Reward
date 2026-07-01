import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { OwnerAuthProvider } from "@/contexts/OwnerAuthContext";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "TalentFlow - Unified HRM & Task Management",
  description: "Modern platform for managing employees, tasks, productivity tracking, and rewards",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;505;700;900&family=Outfit:wght@300;400;505;600;700;800;950&family=JetBrains+Mono:wght@300;400;505;600;700;800&family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{__html: `
          (function() {
            const theme = localStorage.getItem('app-theme') || 'light';
            document.documentElement.setAttribute('data-theme', theme);
            if (theme === 'dark' || theme === 'cyberpunk' || theme === 'ocean' || theme === 'purple' || theme === 'forest') {
              document.documentElement.classList.add('dark');
            } else {
              document.documentElement.classList.remove('dark');
            }
            const font = localStorage.getItem('app-font') || 'inter';
            document.documentElement.setAttribute('data-font', font);
          })()
        `}} />
      </head>
      <body className={inter.className} spellCheck="false" suppressHydrationWarning>
        <AuthProvider>
          <OwnerAuthProvider>
            {children}
          </OwnerAuthProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
