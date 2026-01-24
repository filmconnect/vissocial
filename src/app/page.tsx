export default function Home() {
  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">Vissocial</h1>
      <p className="text-zinc-600">Chat-first generator for Instagram. Connect → onboard in chat → generate → review → publish → learn.</p>
      <div className="flex gap-3">
        <a className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white" href="/chat">Open Chat</a>
        <a className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900" href="/settings">Connect Instagram</a>
      </div>
    </main>
  );
}
