# 🎯 ULTIMATE INTERVIEW PREPARATION HANDBOOK — ReplyPilot
## Part 1: Architecture, Backend, Auth & Security

---

# 1. MICROSERVICES ARCHITECTURE

## 1. Concept

**Beginner**: A microservices architecture splits a large application into smaller, independent services that each handle one specific job. Instead of one big program doing everything, you have multiple smaller programs working together.

**Intermediate**: Each microservice owns its domain logic, communicates via well-defined APIs (REST, gRPC, message queues), can be deployed independently, and can use different tech stacks. This contrasts with monolithic architecture where all features share a single codebase and deployment.

**Expert**: Microservices enable independent deployability, failure isolation, and polyglot persistence. However, they introduce distributed systems complexity — network partitions, eventual consistency, distributed tracing, service discovery, and cascading failures. The CAP theorem becomes a daily design constraint. You must weigh the operational overhead (observability, deployment pipelines, inter-service auth) against the organizational and scalability benefits.

**In MY project (ReplyPilot)**: I split the system into 5 services:
1. **Client** (React + Vite, port 5173) — UI dashboard
2. **Server** (Express.js, port 5000) — API gateway, OAuth, cron jobs
3. **Worker** (BullMQ, standalone Node.js process) — background job processor for classify, generate, post-reply
4. **AI Service** (FastAPI, port 8000) — Python ML classifier + LLM reply generation via Gemma
5. **RAG Service** (FastAPI, port 8001) — transcript ingestion pipeline + semantic search via Pinecone

The reason I split them is:
- **Server vs Worker**: The worker runs CPU-heavy AI calls and YouTube API posting. Keeping it separate means API response times stay fast — the server just enqueues a job and returns 202. Workers scale independently.
- **AI Service in Python**: ML/NLP ecosystem is Python-native (HuggingFace Transformers, sentence-transformers, PyTorch). Using FastAPI was natural.
- **RAG Service separate from AI**: RAG has its own lifecycle — it runs a long-lived BRPOP queue consumer for async transcript ingestion, has its own Pinecone connection pool, and embeds heavy BGE models. Coupling it with the classify/generate service would create deployment coupling and model loading conflicts.

## 2. Interview Questions

**Beginner:**
- Q: What is a microservices architecture?
- Q: Why didn't you build this as a single monolithic application?
- Q: How do the services communicate with each other?

**Intermediate:**
- Q: How did you decide where to split the service boundaries?
- Q: What happens if one service goes down?
- Q: How do you handle data consistency across services?
- Q: Why is the Worker a separate process from the Server?

**Advanced:**
- Q: How do you handle distributed transactions across your services?
- Q: What's the blast radius if your AI Service crashes?
- Q: How would you implement service discovery if you had 20 services?
- Q: How do you handle versioning of your internal APIs?

**Staff Engineer:**
- Q: At what point did the microservices split become worth the operational overhead?
- Q: How would you migrate this to a monolith-first approach if you were starting over?
- Q: How would you implement distributed tracing across Node.js and Python services?
- Q: What's your strategy for schema evolution across service boundaries?

**Debugging:**
- Q: A user says "my comment was classified but no reply was generated." How do you debug this across services?
- Q: The generate queue is backing up. How do you identify the bottleneck?

## 3. Ideal Interview Answers

**Q: Why didn't you build this as a single monolithic application?**

A: "I started by identifying the natural domain boundaries. The ML inference (classification + generation) requires Python and heavy model loading — that doesn't belong in a Node.js process. The background job processing (classify, generate, post-reply) is I/O-bound and long-running — if I kept it in the API server, a batch classify of 500 comments would block HTTP requests. And the RAG pipeline has a completely different lifecycle — it runs a persistent BRPOP loop consuming from a Redis queue, with its own embedder model.

The split gives me three key benefits:
1. **Failure isolation**: If the AI Service OOMs while loading a model, the server keeps serving the dashboard — users see their comments, they just can't generate new replies temporarily.
2. **Independent scaling**: On a day with 10,000 comments to classify, I can spin up more Worker instances without touching the server.
3. **Polyglot**: Python for ML (HuggingFace, sentence-transformers), Node.js for real-time API and queue management.

