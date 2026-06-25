import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  limit?: number;
  loading?: boolean;
}

export const PaginationControls: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  limit = 25,
  loading = false
}) => {
  if (totalPages <= 1) return null;

  // Smart page number generation with ellipsis
  const getPageNumbers = (): (number | 'ellipsis')[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | 'ellipsis')[] = [1];

    const rangeStart = Math.max(2, currentPage - 2);
    const rangeEnd = Math.min(totalPages - 1, currentPage + 2);

    if (rangeStart > 2) pages.push('ellipsis');
    for (let i = rangeStart; i <= rangeEnd; i++) pages.push(i);
    if (rangeEnd < totalPages - 1) pages.push('ellipsis');

    pages.push(totalPages);
    return pages;
  };

  const pages = getPageNumbers();

  // Calculate "Showing X–Y of Z"
  const from = totalItems !== undefined ? (currentPage - 1) * limit + 1 : null;
  const to = totalItems !== undefined ? Math.min(currentPage * limit, totalItems) : null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 bg-white border-t border-gray-100">
      <div className="text-sm text-gray-500 font-medium">
        {totalItems !== undefined && from !== null && to !== null ? (
          <>
            Showing <span className="font-bold text-gray-900">{from}</span>–
            <span className="font-bold text-gray-900">{to}</span> of{' '}
            <span className="font-bold text-gray-900">{totalItems}</span> results
          </>
        ) : (
          <>
            Page <span className="font-bold text-gray-900">{currentPage}</span> of{' '}
            <span className="font-bold text-gray-900">{totalPages}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1 || loading}
          className="flex items-center gap-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
          aria-label="Previous page"
        >
          <ChevronLeft size={15} /> Prev
        </button>

        <div className="flex gap-1">
          {pages.map((page, idx) =>
            page === 'ellipsis' ? (
              <span
                key={`ellipsis-${idx}`}
                className="w-8 h-8 flex items-center justify-center text-gray-400 text-sm font-bold select-none"
              >
                …
              </span>
            ) : (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                disabled={loading}
                aria-label={`Page ${page}`}
                aria-current={currentPage === page ? 'page' : undefined}
                className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  currentPage === page
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-100'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {page}
              </button>
            )
          )}
        </div>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages || loading}
          className="flex items-center gap-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
          aria-label="Next page"
        >
          Next <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
};
