import { useCallback, useEffect, useRef, useState } from 'react';
import { derivClient } from '../deriv-client';
import { ActiveSymbol } from './useActiveSymbols';

const DIGIT_HISTORY_SIZE = 100;
const CONFIRMED_THRESHOLD = 62;
const BATCH_INTERVAL_MS = 250;

export type SignalType = 'CONFIRMED' | 'NEUTRAL';
export type FavoredSide = 'EVEN' | 'ODD';

export type MarketData = {
    symbol: string;
    display_name: string;
    submarket_display_name: string;
    lastTick: number | null;
    digits: number[];
    evenPct: number;
    oddPct: number;
    signal: SignalType;
    favoredSide: FavoredSide;
    tickCount: number;
};

function getLastDigit(price: number): number {
    const str = price.toFixed(5);
    return parseInt(str[str.length - 1], 10);
}

function computeSignal(digits: number[]): { evenPct: number; oddPct: number; signal: SignalType; favoredSide: FavoredSide } {
    if (!digits.length) return { evenPct: 50, oddPct: 50, signal: 'NEUTRAL', favoredSide: 'EVEN' };
    const evenCount = digits.filter(d => d % 2 === 0).length;
    const evenPct = (evenCount / digits.length) * 100;
    const oddPct = 100 - evenPct;
    const signal: SignalType = evenPct >= CONFIRMED_THRESHOLD || oddPct >= CONFIRMED_THRESHOLD ? 'CONFIRMED' : 'NEUTRAL';
    const favoredSide: FavoredSide = evenPct >= oddPct ? 'EVEN' : 'ODD';
    return { evenPct, oddPct, signal, favoredSide };
}

function makeInitialRow(sym: ActiveSymbol): MarketData {
    return {
        symbol: sym.symbol,
        display_name: sym.display_name,
        submarket_display_name: sym.submarket_display_name,
        lastTick: null,
        digits: [],
        evenPct: 50,
        oddPct: 50,
        signal: 'NEUTRAL',
        favoredSide: 'EVEN',
        tickCount: 0,
    };
}

export function useMarketAnalysis(symbols: ActiveSymbol[]) {
    const [marketData, setMarketData] = useState<Map<string, MarketData>>(new Map());
    const dataRef = useRef<Map<string, MarketData>>(new Map());
    const dirtyRef = useRef(false);
    const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const subscriptionIdsRef = useRef<Map<string, string>>(new Map());

    const scheduleBatchUpdate = useCallback(() => {
        if (batchTimerRef.current) return;
        batchTimerRef.current = setTimeout(() => {
            batchTimerRef.current = null;
            if (dirtyRef.current) {
                dirtyRef.current = false;
                setMarketData(new Map(dataRef.current));
            }
        }, BATCH_INTERVAL_MS);
    }, []);

    useEffect(() => {
        if (!symbols.length) return;

        symbols.forEach(sym => {
            if (!dataRef.current.has(sym.symbol)) {
                dataRef.current.set(sym.symbol, makeInitialRow(sym));
            }
        });
        setMarketData(new Map(dataRef.current));

        console.log('[MarketAnalysis] Registering message handler, sending subscriptions for', symbols.length, 'symbols');
        const unsubMsg = derivClient.onMessage((msg: any) => {
            if (msg.msg_type === 'tick') {
                console.log('[MarketAnalysis] TICK received:', msg.tick?.symbol, msg.tick?.quote);
            }
            if (msg.msg_type === 'tick' && msg.tick) {
                const { symbol, quote } = msg.tick;
                const current = dataRef.current.get(symbol);
                if (!current) return;

                if (msg.subscription?.id) subscriptionIdsRef.current.set(symbol, msg.subscription.id);

                const price = typeof quote === 'number' ? quote : parseFloat(quote);
                const digit = getLastDigit(price);
                const newDigits = current.digits.length >= DIGIT_HISTORY_SIZE
                    ? [...current.digits.slice(1), digit]
                    : [...current.digits, digit];

                const { evenPct, oddPct, signal, favoredSide } = computeSignal(newDigits);

                dataRef.current.set(symbol, {
                    ...current,
                    lastTick: price,
                    digits: newDigits,
                    evenPct,
                    oddPct,
                    signal,
                    favoredSide,
                    tickCount: current.tickCount + 1,
                });

                dirtyRef.current = true;
                scheduleBatchUpdate();
            }
        });

        symbols.forEach(sym => {
            derivClient.sendAndForget({ ticks: sym.symbol, subscribe: 1 });
        });

        return () => {
            unsubMsg();
            if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
            subscriptionIdsRef.current.forEach(id => {
                derivClient.sendAndForget({ forget: id });
            });
            subscriptionIdsRef.current.clear();
        };
    }, [symbols, scheduleBatchUpdate]);

    return marketData;
}
