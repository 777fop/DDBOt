/**
 * Market Dashboard — standalone Deriv WebSocket client.
 *
 * Uses api.onMessage().subscribe() — the same pattern as ticks_service.js —
 * which taps into DerivAPIBasic's internal RxJS event stream (this.events).
 * This is the ONLY reliable way to observe all incoming WS messages.
 */
import { getAppId, getSocketURL } from '@/components/shared';
import { website_name } from '@/utils/site-config';
import DerivAPIBasic from '@deriv/deriv-api/dist/DerivAPIBasic';
import { getInitialLanguage } from '@deriv-com/translations';
import APIMiddleware from '@/external/bot-skeleton/services/api/api-middleware';

type MessageHandler = (msg: Record<string, unknown>) => void;

class DerivClient {
    private socket: WebSocket | null = null;
    private api: InstanceType<typeof DerivAPIBasic> | null = null;
    private handlers = new Set<MessageHandler>();
    private ready: Promise<void> | null = null;
    private subscription: { unsubscribe: () => void } | null = null;
    public messageCount = 0;

    private init(): void {
        if (this.socket) return;

        const server = getSocketURL().replace(/[^a-zA-Z0-9.]/g, '');
        const appId = (getAppId() as string)?.replace?.(/[^a-zA-Z0-9]/g, '') ?? getAppId();
        const lang = getInitialLanguage();
        const brand = (website_name as string).toLowerCase();
        const url = `wss://${server}/websockets/v3?app_id=${appId}&l=${lang}&brand=${brand}`;

        this.socket = new WebSocket(url);
        this.api = new DerivAPIBasic({
            connection: this.socket,
            middleware: new APIMiddleware({}),
        } as any);

        // ── Canonical pattern from ticks_service.js ─────────────────────────
        // DerivAPIBasic.messageHandler() calls this.events.next({name,data})
        // onMessage() returns that Observable — this is the correct tap point.
        this.subscription = (this.api as any).onMessage().subscribe(
            ({ data }: { data: Record<string, unknown> }) => {
                try {
                    this.messageCount++;
                    this.handlers.forEach(h => h(data));
                } catch {}
            }
        );

        this.ready = new Promise<void>(resolve => {
            if (this.socket!.readyState === WebSocket.OPEN) {
                resolve();
            } else {
                this.socket!.addEventListener('open', () => resolve(), { once: true });
                this.socket!.addEventListener('error', () => resolve(), { once: true });
                setTimeout(() => resolve(), 10_000);
            }
        });
    }

    connect(): Promise<void> {
        this.init();
        return this.ready!;
    }

    async send<T = Record<string, unknown>>(request: Record<string, unknown>): Promise<T> {
        await this.connect();
        return (this.api as any).send(request) as Promise<T>;
    }

    /** Fire-and-forget subscription request */
    sendAndForget(request: Record<string, unknown>): void {
        if (!this.api) return;
        try { (this.api as any).send(request); } catch {}
    }

    onMessage(handler: MessageHandler): () => void {
        this.handlers.add(handler);
        return () => this.handlers.delete(handler);
    }

    destroy(): void {
        try { this.subscription?.unsubscribe(); } catch {}
        try { (this.api as any)?.disconnect?.(); } catch {}
        this.socket = null;
        this.api = null;
        this.subscription = null;
        this.handlers.clear();
        this.ready = null;
        this.messageCount = 0;
    }
}

export const derivClient = new DerivClient();

// Pre-warm the connection at module load time
derivClient.connect();
