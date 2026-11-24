# 🎯 ULTIMATE INTERVIEW PREPARATION HANDBOOK — ReplyPilot
## Part 3: Frontend, Scaling, Failures, Security, Performance, Verification & System Design

---

# 15. REACT FRONTEND ARCHITECTURE

## 1. Concept

**In MY project** (`client/src/`):
- **React 18 + Vite**: Fast HMR development, ES modules, optimized builds
- **React Router v6**: Declarative routing with layout routes and `ProtectedRoute` guard
- **AuthContext + useAuth hook**: Centralized auth state, `useMemo` to prevent unnecessary re-renders
- **Axios with base config**: All API calls go through a configured Axios instance with `withCredentials: true` for cookie-based auth
- **6 pages**: LandingPage, DashboardPage, VideosPage, VideoDetailPage, RepliesPage, PersonasPage
- **Layout route pattern**: Authenticated pages share `AppLayout` (persistent nav), wrapped inside `ProtectedRoute`

**Key architectural decisions**:
- No Redux/Zustand — `AuthContext` is the only global state. Page-level data is fetched directly with `useEffect` + `useState`. This is intentional — the app is relatively simple in terms of shared state. Comments belong to a video page, replies to the replies page — no cross-page state sharing needed.
- `useMemo` on the context value prevents all consumers from re-rendering when unrelated state changes.
- `useCallback` on `fetchUser` prevents the `useEffect` dependency from causing infinite re-fetch loops.

## 2. Interview Questions

- Q: Why React instead of Next.js?
- Q: Why no state management library (Redux, Zustand)?
- Q: How does `ProtectedRoute` work?
- Q: Why `useMemo` on the AuthContext value?
- Q: How do you handle loading and error states?
- Q: Why Vite instead of Create React App?

## 3. Ideal Answers

**Q: Why React instead of Next.js?**
A: "Next.js adds SSR, SSG, file-based routing, and API routes. My frontend is a pure SPA dashboard — there's no public-facing content that needs SEO (the landing page could benefit from SSR, but it's a single page). All data comes from my Express API. Adding Next.js would add complexity (server-side rendering, hydration issues) without benefit. If I were building a public-facing marketing site with the dashboard, I'd use Next.js for the marketing pages and keep the dashboard as a client-side SPA within it."

**Q: Why `useMemo` on the AuthContext value?**
A: "Without `useMemo`, every time the AuthProvider re-renders (even if `user`, `loading`, and `error` haven't changed), React creates a new object reference for the context value. Every consumer of `AuthContext` (every component using `useAuth()`) would re-render because the object reference changed, even though the actual data is identical. `useMemo` ensures the value object is only recreated when its dependencies (`user`, `loading`, `error`, `fetchUser`) actually change. This is a standard performance optimization for React Context."

---

# 16. SCALING QUESTIONS

## How would this architecture change at different scales?

### 100 Users
"Current architecture works perfectly. Single instances of everything. Redis, MongoDB, and Python services handle this with zero stress. The main bottleneck isn't scale — it's the HuggingFace Inference API rate limit."

### 10,000 Users
"Three changes:
1. **Horizontal scaling**: Run 2-3 Server instances behind a load balancer. Redis-backed sessions already support this — any instance can serve any user.
2. **Worker scaling**: Run 2-3 Worker instances. BullMQ handles this natively — multiple workers compete for jobs without duplication.
3. **Database indexing**: Review MongoDB query patterns, add compound indexes for common queries like 'get all pending comments for a channel sorted by date'.
4. **Rate limit Redis store**: Switch from in-memory to Redis-backed rate limiting for consistency across server instances."

