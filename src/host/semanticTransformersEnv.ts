export interface SemanticTransformersEnvConfig {
  cacheDir: string;
  allowRemoteModels: boolean;
  localModelPath: string;
}

/** Minimal Transformers.js `env` surface used by Tipsboard. */
export interface TransformersEnvLike {
  cacheDir?: string;
  allowRemoteModels?: boolean;
  allowLocalModels?: boolean;
  localModelPath?: string;
}

export function applySemanticTransformersEnv(
  env: TransformersEnvLike | undefined,
  config: SemanticTransformersEnvConfig,
): void {
  if (!env) return;
  env.cacheDir = config.cacheDir;
  env.allowRemoteModels = config.allowRemoteModels;
  if (config.localModelPath) {
    env.localModelPath = config.localModelPath;
    env.allowLocalModels = true;
  }
}

export function offlineSemanticModelHint(cacheDir: string, modelId: string): string {
  return (
    "Allow Remote Models is disabled (closed-network mode). " +
    `Deploy a pre-built Transformers.js cache for "${modelId}" under: ${cacheDir} ` +
    "(run `npm run prepare:semantic-model-cache` in a build environment with network access, then set **Model Cache Path** or copy into the folder from **Tipsboard: Reveal Semantic Model Cache**). " +
    "Or set **Allow Remote Models** to `true` if this machine can reach Hugging Face Hub."
  );
}