The trade-off is operational complexity — I need health checks on each service, and debugging requires correlating logs across 5 processes. For a solo project, that's manageable. For a team, I'd add OpenTelemetry distributed tracing."

**Q: What happens if the AI Service goes down?**

A: "The system degrades gracefully. The Worker tries to call `POST /api/v1/classify` — it gets a connection refused or timeout. BullMQ catches the error, and since I configured `attempts: 3` with `backoff: { type: 'exponential', delay: 5000 }`, it retries after 5s, 10s, 20s. The comment stays in `classificationStatus: 'pending'` in MongoDB. No data is lost.

Meanwhile, the Server is fully operational — users can browse their dashboard, view videos, manage personas. They just won't see new classifications until the AI Service recovers.

In the generate service specifically, I have a fallback in `generate.py` — if the LLM call fails entirely, it returns a generic 'Thank you for your comment!' response with `model_used: 'error-fallback'` rather than crashing the whole pipeline."

**Q: How do you handle data consistency across services?**

A: "I use eventual consistency via message queues. When the server syncs comments from YouTube, it bulk-upserts them into MongoDB with `classificationStatus: 'pending'`, then enqueues classify jobs to BullMQ. The Worker eventually processes them. There's no distributed transaction — if the enqueue fails after the DB write, the comment just sits as 'pending' and the next cron run or manual batch classify picks it up.

For the post-reply flow, I implemented idempotency: the `postReply.worker.js` uses an atomic `findOneAndUpdate` with a status guard (`status: { $ne: 'published' }`) to claim the reply. It checkpoints the `ytReplyId` immediately after posting to YouTube, so even if the worker crashes between posting and updating status, the next retry sees the `ytReplyId` and skips the YouTube insert. The `replyCountCredited` flag prevents double-counting on retries."

## 4. Counter Questions

1. Why not use gRPC instead of REST between services?
2. Why not a message broker like RabbitMQ or Kafka for inter-service communication?
3. What if Redis (your queue backbone) crashes?
4. How would you implement circuit breakers between services?
5. How do you handle schema changes in your REST APIs without breaking other services?
6. Would you still use 5 separate services for 100 users? Isn't that over-engineered?
7. How do you deploy all 5 services atomically?
8. What's your monitoring story? How do you know if a service is unhealthy?
9. How do you handle secrets rotation across 5 services?
10. What if the Worker and Server have different versions of the Mongoose models?

## 5. Counter Question Answers

**Q: Why not gRPC between services?**
A: "gRPC would give me type-safe contracts via protobufs and binary serialization, which is faster than JSON. But for this project, the overhead wasn't justified — I have only 4 inter-service API calls (classify, generate, RAG query, RAG ingest). REST is simpler to debug (curl, Postman), easier to add middleware (logging, timing), and FastAPI has first-class REST support. If I were at Google scale with 50+ services and latency-critical paths, gRPC would be the right call."

**Q: What if Redis crashes?**
A: "Redis is my single biggest dependency — it handles sessions, caching, BullMQ queues, YouTube token storage, and the RAG ingest queue. If Redis goes down:
- **Sessions**: Users get logged out (they can re-login via OAuth).
- **BullMQ**: Workers can't dequeue — jobs accumulate. But BullMQ persists jobs in Redis, so once Redis comes back, jobs resume. No data loss.
- **YouTube tokens**: Token refresh falls back to hitting Google's OAuth endpoint with the encrypted refresh token from MongoDB. Slower, but works.
- In production, I'd use Redis Sentinel or Redis Cluster for HA. On Railway, I use a managed Redis instance with automatic failover."

**Q: Would you still use 5 services for 100 users?**
A: "Honestly, for 100 users, a monolith would be simpler. The reason I split was (a) the Python/Node polyglot requirement — ML models don't run in Node.js, and (b) the Worker separation was essential even at 1 user because I can't block the API server on a 30-second LLM call. The RAG split was a design choice for clean separation but could have been merged with the AI service. The key insight: **the Worker split is architectural necessity, not premature optimization.**"

---

# 2. EXPRESS.js BACKEND (Server)

## 1. Concept

