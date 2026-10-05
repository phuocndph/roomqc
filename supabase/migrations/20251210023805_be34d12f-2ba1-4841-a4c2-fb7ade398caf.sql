-- Drop the unique constraint on transaction_code since multiple items share the same code in a batch
ALTER TABLE inventory_transactions DROP CONSTRAINT IF EXISTS inventory_transactions_transaction_code_key;

-- Create a non-unique index for performance instead
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_transaction_code ON inventory_transactions(transaction_code);