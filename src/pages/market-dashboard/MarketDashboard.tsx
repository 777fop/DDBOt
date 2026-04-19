import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { List, AutoSizer, ListRowRenderer } from 'react-virtualized';
import { wsManager } from './ws-manager';
import { useActiveSymbols } from './hooks/useActiveSymbols';
import { useMarketAnalysis, MarketData, SignalType } from './hooks/useMarketAnalysis';
import { useSoundSystem } from './hooks/useSoundSystem';
import MarketRow from './components/MarketRow';
import './market-dashboard.scss';

const ROW_HEIGHT = 58;

const MarketDashboard = memo(() => {
    const { symbols, loading } = useActiveSymbols();
    const marketData = useMarketAnalysis(symbols);
    const { entryEnabled, toggleEntry, playEntry, playDanger, stopDanger } = useSoundSystem();

    const [lockedSymbol, setLockedSymbol] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    const prevLockedSignalRef = useRef<SignalType | null>(null);
    const prevSignalsRef = useRef<Map<string, SignalType>>(new Map());

    useEffect(() => {
        wsManager.connect();
        setIsConnected(wsManager.isConnected);
        const unsub = wsManager.onConnection(status => setIsConnected(status === 'open'));
        return unsub;
    }, []);

    const lock = useCallback(
        (symbol: string) => {
            stopDanger();
            setLockedSymbol(symbol);
            prevLockedSignalRef.current = 'CONFIRMED';
        },
        [stopDanger]
    );

    const unlock = useCallback(() => {
        stopDanger();
        setLockedSymbol(null);
        prevLockedSignalRef.current = null;
    }, [stopDanger]);

    useEffect(() => {
        if (!lockedSymbol) {
            if (!entryEnabled) return;
            marketData.forEach((data, symbol) => {
                const prev = prevSignalsRef.current.get(symbol);
                if (prev === 'NEUTRAL' && data.signal === 'CONFIRMED') {
                    playEntry();
                }
                prevSignalsRef.current.set(symbol, data.signal);
            });
            return;
        }

        const lockedData = marketData.get(lockedSymbol);
        if (!lockedData) return;
        const prev = prevLockedSignalRef.current;
        const current = lockedData.signal;
        if (prev === 'CONFIRMED' && current === 'NEUTRAL') {
            playDanger();
        }
        prevLockedSignalRef.current = current;
    }, [marketData, lockedSymbol, entryEnabled, playEntry, playDanger]);

    const sortedMarkets = useMemo<MarketData[]>(() => {
        const arr = Array.from(marketData.values());
        return arr.sort((a, b) => {
            if (a.symbol === lockedSymbol) return -1;
            if (b.symbol === lockedSymbol) return 1;
            if (a.signal !== b.signal) return a.signal === 'CONFIRMED' ? -1 : 1;
            return Math.max(b.evenPct, b.oddPct) - Math.max(a.evenPct, a.oddPct);
        });
    }, [marketData, lockedSymbol]);

    const lockedData = lockedSymbol ? marketData.get(lockedSymbol) : null;
    const isLockedDanger = !!lockedSymbol && lockedData?.signal === 'NEUTRAL';

    const confirmedCount = useMemo(() => {
        let n = 0;
        marketData.forEach(d => { if (d.signal === 'CONFIRMED') n++; });
        return n;
    }, [marketData]);

    const rowRenderer: ListRowRenderer = useCallback(
        ({ key, index, style }) => {
            const data = sortedMarkets[index];
            if (!data) return null;
            const isLocked = data.symbol === lockedSymbol;
            const dimmed = !!lockedSymbol && !isLocked;
            return (
                <MarketRow
                    key={key}
                    style={style}
                    data={data}
                    isLocked={isLocked}
                    isDanger={isLocked && isLockedDanger}
                    canLock={!lockedSymbol && data.signal === 'CONFIRMED'}
                    dimmed={dimmed}
                    onLock={lock}
                    onUnlock={unlock}
                />
            );
        },
        [sortedMarkets, lockedSymbol, isLockedDanger, lock, unlock]
    );

    return (
        <div className='mdb-page'>
            <div className='mdb-header'>
                <span className='mdb-header__title'>📊 Market Signal Dashboard</span>

                <div className='mdb-header__status'>
                    <span className={`mdb-header__dot${!isConnected ? ' mdb-header__dot--off' : ''}`} />
                    <span>{isConnected ? 'Live' : 'Connecting…'}</span>
                </div>

                {lockedSymbol && (
                    <div className={`mdb-header__lock-badge${isLockedDanger ? ' mdb-header__lock-badge--danger' : ''}`}>
                        {isLockedDanger ? '⚠️ SIGNAL LOST' : '🔒'}&nbsp;{lockedData?.display_name}
                    </div>
                )}

                <button
                    className={`mdb-sound-btn${entryEnabled ? ' mdb-sound-btn--on' : ''}`}
                    onClick={toggleEntry}
                    title='Toggle entry sound'
                >
                    {entryEnabled ? '🔊' : '🔇'}&nbsp;Entry Sound
                </button>
            </div>

            <div className='mdb-col-header'>
                <span>Market</span>
                <span>Even / Odd Distribution</span>
                <span>Signal</span>
                <span>Last Tick</span>
                <span style={{ textAlign: 'center' }}>Action</span>
            </div>

            {loading ? (
                <div className='mdb-loading'>
                    <div className='mdb-spinner' />
                    Fetching markets…
                </div>
            ) : sortedMarkets.length === 0 ? (
                <div className='mdb-loading'>
                    No markets available — markets may be closed or loading…
                </div>
            ) : (
                <div className='mdb-list'>
                    <AutoSizer>
                        {({ height, width }) => (
                            <List
                                height={height}
                                width={width}
                                rowCount={sortedMarkets.length}
                                rowHeight={ROW_HEIGHT}
                                rowRenderer={rowRenderer}
                                overscanRowCount={6}
                            />
                        )}
                    </AutoSizer>
                </div>
            )}

            <div className='mdb-footer'>
                <span className='mdb-footer__stat'>{sortedMarkets.length} markets</span>
                <span className='mdb-footer__stat mdb-footer__stat--green'>
                    {confirmedCount} confirmed
                </span>
                {lockedSymbol && (
                    <span className='mdb-footer__stat mdb-footer__stat--lock'>
                        🔒 Locked: {lockedData?.display_name}
                    </span>
                )}
                <span className='mdb-footer__stat' style={{ marginLeft: 'auto' }}>
                    {marketData.size > 0 ? 'Streaming live ticks' : isConnected ? 'Awaiting ticks…' : 'Connecting…'}
                </span>
            </div>
        </div>
    );
});

MarketDashboard.displayName = 'MarketDashboard';

export default MarketDashboard;
