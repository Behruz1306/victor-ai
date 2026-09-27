export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 py-6 sm:px-8 sm:py-8" aria-busy aria-live="polite">
      <div className="skeleton h-8 w-64" />
      <div className="skeleton h-4 w-96 max-w-full" />
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <div className="skeleton h-28 rounded-lg" />
        <div className="skeleton h-28 rounded-lg" />
        <div className="skeleton h-28 rounded-lg" />
      </div>
      <div className="skeleton h-40 rounded-lg" />
      <div className="skeleton h-40 rounded-lg" />
    </div>
  );
}
