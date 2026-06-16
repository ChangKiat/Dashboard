import { useEffect, useMemo, useState } from 'react';

const DEFAULT_PAGE_SIZE = 10;

interface Options {
    pageSize?: number;
}

export function usePagination<T>(items: T[], options: Options = {}) {
    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    const [page, setPage] = useState(1);

    const totalItems = items.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    useEffect(() => {
        setPage(1);
    }, [items, pageSize]);

    useEffect(() => {
        if (page > totalPages) {
            setPage(totalPages);
        }
    }, [page, totalPages]);

    const pageItems = useMemo(() => {
        const start = (page - 1) * pageSize;
        return items.slice(start, start + pageSize);
    }, [items, page, pageSize]);

    return {
        page,
        setPage,
        pageItems,
        totalPages,
        totalItems,
        pageSize,
    };
}
