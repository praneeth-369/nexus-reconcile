import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Nexus Reconcile | Financial Settlement Engine',
  description: 'Production-grade financial settlement reconciliation dashboard powered by Antigravity Agentic AI and Cloud Firestore audit store.',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 transition-colors duration-300">
        <Providers attribute="class" defaultTheme="dark" enableSystem>
          {children}
        </Providers>
      </body>
    </html>
  );
}
