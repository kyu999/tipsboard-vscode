export const SEMANTIC_RUNTIME_KIND = "tipsboard-semantic-runtime-pack";

export function semanticRuntimeTarget(): string {
  return `${process.platform}-${process.arch}`;
}

export function semanticRuntimeAssetName(target: string = semanticRuntimeTarget()): string {
  return `tipsboard-semantic-runtime-${target}.zip`;
}

export function semanticOfflinePackAssetName(target: string = semanticRuntimeTarget()): string {
  return `tipsboard-semantic-offline-${target}.zip`;
}
