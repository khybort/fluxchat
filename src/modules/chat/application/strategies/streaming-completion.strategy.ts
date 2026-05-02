import type {
  CompletionInput,
  CompletionResult,
  ICompletionStrategy,
} from './completion.strategy.js';
import type { IAiProvider } from '../../../../infrastructure/ai/ai.provider.js';
import type { CompletionStreamEvent } from '../../../../infrastructure/ai/ai.types.js';
import { resolveEnabledTools } from '../../../../infrastructure/ai/tools/resolve-enabled.js';
import type { FeatureFlagService } from '../../../../shared/feature-flags/feature-flag.service.js';
import type { FlagContext } from '../../../../shared/feature-flags/feature-flag.types.js';

export class StreamingCompletionStrategy implements ICompletionStrategy {
  constructor(
    private readonly ai: IAiProvider,
    private readonly flags: FeatureFlagService,
    private readonly signal: AbortSignal,
    private readonly flagCtx?: FlagContext,
  ) {}

  public execute(input: CompletionInput): CompletionResult {
    const events = this.run(input);
    return { kind: 'stream', events };
  }

  private async *run(input: CompletionInput): AsyncIterable<CompletionStreamEvent> {
    const toolsEnabled = this.flags.get('AI_TOOLS_ENABLED', this.flagCtx);
    const upstream = this.ai.stream(
      {
        history: input.history,
        prompt: input.prompt,
        toolsEnabled,
        ...(toolsEnabled ? { enabledTools: resolveEnabledTools(this.flags, this.flagCtx) } : {}),
      },
      this.signal,
    );

    let fullText = '';
    let persisted = false;
    try {
      for await (const event of upstream) {
        if (event.type === 'delta') {
          fullText += event.text;
        } else if (event.type === 'done') {
          // Persist before forwarding `done` so clients that close the stream
          // immediately after still see the assistant message in history.
          await input.onComplete(event.fullText || fullText, {
            ...(event.usage ? { usage: event.usage } : {}),
            provider: this.ai.kind,
            model: this.ai.model,
          });
          persisted = true;
        }
        yield event;
      }
    } catch (err: unknown) {
      // Mid-stream failure (provider error, abort, network drop). If any text
      // already streamed, save it as the assistant message so the chat
      // history reflects what the user actually saw — losing it would be
      // worse than a partial save. Re-throw so the controller still emits
      // the SSE error frame.
      if (!persisted && fullText.length > 0) {
        await input.onComplete(fullText, {
          provider: this.ai.kind,
          model: this.ai.model,
        });
      }
      throw err;
    }
  }
}
