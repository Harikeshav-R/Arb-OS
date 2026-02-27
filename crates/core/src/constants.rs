use rust_decimal::Decimal;
use rust_decimal_macros::dec;

pub const PEAK_TAKER_FEE_CRYPTO_AT_50PCT: Decimal = dec!(0.0156);
pub const PEAK_TAKER_FEE_SPORTS_AT_50PCT: Decimal = dec!(0.0044);
pub const GAS_SAFETY_MARGIN: Decimal = dec!(1.5);
// Typical Polygon standard transaction: ~50k gas units @ 30 gwei
pub const ESTIMATED_GAS_UNITS_PER_LEG: Decimal = dec!(50000);
pub const ESTIMATED_GWEI_PRICE: Decimal = dec!(30);
/// Mock static price for POL/MATIC in USDC used for gas budget calculations.
/// Since typical Polygon transaction fees are extremely small (on the order of $0.001),
/// even significant relative volatility in the asset price will not materially affect
/// the expected profit margin of arbitrage paths which have a $0.50 minimum threshold.
/// Thus, using a static price is an acceptable simplification.
pub const MATIC_PRICE_USDC: Decimal = dec!(0.60);

pub const TARGET_LIQUIDITY: Decimal = dec!(100.0);
pub const MIN_PROFIT_THRESH_USDC: Decimal = dec!(0.50); // Minimum $0.50 absolute return (equivalent to 0.5% return on $100 deployment)
pub const MIN_CONFIDENCE_THRESHOLD: f64 = 0.90;

pub const MAX_TRACKED_ASSETS: usize = 1000;
pub const CMD_CHANNEL_BUFFER: usize = 32;
pub const STATE_CHANNEL_BUFFER: usize = 100;
pub const STREAM_ERROR_RETRY_DELAY_SECS: u64 = 2;
pub const CONNECTION_RETRY_DELAY_SECS: u64 = 5;
