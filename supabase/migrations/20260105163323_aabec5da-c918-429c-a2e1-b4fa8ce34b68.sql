-- Add department column to telegram_groups for smart routing
ALTER TABLE telegram_groups ADD COLUMN IF NOT EXISTS department text NULL;

-- Comment for documentation
COMMENT ON COLUMN telegram_groups.department IS 'Department filter: housekeeping, maintenance, laundry, inventory, accounting, front_desk, general';

-- Create index for department filtering (if not exists)
CREATE INDEX IF NOT EXISTS idx_telegram_groups_department ON telegram_groups(department);