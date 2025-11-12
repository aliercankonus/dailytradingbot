-- Create trades table for executed trades
CREATE TABLE public.trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid REFERENCES public.trading_signals(id),
  symbol text NOT NULL,
  side text NOT NULL CHECK (side IN ('BUY', 'SELL')),
  order_type text NOT NULL CHECK (order_type IN ('MARKET', 'LIMIT', 'STOP_LOSS', 'TAKE_PROFIT')),
  quantity numeric NOT NULL,
  entry_price numeric NOT NULL,
  exit_price numeric,
  stop_loss numeric,
  take_profit numeric,
  profit_loss numeric,
  profit_loss_percent numeric,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  binance_order_id text,
  executed_at timestamp with time zone DEFAULT now(),
  closed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- Create positions table for tracking open positions
CREATE TABLE public.positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid REFERENCES public.trades(id),
  symbol text NOT NULL,
  side text NOT NULL,
  quantity numeric NOT NULL,
  entry_price numeric NOT NULL,
  current_price numeric,
  stop_loss numeric,
  take_profit numeric,
  unrealized_pnl numeric,
  unrealized_pnl_percent numeric,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  opened_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create backtesting_results table
CREATE TABLE public.backtesting_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_name text NOT NULL,
  symbol text NOT NULL,
  start_date timestamp with time zone NOT NULL,
  end_date timestamp with time zone NOT NULL,
  initial_capital numeric NOT NULL DEFAULT 10000,
  final_capital numeric,
  total_trades integer DEFAULT 0,
  winning_trades integer DEFAULT 0,
  losing_trades integer DEFAULT 0,
  win_rate numeric,
  total_profit numeric,
  total_loss numeric,
  net_profit numeric,
  max_drawdown numeric,
  sharpe_ratio numeric,
  profit_factor numeric,
  avg_win numeric,
  avg_loss numeric,
  largest_win numeric,
  largest_loss numeric,
  results_data jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Create risk_parameters table
CREATE TABLE public.risk_parameters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  max_risk_per_trade_percent numeric NOT NULL DEFAULT 1.5,
  max_open_trades integer NOT NULL DEFAULT 5,
  consecutive_loss_threshold integer NOT NULL DEFAULT 3,
  position_size_reduction_percent numeric NOT NULL DEFAULT 50,
  portfolio_value numeric NOT NULL DEFAULT 10000,
  current_open_trades integer DEFAULT 0,
  consecutive_losses integer DEFAULT 0,
  is_trading_enabled boolean DEFAULT true,
  updated_at timestamp with time zone DEFAULT now()
);

-- Insert default risk parameters
INSERT INTO public.risk_parameters (id) VALUES (gen_random_uuid());

-- Enable RLS
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backtesting_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_parameters ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access
CREATE POLICY "Allow public read access to trades"
  ON public.trades FOR SELECT USING (true);

CREATE POLICY "Allow public read access to positions"
  ON public.positions FOR SELECT USING (true);

CREATE POLICY "Allow public read access to backtesting results"
  ON public.backtesting_results FOR SELECT USING (true);

CREATE POLICY "Allow public read access to risk parameters"
  ON public.risk_parameters FOR SELECT USING (true);

-- Create indexes for performance
CREATE INDEX idx_trades_symbol ON public.trades(symbol);
CREATE INDEX idx_trades_status ON public.trades(status);
CREATE INDEX idx_positions_symbol ON public.positions(symbol);
CREATE INDEX idx_positions_status ON public.positions(status);
CREATE INDEX idx_backtesting_results_strategy ON public.backtesting_results(strategy_name);

-- Create function to update positions
CREATE OR REPLACE FUNCTION update_position_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_positions_timestamp
  BEFORE UPDATE ON public.positions
  FOR EACH ROW
  EXECUTE FUNCTION update_position_timestamp();