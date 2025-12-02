-- Add columns for partial take profit tracking
ALTER TABLE public.positions
ADD COLUMN IF NOT EXISTS original_quantity numeric,
ADD COLUMN IF NOT EXISTS partial_tp_level integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS tp1_price numeric,
ADD COLUMN IF NOT EXISTS tp2_price numeric,
ADD COLUMN IF NOT EXISTS tp3_price numeric;

-- Add same columns to positions_archive for consistency
ALTER TABLE public.positions_archive
ADD COLUMN IF NOT EXISTS original_quantity numeric,
ADD COLUMN IF NOT EXISTS partial_tp_level integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS tp1_price numeric,
ADD COLUMN IF NOT EXISTS tp2_price numeric,
ADD COLUMN IF NOT EXISTS tp3_price numeric;

-- Update the view to include new columns
DROP VIEW IF EXISTS public.positions_with_archive;
CREATE VIEW public.positions_with_archive AS
SELECT 
    id, user_id, symbol, side, quantity, entry_price, current_price,
    stop_loss, take_profit, realized_pnl, realized_pnl_percent,
    status, opened_at, updated_at, closed_at, executed_at, exit_price,
    close_reason, trend, confidence_score, trend_consistency,
    opened_by_rebalancer, closed_by_rebalancer, binance_order_id,
    order_type, signal_id, strategy_name, original_quantity,
    partial_tp_level, tp1_price, tp2_price, tp3_price,
    false as is_archived
FROM public.positions
UNION ALL
SELECT 
    id, user_id, symbol, side, quantity, entry_price, current_price,
    stop_loss, take_profit, realized_pnl, realized_pnl_percent,
    status, opened_at, updated_at, closed_at, executed_at, exit_price,
    close_reason, trend, confidence_score, trend_consistency,
    opened_by_rebalancer, closed_by_rebalancer, binance_order_id,
    order_type, signal_id, strategy_name, original_quantity,
    partial_tp_level, tp1_price, tp2_price, tp3_price,
    true as is_archived
FROM public.positions_archive;

COMMENT ON COLUMN public.positions.partial_tp_level IS 'Tracks which partial TP level has been reached: 0=none, 1=TP1 (50%), 2=TP2 (75%), 3=TP3 (100%)';
COMMENT ON COLUMN public.positions.original_quantity IS 'Original quantity when position was opened, before any partial closes';
COMMENT ON COLUMN public.positions.tp1_price IS 'First partial take profit price (33% of TP distance)';
COMMENT ON COLUMN public.positions.tp2_price IS 'Second partial take profit price (66% of TP distance)';
COMMENT ON COLUMN public.positions.tp3_price IS 'Final take profit price (100% - same as take_profit)';