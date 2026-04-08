-- Add staff_name column to tip_distribution_details table

ALTER TABLE tip_distribution_details
ADD COLUMN staff_name TEXT DEFAULT NULL;

-- Create index on staff_name for faster lookups
CREATE INDEX idx_tip_distribution_details_staff_name
ON tip_distribution_details(staff_name);
