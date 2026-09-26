import type { NodeChange } from '@xyflow/react';
import type { GraphEnvelope } from '@ilmheg/contracts';

/**
 * Applies only geometry that belongs in the persisted graph.
 *
 * React Flow emits `dimensions` changes while measuring every mounted node.
 * Persisting those measurements makes controlled nodes render and measure again,
 * so regular node measurements must stay inside React Flow. Group dimensions are
 * the exception because they are explicitly user-resizable.
 */
export function applyNodeGeometryChanges(
  graph: GraphEnvelope,
  changes: NodeChange[],
  timestamp = new Date().toISOString(),
): GraphEnvelope {
  const changesById = new Map<string, NodeChange[]>();
  for (const change of changes) {
    if (change.type !== 'position' && change.type !== 'dimensions') continue;
    const current = changesById.get(change.id) ?? [];
    current.push(change);
    changesById.set(change.id, current);
  }

  let graphChanged = false;
  const nodes = graph.nodes.map((node) => {
    const nodeChanges = changesById.get(node.id);
    if (!nodeChanges) return node;

    let next = node;
    for (const change of nodeChanges) {
      if (change.type === 'position' && change.position && !samePoint(next.position, change.position)) {
        next = { ...next, position: change.position, updatedAt: timestamp };
      }

      if (change.type === 'dimensions' && next.kind === 'group' && change.dimensions) {
        const currentSize = next.size ?? { width: 560, height: 360 };
        if (!sameSize(currentSize, change.dimensions)) {
          next = { ...next, size: change.dimensions, updatedAt: timestamp };
        }
      }
    }

    if (next !== node) graphChanged = true;
    return next;
  });

  return graphChanged ? { ...graph, nodes } : graph;
}

function samePoint(left: { x: number; y: number }, right: { x: number; y: number }) {
  return left.x === right.x && left.y === right.y;
}

function sameSize(left: { width: number; height: number }, right: { width: number; height: number }) {
  return left.width === right.width && left.height === right.height;
}
