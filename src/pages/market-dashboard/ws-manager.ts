import { api_base } from '@/external/bot-skeleton';

type MessageHandler = (msg: Record<string, unknown>) => void;
type ConnectionHandler = (status: 'open' | 'close') => void;

class ApiBaseBridge {
    private messageHandlers = new Set<MessageHandler>();
    private connectionHandlers = new Set<ConnectionHandler>();
    private pendingSends: object[] = [];
    private msgSubscription: { unsubscribe: () => void } | null = null;
    private pollInterval: ReturnType<typeof setInterval> | null = null;
    private _connected = false;
    private initStarted = false;

    private trySetupSubscription(): boolean {
        if (this.msgSubscription) return true;
        const api = (api_base as any)?.api;
        if (!api) return false;

        try {
            const obs = api.onMessage?.();
            if (!obs?.subscribe) return false;

            this.msgSubscription = obs.subscribe((msg: unknown) => {
                this.messageHandlers.forEach(h => h(msg as Record<string, unknown>));
            });

            if (!this._connected) {
                this._connected = true;
                this.connectionHandlers.forEach(h => h('open'));
                const pending = this.pendingSends.splice(0);
                pending.forEach(msg => this.sendRaw(msg));
            }
            return true;
        } catch {
            return false;
        }
    }

    async ensureInit() {
        if (this.initStarted) return;
        this.initStarted = true;

        try {
            const api = (api_base as any)?.api;
            if (!api || api.connection?.readyState !== 1) {
                await (api_base as any).init();
            }
        } catch {}
    }

    connect() {
        if (this.msgSubscription) return;
        if (this.trySetupSubscription()) return;

        if (!this.pollInterval) {
            this.pollInterval = setInterval(() => {
                if (this.trySetupSubscription()) {
                    clearInterval(this.pollInterval!);
                    this.pollInterval = null;
                }
            }, 400);
        }
    }

    private sendRaw(msg: object) {
        try {
            (api_base as any)?.api?.send(msg);
        } catch {}
    }

    send(msg: object) {
        if (this.msgSubscription) {
            this.sendRaw(msg);
        } else {
            this.pendingSends.push(msg);
            this.connect();
        }
    }

    onMessage(handler: MessageHandler): () => void {
        this.messageHandlers.add(handler);
        if (!this.msgSubscription) this.connect();
        return () => this.messageHandlers.delete(handler);
    }

    onConnection(handler: ConnectionHandler): () => void {
        this.connectionHandlers.add(handler);
        if (this._connected) setTimeout(() => handler('open'), 0);
        return () => this.connectionHandlers.delete(handler);
    }

    get isConnected(): boolean {
        return this._connected && !!this.msgSubscription;
    }

    destroy() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        this.msgSubscription?.unsubscribe();
        this.msgSubscription = null;
        this.messageHandlers.clear();
        this.connectionHandlers.clear();
        this._connected = false;
        this.initStarted = false;
    }
}

export const wsManager = new ApiBaseBridge();
