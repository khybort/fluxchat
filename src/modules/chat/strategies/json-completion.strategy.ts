import type {
  CompletionInput,
  CompletionResult,
  ICompletionStrategy,
} from './completion.strategy.js';
import type { IAiProvider } from '../../../infrastructure/ai/ai.provider.js';
import type { FeatureFlagService } from '../../../shared/feature-flags/feature-flag.service.js';

export class JsonCompletionStrategy implements ICompletionStrategy {
  constructor(
    private readonly ai: IAiProvider,
    private readonly flags: FeatureFlagService,
  ) {}

  public async execute(input: CompletionInput): Promise<CompletionResult> {
    const result = await this.ai.complete({
      history: input.history,
      prompt: input.prompt,
      toolsEnabled: this.flags.get('AI_TOOLS_ENABLED'),
    });

    await input.onComplete(result.text);

    return {
      kind: 'json',
      text: result.text,
      toolCalls: result.toolCalls,
      ...(result.usage ? { usage: result.usage } : {}),
    };
  }
}
