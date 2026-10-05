-- Update rooms status check constraint to include check_in and check_out
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_status_check;

ALTER TABLE rooms ADD CONSTRAINT rooms_status_check 
CHECK (status IN ('vacant', 'occupied', 'check_in', 'check_out', 'cleaning', 'maintenance', 'out_of_order'));