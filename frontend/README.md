# AppNation Chat — Frontend

A React + Vite single-page app that talks to the backend in this repo. Built with **shadcn/ui** components, **lucide-react** icons, and **framer-motion** animations.

## Tech stack

| Concern | Choice |
|---|---|
| Bundler / dev server | Vite 5 |
| UI framework | React 18 + TypeScript (strict) |
| Styling | Tailwind CSS + shadcn/ui (Radix primitives) |
| Icons | lucide-react |
| Animations | framer-motion |
| Routing | react-router-dom v6 |
| State | zustand (auth + ephemeral sidebar refresh) |
| Notifications | sonner |
| HTTP / SSE | native `fetch` + ReadableStream parser |

## Setup

```bash
pnpm install
cp .env.example .env
# edit .env — set VITE_API_URL and VITE_APP_CHECK_TOKEN to match your backend
pnpm dev
```

### Required env

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend base URL (e.g. `http://localhost:3000`). No trailing slash. |
| `VITE_APP_CHECK_TOKEN` | Must match the backend's `APP_CHECK_TOKEN`. The Firebase App Check is mocked in this case study; in production this token is exchanged via the Firebase SDK. |

## Features

- **Real auth**: register, login, persisted session (Zustand + `localStorage`), `/api/auth/me` revalidation on app load.
- **Multi-client header**: detects `web | mobile | desktop` from the user agent and sends `x-client-type` on every request.
- **Animated layout**: framer-motion-driven sidebar, staggered chat list, slide-in messages, gradient backdrops on auth screens.
- **Streaming completion**: SSE parser yielding typed events (`thinking`, `tool_execution`, `delta`, `done`) for instant UI updates.
- **Tool execution UI**: collapsible card animates in the moment the backend emits `tool_execution`, showing arguments + result.
- **Pagination**: "Load more" cursor pagination on the chat list.
- **Feature flag awareness**: a panel in the sidebar shows the live `STREAMING_ENABLED`, `AI_TOOLS_ENABLED`, `CHAT_HISTORY_ENABLED`, `PAGINATION_LIMIT`, `RATE_LIMIT_PER_MINUTE` snapshot from `/healthz`. The completion path picks JSON vs SSE based on `STREAMING_ENABLED`.
- **Auto-create chat**: typing the first message from `/chat` (no chat selected) creates the chat behind the scenes via `POST /api/chats`, then routes you into it.
- **Mobile sheet sidebar**: collapses behind a backdrop on small screens, slides in/out.
- **Streaming caret**: the assistant bubble gets a blinking caret while bytes are arriving.

## Project structure

```
src/
├── api/
│   ├── client.ts           # fetch wrapper, ApiError, headers (auth + app-check + client-type)
│   ├── sse.ts              # POST SSE parser yielding typed events
│   ├── auth.ts             # register / login / me
│   ├── chat.ts             # createChat / listChats / getHistory / completion / healthz
│   └── types.ts            # shared response types
├── components/
│   ├── app-shell.tsx       # animated sidebar + header + dropdown account menu
│   ├── chat-sidebar.tsx    # animated chat list with cursor pagination + search
│   ├── feature-flags-panel.tsx
│   ├── chat/
│   │   ├── composer.tsx    # textarea + send/stop button, auto-grow
│   │   ├── message-bubble.tsx
│   │   ├── streaming-status.tsx
│   │   └── tool-execution-card.tsx
│   └── ui/                 # shadcn/ui primitives (button, input, dialog, dropdown, ...)
├── lib/
│   ├── utils.ts            # cn, formatRelativeTime, initialsOf
│   └── uuid.ts             # crypto.randomUUID with fallback
├── pages/
│   ├── auth/
│   │   ├── auth-layout.tsx
│   │   ├── login-page.tsx
│   │   └── register-page.tsx
│   └── chat-page.tsx
├── store/
│   ├── auth-store.ts       # persisted session
│   └── chat-store.ts       # sidebar refresh nonce + optimistic chat
├── styles/globals.css
├── App.tsx                 # protected/public route guards
└── main.tsx
```

## Scripts

```bash
pnpm dev       # vite dev server on :5173
pnpm build     # type-check + production build to dist/
pnpm preview   # preview the production build
pnpm lint      # eslint
pnpm format    # prettier --write .
```

## Smoke test

1. Start the backend (`pnpm dev` in the repo root with a configured `.env`).
   Browse the live API spec at **http://localhost:3000/docs** while it runs.
2. In another terminal: `pnpm dev` here.
3. Open http://localhost:5173, register an account.
4. Type "hello" — the sidebar shows a new chat, the message streams in word-by-word.
5. Toggle `STREAMING_ENABLED=false` in the backend `.env`, send `SIGHUP`, refresh `/healthz` — next message returns as a single JSON response. The sidebar panel reflects the change.
6. With `AI_TOOLS_ENABLED=true` and a real `ANTHROPIC_API_KEY`, ask "What's the weather in Istanbul?" — a `tool_execution` card slides in mid-stream before the final assistant text.
