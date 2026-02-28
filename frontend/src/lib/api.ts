/**
 * Centralized API client for ArbOS frontend.
 *
 * DEMO MODE — All data is mock. No backend required.
 * Uses rich, believable crypto-themed graph clusters for hackathon judging.
 */

export const BRAIN_URL = import.meta.env.VITE_BRAIN_URL || 'http://localhost:8000';
export const BOT_URL = import.meta.env.VITE_BOT_URL || 'http://localhost:8001';
export const BOT_WS_URL = BOT_URL.replace(/^http/, 'ws');

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

// ── Safe Fetchers (always fall back to mock) ─────────────────────────────

export async function brainFetch<T>(path: string, options?: RequestInit): Promise<T> {
    try {
        const res = await fetch(`${BRAIN_URL}${path}`, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...options?.headers },
        });
        if (!res.ok) throw new Error();
        return res.json();
    } catch {
        return {} as T;
    }
}

export async function botFetch<T>(path: string, options?: RequestInit): Promise<T> {
    try {
        const res = await fetch(`${BOT_URL}${path}`, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...options?.headers },
        });
        if (!res.ok) throw new Error();
        return res.json();
    } catch {
        return {} as T;
    }
}

// ── Dense Mock Data ─────────────────────────────────────────────────────────
// 6 thematic crypto clusters, ~43 nodes, 65+ edges

// ─── Cluster 1: BTC ETF & Derivatives (8 nodes) ────────────────────────────
const BTC_NODES: GraphNode[] = [
    { id: 'btc_70k', label: 'BTC > $70K March', price: 0.62, status: 'arb', volume: 4_800_000 },
    { id: 'ibit_inflow', label: 'IBIT Inflow > $500M', price: 0.71, status: 'arb', volume: 2_100_000 },
    { id: 'btc_dom', label: 'BTC Dominance > 55%', price: 0.58, status: 'normal', volume: 1_500_000 },
    { id: 'gbtc_outflow', label: 'GBTC Outflow Stops', price: 0.33, status: 'illiquid', volume: 870_000 },
    { id: 'btc_halving', label: 'Halving Price Pump', price: 0.74, status: 'normal', volume: 3_200_000 },
    { id: 'btc_basis', label: 'Futures Basis > 10%', price: 0.45, status: 'arb', volume: 1_900_000 },
    { id: 'cme_gap', label: 'CME Gap Fill $59K', price: 0.28, status: 'illiquid', volume: 420_000 },
    { id: 'miner_cap', label: 'Miner Capitulation', price: 0.19, status: 'normal', volume: 680_000 },
];

const BTC_EDGES: GraphEdge[] = [
    { source: 'btc_70k', target: 'ibit_inflow', type: 'IMPLIES', confidence: 0.94, isArb: true },
    { source: 'btc_70k', target: 'btc_dom', type: 'IMPLIES', confidence: 0.82 },
    { source: 'ibit_inflow', target: 'gbtc_outflow', type: 'EXCLUSIVE', confidence: 0.88, isArb: true },
    { source: 'btc_halving', target: 'btc_70k', type: 'IMPLIES', confidence: 0.91 },
    { source: 'btc_halving', target: 'miner_cap', type: 'IMPLIES', confidence: 0.76 },
    { source: 'btc_basis', target: 'btc_70k', type: 'IMPLIES', confidence: 0.85, isArb: true },
    { source: 'cme_gap', target: 'btc_70k', type: 'EXCLUSIVE', confidence: 0.72 },
    { source: 'miner_cap', target: 'cme_gap', type: 'IMPLIES', confidence: 0.68 },
    { source: 'btc_dom', target: 'ibit_inflow', type: 'PARTITION', confidence: 0.79 },
    { source: 'gbtc_outflow', target: 'btc_basis', type: 'IMPLIES', confidence: 0.65 },
];

// ─── Cluster 2: ETH Ecosystem & L2s (7 nodes) ──────────────────────────────
const ETH_NODES: GraphNode[] = [
    { id: 'eth_etf', label: 'ETH Spot ETF Q1', price: 0.41, status: 'arb', volume: 3_400_000 },
    { id: 'eth_btc_ratio', label: 'ETH/BTC > 0.06', price: 0.35, status: 'normal', volume: 1_200_000 },
    { id: 'arb_tvl', label: 'Arbitrum TVL > $20B', price: 0.52, status: 'normal', volume: 980_000 },
    { id: 'base_txn', label: 'Base Daily TXN > 5M', price: 0.67, status: 'arb', volume: 1_800_000 },
    { id: 'blob_savings', label: 'Blob Fee > 90% Save', price: 0.81, status: 'normal', volume: 450_000 },
    { id: 'eth_yield', label: 'ETH Staking > 4%', price: 0.38, status: 'illiquid', volume: 2_100_000 },
    { id: 'op_adopt', label: 'OP Stack > 50% L2', price: 0.55, status: 'normal', volume: 720_000 },
];

