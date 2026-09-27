export default function Loading() {
  return (
    <div className="flex flex-col gap-3" aria-busy>
      <div className="h-7 w-48 animate-pulse rounded-md bg-muted" />
      <div className="h-32 animate-pulse rounded-lg bg-muted" />
      <div className="h-32 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