### 100,000 Users
"Significant changes:
1. **MongoDB Atlas dedicated cluster**: Move from shared to dedicated with replica sets. Enable read secondaries for analytics queries.
2. **Redis Cluster**: Single Redis instance becomes a bottleneck. Cluster mode shards data across nodes.
3. **AI Service autoscaling**: Deploy multiple AI Service instances behind a load balancer. Each loads the classifier model in memory (~500MB). Use GPU instances for the LLM calls.
4. **Separate Redis for queues vs cache**: BullMQ queues on one Redis, sessions/caching on another. Prevents cache eviction from affecting job data.
5. **CDN for frontend**: Deploy React build to Cloudflare Pages or Vercel for edge caching.
6. **Cron job rethink**: The 30-min cron syncing 100K users' comments would take too long. Switch to user-level scheduling — each user gets their own repeatable BullMQ job."

### 1 Million Users
"Architecture redesign:
1. **Event-driven architecture**: Replace REST between services with Kafka. Comments arrive as events, each service consumes what it needs. This decouples services and adds replay capability.
2. **CQRS**: Separate read and write models. The dashboard reads from a read-optimized view (maybe Elasticsearch) while writes go to MongoDB.
3. **YouTube API quotas**: 10,000 quota units/day per project. At 1M users, I'd need multiple Google Cloud projects with API keys, or apply for higher quota. Implement intelligent fetching — only sync active users' recent videos.
4. **Model serving**: Move from HuggingFace Inference API to self-hosted model serving (vLLM, TensorRT) for cost control and lower latency.
5. **Database sharding**: Shard MongoDB by `channelId` for data locality — all of a channel's videos, comments, and replies on the same shard."

### 10 Million+ Users
"Platform-level engineering:
1. **Multi-region deployment**: Deploy services in US, EU, Asia. Route users to nearest region.
2. **Global Redis with CRDTs**: Redis Enterprise with active-active geo-replication for sessions.
3. **Microservices mesh**: Istio/Linkerd for service-to-service TLS, circuit breaking, retry policies, and distributed tracing.
4. **ML model pipeline**: Train specialized classifiers per language. A/B test model versions. Feature store for real-time feature computation.
5. **Data pipeline**: Kafka → Spark/Flink for real-time analytics. Data warehouse for historical analysis.
6. **Cost optimization**: Spot instances for Workers, reserved capacity for API servers, CDN for static assets."

---

# 17. COMPREHENSIVE FAILURE SCENARIOS

### Scenario 1: Redis Crashes
**What happens**: Sessions lost (users logged out), BullMQ stops (no new jobs processed, no dequeue), YouTube tokens lost (need fresh OAuth refresh), RAG queue consumer stops.
**How to debug**: Check Redis connection logs in Winston/loguru. Both `node-redis` and `ioredis` emit reconnection events. BullMQ workers will log connection errors.
**How to fix**: Redis comes back → `node-redis` auto-reconnects (reconnect strategy: `retries * 100ms` capped at 5s). BullMQ reconnects. Sessions require re-login. Jobs in Redis are persisted — they resume processing.
**How to prevent**: Redis Sentinel for automatic failover. Redis Cluster for HA. Persistent storage (RDB snapshots + AOF) enabled.