const ETH_EDGES: GraphEdge[] = [
    { source: 'eth_etf', target: 'eth_btc_ratio', type: 'IMPLIES', confidence: 0.89, isArb: true },
    { source: 'eth_etf', target: 'eth_yield', type: 'IMPLIES', confidence: 0.77 },
    { source: 'arb_tvl', target: 'blob_savings', type: 'PARTITION', confidence: 0.83 },
    { source: 'base_txn', target: 'op_adopt', type: 'IMPLIES', confidence: 0.91, isArb: true },
    { source: 'base_txn', target: 'arb_tvl', type: 'EXCLUSIVE', confidence: 0.74 },
    { source: 'blob_savings', target: 'base_txn', type: 'IMPLIES', confidence: 0.86 },
    { source: 'eth_yield', target: 'eth_btc_ratio', type: 'PARTITION', confidence: 0.69 },
    { source: 'op_adopt', target: 'arb_tvl', type: 'EXCLUSIVE', confidence: 0.78 },
    { source: 'eth_etf', target: 'arb_tvl', type: 'IMPLIES', confidence: 0.72 },
];

// ─── Cluster 3: Stablecoin & DeFi (8 nodes) ────────────────────────────────
const DEFI_NODES: GraphNode[] = [
    { id: 'usdc_40b', label: 'USDC MCap > $40B', price: 0.73, status: 'normal', volume: 5_200_000 },
    { id: 'tether_attest', label: 'Tether Attestation OK', price: 0.88, status: 'normal', volume: 1_400_000 },
    { id: 'aave_v4', label: 'AAVE V4 Launch Q1', price: 0.56, status: 'arb', volume: 2_800_000 },
    { id: 'maker_endgame', label: 'MakerDAO Endgame P2', price: 0.42, status: 'normal', volume: 1_100_000 },
    { id: 'dex_cex', label: 'DEX Volume > CEX', price: 0.23, status: 'illiquid', volume: 890_000 },
    { id: 'rwa_tvl', label: 'RWA TVL > $10B', price: 0.61, status: 'arb', volume: 3_600_000 },
    { id: 'pyusd_1b', label: 'PayPal PYUSD > $1B', price: 0.47, status: 'normal', volume: 760_000 },
    { id: 'usde_depeg', label: 'Ethena USDe Depeg', price: 0.12, status: 'illiquid', volume: 320_000 },
];

const DEFI_EDGES: GraphEdge[] = [
    { source: 'usdc_40b', target: 'pyusd_1b', type: 'PARTITION', confidence: 0.81 },
    { source: 'usdc_40b', target: 'tether_attest', type: 'IMPLIES', confidence: 0.76 },
    { source: 'aave_v4', target: 'rwa_tvl', type: 'IMPLIES', confidence: 0.88, isArb: true },
    { source: 'aave_v4', target: 'maker_endgame', type: 'EXCLUSIVE', confidence: 0.71 },
    { source: 'maker_endgame', target: 'rwa_tvl', type: 'IMPLIES', confidence: 0.84, isArb: true },
    { source: 'dex_cex', target: 'aave_v4', type: 'IMPLIES', confidence: 0.79 },
    { source: 'rwa_tvl', target: 'usdc_40b', type: 'IMPLIES', confidence: 0.92 },
    { source: 'pyusd_1b', target: 'usdc_40b', type: 'EXCLUSIVE', confidence: 0.66 },
    { source: 'usde_depeg', target: 'tether_attest', type: 'IMPLIES', confidence: 0.73 },
    { source: 'dex_cex', target: 'usde_depeg', type: 'PARTITION', confidence: 0.58 },
    { source: 'maker_endgame', target: 'usdc_40b', type: 'IMPLIES', confidence: 0.82 },
];

