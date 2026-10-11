-- 78 — Session Lifecycle: feedback rating + closed reason on conversations
-- Run once after 75_chatbot_module.sql

-- Feedback rating (1-5) from the visitor after chat completion
ALTER TABLE mb_chatbot_conversations
  ADD COLUMN IF NOT EXISTS feedback_rating  smallint      CHECK (feedback_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS feedback_comment text,
  ADD COLUMN IF NOT EXISTS closed_reason    text          CHECK (closed_reason IN ('idle_timeout','user_closed','max_length','agent_closed','completed'));

-- Track whether the idle followup was already sent for this conversation
ALTER TABLE mb_chatbot_conversations
  ADD COLUMN IF NOT EXISTS idle_followup_sent_at timestamptz;

COMMENT ON COLUMN mb_chatbot_conversations.feedback_rating IS '1-5 emoji rating from visitor after chat closes';
COMMENT ON COLUMN mb_chatbot_conversations.closed_reason IS 'Why the chat was closed: idle_timeout, user_closed, max_length, agent_closed, completed';
COMMENT ON COLUMN mb_chatbot_conversations.idle_followup_sent_at IS 'When the idle nudge was sent, so we don''t send it twice';
