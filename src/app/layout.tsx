import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hr">
      <body className="min-h-screen bg-zinc-50 text-zinc-900">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <div className="mb-6 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-zinc-900" />
              <div>
                <div className="text-sm font-semibold">Vissocial</div>
                <div className="text-xs text-zinc-500">Chat-first MVP</div>
              </div>
            </a>
            <div className="flex items-center gap-3 text-sm">
              <a className="text-zinc-600 hover:text-zinc-900" href="/chat">Chat</a>
              <a className="text-zinc-600 hover:text-zinc-900" href="/calendar">Calendar</a>
              <a className="text-zinc-600 hover:text-zinc-900" href="/profile">Profile</a>
              <a className="text-zinc-600 hover:text-zinc-900" href="/settings">Settings</a>
            </div>
          </div>
          {children}
        </div>
      </body>
    </html>
  );
}
