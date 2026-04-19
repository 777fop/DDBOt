import React, { memo } from 'react';
import { MarketData } from '../hooks/useMarketAnalysis';

type Props = {
    style: React.CSSProperties;
    data: MarketData;
    isLocked: boolean;
    isDanger: boolean;
    canLock: boolean;
    dimmed: boolean;
    onLock: (sym: string) => void;
    onUnlock: () => void;
};

const MarketRow = memo(({ style, data, isLocked, isDanger, canLock, dimmed, onLock, onUnlock }: Props) => {
    const { symbol, display_name, lastTick, evenPct, oddPct, signal, favoredSide, tickCount } = data;

    let rowClass = 'mdb-row';
    if (isLocked && isDanger) rowClass += ' mdb-row--danger';
    else if (isLocked) rowClass += ' mdb-row--locked';

    const evenW = Math.round(evenPct);
    const oddW = 100 - evenW;

    return (
        <div style={{ ...style, opacity: dimmed ? 0.38 : 1 }} className={rowClass}>
            <div className='mdb-row__name'>
                <div className='mdb-row__name-main'>{display_name}</div>
                <div className='mdb-row__name-sub'>
                    {symbol} &middot; {tickCount} ticks
                </div>
            </div>

            <div className='mdb-row__bar-wrap'>
                <div className='mdb-row__bar'>
                    <div className='mdb-row__bar-even' style={{ width: `${evenW}%` }} />
                    <div className='mdb-row__bar-odd' style={{ width: `${oddW}%` }} />
                </div>
                <div className='mdb-row__pct'>
                    <span className='mdb-row__pct-even'>{evenPct.toFixed(1)}%</span>
                    <span className='mdb-row__pct-sep'>/</span>
                    <span className='mdb-row__pct-odd'>{oddPct.toFixed(1)}%</span>
                </div>
            </div>

            <div className={`mdb-row__signal mdb-row__signal--${signal === 'CONFIRMED' ? 'confirmed' : 'neutral'}`}>
                {signal === 'CONFIRMED' ? `✓ ${favoredSide}` : '◦ NEUTRAL'}
            </div>

            <div className='mdb-row__tick'>
                {lastTick !== null ? lastTick.toFixed(2) : '—'}
            </div>

            <div className='mdb-row__action'>
                {isLocked ? (
                    <button className='mdb-btn mdb-btn--unlock' onClick={onUnlock}>
                        Unlock
                    </button>
                ) : (
                    <button
                        className='mdb-btn mdb-btn--lock'
                        disabled={!canLock}
                        onClick={() => onLock(symbol)}
                        title={!canLock && signal !== 'CONFIRMED' ? 'Lock available when CONFIRMED' : ''}
                    >
                        Lock
                    </button>
                )}
            </div>
        </div>
    );
});

MarketRow.displayName = 'MarketRow';

export default MarketRow;
