import type { LifecycleEvent, LifecycleStage } from "./types.js";

export type LifecycleListener = (event: LifecycleEvent) => void;

export function createLifecycleEmitter(): {
  emit: (stage: LifecycleStage, requestId: string, detail?: string) => void;
  on: (listener: LifecycleListener) => () => void;
} {
  const listeners = new Set<LifecycleListener>();

  return {
    emit(stage, requestId, detail) {
      const event: LifecycleEvent = {
        stage,
        requestId,
        timestamp: new Date().toISOString(),
        detail,
      };
      for (const listener of listeners) {
        listener(event);
      }
    },
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
