"use client";

interface Props {
  page: number;
  totalPages: number;
  total: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}

export default function PaginationCompact({
  page,
  totalPages,
  total,
  loading,
  onPageChange,
}: Props) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-500 hidden sm:inline">
        {total.toLocaleString("es-AR")} productos
      </span>
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1 || loading}
        className="px-2 py-1 border rounded disabled:opacity-50 hover:bg-gray-50"
      >
        &larr;
      </button>
      <span className="text-gray-600">
        {page}/{totalPages}
      </span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages || loading}
        className="px-2 py-1 border rounded disabled:opacity-50 hover:bg-gray-50"
      >
        &rarr;
      </button>
    </div>
  );
}