// ─── Cluster 4: Regulation & Legal (7 nodes) ───────────────────────────────
const REG_NODES: GraphNode[] = [
    { id: 'sec_cb_drop', label: 'SEC Drops CB Case', price: 0.39, status: 'arb', volume: 2_400_000 },
    { id: 'fit21_senate', label: 'FIT21 Senate Vote', price: 0.64, status: 'normal', volume: 1_900_000 },
    { id: 'sab121', label: 'SAB 121 Override', price: 0.31, status: 'illiquid', volume: 560_000 },
    { id: 'mica_enforce', label: 'EU MiCA Enforced', price: 0.87, status: 'normal', volume: 1_100_000 },
    { id: 'binance_relic', label: 'Binance US Relicense', price: 0.22, status: 'illiquid', volume: 340_000 },
    { id: 'cbdc_pilot', label: 'US CBDC Pilot 2026', price: 0.15, status: 'normal', volume: 480_000 },
    { id: 'gensler_succ', label: 'Gensler Successor', price: 0.71, status: 'arb', volume: 3_100_000 },
];

const REG_EDGES: GraphEdge[] = [
    { source: 'sec_cb_drop', target: 'fit21_senate', type: 'IMPLIES', confidence: 0.87, isArb: true },
    { source: 'sec_cb_drop', target: 'gensler_succ', type: 'IMPLIES', confidence: 0.93, isArb: true },
    { source: 'fit21_senate', target: 'sab121', type: 'IMPLIES', confidence: 0.78 },
    { source: 'fit21_senate', target: 'mica_enforce', type: 'PARTITION', confidence: 0.65 },
    { source: 'sab121', target: 'binance_relic', type: 'IMPLIES', confidence: 0.72 },
    { source: 'mica_enforce', target: 'cbdc_pilot', type: 'EXCLUSIVE', confidence: 0.59 },
    { source: 'gensler_succ', target: 'sec_cb_drop', type: 'IMPLIES', confidence: 0.84 },
    { source: 'binance_relic', target: 'sec_cb_drop', type: 'IMPLIES', confidence: 0.68 },
    { source: 'cbdc_pilot', target: 'sab121', type: 'EXCLUSIVE', confidence: 0.63 },
];

// ─── Cluster 5: Macro & Rates (7 nodes) ────────────────────────────────────
const MACRO_NODES: GraphNode[] = [
    { id: 'fed_cut', label: 'Fed Rate Cut March', price: 0.54, status: 'arb', volume: 8_200_000 },
    { id: 'cpi_below3', label: 'Core CPI < 3%', price: 0.48, status: 'normal', volume: 4_100_000 },
    { id: 'yield_uninv', label: '10Y-2Y Uninversion', price: 0.36, status: 'normal', volume: 1_800_000 },
    { id: 'dxy_100', label: 'DXY Below 100', price: 0.29, status: 'illiquid', volume: 960_000 },
    { id: 'btc_gold', label: 'BTC-Gold Corr > 0.5', price: 0.43, status: 'normal', volume: 520_000 },
    { id: 'crypto_3t', label: 'Crypto MCap > $3T', price: 0.59, status: 'arb', volume: 6_700_000 },
    { id: 'japan_hike', label: 'Japan Rate Hike', price: 0.66, status: 'normal', volume: 2_300_000 },
];

const MACRO_EDGES: GraphEdge[] = [
    { source: 'fed_cut', target: 'cpi_below3', type: 'IMPLIES', confidence: 0.93, isArb: true },
    { source: 'fed_cut', target: 'dxy_100', type: 'IMPLIES', confidence: 0.86 },
    { source: 'fed_cut', target: 'crypto_3t', type: 'IMPLIES', confidence: 0.88, isArb: true },
    { source: 'cpi_below3', target: 'yield_uninv', type: 'IMPLIES', confidence: 0.81 },
    { source: 'yield_uninv', target: 'dxy_100', type: 'PARTITION', confidence: 0.74 },
    { source: 'dxy_100', target: 'btc_gold', type: 'IMPLIES', confidence: 0.69 },
    { source: 'btc_gold', target: 'crypto_3t', type: 'IMPLIES', confidence: 0.77 },
    { source: 'japan_hike', target: 'dxy_100', type: 'EXCLUSIVE', confidence: 0.83 },
    { source: 'japan_hike', target: 'yield_uninv', type: 'IMPLIES', confidence: 0.71 },
    { source: 'crypto_3t', target: 'fed_cut', type: 'PARTITION', confidence: 0.62 },
];

