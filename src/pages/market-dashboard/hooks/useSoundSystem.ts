import { useCallback, useRef, useState } from 'react';

export function useSoundSystem() {
    const [entryEnabled, setEntryEnabled] = useState(true);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const dangerLoopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isDangerPlayingRef = useRef(false);

    const getCtx = useCallback((): AudioContext => {
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume();
        }
        return audioCtxRef.current;
    }, []);

    const playTone = useCallback(
        (freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.3, startOffset = 0) => {
            try {
                const ctx = getCtx();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.value = freq;
                osc.type = type;
                gain.gain.setValueAtTime(0.001, ctx.currentTime + startOffset);
                gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + startOffset + 0.01);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startOffset + duration);
                osc.start(ctx.currentTime + startOffset);
                osc.stop(ctx.currentTime + startOffset + duration + 0.05);
            } catch {}
        },
        [getCtx]
    );

    const playEntry = useCallback(() => {
        if (!entryEnabled) return;
        playTone(523.25, 0.12, 'sine', 0.2);
        playTone(659.25, 0.12, 'sine', 0.2, 0.1);
        playTone(783.99, 0.18, 'sine', 0.25, 0.2);
    }, [entryEnabled, playTone]);

    const stopDanger = useCallback(() => {
        if (dangerLoopRef.current) {
            clearTimeout(dangerLoopRef.current);
            dangerLoopRef.current = null;
        }
        isDangerPlayingRef.current = false;
    }, []);

    const playDanger = useCallback(() => {
        if (isDangerPlayingRef.current) return;
        isDangerPlayingRef.current = true;

        let step = 0;
        const MAX_STEPS = 8;

        const beepFreqs = [880, 440, 880, 440, 1046, 440, 1046, 440];

        const loop = () => {
            if (!isDangerPlayingRef.current || step >= MAX_STEPS) {
                isDangerPlayingRef.current = false;
                return;
            }
            playTone(beepFreqs[step % beepFreqs.length], 0.22, 'sawtooth', 0.45);
            step++;
            dangerLoopRef.current = setTimeout(loop, 380);
        };

        loop();
    }, [playTone]);

    const toggleEntry = useCallback(() => setEntryEnabled(prev => !prev), []);

    return { entryEnabled, toggleEntry, playEntry, playDanger, stopDanger };
}
