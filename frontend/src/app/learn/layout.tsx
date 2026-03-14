import { PublicHeader } from '@/components/layout';

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-page">
      <PublicHeader />
      <main className="pt-28 pb-20">
        <div className="max-w-3xl mx-auto px-6">
          {children}
        </div>
      </main>
      <footer className="border-t border-gray-200 bg-surface-page">
        <div className="max-w-3xl mx-auto px-6 py-8 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} Vigil. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
