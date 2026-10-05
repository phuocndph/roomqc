-- Add bidirectional linking between supplement_requests and distribution_orders

-- Add distribution_order_id to supplement_requests
ALTER TABLE supplement_requests 
ADD COLUMN distribution_order_id uuid REFERENCES distribution_orders(id);

-- Add supplement_request_id to distribution_orders
ALTER TABLE distribution_orders 
ADD COLUMN supplement_request_id uuid REFERENCES supplement_requests(id);

-- Create indexes for efficient lookups
CREATE INDEX idx_supplement_requests_distribution_order_id 
ON supplement_requests(distribution_order_id) 
WHERE distribution_order_id IS NOT NULL;

CREATE INDEX idx_distribution_orders_supplement_request_id 
ON distribution_orders(supplement_request_id) 
WHERE supplement_request_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN supplement_requests.distribution_order_id IS 'Link to distribution order created when request is approved';
COMMENT ON COLUMN distribution_orders.supplement_request_id IS 'Link to supplement request that triggered this distribution order';