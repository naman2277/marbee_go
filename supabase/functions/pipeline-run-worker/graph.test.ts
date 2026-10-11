import { assertEquals } from 'https://deno.land/std@0.208.0/assert/assert_equals.ts';
import { buildPlan, parseGraph } from './graph.ts';

Deno.test('buildPlan rejects cycles and preserves dependency order', () => {
  const graph = parseGraph({
    nodes: [
      { id: 'source', data: { stepType: 'source' } },
      { id: 'target', data: { stepType: 'target' } },
    ],
    edges: [{ source: 'source', target: 'target' }],
  });
  const plan = buildPlan(graph);
  assertEquals(plan.order, ['source', 'target']);
  assertEquals(plan.errors, []);

  const cyclic = parseGraph({
    nodes: [
      { id: 'source', data: { stepType: 'source' } },
      { id: 'target', data: { stepType: 'target' } },
    ],
    edges: [
      { source: 'source', target: 'target' },
      { source: 'target', target: 'source' },
    ],
  });
  assertEquals(buildPlan(cyclic).errors, ['Workflow graph has a cycle']);
});

Deno.test('parseGraph supports legacy steps without unbounded execution input', () => {
  const graph = parseGraph({
    steps: [
      { id: 'a', type: 'trigger_manual', label: 'Start' },
      { id: 'b', type: 'target', label: 'Write' },
    ],
  });
  assertEquals(graph.edges, [{ source: 'a', target: 'b', sourceHandle: null }]);
});
