-- Migration 031: Reset test data
-- Clears test conversations/messages/runs while keeping core config

DELETE FROM flow_run_events;
DELETE FROM flow_runs;
DELETE FROM messages;
DELETE FROM conversations;
DELETE FROM broadcast_recipients;
DELETE FROM broadcasts;
DELETE FROM contact_tags;
DELETE FROM contact_custom_values;
DELETE FROM contact_notes;
DELETE FROM scheduled_reminders;
DELETE FROM website_orders;
DELETE FROM contacts;
DELETE FROM deals;