**Beginner**: Express.js is a minimal web framework for Node.js that makes it easy to build APIs. You define routes (like `/api/comments`), attach middleware (functions that process requests), and send responses.

**Intermediate**: Express follows a middleware pipeline pattern — each request flows through a chain of functions (`req, res, next`). Middleware can authenticate, validate, rate-limit, log, and transform before hitting the route handler. Express is un-opinionated, so you design your own architecture (MVC, Service Layer, etc.).

**Expert**: Express's strength is its simplicity and ecosystem. But it lacks built-in dependency injection, doesn't enforce architectural patterns, has no native TypeScript support, and doesn't support async error handling by default (you must wrap async handlers or use a library). For large teams, frameworks like NestJS (which wraps Express with decorators and DI) or Fastify (better performance via schema-based serialization) may be more appropriate.

**In MY project**: I use Express with an MVC + Service Layer pattern:
```
Routes → Controllers → Services → Models (MongoDB)
                          ↓
                    Queue Service (BullMQ)
```

My middleware stack in `app.js` is carefully ordered:
1. `express.json({ limit: '16kb' })` — body parsing with size limit against payload attacks
2. `cors(cors_option)` — CORS whitelist
3. `helmet()` — security headers
4. `cookieParser()` — session cookie parsing
5. `requestLogger` — structured HTTP logging
6. `session(...)` — Redis-backed sessions via `connect-redis`
7. `passport.initialize()` + `passport.session()` — OAuth
8. `csrfProtection` — Origin/Referer verification
9. `apilimiter` — rate limiting on `/api` routes
10. Route handlers
11. 404 handler
12. `globalErrorHandler` — catches all unhandled errors

## 2. Interview Questions

**Beginner:**
- Q: What is Express.js and why did you choose it?
- Q: What is middleware in Express?
- Q: How does your routing work?

**Intermediate:**
- Q: Why is the order of middleware important in your `app.js`?
- Q: How do you handle async errors in Express?
- Q: What does `express.json({ limit: '16kb' })` do and why?

**Advanced:**
- Q: Why not use NestJS or Fastify instead?
- Q: How does `trust proxy` affect your rate limiter and session cookies?
- Q: Explain your global error handler. How does it catch errors from async route handlers?

**Staff Engineer:**
- Q: How would you migrate this Express codebase to TypeScript without downtime?
- Q: What's the performance ceiling of Express? At what point would you switch frameworks?

## 3. Ideal Interview Answers

**Q: Why is the order of middleware important in your `app.js`?**

A: "Order is critical because Express processes middleware top-to-bottom. In my `app.js`:
- `helmet()` must come before any response is sent to set security headers on every response.
- `cors()` must come before route handlers so preflight OPTIONS requests are handled correctly.
- `session()` must come before `passport.initialize()` because Passport reads from the session.
- `csrfProtection` must come after session (it needs the session cookie) and before route handlers.
- `apilimiter` is scoped to `/api` prefix specifically so the health check endpoint isn't rate-limited.
- `globalErrorHandler` must be the very last middleware — Express identifies error handlers by having 4 arguments `(err, req, res, next)`.

If I put CSRF before sessions, it would fail because there's no session to verify against. If I put rate limiting after routes, it would never execute."

**Q: How do you handle async errors in Express?**

A: "Express doesn't natively catch promise rejections in async handlers. If an async controller throws, Express won't call the error middleware — it'll crash with an unhandled rejection. I handle this by using an `ApiError` class that extends `Error` with a `statusCode` property, and my controllers use try/catch blocks. My global error handler in `error.middleware.js` catches these and returns structured JSON responses. In a production system, I'd use a wrapper like `express-async-errors` or write a higher-order function to automatically catch async errors."

## 4. Counter Questions & Answers

**Q: Why Express instead of NestJS?**
A: "NestJS adds decorators, dependency injection, and TypeScript-first design. For a team of 5+, that's great for consistency. For this project, Express was faster to iterate with — I didn't need DI containers or module systems. The trade-off is I manually organized my code into MVC + Service layers. If I were starting this at a company, I'd pick NestJS for enforced structure."