// ─── Cluster 6: Solana & Alt-L1 (6 nodes) ─────────────────────────────────
const SOL_NODES: GraphNode[] = [
    { id: 'sol_200', label: 'SOL > $200', price: 0.51, status: 'arb', volume: 3_900_000 },
    { id: 'sol_etf', label: 'Solana ETF Filed', price: 0.34, status: 'normal', volume: 2_600_000 },
    { id: 'firedancer', label: 'Firedancer Launch', price: 0.78, status: 'normal', volume: 1_400_000 },
    { id: 'sui_tvl', label: 'SUI TVL > $5B', price: 0.27, status: 'illiquid', volume: 580_000 },
    { id: 'avax_subnet', label: 'AVAX Subnet Adopt', price: 0.44, status: 'normal', volume: 720_000 },
    { id: 'cosmos_ibc', label: 'IBC Volume > $1B', price: 0.39, status: 'arb', volume: 410_000 },
];

const SOL_EDGES: GraphEdge[] = [
    { source: 'sol_200', target: 'sol_etf', type: 'IMPLIES', confidence: 0.89, isArb: true },
    { source: 'sol_200', target: 'firedancer', type: 'IMPLIES', confidence: 0.84 },
    { source: 'firedancer', target: 'sol_etf', type: 'IMPLIES', confidence: 0.78 },
    { source: 'sol_etf', target: 'sui_tvl', type: 'EXCLUSIVE', confidence: 0.62 },
    { source: 'sui_tvl', target: 'avax_subnet', type: 'EXCLUSIVE', confidence: 0.71 },
    { source: 'avax_subnet', target: 'cosmos_ibc', type: 'PARTITION', confidence: 0.67, isArb: true },
    { source: 'cosmos_ibc', target: 'sol_200', type: 'IMPLIES', confidence: 0.58 },
    { source: 'firedancer', target: 'avax_subnet', type: 'EXCLUSIVE', confidence: 0.73 },
];

// ─── Cross-Cluster Edges ────────────────────────────────────────────────────
const CROSS_EDGES: GraphEdge[] = [
    { source: 'fed_cut', target: 'btc_70k', type: 'IMPLIES', confidence: 0.91, isArb: true, label: 'Macro→BTC' },
    { source: 'crypto_3t', target: 'eth_etf', type: 'IMPLIES', confidence: 0.85, label: 'MCap→ETH' },
    { source: 'sec_cb_drop', target: 'eth_etf', type: 'IMPLIES', confidence: 0.83, isArb: true, label: 'Legal→ETF' },
    { source: 'fit21_senate', target: 'usdc_40b', type: 'IMPLIES', confidence: 0.79, label: 'Reg→Stables' },
    { source: 'btc_70k', target: 'sol_200', type: 'IMPLIES', confidence: 0.76, label: 'BTC→SOL' },
    { source: 'rwa_tvl', target: 'eth_yield', type: 'IMPLIES', confidence: 0.81, label: 'RWA→ETH' },
    { source: 'dxy_100', target: 'usdc_40b', type: 'EXCLUSIVE', confidence: 0.67, label: 'DXY→USDC' },
    { source: 'mica_enforce', target: 'tether_attest', type: 'IMPLIES', confidence: 0.88, label: 'EU→Tether' },
    { source: 'btc_halving', target: 'crypto_3t', type: 'IMPLIES', confidence: 0.87, label: 'Halving→MCap' },
    { source: 'sol_200', target: 'crypto_3t', type: 'IMPLIES', confidence: 0.73, label: 'SOL→MCap' },
];

// ─── Aggregated Data ────────────────────────────────────────────────────────
const ALL_NODES: GraphNode[] = [...BTC_NODES, ...ETH_NODES, ...DEFI_NODES, ...REG_NODES, ...MACRO_NODES, ...SOL_NODES];
const ALL_EDGES: GraphEdge[] = [...BTC_EDGES, ...ETH_EDGES, ...DEFI_EDGES, ...REG_EDGES, ...MACRO_EDGES, ...SOL_EDGES, ...CROSS_EDGES];

// ─── Cluster Routing ────────────────────────────────────────────────────────

interface Cluster {
    keywords: string[];
    nodes: GraphNode[];
    edges: GraphEdge[];
}

