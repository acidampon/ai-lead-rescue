# AI Lead Rescue

AI Lead Rescue is a lead-recovery and conversion system: capture an enquiry, analyze it, respond using approved business information, follow up, stop automation when the customer replies, and hand off to a human when required.

## Run
```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Production
Use PostgreSQL with `DATABASE_URL`, set `NODE_ENV=production` and `AUTH_REQUIRED=true`, configure HTTPS/CORS, and provide approved AI/email credentials through the host secret manager.

## Core API
- `POST /api/public/leads` — public intake using `X-Intake-Token`
- `POST /api/public/reply` — records customer replies and stops automated follow-up
- `GET /api/leads` — authenticated lead list
- `GET /api/leads.csv` — authenticated export
- `POST /api/leads/:id/respond`
- `POST /api/leads/:id/follow-up`
- `POST /api/leads/:id/handoff`
- `POST /api/leads/:id/reply`
- `POST /api/leads/:id/close`
- `GET /api/health`
- `GET /api/ready`

## Make.com
Use Make as an integration layer: Make can send inbound enquiries to the public intake endpoint, and AI Lead Rescue can send signed webhook events back to Make.

## Safety rules
The response layer is instructed to use only approved business information and not invent prices, availability, discounts, promises, or policies. Unknown information is escalated to a human.