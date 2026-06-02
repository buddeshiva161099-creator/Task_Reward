import { Skeleton } from "./Skeleton";

export function CardSkeleton() {
  return (
    <div className="glass rounded-xl p-5 border border-slate-100/50 shadow-sm space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number, cols?: number }) {
  return (
    <div className="glass rounded-xl border border-border overflow-hidden">
      <div className="bg-slate-50 border-b border-border px-6 py-4">
        <div className="flex justify-between">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-24" />
          ))}
        </div>
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-6 py-4 flex justify-between">
            {Array.from({ length: cols }).map((_, j) => (
              <Skeleton key={j} className="h-4 w-20" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-2.5">
          <Skeleton className="w-8 h-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="w-12 h-4" />
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-8 pb-12">
      {/* Header Skeleton */}
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div className="space-y-2">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
      </div>

      {/* AI Insight Panel Skeleton */}
      <div className="glass rounded-2xl p-6 border border-indigo-100 space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="w-5 h-5" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </div>

      {/* Performance Panel Skeleton */}
      <div className="bg-indigo-950 rounded-2xl p-6 space-y-6">
        <div className="flex justify-between border-b border-indigo-800 pb-4">
          <div className="flex items-center gap-2">
            <Skeleton className="w-5 h-5 bg-indigo-800" />
            <div className="space-y-1">
              <Skeleton className="h-5 w-64 bg-indigo-800" />
              <Skeleton className="h-3 w-80 bg-indigo-800" />
            </div>
          </div>
          <Skeleton className="h-8 w-40 bg-indigo-800" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl bg-indigo-900" />
          ))}
        </div>
      </div>

      {/* Headcount Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
