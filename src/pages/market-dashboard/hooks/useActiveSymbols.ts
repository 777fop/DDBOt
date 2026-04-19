import { useEffect, useState } from 'react';
import { api_base } from '@/external/bot-skeleton';

export type ActiveSymbol = {
    symbol: string;
    display_name: string;
    market: string;
    submarket: string;
    submarket_display_name: string;
    pip: number;
    exchange_is_open: number;
};

const SYNTHETIC_MARKETS = new Set(['synthetic_index']);

function isSyntheticIndex(sym: ActiveSymbol): boolean {
    return SYNTHETIC_MARKETS.has(sym.market);
}

function filterAndSort(rawList: ActiveSymbol[]): ActiveSymbol[] {
    const synthetic = rawList.filter(isSyntheticIndex);
    return synthetic.length > 0 ? synthetic : rawList;
}

async function ensureWsReady(): Promise<void> {
    const ab = api_base as any;
    const api = ab?.api;
    const wsReady = api && api.connection?.readyState === 1;
    if (!wsReady) {
        try {
            await ab.init();
        } catch {}
        const apiAfter = ab?.api;
        if (!apiAfter || apiAfter.connection?.readyState !== 1) {
            await new Promise<void>(resolve => {
                const poll = setInterval(() => {
                    const a = (api_base as any)?.api;
                    if (a && a.connection?.readyState === 1) {
                        clearInterval(poll);
                        resolve();
                    }
                }, 300);
                setTimeout(() => { clearInterval(poll); resolve(); }, 20000);
            });
        }
    }
}

async function loadSymbols(): Promise<ActiveSymbol[]> {
    const ab = api_base as any;

    await ensureWsReady();

    const fromApiBase = (): ActiveSymbol[] | null => {
        const syms = ab?.active_symbols;
        return Array.isArray(syms) && syms.length > 0 ? (syms as ActiveSymbol[]) : null;
    };

    const tryLandingCompanies = ['svg', 'maltainvest', null];

    for (const lc of tryLandingCompanies) {
        try {
            const req: Record<string, unknown> = { active_symbols: 'brief' };
            if (lc) req.landing_company_short = lc;
            const resp = await ab.api.send(req);
            const rawList: ActiveSymbol[] = Array.isArray(resp?.active_symbols) ? resp.active_symbols : [];
            if (rawList.length > 0) {
                return filterAndSort(rawList);
            }
        } catch {}
    }

    const fromBase = fromApiBase();
    if (fromBase) return filterAndSort(fromBase);

    return [];
}

let cachedSymbols: ActiveSymbol[] | null = null;
let globalFetch: Promise<ActiveSymbol[]> | null = null;

export function useActiveSymbols() {
    const [symbols, setSymbols] = useState<ActiveSymbol[]>(cachedSymbols ?? []);
    const [loading, setLoading] = useState(cachedSymbols === null || cachedSymbols.length === 0);

    useEffect(() => {
        if (cachedSymbols && cachedSymbols.length > 0) {
            setSymbols(cachedSymbols);
            setLoading(false);
            return;
        }

        if (!globalFetch) {
            globalFetch = loadSymbols();
        }

        let mounted = true;
        globalFetch.then(syms => {
            if (!mounted) return;
            cachedSymbols = syms;
            globalFetch = null;
            setSymbols(syms);
            setLoading(false);
        });

        return () => {
            mounted = false;
        };
    }, []);

    return { symbols, loading };
}
