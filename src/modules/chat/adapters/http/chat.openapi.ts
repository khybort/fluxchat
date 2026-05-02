// Side-effect manifest: this file aggregates the per-route OpenAPI registrations
// so a single import (`./modules/chat/adapters/http/chat.openapi.js`) at app boot
// fills the registry for every chat path. The split mirrors the route grouping
// in chat.routes.ts and keeps each file under the SRP file-size cap.
import './chat.openapi.shared.js';
import './chat.list.openapi.js';
import './chat.history.openapi.js';
import './chat.completion.openapi.js';
import './chat.archive.openapi.js';