const CLUSTERS: Cluster[] = [
    { keywords: ['btc', 'bitcoin', 'etf', 'halving', 'miner', 'spot'], nodes: BTC_NODES, edges: BTC_EDGES },
    { keywords: ['eth', 'ethereum', 'l2', 'layer', 'rollup', 'arbitrum', 'base', 'optimism', 'blob'], nodes: ETH_NODES, edges: ETH_EDGES },
    { keywords: ['defi', 'stable', 'usdc', 'usdt', 'aave', 'maker', 'rwa', 'yield', 'stablecoin'], nodes: DEFI_NODES, edges: DEFI_EDGES },
    { keywords: ['sec', 'regulation', 'legal', 'congress', 'mica', 'gensler', 'binance', 'coinbase', 'fit21'], nodes: REG_NODES, edges: REG_EDGES },
    { keywords: ['macro', 'fed', 'fomc', 'rate', 'cpi', 'inflation', 'treasury', 'yield', 'dxy', 'dollar'], nodes: MACRO_NODES, edges: MACRO_EDGES },
    { keywords: ['sol', 'solana', 'alt', 'sui', 'avax', 'cosmos', 'ibc', 'firedancer'], nodes: SOL_NODES, edges: SOL_EDGES },
];

function matchClusters(query: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const q = query.toLowerCase();
    const matched = CLUSTERS.filter(c => c.keywords.some(kw => q.includes(kw)));

    // If user types something generic like "crypto" or "markets" or "all" or "everything", return everything
    if (matched.length === 0 || q.includes('crypto') || q.includes('market') || q.includes('all') || q.includes('everything')) {
        return { nodes: [...ALL_NODES], edges: [...ALL_EDGES] };
    }

    const nodeIds = new Set<string>();
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    for (const c of matched) {
        for (const n of c.nodes) {
            if (!nodeIds.has(n.id)) {
                nodeIds.add(n.id);
                nodes.push(n);
            }
        }
        edges.push(...c.edges);
    }

    // Add cross-cluster edges where both endpoints are present
    for (const e of CROSS_EDGES) {
        if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
            edges.push(e);
        }
    }

    return { nodes, edges };
}

// ─── Price Jitter (makes graph feel alive at 200ms polling) ─────────────────

function jitterNodes(nodes: GraphNode[]): GraphNode[] {
    return nodes.map(n => ({
        ...n,
        price: Math.max(0.01, Math.min(0.99, n.price + (Math.random() - 0.5) * 0.04)),
    }));
}

function jitterEdges(edges: GraphEdge[]): GraphEdge[] {
    return edges.map(e => ({
        ...e,
        confidence: Math.max(0.50, Math.min(0.99, e.confidence + (Math.random() - 0.5) * 0.03)),
    }));
}

// ── Stateful graph accumulator (grows as user asks questions) ────────────────

let _accumulatedNodes: GraphNode[] = [];
let _accumulatedEdges: GraphEdge[] = [];

export function resetGraph() {
    _accumulatedNodes = [];
    _accumulatedEdges = [];
}

function accumulateGraph(newNodes: GraphNode[], newEdges: GraphEdge[]) {
    const existingIds = new Set(_accumulatedNodes.map(n => n.id));
    for (const n of newNodes) {
        if (!existingIds.has(n.id)) {
            _accumulatedNodes.push(n);
            existingIds.add(n.id);
        }
    }
    const existingEdgeKeys = new Set(_accumulatedEdges.map(e => `${e.source}-${e.target}`));
    for (const e of newEdges) {
        const key = `${e.source}-${e.target}`;
        if (!existingEdgeKeys.has(key)) {
            _accumulatedEdges.push(e);
            existingEdgeKeys.add(key);
        }
    }
}

// ── Convenience Fetchers ───────────────────────────────────────────────────

export const fetchGraphVis = async (): Promise<GraphVisResponse> => {
    // Return the accumulated graph with price jitter
    if (_accumulatedNodes.length === 0) {
        return { nodes: [], edges: [] };
    }
    return {
        nodes: jitterNodes(_accumulatedNodes),
        edges: jitterEdges(_accumulatedEdges),
    };
};

export const fetchGraphStats = async (): Promise<GraphStats> => {
    const n = _accumulatedNodes.length || 43;
    const e = _accumulatedEdges.length || 67;
    return {
        total_markets: n,
        total_relationships: e,
        total_implies: Math.floor(e * 0.55),
        total_mutually_exclusive: Math.floor(e * 0.25),
        connected_components: Math.min(6, Math.ceil(n / 7)),
    };
};

export const fetchBrainHealth = async (): Promise<HealthResponse> => {
    return { status: 'ok', db_connected: true, llm_configured: true };
};

export const fetchBotHealth = async (): Promise<boolean> => {
    return true;
};

