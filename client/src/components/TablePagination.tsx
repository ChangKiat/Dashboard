interface Props {
    page: number;
    totalPages: number;
    totalItems: number;
    onPageChange: (page: number) => void;
}

export default function TablePagination({ page, totalPages, totalItems, onPageChange }: Props) {
    if (totalItems <= 0 || totalPages <= 1) {
        return null;
    }

    return (
        <div className="table-pagination">
            <span className="table-pagination-label">
                Page {page} of {totalPages} ({totalItems} items)
            </span>
            <div className="table-pagination-controls">
                <button
                    type="button"
                    className="btn-secondary"
                    disabled={page <= 1}
                    onClick={() => onPageChange(page - 1)}
                >
                    Prev
                </button>
                <button
                    type="button"
                    className="btn-secondary"
                    disabled={page >= totalPages}
                    onClick={() => onPageChange(page + 1)}
                >
                    Next
                </button>
            </div>
        </div>
    );
}
