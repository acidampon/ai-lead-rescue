# Make.com pilot

Inbound: Make Webhook -> POST /api/public/leads with X-Intake-Token and Idempotency-Key.

Replies: Make -> POST /api/public/reply with X-Intake-Token.

Outbound: AI Lead Rescue -> signed webhook -> Make scenario.

Events include lead.created, lead.analyzed, lead.responded, followup.due, lead.replied, human.handoff and lead.closed.