**Q: Why Express instead of Spring Boot (Java)?**
A: "Spring Boot is excellent for enterprise Java shops. But my frontend is React, my ML services are Python — adding Java would mean 3 languages. Node.js shares the JavaScript ecosystem with React, and the npm ecosystem for YouTube API (`googleapis`), Redis (`ioredis`, `connect-redis`), and BullMQ is mature. Performance-wise, for I/O-bound API workloads, Node.js is competitive with Spring Boot."

---

# 3. GOOGLE OAuth 2.0 AUTHENTICATION

## 1. Concept

**Beginner**: OAuth 2.0 lets users log in to my app using their Google account. Instead of storing passwords, I redirect users to Google's login page. Google verifies them and gives my app a token to access their data (like YouTube comments).

**Intermediate**: OAuth 2.0 is an authorization framework (not authentication — that's OpenID Connect on top). The flow is:
1. User clicks "Login with Google" → redirected to Google's consent screen
2. User grants permissions (scopes) → Google redirects back to my `callbackURL` with an authorization code
3. My server exchanges the code for an access token (short-lived, ~1 hour) and a refresh token (long-lived)
4. The access token is used to call YouTube APIs. The refresh token is stored securely to get new access tokens later.

**Expert**: The critical subtleties:
- **`accessType: 'offline'`**: Required to receive a refresh token. Without this, Google only gives an access token.
- **`prompt: 'consent'`**: Forces the consent screen every time, ensuring we always get a refresh token (Google only sends it on first consent or when re-prompted).
- **Scope management**: I request YouTube-specific scopes (`youtube.readonly`, `youtube.force-ssl`) which give access to channel data and comment posting.
- **Token storage**: Access tokens are ephemeral (cached in Redis with 55-min TTL). Refresh tokens are encrypted with AES-256-GCM before storing in MongoDB — because if the database is compromised, plaintext refresh tokens would give attackers permanent access to users' YouTube channels.

**In MY project**: I use `passport-google-oauth20` strategy in `config/passport.js`. On OAuth callback:
1. Encrypt the refresh token via `encrypt()` from `utils/crypto.js`
2. Upsert the user into MongoDB with `findOneAndUpdate` (handles both new and returning users)
3. Cache the access token in Redis with key `yt:access_token:{userId}` (55-min TTL)
4. Cache the token expiry timestamp in Redis for quick validation
5. Cache the serialized user object in Redis (15-min TTL) to avoid DB hits on every request during `deserializeUser`

## 2. Interview Questions

**Beginner:**
- Q: What is OAuth 2.0 and why did you use it?
- Q: What's the difference between an access token and a refresh token?

**Intermediate:**
- Q: Why do you set `accessType: 'offline'` and `prompt: 'consent'`?
- Q: What YouTube scopes do you request and why?
- Q: How do you handle token expiration?

**Advanced:**
- Q: Why do you encrypt the refresh token before storing it in MongoDB?
- Q: Walk me through exactly what happens when a user's access token expires mid-request.
- Q: What's the race condition in token refresh, and how did you solve it?

**Staff Engineer:**
- Q: How would you handle token revocation by Google?
- Q: What happens if your encryption key is compromised?
- Q: How would you implement OAuth for a multi-tenant SaaS version of this?

**Production:**
- Q: A user reports "I keep getting asked to re-authenticate." What's happening?
- Q: How do you handle the Google OAuth quota limit?

## 3. Ideal Interview Answers

**Q: Walk me through what happens when a user's access token expires mid-request.**

A: "Great question — I built a specific mechanism for this. In `youtubeToken.helper.js`, the `getValidYoutubeToken()` function does this:

1. Check Redis for cached access token (`yt:access_token:{userId}`) and its expiry timestamp
2. If the token exists AND expiry is more than 5 minutes away (I use a 5-minute buffer), return it immediately — O(1) Redis GET.
3. If expired or about to expire, fetch the user's encrypted refresh token from MongoDB, decrypt it with `decrypt()`, and call Google's `refreshAccessToken()` API.
4. Cache the new access token and expiry in Redis.

**The race condition**: If 3 concurrent requests hit this while the token is expired, all 3 would try to refresh simultaneously — wasting Google API quota and potentially causing token invalidation. I solved this with an in-memory `Map` called `ongoingRefreshPromises`. Before starting a refresh, I check if one is already in-flight for this user. If yes, I await the existing promise. If no, I create a new promise, store it in the Map, and clean it up on `.finally()`. This is effectively a per-user mutex for token refresh."

**Q: What's the race condition in token refresh?**

A: "Without protection, if 10 concurrent requests hit the server for the same user with an expired token, all 10 would see 'token expired', all 10 would call `google.auth.OAuth2.refreshAccessToken()`. This has two problems:
1. **Quota waste**: 10 API calls to Google instead of 1.
2. **Token invalidation risk**: Google may invalidate previous refresh tokens when a new one is issued, causing race conditions.

I use an in-memory `Map<userId, Promise>` called `ongoingRefreshPromises`. The first request creates the refresh promise and stores it. Requests 2-10 find the existing promise and `await` it. When the first refresh completes, all 10 requests get the same new access token. The promise is removed from the Map in the `.finally()` handler."

## 4. Counter Questions

1. Why Passport.js and not a custom OAuth implementation?
2. Why not use JWT for authentication instead of server-side sessions?
3. What happens if Google revokes the user's refresh token?
4. How do you handle the case where a user removes your app's access from Google settings?
5. Why cache the user in Redis during `deserializeUser`? Isn't that premature optimization?
6. What if Redis is down during deserialization?
7. How would you support multiple OAuth providers (GitHub, Microsoft)?
8. Why a 55-minute TTL for access tokens when Google gives 60 minutes?
9. What if the user changes their Google email or display name?
10. How would you implement "link additional YouTube channels" for a single user?

## 5. Counter Question Answers

**Q: Why not JWT instead of server-side sessions?**
A: "JWTs are stateless — you can't revoke them before expiry. With session-based auth, if I detect suspicious activity, I can delete the session from Redis and the user is immediately logged out. Also, my sessions store the user ID and are backed by Redis, which gives me O(1) lookup. JWTs would require me to verify the signature on every request (CPU cost) and can't be invalidated without a blacklist (which is just sessions with extra steps). For this app where users manage their YouTube channel, the security benefit of revocable sessions outweighs the scalability benefit of JWTs."

**Q: Why a 55-minute TTL?**
A: "Google access tokens expire in 3600 seconds (60 min). I set 55 min TTL to create a 5-minute buffer. If a request comes in at minute 58, the token might expire mid-API-call to YouTube. With the 55-min TTL, Redis evicts the key 5 minutes early, triggering a proactive refresh before the token actually expires. This prevents mid-request token expiration errors."

---

# 4. AES-256-GCM TOKEN ENCRYPTION

## 1. Concept

**Beginner**: Encryption turns readable data into scrambled text that can only be read with a secret key. I encrypt sensitive data (like Google's refresh token) before storing it in the database, so even if someone hacks the database, they can't use the tokens.

**Intermediate**: AES-256-GCM is an authenticated encryption algorithm:
- **AES-256**: Advanced Encryption Standard with a 256-bit key — considered unbreakable by current technology
- **GCM** (Galois/Counter Mode): Provides both confidentiality AND integrity. The 16-byte authentication tag ensures the ciphertext hasn't been tampered with.

**Expert**: GCM is an AEAD (Authenticated Encryption with Associated Data) mode. Unlike CBC, it doesn't require separate HMAC for integrity. Key derivation: I use `SHA-256` to derive a 32-byte key from the `TOKEN_ENCRYPTION_KEY` env variable. Each encryption uses a random 16-byte IV (initialization vector) ensuring the same plaintext produces different ciphertext each time. The output format is `base64(IV || authTag || ciphertext)`.

**In MY project** (`utils/crypto.js`):
- `encrypt()`: Generates random 16-byte IV → creates AES-256-GCM cipher → encrypts → packs `iv + authTag + ciphertext` into a single base64 string
- `decrypt()`: Unpacks base64 → extracts IV (first 16 bytes), authTag (next 16 bytes), ciphertext (rest) → decrypts and verifies integrity
- **Graceful fallback**: If decryption fails (e.g., legacy plaintext token from before encryption was added), `decrypt()` returns the original string instead of crashing. This handles migration scenarios.

## 2. Interview Questions

**Beginner:**
- Q: Why do you encrypt refresh tokens?
- Q: What is AES-256-GCM?

**Intermediate:**
- Q: Why GCM mode instead of CBC?
- Q: What is the purpose of the IV and auth tag?
- Q: Why do you use a random IV each time?

**Advanced:**
- Q: How do you derive the encryption key? Is SHA-256 of a passphrase secure enough?
- Q: What happens if someone steals the `TOKEN_ENCRYPTION_KEY`?
- Q: Why does your `decrypt()` function fail gracefully instead of throwing?

**Staff Engineer:**
- Q: How would you implement key rotation without downtime?
- Q: Should the encryption key be in an environment variable or an HSM/KMS?
- Q: What's the risk of using a deterministic key derivation (SHA-256) vs. PBKDF2/scrypt?

## 3. Ideal Interview Answers

**Q: Why GCM instead of CBC?**

A: "CBC provides confidentiality but not integrity — an attacker could modify the ciphertext (bit-flipping attack) without detection. You'd need to add HMAC separately, which introduces 'encrypt-then-MAC' vs 'MAC-then-encrypt' ordering issues. GCM is an AEAD mode — it gives me both confidentiality and integrity in one operation. The 16-byte auth tag is generated during encryption and verified during decryption. If anyone tampers with the ciphertext, `decipher.final()` throws an error. It's also parallelizable, so it's faster than CBC on modern CPUs with AES-NI instructions."

**Q: How would you implement key rotation?**

A: "I'd implement a two-phase approach:
1. **Add key versioning**: Prefix each encrypted token with a key version byte (e.g., `0x01`). The `decrypt()` function reads the version and selects the corresponding key.
2. **Background migration**: Run a one-time job that reads all users, decrypts with the old key, re-encrypts with the new key, and updates MongoDB.
3. **Dual-key window**: During migration, `decrypt()` tries the new key first; if it fails (old token), falls back to the old key. My current `decrypt()` already has this pattern — it catches decryption errors and returns the raw value.
4. **Atomic cutover**: Once all tokens are migrated, remove the old key from config."

## 4. Counter Questions & Answers

**Q: Is SHA-256 of a passphrase secure for key derivation?**
A: "For key derivation from a passphrase, PBKDF2 or scrypt with a salt and high iteration count is more appropriate — they add computational cost to resist brute-force attacks. However, my `TOKEN_ENCRYPTION_KEY` is a high-entropy 32-byte hex string (set during deployment), not a human-memorable passphrase. SHA-256 of a random 256-bit key is effectively just a hash of random bytes — there's nothing to brute-force. The key derivation is a formality to ensure the key is exactly 32 bytes. In a production system with user-provided passwords, I'd absolutely use scrypt."

---

# 5. SESSION MANAGEMENT (Redis-backed)

## 1. Concept

**In MY project** (`app.js`): I use `express-session` with `connect-redis` as the session store:
- **Session name**: `'sid'` — a non-default name (default is `connect.sid`) to avoid fingerprinting the tech stack
- **Redis prefix**: `'session:'` — all session keys in Redis start with this prefix for easy identification
- **TTL**: 7 days (configured both in Redis store and cookie `maxAge`)
- **`resave: false`**: Don't save session to store if it wasn't modified during the request
- **`saveUninitialized: false`**: Don't create sessions for unauthenticated requests — saves Redis memory
- **`rolling: true`**: Resets the cookie expiry on every response — active users never get logged out
- **Cookie settings**: `httpOnly: true` (JavaScript can't access), `secure: true` in production (HTTPS only), `sameSite: 'none'` in production (required for cross-origin cookies when frontend and backend are on different domains), `'lax'` in development

## 2. Interview Questions

- Q: Why Redis for sessions instead of in-memory or MongoDB?
- Q: What does `rolling: true` do and why is it important?
- Q: Why `saveUninitialized: false`?
- Q: Explain the security implications of your cookie settings.
- Q: What happens to user sessions if you redeploy the server?
- Q: How would you implement session fixation prevention?
- Q: Why `sameSite: 'none'` in production but `'lax'` in development?

## 3. Ideal Answers

**Q: Why Redis for sessions instead of in-memory?**
A: "In-memory sessions die when the server restarts — every user gets logged out on deploy. They also can't be shared across multiple server instances (horizontal scaling). MongoDB would work but adds unnecessary write load for ephemeral data. Redis is purpose-built for this: O(1) GET/SET, automatic TTL expiration, and the data is naturally ephemeral. My sessions are small (just the user ID), so the memory footprint is negligible."

**Q: Why `sameSite: 'none'` in production?**
A: "My frontend (React on Vercel/Railway) and backend (Express on Railway) are on different domains in production. Cross-origin requests need `sameSite: 'none'` for the session cookie to be sent. This is safe because I also set `secure: true` (cookie only sent over HTTPS) and have CSRF protection via Origin/Referer header verification. In development, both are on `localhost` (different ports), so `'lax'` works fine."

---

# 6. CSRF PROTECTION

## 1. Concept

**In MY project** (`csrf.middleware.js`): I use Origin/Referer header verification instead of traditional CSRF tokens:
1. Only applies to state-changing methods (POST, PUT, PATCH, DELETE) — GET/HEAD/OPTIONS pass through
2. Extracts the `Origin` or `Referer` header from the request
3. Compares the origin against an allowlist built from `CORS_WHITELIST` and `CLIENT_URL`
4. If the origin matches → request proceeds. If not → 403 Forbidden.

This works because browsers always send the Origin/Referer header on cross-origin requests, and attackers cannot spoof these headers from a browser context. Combined with `sameSite: 'lax'` cookies, this provides strong CSRF protection without requiring token management.

## 2. Interview Questions

- Q: What is CSRF and how does your project prevent it?
- Q: Why did you use Origin/Referer checking instead of CSRF tokens?
- Q: What if the browser doesn't send an Origin header?
- Q: Can an attacker spoof the Origin header?
- Q: How does `sameSite: 'lax'` help with CSRF?

## 3. Ideal Answers

**Q: Why Origin/Referer checking instead of CSRF tokens?**
A: "Traditional CSRF tokens (like `csurf` middleware) require synchronizing a token between server and client — the server generates a token, sends it in a cookie or meta tag, and the client must include it in every state-changing request header. This adds complexity for SPAs with Axios. Origin/Referer checking is simpler and equally effective for browser-only APIs because:
1. Browsers always include the Origin header on cross-origin requests (and Referer on same-origin POST).
2. Attackers cannot programmatically set these headers from a browser — the browser enforces them.
3. Combined with `sameSite` cookies, cross-site form submissions don't even send the session cookie.

The trade-off: if I ever need to support non-browser clients (mobile apps, server-to-server), I'd need to whitelist or bypass the check — which my middleware already handles by allowing requests with no Origin header."

---

# 7. RATE LIMITING

## 1. Concept

**In MY project** (`rateLimiter.middleware.js`): Two rate limiters:
1. **`apilimiter`**: 100 requests per 15 minutes per IP on all `/api` routes. Uses `express-rate-limit` with standard headers (`RateLimit-*`). If the client accepts HTML, it redirects to the frontend with `?error=rate_limit` instead of showing raw JSON.
2. **`authLimiter`**: 20 requests per 15 minutes on auth routes — tighter limit to prevent OAuth brute-force.

Both use `validate: { trustProxy: false }` because I set `trust proxy` at the app level.

## 2. Interview Questions

- Q: Why do you have two different rate limiters?
- Q: Why 100 requests/15 min for API and 20 for auth?
- Q: How does rate limiting work with Redis in production? (Is it per-instance or global?)
- Q: What happens when a legitimate user hits the rate limit?
- Q: How would you implement per-user rate limiting instead of per-IP?

## 3. Ideal Answers

**Q: How does rate limiting scale across multiple server instances?**
A: "My current `express-rate-limit` uses in-memory storage by default — each server instance has its own counter. If I have 3 instances, a user could make 300 requests by hitting different instances. In production, I'd switch to `rate-limit-redis` which stores counters in Redis — giving me a global, distributed rate limit across all instances. The config change is one line: adding `store: new RedisStore({ client: redis })`."
