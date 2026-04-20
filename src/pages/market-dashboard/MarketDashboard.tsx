import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { List, AutoSizer, ListRowRenderer } from 'react-virtualized';
import { derivClient } from './deriv-client';
import { useActiveSymbols } from './hooks/useActiveSymbols';
import { useMarketAnalysis, MarketData, SignalType } from './hooks/useMarketAnalysis';
import { useSoundSystem, DANGER_SOUNDS } from './hooks/useSoundSystem';
import MarketRow from './components/MarketRow';
import './market-dashboard.scss';

const ROW_HEIGHT = 58;

const MarketDashboard = memo(() => {
    const { symbols, loading } = useActiveSymbols();
    const marketData = useMarketAnalysis(symbols);
    const {
        confirmEnabled, toggleConfirm,
        dangerEnabled, toggleDanger,
        dangerSoundId, setDangerSoundId,
        playConfirm, playDanger, stopDanger, previewSound,
    } = useSoundSystem();

    const [lockedSymbol, setLockedSymbol] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [msgCount, setMsgCount] = useState(0);

    const prevLockedSignalRef = useRef<SignalType | null>(null);
    const prevSignalsRef = useRef<Map<string, SignalType>>(new Map());

    useEffect(() => {
        derivClient.connect().then(() => setIsConnected(true));
        const poll = setInterval(() => setMsgCount(derivClient.messageCount), 1000);
        return () => clearInterval(poll);
    }, []);

    const lock = useCallback((symbol: string) => {
        stopDanger();
        setLockedSymbol(symbol);
        prevLockedSignalRef.current = 'CONFIRMED';
    }, [stopDanger]);

    const unlock = useCallback(() => {
        stopDanger();
        setLockedSymbol(null);
        prevLockedSignalRef.current = null;
    }, [stopDanger]);

    useEffect(() => {
        if (lockedSymbol) {
            const lockedData = marketData.get(lockedSymbol);
            if (!lockedData) return;
            const prev = prevLockedSignalRef.current;
            const current = lockedData.signal;
            if (prev === 'CONFIRMED' && current === 'NEUTRAL') {
                playDanger();
            } else if (prev === 'NEUTRAL' && current === 'CONFIRMED') {
                stopDanger();
                playConfirm();
            }
            prevLockedSignalRef.current = current;
        } else {
            marketData.forEach((data, symbol) => {
                const prev = prevSignalsRef.current.get(symbol);
                if (prev === 'NEUTRAL' && data.signal === 'CONFIRMED') {
                    playConfirm();
                }
                prevSignalsRef.current.set(symbol, data.signal);
            });
        }
    }, [marketData, lockedSymbol, playConfirm, playDanger, stopDanger]);

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

    const rowRenderer: ListRowRenderer = useCallback(({ key, index, style }) => {
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
    }, [sortedMarkets, lockedSymbol, isLockedDanger, lock, unlock]);

    return (
        <div className='mdb-page'>
            {/* ── Header ── */}
            <div className='mdb-header'>
                <span className='mdb-header__title'>📊 Market Signal Dashboard</span>

                <div className='mdb-header__status'>
                    <span className={`mdb-header__dot${!isConnected ? ' mdb-header__dot--off' : ''}`} />
                    <span>{isConnected ? 'Live' : 'Connecting…'}</span>
                    <span style={{ fontSize: 10, opacity: 0.4, marginLeft: 6 }}>[{msgCount}]</span>
                </div>

                {lockedSymbol && (
                    <div className={`mdb-header__lock-badge${isLockedDanger ? ' mdb-header__lock-badge--danger' : ''}`}>
                        {isLockedDanger ? '⚠️ SIGNAL LOST' : '🔒'}&nbsp;{lockedData?.display_name}
                        <button className='mdb-header__unlock-btn' onClick={unlock} title='Unlock'>✕</button>
                    </div>
                )}

                <button
                    className={`mdb-sound-btn${showSettings ? ' mdb-sound-btn--on' : ''}`}
                    onClick={() => setShowSettings(v => !v)}
                    title='Notification settings'
                >
                    🔔 Notifications
                </button>
            </div>

            {/* ── Notification Settings Panel ── */}
            {showSettings && (
                <div className='mdb-settings'>
                    <div className='mdb-settings__section'>
                        <div className='mdb-settings__row'>
                            <span className='mdb-settings__label'>
                                ✅ Confirmation Alert
                                <span className='mdb-settings__sublabel'>Plays when any signal becomes CONFIRMED</span>
                            </span>
                            <button
                                className={`mdb-toggle${confirmEnabled ? ' mdb-toggle--on' : ''}`}
                                onClick={toggleConfirm}
                            >
                                {confirmEnabled ? 'ON' : 'OFF'}
                            </button>
                        </div>
                    </div>

                    <div className='mdb-settings__divider' />

                    <div className='mdb-settings__section'>
                        <div className='mdb-settings__row'>
                            <span className='mdb-settings__label'>
                                ⚠️ Danger Alert
                                <span className='mdb-settings__sublabel'>Plays when locked signal breaks (CONFIRMED → NEUTRAL)</span>
                            </span>
                            <button
                                className={`mdb-toggle${dangerEnabled ? ' mdb-toggle--on mdb-toggle--danger' : ''}`}
                                onClick={toggleDanger}
                            >
                                {dangerEnabled ? 'ON' : 'OFF'}
                            </button>
                        </div>

                        <div className='mdb-settings__sounds'>
                            <span className='mdb-settings__sounds-label'>Danger sound:</span>
                            <div className='mdb-settings__sound-grid'>
                                {DANGER_SOUNDS.map(s => (
                                    <button
                                        key={s.id}
                                        className={`mdb-sound-opt${dangerSoundId === s.id ? ' mdb-sound-opt--selected' : ''}`}
                                        onClick={() => {
                                            setDangerSoundId(s.id);
                                            previewSound(s.id);
                                        }}
                                        title={`Preview ${s.label}`}
                                    >
                                        <span className='mdb-sound-opt__icon'>{s.emoji}</span>
                                        <span className='mdb-sound-opt__name'>{s.label}</span>
                                        {dangerSoundId === s.id && <span className='mdb-sound-opt__check'>✓</span>}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Column Headers ── */}
            <div className='mdb-col-header'>
                <span>Market</span>
                <span>Even / Odd Distribution</span>
                <span>Signal</span>
                <span>Last Tick</span>
                <span style={{ textAlign: 'center' }}>
                    {lockedSymbol ? 'Locked' : 'Lock'}
                </span>
            </div>

            {/* ── Market List ── */}
            {loading ? (
                <div className='mdb-loading'>
                    <div className='mdb-spinner' />
                    Fetching markets…
                </div>
            ) : sortedMarkets.length === 0 ? (
                <div className='mdb-loading'>
                    No markets — closed or waiting for data…
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
                                overscanRowCount={8}
                            />
                        )}
                    </AutoSizer>
                </div>
            )}

            {/* ── Footer ── */}
            <div className='mdb-footer'>
                <span className='mdb-footer__stat'>{sortedMarkets.length} markets</span>
                <span className='mdb-footer__stat mdb-footer__stat--green'>{confirmedCount} confirmed</span>
                {lockedSymbol && (
                    <span className='mdb-footer__stat mdb-footer__stat--lock'>
                        🔒 {lockedData?.display_name}{isLockedDanger ? ' — ⚠️ Signal lost' : ''}
                    </span>
                )}
                <span className='mdb-footer__stat' style={{ marginLeft: 'auto' }}>
                    {marketData.size > 0
                        ? `Streaming live ticks`
                        : isConnected ? 'Awaiting ticks…' : 'Connecting…'}
                </span>
                <span className='mdb-footer__stat' style={{ opacity: 0.4, fontSize: 10 }}>
                    WS msgs: {msgCount}
                </span>
            </div>
        </div>
    );
});

MarketDashboard.displayName = 'MarketDashboard';

export default MarketDashboard;