export const fetchBotStatus = async (): Promise<BotStatus> => {
    return {
        mode: 'AUTONOMOUS_V3',
        cumulative_pnl: '1240.50',
        signals_executed: 84,
        uptime_secs: 7200,
        positions: [
            { asset_id: 'BTC_70K_MARCH', side: 'BUY', size: '25.00', entry_price: '0.620', opened_at: new Date(Date.now() - 3600000).toISOString() },
            { asset_id: 'ETH_SPOT_ETF', side: 'BUY', size: '18.50', entry_price: '0.410', opened_at: new Date(Date.now() - 7200000).toISOString() },
            { asset_id: 'FED_CUT_MARCH', side: 'SELL', size: '12.00', entry_price: '0.540', opened_at: new Date(Date.now() - 1800000).toISOString() },
        ],
        recent_trades: [],
    };
};

// ── Chat — the demo's core interaction ──────────────────────────────────────

const ANALYSIS_RESPONSES: Record<string, string> = {
    btc: `SCAN_COMPLETE: Mapped 8 BTC/ETF derivative vectors. High-confidence arbitrage detected in IBIT inflow ↔ GBTC outflow spread (Δ=3.8%, Kelly=0.42). Cross-referencing with halving cycle thesis for temporal edge. Contradiction engine flagged IBIT_INFLOW vs GBTC_OUTFLOW as mutually exclusive — probability sum exceeds 1.04 → correcting.`,
    eth: `SCAN_COMPLETE: 7 Ethereum ecosystem vectors identified. L2 scaling thesis shows Base daily TXN momentum correlating with OP Stack adoption at r=0.91. ETH Spot ETF filing creates implication cascade to ETH/BTC ratio. Blob fee savings driving L2 TVL rebalancing across Arbitrum ↔ Base (partition detected).`,
    defi: `SCAN_COMPLETE: 8 DeFi/stablecoin vectors mapped. AAVE V4 → RWA TVL implication chain at 0.88 confidence. MakerDAO Endgame creates exclusive relationship with AAVE governance. Stable supply dynamics: USDC $40B target implies regulatory clarity cascade. Ethena USDe depeg risk flagged as hedge vector.`,
    reg: `SCAN_COMPLETE: 7 regulatory vectors analyzed. SEC Coinbase case resolution → Gensler successor appointment creates high-confidence implication loop (0.93). FIT21 Senate passage cascades to SAB 121 override and Binance US relicensing. EU MiCA enforcement is partitioned from US CBDC pilot timeline.`,
    macro: `SCAN_COMPLETE: 7 macro vectors processed. Fed rate cut → crypto $3T MCap implication at 0.88 confidence. CPI → yield curve → DXY cascade creates 3-leg arbitrage chain. Japan rate hike generates exclusive pressure on DXY direction. BTC-Gold correlation strengthening at 0.43, threshold trigger at 0.50.`,
    sol: `SCAN_COMPLETE: 6 alt-L1 vectors mapped. SOL > $200 → ETF filing implication at 0.89 confidence. Firedancer launch creates exclusive relationship with AVAX subnet adoption. SUI TVL growth competes with Solana ecosystem for capital flows. Cross-chain IBC volume serving as liquidity barometer.`,
    all: `FULL_SCAN_COMPLETE: 43 market vectors across 6 sector clusters processed. 67 relationships mapped including 10 cross-cluster edges. Identified 12 active arbitrage opportunities with aggregate expected edge of 4.2%. Contradiction engine resolved 3 probability violations. Portfolio Kelly optimal at 34% capital deployment.`,
};

function getResponseText(query: string): string {
    const q = query.toLowerCase();
    for (const [key, response] of Object.entries(ANALYSIS_RESPONSES)) {
        if (key === 'all') continue;
        const cluster = CLUSTERS.find(c => c.keywords.some(kw => key.includes(kw.slice(0, 3))));
        if (cluster && cluster.keywords.some(kw => q.includes(kw))) {
            return response;
        }
    }
    return ANALYSIS_RESPONSES.all;
}

export const sendChatMessage = async (message: string, _history: ChatMessage[] = []) => {
    // Believable 3–5 second delay
    const delay = 3000 + Math.random() * 2000;
    await new Promise(r => setTimeout(r, delay));

    const { nodes, edges } = matchClusters(message);
    accumulateGraph(nodes, edges);

    return {
        response: getResponseText(message),
        graph_updated: true,
        markets_found: nodes.length,
        mock_data: { nodes, edges },
    };
};

export const syncAssets = (_assetIds: string[]) =>
    Promise.resolve({ message: 'OK', errors: [] });
