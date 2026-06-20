import { DataMapError } from "./errors.js";
import type { DataMap, ErasurePlan, ModelPlan, SubjectId } from "./types.js";
import { getModelAction } from "./data-map.js";

export function buildRelationEdges(dataMap: DataMap): Array<{ child: string; parent: string }> {
  const edges: Array<{ child: string; parent: string }> = [];

  for (const [name, decl] of Object.entries(dataMap.models)) {
    if (decl.parent) {
      if (!dataMap.models[decl.parent]) {
        throw new DataMapError(`Model "${name}" references unknown parent "${decl.parent}"`);
      }
      edges.push({ child: name, parent: decl.parent });
    }
  }

  return edges;
}

export function topologicalSort(dataMap: DataMap): string[] {
  const edges = buildRelationEdges(dataMap);
  const allModels = Object.keys(dataMap.models);
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const model of allModels) {
    inDegree.set(model, 0);
    adjacency.set(model, []);
  }

  for (const { child, parent } of edges) {
    adjacency.get(parent)!.push(child);
    inDegree.set(child, (inDegree.get(child) ?? 0) + 1);
  }

  const queue = allModels.filter((m) => (inDegree.get(m) ?? 0) === 0);
  const sorted: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);
    for (const child of adjacency.get(current) ?? []) {
      const deg = (inDegree.get(child) ?? 1) - 1;
      inDegree.set(child, deg);
      if (deg === 0) {
        queue.push(child);
      }
    }
  }

  if (sorted.length !== allModels.length) {
    throw new DataMapError("Circular relation detected in data map");
  }

  // Children before parents for deletion (reverse dependency order)
  return sorted.reverse();
}

export function buildErasurePlan(dataMap: DataMap, subject: SubjectId): ErasurePlan {
  const order = topologicalSort(dataMap);
  const models: ModelPlan[] = order.map((modelName, index) => {
    const { action, legalBasis, fields } = getModelAction(dataMap, modelName);
    return {
      model: modelName,
      action,
      order: index,
      legalBasis,
      fields,
    };
  });

  return {
    subject,
    models,
    processors: dataMap.processors ?? [],
  };
}

export function getDeletionOrder(dataMap: DataMap): string[] {
  return topologicalSort(dataMap);
}
