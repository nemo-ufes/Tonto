import { LLkLookaheadStrategy } from "chevrotain";
import { LLStarLookaheadStrategy } from "chevrotain-allstar";

/** Keep package declarations parseable while their bodies are still being typed. */
export class TontoLookaheadStrategy extends LLStarLookaheadStrategy {
  override buildLookaheadForOptional(
    options: Parameters<LLStarLookaheadStrategy["buildLookaheadForOptional"]>[0]
  ) {
    // Package imports and declarations have distinct leading keywords from the next
    // package or EOF. Adaptive lookahead through their entire bodies rejects an
    // unfinished declaration and drops its AST, leaving completion on its predecessor.
    if (options.rule.name.replace(/\u200b/g, "") === "ContextModule") {
      return new LLkLookaheadStrategy({ maxLookahead: 1 }).buildLookaheadForOptional({
        ...options,
        maxLookahead: 1,
      });
    }
    return super.buildLookaheadForOptional(options);
  }
}
