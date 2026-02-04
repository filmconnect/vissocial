"use client";

export function Badge({children,tone="neutral"}:{children:React.ReactNode;tone?:"neutral"|"good"|"warn"|"bad"|"info"}) {
  const cls = {neutral:"bg-zinc-100 text-zinc-700",good:"bg-emerald-100 text-emerald-800",warn:"bg-amber-100 text-amber-800",bad:"bg-rose-100 text-rose-800",info:"bg-sky-100 text-sky-800"}[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}
