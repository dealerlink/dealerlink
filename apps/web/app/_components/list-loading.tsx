import { LoadingSkeleton } from './loading-skeleton';

/**
 * Full-page loading placeholder for a list route. Mirrors the standard list
 * layout — titlecaps strip, page heading, then the table skeleton — so the
 * route's `loading.tsx` is a one-liner and there is no layout shift when the
 * real page paints.
 */
export function ListLoading({ columns = 6 }: { columns?: number }) {
  return (
    <div className="px-6 py-5">
      <div className="skel mb-2 h-[10px] w-24 rounded-[3px]" />
      <div className="skel mb-5 h-[26px] w-52 rounded-[4px]" />
      <LoadingSkeleton columns={columns} />
    </div>
  );
}
