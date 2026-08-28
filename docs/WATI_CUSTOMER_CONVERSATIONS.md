# WATI customer conversations

The customer message panel sends text directly through WATI and receives customer
replies through a webhook. Complaint and like tabs remain timeline history.

## Deployment

1. Apply `20260828100000_wati_customer_conversations.sql`.
2. Set `WATI_API_ENDPOINT`, `WATI_API_TOKEN`, `WATI_CHANNEL_NUMBER`, and a random
   `WATI_WEBHOOK_SECRET` as Supabase Edge Function secrets.
3. Deploy `send-wati-customer-message` and `wati-customer-webhook`.
4. In WATI, add this enabled webhook URL (replace both placeholders):

   `https://<project>.supabase.co/functions/v1/wati-customer-webhook?secret=<WATI_WEBHOOK_SECRET>`

5. Subscribe it to Message Received, Session Message Sent, Delivered, Read, and
   Failed events, then use WATI's sample callback to verify a `200` response.

Free-form session messages only work while the WhatsApp 24-hour customer-service
window is active. Outside that window, initiate contact with an approved template.
