import { useEffect, useRef, useState } from 'react';
import { derivClient } from '../deriv-client';

export type ActiveSymbol = {
    symbol: string;
    display_name: string;
    market: string;
    submarket: string;
    submarket_display_name: string;
    symbol_type?: string;
    pip: number;
    exchange_is_open: number;
};

const EXCLUDED_SUBMARTKETS = new Set(['forex_basket', 'baskets', 'commodities_basket']);

function filterSymbols(raw: ActiveSymbol[]): ActiveSymbol[] {
    const allSynthetic = raw.filter(
        s => s.market === 'synthetic_index' && !EXCLUDED_SUBMARTKETS.has(s.submarket)
    );
    const openSynthetic = allSynthetic.filter(s => s.exchange_is_open === 1);
    if (openSynthetic.length > 0) return openSynthetic;
    if (allSynthetic.length > 0) return allSynthetic;
    return raw.filter(s => s.market === 'synthetic_index');
}

async function fetchSymbols(): Promise<ActiveSymbol[]> {
    try {
        const resp = await derivClient.send<{ active_symbols?: ActiveSymbol[]; error?: unknown }>({
            active_symbols: 'brief',
        });

        const rawList = Array.isArray(resp?.active_symbols) ? resp.active_symbols! : [];
        if (rawList.length > 0) {
            return filterSymbols(rawList);
        }
    } catch {}
    return [];
}

let fetchPromise: Promise<ActiveSymbol[]> | null = null;
let cachedResult: ActiveSymbol[] | null = null;

export function useActiveSymbols() {
    const [symbols, setSymbols] = useState<ActiveSymbol[]>(cachedResult ?? []);
    const [loading, setLoading] = useState(!cachedResult || cachedResult.length === 0);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;

        if (cachedResult && cachedResult.length > 0) {
            setSymbols(cachedResult);
            setLoading(false);
            return;
        }

        if (!fetchPromise) {
            fetchPromise = fetchSymbols();
        }

        fetchPromise.then(syms => {
            if (!mountedRef.current) return;
            cachedResult = syms.length > 0 ? syms : null;
            fetchPromise = null;
            setSymbols(syms);
            setLoading(false);
        });

        return () => {
            mountedRef.current = false;
        };
    }, []);

    return { symbols, loading };
}
