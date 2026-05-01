import type {
  CompletionInput,
  CompletionResult,
  ICompletionStrategy,
} from './completion.strategy.js';
import type { IAiProvider } from '../../../infrastructure/ai/ai.provider.js';
import type { CompletionStreamEvent } from '../../../infrastructure/ai/ai.types.js';
import { resolveEnabledTools } from '../../../infrastructure/ai/tools/resolve-enabled.js';
import type { FeatureFlagService } from '../../../shared/feature-flags/feature-flag.service.js';
import type { FlagContext } from '../../../shared/feature-flags/feature-flag.types.js';

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
      }
      yield event;
    }
  }
}