### Scenario 2: MongoDB Crashes
**What happens**: Server can't serve any API requests (all routes read/write MongoDB). Workers can't fetch comments or save replies. But the AI and RAG services continue working (they don't use MongoDB directly).
**How to debug**: Mongoose connection error events, health check endpoint returns 503.
**How to fix**: MongoDB Atlas with replica sets auto-failovers in ~5 seconds. My `startServer()` function has a retry loop with exponential backoff (5s base, 60s cap) — it keeps retrying the DB connection until it succeeds.
**How to prevent**: MongoDB Atlas with 3-node replica set. Enable retryable writes.

### Scenario 3: Worker Process Crashes Mid-Job
**What happens**: The job being processed is left in `active` state in BullMQ. After `stalledInterval` (default 30s), BullMQ detects it as stalled and retries it.
**For post-reply**: If crash happens after posting to YouTube but before status update — the retry finds `ytReplyId` already set and skips re-posting. Idempotent.
**For classify**: Comment status stays `pending`/`processing`. Retry reclassifies.
**How to prevent**: Graceful shutdown handlers (`SIGTERM`/`SIGINT`) close workers properly, letting in-flight jobs complete.

### Scenario 4: AI Service Down
**What happens**: Classify and generate workers get HTTP errors. BullMQ retries 3 times with exponential backoff. After 3 failures, the job moves to `failed` state. Comments stay `classificationStatus: 'pending'`. No data loss.
**User experience**: Dashboard works fine. Users see comments but without classifications or replies. They can manually retry via batch classify/generate buttons.
**How to prevent**: Health checks. Container orchestration (Railway, Kubernetes) auto-restarts crashed containers.

### Scenario 5: YouTube API Quota Exhausted
**What happens**: YouTube Data API v3 has a default quota of 10,000 units/day. `commentThreads.list` costs 1 unit per page. `comments.insert` costs 50 units per reply. At ~200 replies/day, posting alone uses 10,000 units.
**How to debug**: YouTube API returns 403 with `quotaExceeded` error. Check Google Cloud Console for usage.
**How to fix**: Reduce sync frequency, batch operations, apply for higher quota.
**In my project**: The cron job only fetches the top 100 comments per video (not `fetchAll`), preserving quota. The `youtubeSync.worker.js` gracefully handles auth failures (`invalid_grant`) by returning `{ success: false, reason: 'reAuthNeeded' }` instead of crashing.

### Scenario 6: Duplicate Replies Posted to YouTube
**Root cause**: Worker posted reply, crashed before marking as published, retry posts again.
**My solution**: The `ytReplyId` checkpoint — immediately save the YouTube reply ID after posting. Retry checks if `ytReplyId` exists and skips re-posting. Plus the atomic claim via `findOneAndUpdate` with status guard.
**Detection**: Monitor for multiple `ytReplyId` values per comment. Alert on `replyCountCredited` inconsistencies.

### Scenario 7: Pinecone Unavailable
**What happens**: RAG ingest pipeline fails at Stage 8 (upsert). The queue consumer retries 3 times with backoff. After max retries, the job goes to the dead letter queue (`rag:ingest:dead`).
**For query**: The RAG client in the AI service catches the error and returns `None`. The generate service proceeds without RAG context — it falls back to basic video context (title + description) or generates without context entirely. This is the "fail open" pattern.
**How to prevent**: Pinecone has a 99.99% SLA. The readiness health check (`GET /health/ready`) proactively verifies Pinecone connectivity.

### Scenario 8: Network Partition Between Services
**What happens**: Server can't reach Workers (not directly — they communicate via Redis). Workers can't reach AI Service. AI Service can't reach RAG Service.
**In my project**: All inter-service calls have timeouts. The RAG client uses `httpx.AsyncClient` with `timeout=30s, connect=5s`. BullMQ workers have `attempts: 3` with exponential backoff. The system is designed for eventual consistency — temporary network issues are handled by retries.

---

# 18. SECURITY DEEP-DIVE

### XSS (Cross-Site Scripting)
**Q: How does your project prevent XSS?**
A: "Multiple layers:
1. **Helmet middleware**: Sets `X-XSS-Protection`, `Content-Security-Policy`, and other security headers.
2. **React's JSX**: React automatically escapes all rendered values — `{comment.text}` won't execute injected `<script>` tags.
3. **`httpOnly: true` session cookie**: Even if XSS occurs, the attacker can't steal the session cookie via `document.cookie`.
4. **Body parsing limits**: `express.json({ limit: '16kb' })` prevents payload-based attacks."

### NoSQL Injection
**Q: How do you prevent NoSQL injection?**
A: "Mongoose provides implicit protection — when you use `Comment.findById(commentId)`, Mongoose validates that `commentId` is a valid ObjectId before querying. For user-provided query parameters, I use `$set` with explicit field names rather than passing raw `req.body` directly to queries. The `$setOnInsert` pattern in comment syncing also prevents overwriting classification data with user-provided values."

### Session Hijacking
**Q: How do you prevent session hijacking?**
A: "`httpOnly: true` — JavaScript can't access the cookie. `secure: true` in production — cookie only sent over HTTPS, preventing interception over plain HTTP. `sameSite: 'none'` with HTTPS — prevents CSRF while allowing cross-origin. Session regeneration on OAuth callback — prevents session fixation attacks. 7-day TTL — limits the window for stolen sessions."

### Secrets Management
**Q: How do you manage secrets across 5 services?**
A: "Each service has its own `.env` file with only the secrets it needs (principle of least privilege). The server has the encryption key and OAuth secrets. The AI service has the HuggingFace token. The RAG service has the Pinecone key. None of them have secrets they don't need. In production on Railway, secrets are set as environment variables in the deployment platform — never committed to git. The `.gitignore` excludes all `.env` files."

---

# 19. PERFORMANCE OPTIMIZATION QUESTIONS

**Q: What are the main performance bottlenecks?**
A: "
1. **LLM API latency**: Gemma generation takes 2-5 seconds per reply. Mitigated by background processing — users don't wait.
2. **BGE embedding**: CPU-bound model inference. Mitigated by running in `asyncio.to_thread()` to not block the event loop, and by background model loading on startup.
3. **YouTube API**: Rate-limited and slow (300-500ms per call). Mitigated by batching (`BATCH_SIZE = 5` concurrent video syncs) and caching transcripts in Redis.
4. **MongoDB bulk operations**: Comment sync can upsert 100+ documents. Mitigated by `bulkWrite` with `{ ordered: false }` for parallel execution."

**Q: How did you optimize the `deserializeUser` call?**
A: "Passport's `deserializeUser` runs on EVERY authenticated request — it converts the session's user ID into a full user object. Without caching, that's a MongoDB query per request. I added a Redis cache with 15-min TTL: check Redis first (O(1) GET), fall back to MongoDB only on cache miss, then populate the cache. This turns ~5ms DB queries into ~0.5ms Redis GETs for 95%+ of requests."

**Q: How did you optimize the cron job for comment syncing?**
A: "The cron job processes videos in batches of 5 (`BATCH_SIZE = 5`) using `Promise.all()`. This means 5 concurrent YouTube API calls instead of sequential. Also, the cron uses `isSyncRunning` flag to prevent overlapping runs — if the previous sync is still running when the next 30-min trigger fires, it skips."

---

# 20. RESUME VERIFICATION QUESTIONS

These are questions interviewers ask to verify you actually built the project:

**Q: What was the hardest bug you encountered?**
A: "The duplicate reply posting issue. In early development, the post-reply worker would sometimes post the same reply twice to YouTube. I tracked it down to a race condition: the worker posted to YouTube, then updated the database, but if it crashed between those two steps, the retry would post again. I solved it by adding the `ytReplyId` checkpoint — save the YouTube reply ID immediately after posting, so retries can check for it. I also added the `replyCountCredited` flag to prevent double-counting. This was a classic distributed systems problem that textbooks describe but you only truly understand when you encounter it in production."

**Q: Why did you choose `langdetect` over other language detection libraries?**
A: "I actually tried `lingua` first — it's more accurate but significantly heavier (~100MB models). `langdetect` is lightweight but unreliable for short text (< 40 chars). I observed it classifying 'Very funny..😂😂' as Welsh. My solution was pragmatic: if text is under 40 chars after stripping emojis and punctuation, default to English. This works because short comments in any language are still handled by Gemma in the generation step — the ML classifier is the only English-dependent component."

**Q: What would you change if you were starting over?**
A: "Three things:
1. **TypeScript everywhere**: The server and worker are plain JavaScript. In retrospect, TypeScript would have caught several bugs — like when I passed `videoId` as a string where an ObjectId was expected.
2. **Shared model package**: The Worker duplicates Mongoose models from the Server. I'd create a shared npm package or use a monorepo with shared models.
3. **Better observability**: I'd add OpenTelemetry from day one. Debugging across 5 services with just Winston and loguru logs is painful. Correlation IDs for request tracing would save hours."

**Q: Walk me through the exact flow when a user clicks 'Approve' on a reply.**
A: "The user clicks 'Approve' on the React dashboard. The frontend calls `POST /api/replies/:id/approve`. The controller:
1. Validates the reply belongs to the authenticated user
2. Updates the reply status to `approved`
3. Calls `enqueuePostReplyJob({ replyId })` which adds a job to the `post-reply` BullMQ queue
4. Returns 200 to the frontend immediately

Meanwhile, the Worker picks up the post-reply job:
1. Atomic claim: `findOneAndUpdate({ _id: replyId, status: { $ne: 'published' } }, { status: 'publishing' })`
2. Fetch the comment to get the parent `ytCommentId`
3. Fetch the video to get the `userId` (channel owner)
4. Get a valid YouTube access token via `getValidYoutubeToken(userId)` — checks Redis cache, refreshes if expired
5. Call YouTube API: `youtube.comments.insert({ snippet: { parentId, textOriginal } })`
6. Checkpoint the `ytReplyId` immediately
7. Update status to `published`, set `publishedAt`
8. Credit `replyCount` with the `replyCountCredited` guard"

**Q: How do you handle a user who has 1000 videos with 50,000 total comments?**
A: "The sync is designed for this. The cron job processes channels sequentially (to respect YouTube API quotas) but processes 5 videos concurrently within each channel. Comment syncing uses `bulkWrite` with `ordered: false` — MongoDB processes inserts in parallel. The `$setOnInsert` pattern ensures already-classified comments aren't reset. For the dashboard, the video list and comment list are paginated — the frontend never loads all 50,000 comments at once."

---

# 21. CODING QUESTIONS INSPIRED BY THIS PROJECT

### Q1: Implement Shannon Entropy
```python
from collections import Counter
import math

def shannon_entropy(text: str) -> float:
    """Calculate Shannon entropy of a string."""
    if not text:
        return 0.0
    counts = Counter(text)
    length = len(text)
    return -sum(
        (count / length) * math.log2(count / length)
        for count in counts.values()
    )

# Time: O(n) where n = len(text)
# Space: O(k) where k = number of unique characters
```

### Q2: Implement Exponential Backoff with Jitter
```javascript
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 5000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (attempt === maxRetries) throw error;
            const delay = baseDelay * Math.pow(2, attempt - 1);
            const jitter = delay * (0.5 + Math.random() * 0.5);
            await new Promise(r => setTimeout(r, jitter));
        }
    }
}
// Used in: BullMQ job retry, server startup retry, RAG queue consumer retry
```

### Q3: Implement the Token Refresh Mutex
```javascript
const refreshPromises = new Map();

async function getTokenWithMutex(userId) {
    // Check cache first
    const cached = await redis.get(`token:${userId}`);
    if (cached) return cached;
    
    // If another request is already refreshing, wait for it
    if (refreshPromises.has(userId)) {
        return refreshPromises.get(userId);
    }
    
    // Start refresh
    const promise = refreshToken(userId);
    refreshPromises.set(userId, promise);
    promise.finally(() => refreshPromises.delete(userId));
    
    return promise;
}
// Pattern: Prevents N concurrent refresh requests from hitting Google's API
```

### Q4: Implement Idempotent Job Processing
```javascript
async function processJob(replyId) {
    // Atomic claim — prevents double-processing
    const reply = await Reply.findOneAndUpdate(
        { _id: replyId, status: { $ne: 'published' } },
        { $set: { status: 'publishing' } },
        { returnDocument: 'after' }
    );
    if (!reply) return { status: 'already_handled' };
    
    // Check if already posted (crash recovery)
    if (reply.ytReplyId) {
        // Previous attempt posted but crashed before status update
        reply.status = 'published';
        await reply.save();
        return { status: 'recovered' };
    }
    
    // Post to external service
    const externalId = await postToYouTube(reply.text);
    
    // Checkpoint immediately
    reply.ytReplyId = externalId;
    await reply.save();
    
    // Update final status
    reply.status = 'published';
    reply.publishedAt = new Date();
    await reply.save();
}
```

### Q5: Implement Cosine Similarity
```javascript
function cosineSimilarity(a, b) {
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
}
// Time: O(d) where d = vector dimensions
// Space: O(1)
// Used in: MongoDB aggregation for few-shot example retrieval
```

---

# 22. SYSTEM DESIGN QUESTIONS

### Q: Design a YouTube comment reply automation system

**Requirements**: Users link their YouTube channel. The system monitors new comments, classifies them, generates AI replies, and publishes them after human review.

**High-Level Design**:

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   React UI  │────→│  API Gateway │────→│  Message     │
│  Dashboard  │     │  (Express)   │     │  Queue       │
└─────────────┘     │              │     │  (Redis)     │
                    │ - OAuth      │     └──────┬──────┘
                    │ - CRUD       │            │
                    │ - Cron sync  │     ┌──────┴──────┐
                    └──────────────┘     │   Workers   │
                                        │ - classify  │
                    ┌──────────────┐     │ - generate  │
                    │   MongoDB    │←────│ - post      │
                    │ - Users      │     └──────┬──────┘
                    │ - Comments   │            │
                    │ - Replies    │     ┌──────┴──────┐
                    └──────────────┘     │  AI Service │
                                        │ - Spam gate │
                                        │ - Classifier│
                                        │ - LLM gen   │
                                        │ - RAG query │
                                        └─────────────┘
```

**Key Design Decisions**:
1. **Async processing**: API enqueues, Worker processes. Users don't wait for AI.
2. **Multi-stage classification**: Cheap filters first (regex, entropy), expensive ML second.
3. **Human-in-the-loop**: All replies are `pending_review` — no auto-posting without user approval.
4. **Idempotent posting**: Atomic claim + checkpoint prevents duplicate YouTube comments.
5. **Conditional RAG**: Only retrieve video context when the comment is a question AND the transcript is indexed. Saves compute and latency.

**Scaling Discussion**: At 100K users, the cron job (every 30 min × 100K channels) becomes the bottleneck. Solution: Replace cron with per-user BullMQ repeatable jobs, sharded by user ID. At 1M users, move to event-driven architecture with Kafka for decoupling.

---

### Q: Design a real-time spam detection system for user-generated content

**Directly from my project's SpamGatekeeper**:

```
                            ┌──────────────────┐
                            │  Incoming Comment │
                            └────────┬─────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │ Layer 1: O(1) Quick Reject      │
                    │ - Length check                   │
                    │ - Known spam phrases (frozenset) │
                    │ - AI prompt leakage detection    │
                    └────────────────┬────────────────┘
                                     │ pass
                    ┌────────────────┴────────────────┐
                    │ Layer 2: Pattern Matching        │
                    │ - URLs, phone numbers            │
                    │ - Repeating characters            │
                    │ - Emoji spam                      │
                    └────────────────┬────────────────┘
                                     │ pass
                    ┌────────────────┴────────────────┐
                    │ Layer 3: Mathematical Analysis   │
                    │ - Unicode normalization           │
                    │ - Shannon entropy bounds           │
                    │ - Vowel starvation                │
                    │ - Symbol ratio                    │
                    └────────────────┬────────────────┘
                                     │ pass
                    ┌────────────────┴────────────────┐
                    │ Layer 4: Stateful Detection      │
                    │ - Redis SET NX (bot-swarm dedup) │
                    └────────────────┬────────────────┘
                                     │ pass
                    ┌────────────────┴────────────────┐
                    │ Layer 5: ML Classifier            │
                    │ - Fine-tuned intent model         │
                    └────────────────┬────────────────┘
                                     │
                              ┌──────┴──────┐
                              │   Result    │
                              │ spam/clean  │
                              └─────────────┘
```

**Key principle**: **Short-circuit evaluation from cheapest to most expensive**. Layer 1 (O(1) set lookup) catches 60% of spam. Layer 2 (regex) catches 20%. Layers 3-4 catch 10%. The expensive ML model only runs on the remaining 10% of comments that passed all structural checks. This saves significant compute cost.

---

# 23. ADDITIONAL QUESTIONS FROM DEEP CODE ANALYSIS

### Docker & Deployment

**Q: Why separate Dockerfiles for client and server but Nixpacks for AI Service?**
A: "The client and server are standard Node.js apps — Dockerfiles give me precise control over the build process (multi-stage build, nginx for static serving). The AI Service needs PyTorch with CPU-only wheels (to keep image size small) — Nixpacks auto-detects the Python version from `pyproject.toml` and installs dependencies from `requirements.txt` with the right CUDA/CPU configuration automatically. The RAG Service uses a Dockerfile because it needs `sentence-transformers` which requires specific system dependencies that Nixpacks might not handle correctly."

### Graceful Shutdown

**Q: How do you handle graceful shutdown?**
A: "Both the server (`server.js`) and worker (`main.js`) register handlers for `SIGTERM` and `SIGINT`:

**Server**: Stop cron job → Disconnect MongoDB → Close HTTP server (drain in-flight requests) → exit
**Worker**: Close all BullMQ workers (stop accepting new jobs, finish in-flight) → Disconnect MongoDB → exit
**RAG Consumer**: Signal handler sets `_running = False` → BRPOP loop exits on next iteration

The order matters — I stop accepting new work FIRST, then drain in-progress work, then disconnect infrastructure. If I disconnect MongoDB before workers finish, in-flight jobs would fail."

### The `run_all.sh` Script

**Q: How does your startup script handle cross-platform compatibility?**
A: "The `run_all.sh` script detects the OS by checking for `.venv/Scripts/activate` (Windows/Git Bash) vs `.venv/bin/activate` (Linux/Mac). Each Python service is started in a subshell with `(cd ... && source activate && uvicorn ...) &` — the `&` backgrounds each process. `wait` at the end keeps the script alive until all background processes exit. There's also a `run_all.ps1` for native PowerShell on Windows."

### Two Redis Clients

**Q: Why do you use both `node-redis` and `ioredis`?**
A: "BullMQ requires ioredis with `maxRetriesPerRequest: null` — this is a hard requirement because BullMQ uses blocking commands (BRPOPLPUSH) that should never timeout. The `node-redis` v4 client is used for everything else (sessions via `connect-redis`, caching, token storage) because it's the official Redis Node.js client with better TypeScript support. Having two clients is slightly redundant but avoids configuring a single client for conflicting requirements."

### BGE Embedder Singleton Pattern

**Q: How do you handle model loading for the BGE embedder?**
A: "The `BGEEmbedder` in the RAG service is a singleton — the model is loaded once on first instantiation and reused. On startup, `main.py` triggers background model loading via `asyncio.create_task(asyncio.to_thread(BGEEmbedder()._load_model))` — this pre-warms the model in a background thread so the first ingest request doesn't suffer a cold-start delay of 10-15 seconds. The embedding itself runs in `asyncio.to_thread()` to not block the async event loop since it's CPU-bound."

### Error Handling Philosophy

**Q: What's your error handling philosophy across the system?**
A: "I follow three principles:
1. **Fail open for non-critical paths**: RAG client returns `None` if RAG is down (generate proceeds without context). SpamGatekeeper's Redis check fails open (doesn't block legitimate comments). This prioritizes availability.
2. **Fail closed for critical paths**: Authentication, CSRF, rate limiting — these reject requests on failure. Security cannot fail open.
3. **Retry with backoff for transient failures**: BullMQ jobs (3 attempts, exponential backoff), server startup (infinite retry with backoff), Redis reconnection (strategy with capped delay). The system self-heals from temporary infrastructure issues."
