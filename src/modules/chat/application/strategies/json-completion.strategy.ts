import type {
  CompletionInput,
  CompletionResult,
  ICompletionStrategy,
} from './completion.strategy.js';
import type { IAiProvider } from '../../../../infrastructure/ai/ai.provider.js';
import { resolveEnabledTools } from '../../../../infrastructure/ai/tools/resolve-enabled.js';
import type { FeatureFlagService } from '../../../../shared/feature-flags/feature-flag.service.js';
import type { FlagContext } from '../../../../shared/feature-flags/feature-flag.types.js';

export class JsonCompletionStrategy implements ICompletionStrategy {
  constructor(
    private readonly ai: IAiProvider,
    private readonly flags: FeatureFlagService,
    private readonly flagCtx?: FlagContext,
  ) {}

  public async execute(input: CompletionInput): Promise<CompletionResult> {
    const toolsEnabled = this.flags.get('AI_TOOLS_ENABLED', this.flagCtx);
    const result = await this.ai.complete({
      history: input.history,
      prompt: input.prompt,
      toolsEnabled,
      ...(toolsEnabled ? { enabledTools: resolveEnabledTools(this.flags, this.flagCtx) } : {}),
    });

    await input.onComplete(result.text, {
      ...(result.usage ? { usage: result.usage } : {}),
      provider: this.ai.kind,
      model: this.ai.model,
    });

    return {
      kind: 'json',
      text: result.text,
      toolCalls: result.toolCalls,
      ...(result.usage ? { usage: result.usage } : {}),
    };
  }
}
