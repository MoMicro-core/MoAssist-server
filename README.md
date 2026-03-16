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
3. Publish it and install it with the snippet from `/v1/chatbots/:chatbotId/install`.
4. Start a chatbot trial with `/v1/subscription/trial` or buy chatbot premium with `/v1/subscription/checkout` (`chatbotId` is required).
5. Upload `pdf`, `txt`, or `json` files to `/v1/chatbots/:chatbotId/files` (premium/trial chatbot only).
