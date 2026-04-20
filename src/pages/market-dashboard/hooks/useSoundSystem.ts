import { useCallback, useRef, useState } from 'react';

export type DangerSoundOption = { id: string; label: string; emoji: string };

export const DANGER_SOUNDS: DangerSoundOption[] = [
    { id: 'alarm',   label: 'Alarm Beep', emoji: '🚨' },
    { id: 'siren',   label: 'Siren',      emoji: '🔴' },
    { id: 'pulse',   label: 'Pulse',      emoji: '💥' },
    { id: 'digital', label: 'Digital',    emoji: '⚡' },
    { id: 'horn',    label: 'Horn',       emoji: '📯' },
];

function makeCtx(): AudioContext | null {
    try {
        return new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch { return null; }
}

function tone(ctx: AudioContext, freq: number, t: number, dur: number, vol = 0.2, type: OscillatorType = 'sine') {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t); osc.stop(t + dur + 0.01);
}

function playConfirmSound(ctx: AudioContext) {
    const t = ctx.currentTime;
    tone(ctx, 880, t, 0.12, 0.22, 'sine');
    tone(ctx, 1320, t + 0.1, 0.18, 0.25, 'sine');
}

function playDangerOnce(ctx: AudioContext, soundId: string) {
    const t = ctx.currentTime;
    switch (soundId) {
        case 'alarm': {
            [880, 660, 880].forEach((f, i) => tone(ctx, f, t + i * 0.25, 0.2, 0.22, 'square'));
            break;
        }
        case 'siren': {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.connect(g); g.connect(ctx.destination);
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(440, t);
            osc.frequency.linearRampToValueAtTime(880, t + 0.4);
            osc.frequency.linearRampToValueAtTime(440, t + 0.8);
            g.gain.setValueAtTime(0.18, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
            osc.start(t); osc.stop(t + 0.85);
            break;
        }
        case 'pulse': {
            for (let i = 0; i < 5; i++) tone(ctx, 700, t + i * 0.12, 0.08, 0.25, 'sine');
            break;
        }
        case 'digital': {
            [800, 400, 800, 400, 1200].forEach((f, i) => tone(ctx, f, t + i * 0.1, 0.07, 0.18, 'square'));
            break;
        }
        case 'horn': {
            const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
            const g = ctx.createGain();
            o1.connect(g); o2.connect(g); g.connect(ctx.destination);
            o1.type = 'sawtooth'; o2.type = 'sawtooth';
            o1.frequency.value = 220; o2.frequency.value = 277;
            g.gain.setValueAtTime(0.15, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
            o1.start(t); o1.stop(t + 0.65);
            o2.start(t); o2.stop(t + 0.65);
            break;
        }
        default:
            [880, 660].forEach((f, i) => tone(ctx, f, t + i * 0.25, 0.2, 0.22, 'square'));
    }
}

export function useSoundSystem() {
    const [confirmEnabled, setConfirmEnabled] = useState(true);
    const [dangerEnabled, setDangerEnabled] = useState(true);
    const [dangerSoundId, setDangerSoundId] = useState('alarm');
    const ctxRef = useRef<AudioContext | null>(null);
    const dangerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const getCtx = useCallback((): AudioContext | null => {
        if (!ctxRef.current || ctxRef.current.state === 'closed') {
            ctxRef.current = makeCtx();
        }
        if (ctxRef.current?.state === 'suspended') ctxRef.current.resume().catch(() => {});
        return ctxRef.current;
    }, []);

    const playConfirm = useCallback(() => {
        if (!confirmEnabled) return;
        const ctx = getCtx();
        if (ctx) playConfirmSound(ctx);
    }, [confirmEnabled, getCtx]);

    const playDanger = useCallback(() => {
        if (!dangerEnabled || dangerTimerRef.current) return;
        const ctx = getCtx();
        if (!ctx) return;
        playDangerOnce(ctx, dangerSoundId);
        dangerTimerRef.current = setInterval(() => {
            const c = getCtx();
            if (c) playDangerOnce(c, dangerSoundId);
        }, 1800);
    }, [dangerEnabled, dangerSoundId, getCtx]);

    const stopDanger = useCallback(() => {
        if (dangerTimerRef.current) {
            clearInterval(dangerTimerRef.current);
            dangerTimerRef.current = null;
        }
    }, []);

    const previewSound = useCallback((id: string) => {
        const ctx = getCtx();
        if (ctx) playDangerOnce(ctx, id);
    }, [getCtx]);

    return {
        confirmEnabled, toggleConfirm: () => setConfirmEnabled(v => !v),
        dangerEnabled, toggleDanger: () => setDangerEnabled(v => !v),
        dangerSoundId, setDangerSoundId,
        playConfirm, playDanger, stopDanger, previewSound,
    };
}
