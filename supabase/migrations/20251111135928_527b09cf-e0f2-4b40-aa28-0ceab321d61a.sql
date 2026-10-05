-- Remove strict hotel code constraint to allow flexible codes
ALTER TABLE hotels DROP CONSTRAINT IF EXISTS hotels_code_check;

-- Add a more flexible constraint: code must be 2-20 characters, alphanumeric with dashes
ALTER TABLE hotels ADD CONSTRAINT hotels_code_format 
  CHECK (code ~ '^[A-Z0-9-]{2,20}$' AND length(trim(code)) >= 2);