## MoMicro Assist Server

Fastify backend for MoMicro Assist with Firebase auth, Stripe premium billing, chatbot management, public widget embeds, websocket messaging, AI replies, and local vector search.

### Start

```bash
npm start
```

### Main docs

- Swagger UI: `/docs`
- Firebase auth page: `/static/auth.html`
- Widget script: `/chat/script/:chatbotId`
- Widget iframe: `/chat/iframe/:chatbotId`

### Core flow

1. Authenticate with Firebase and exchange the Firebase token for a backend session at `/v1/auth/session`.
2. Create a chatbot in `/v1/chatbots`.
   Set `settings.defaultLanguage` (for example `english`, `german`, `french`) and provide text fields in that language.
   To list allowed languages, use `GET /v1/chatbots/languages`.
   To edit only one translated language without GPT retranslation, use `PATCH /v1/chatbots/:chatbotId/languages/:language`.
3. Publish it and install it with the snippet from `/v1/chatbots/:chatbotId/install`.
   You can force widget language from website via `?lang=` on embed URL (`/chat/script/:chatbotId?lang=en` or `/chat/iframe/:chatbotId?lang=german`).
4. Start a chatbot trial with `/v1/subscription/trial` or buy a chatbot tier with `/v1/subscription/checkout` (`chatbotId` is required, `tierId` supports `auth` and `full` by default).
5. Upload `pdf`, `txt`, or `json` files to `/v1/chatbots/:chatbotId/files` (`full` tier or trial by default).

### Billing tiers

- `free`: manual chat only, no `authClient`, no AI, no knowledge files.
- `auth`: `$20/mo`, enables `authClient` conversations without AI.
- `full`: `$50/mo`, enables `authClient`, AI replies, and knowledge files.
- You can extend or override tiers with `BILLING_TIER_DEFINITIONS` JSON, and configure default Stripe prices with `STRIPE_AUTH_PRICE_ID` and `STRIPE_FULL_PRICE_ID`.
