/**
 * Centralized API client for ArbOS frontend.
 *
 * Uses VITE_BRAIN_URL and VITE_BOT_URL environment variables
 * with sensible localhost defaults for development.
 */

export const BRAIN_URL = import.meta.env.VITE_BRAIN_URL || 'http://localhost:8000';
export const BOT_URL = import.meta.env.VITE_BOT_URL || 'http://localhost:8001';
export const BOT_WS_URL = BOT_URL.replace(/^http/, 'ws');

// ── Brain API ──────────────────────────────────────────────────────────────

export async function brainFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${BRAIN_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
        },
    });
    if (!res.ok) {
        throw new Error(`Brain API error: ${res.status} ${res.statusText}`);
    }
    return res.json();
}

export async function botFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${BOT_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
        },
    });
    if (!res.ok) {
        throw new Error(`Bot API error: ${res.status} ${res.statusText}`);
    }
    return res.json();
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface GraphNode {
    id: string;
    label: string;
    price: number;
    status: 'arb' | 'normal' | 'illiquid';
    volume: number;
}

export interface GraphEdge {
    source: string;
    target: string;
    type: 'IMPLIES' | 'EXCLUSIVE' | 'PARTITION';
    confidence: number;
    isArb?: boolean;
    label?: string;
}

export interface GraphVisResponse {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export interface GraphStats {
    total_markets: number;
    total_relationships: number;
    total_implies: number;
    total_mutually_exclusive: number;
    connected_components: number;
}

export interface HealthResponse {
    status: string;
    db_connected: boolean;
    llm_configured: boolean;
}

export interface ChatMessage {
    role: 'user' | 'ai';
    text: string;
}

export interface ChatResponse {
    response: string;
    graph_updated: boolean;
    markets_found: number;
}

export interface BotStatus {
    mode: string;
    cumulative_pnl: string;
    signals_executed: number;
    uptime_secs: number;
    positions: BotPosition[];
    recent_trades: BotExecutionReport[];
}

export interface BotPosition {
    asset_id: string;
    side: string;
    size: string;
    entry_price: string;
    opened_at: string;
}

export interface BotExecutionReport {
    strategy: string;
    success: boolean;
    pnl_usdc: string;
    legs: number;
    executed_at: string;
    fill_details: BotFillDetail[];
}

export interface BotFillDetail {
    asset_id: string;
    side: string;
    size: string;
    price: string;
    filled: boolean;
}

// ── Convenience Fetchers ───────────────────────────────────────────────────

export const fetchGraphVis = () => brainFetch<GraphVisResponse>('/graph/vis');
export const fetchGraphStats = () => brainFetch<GraphStats>('/graph/stats');
export const fetchBrainHealth = () => brainFetch<HealthResponse>('/health');

export const fetchBotHealth = async (): Promise<boolean> => {
    try {
        const res = await fetch(`${BOT_URL}/api/health`);
        return res.ok;
    } catch {
        return false;
    }
};

export const fetchBotStatus = () => botFetch<BotStatus>('/api/status');

export const sendChatMessage = (message: string, history: ChatMessage[] = []) =>
    brainFetch<ChatResponse>('/chat', {
        method: 'POST',
        body: JSON.stringify({ message, history }),
    });

export const syncAssets = (assetIds: string[]) =>
    botFetch<{ message: string; errors: string[] }>('/api/assets/add', {
        method: 'POST',
        body: JSON.stringify({ asset_ids: assetIds }),
    });
