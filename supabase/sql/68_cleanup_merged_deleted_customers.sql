-- 68: Permanently remove merged and soft-deleted customer records
-- Both the Customers page and pipeline workflows should show the same count.

BEGIN;

-- Fix FK constraints that block deletes (change RESTRICT → SET NULL)
ALTER TABLE public.form_submissions
  DROP CONSTRAINT IF EXISTS form_submissions_customer_id_fkey,
  ADD CONSTRAINT form_submissions_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;

-- Remove soft-deleted customers
DELETE FROM customers WHERE deleted_at IS NOT NULL;

-- Remove merged duplicate customers
DELETE FROM customers WHERE status = 'merged';

COMMIT;
