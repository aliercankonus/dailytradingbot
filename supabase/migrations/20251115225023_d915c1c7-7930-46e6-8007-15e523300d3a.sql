-- Add trend and confidence_score columns to positions table
ALTER TABLE positions 
ADD COLUMN trend text,
ADD COLUMN confidence_score integer;

-- Add comment to describe the trend column
COMMENT ON COLUMN positions.trend IS 'Market trend at position entry: bullish, bearish, or ranging';
COMMENT ON COLUMN positions.confidence_score IS 'Confidence score (0-100) from the signal that generated this position';