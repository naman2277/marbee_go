import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Play, Save, Plus, Trash2, X, Zap,
  Clock, Globe, FileInput, CreditCard, Mail, GitBranch, Repeat,
  Timer, Merge, ShieldAlert, Sparkles, Wand2, Tags, FileText,
  Heart, Braces, Code, Pencil, Filter, BarChart3, Scissors, FileCode,
  MessageSquare, MessageCircle, Database, Send, Sheet, Reply,
  CheckCircle2, XCircle, Loader2,
  Maximize2, Minimize2, Search,
  Rocket, FlaskConical,
  Sliders, Terminal,
} from 'lucide-react';
import type { AutomationNode, AutomationEdge, AutomationWorkflow } from '../../lib/automations';
import {
  getWorkflowById, saveWorkflow, NODE_PALETTE,
  autoLayoutNodes, getOutputPos, getInputPos, buildBezierPath,
  executeSingleNode,
} from '../../lib/automations';
import { SendEmailActivityConfigurator } from '../../components/channels/SendEmailActivityConfigurator';

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  Globe, Clock, FileInput, Zap, CreditCard, Mail, GitBranch, Repeat,
  Timer, Merge, ShieldAlert, Sparkles, Wand2, Tags, FileText, Heart,
  Braces, Code, Pencil, Filter, BarChart3, Scissors, FileCode,
  MessageSquare, MessageCircle, Database, Send, Sheet, Reply,
};

const COLOR_MAP: Record<string, { bg: string; border: string; accent: string; light: string }> = {
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-300', accent: 'bg-emerald-500', light: 'bg-emerald-100' },
  amber: { bg: 'bg-amber-50', border: 'border-amber-300', accent: 'bg-amber-500', light: 'bg-amber-100' },
  violet: { bg: 'bg-violet-50', border: 'border-violet-300', accent: 'bg-violet-500', light: 'bg-violet-100' },
  cyan: { bg: 'bg-cyan-50', border: 'border-cyan-300', accent: 'bg-cyan-500', light: 'bg-cyan-100' },
  blue: { bg: 'bg-blue-50', border: 'border-blue-300', accent: 'bg-blue-500', light: 'bg-blue-100' },
};

const NODE_W = 220;
const NODE_H = 80;

// CSS keyframes injected once
const BLINK_STYLE_ID = 'automation-blink-styles';
function ensureBlinkStyles() {
  if (document.getElementById(BLINK_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = BLINK_STYLE_ID;
  style.textContent = `
    @keyframes blink-green { 0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,0)} 50%{box-shadow:0 0 12px 4px rgba(34,197,94,0.5)} }
    @keyframes blink-red { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0)} 50%{box-shadow:0 0 12px 4px rgba(239,68,68,0.5)} }
    .node-blink-green { animation: blink-green 0.6s ease-in-out 3; }
    .node-blink-red { animation: blink-red 0.6s ease-in-out 3; }
    @keyframes blink-running { 0%,100%{box-shadow:0 0 0 0 rgba(99,102,241,0)} 50%{box-shadow:0 0 14px 5px rgba(99,102,241,0.45)} }
    .node-blink-running { animation: blink-running 0.8s ease-in-out infinite; }
  `;
  document.head.appendChild(style);
}

export default function AutomationEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [isEmailStudioOpen] = useState(false);

  const [workflow, setWorkflow] = useState<AutomationWorkflow | null>(null);
  const [nodes, setNodes] = useState<AutomationNode[]>([]);
  const [edges, setEdges] = useState<AutomationEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteSearch, setPaletteSearch] = useState('');
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<'params' | 'output'>('params');
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const isSelectingBoxRef = useRef(false);

  // Canvas pan/zoom
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Node drag
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0, nodeX: 0, nodeY: 0 });

  // Edge draw & reconnect
  const [drawingEdge, setDrawingEdge] = useState<{ fromId: string; fromHandle?: string; x: number; y: number } | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [reconnectingEdge, setReconnectingEdge] = useState<{ edgeId: string; fromId: string; fromHandle?: string } | null>(null);

  // Execution
  const [executing, setExecuting] = useState(false);
  const [executedNodes, setExecutedNodes] = useState<Set<string>>(new Set());
  const [executingNodeId, setExecutingNodeId] = useState<string | null>(null);
  const [executionLog, setExecutionLog] = useState<{ nodeId: string; title: string; status: string; ms: number; output: any }[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [blinkingNodes, setBlinkingNodes] = useState<Record<string, 'green' | 'red'>>({});

  // Title edit
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  // Fullscreen
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Test mode vs publish mode
  const [testMode, setTestMode] = useState(true);

  useEffect(() => { ensureBlinkStyles(); }, []);

  useEffect(() => {
    if (!id) return;
    const wf = getWorkflowById(id);
    if (wf) {
      setWorkflow(wf);
      setNodes(wf.nodes);
      setEdges(wf.edges);
      setTestMode(wf.status !== 'active');
    }
  }, [id]);

  // Fullscreen listeners
  useEffect(() => {
    const handleChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  const save = useCallback(() => {
    if (!workflow) return;
    const updated = { ...workflow, nodes, edges, updatedAt: new Date().toISOString() };
    saveWorkflow(updated);
    setWorkflow(updated);
  }, [workflow, nodes, edges]);

  const publish = useCallback(() => {
    if (!workflow) return;
    const updated = { ...workflow, nodes, edges, status: 'active' as const, updatedAt: new Date().toISOString(), version: workflow.version + 1 };
    saveWorkflow(updated);
    setWorkflow(updated);
  }, [workflow, nodes, edges]);

  // ─── Canvas pan ──────────────────────────────────────────────────────

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.group') || target.closest('button') || target.closest('input') || target.closest('select')) return;
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      e.preventDefault();
    } else if (e.button === 0) {
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
        // Don't deselect when email studio or template explorer is open
        if (document.body.getAttribute('data-email-studio-active') === 'true') return;
        setSelectedNode(null);
        setInspectorOpen(false);
      }
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const cx = (e.clientX - rect.left - pan.x) / zoom;
        const cy = (e.clientY - rect.top - pan.y) / zoom;
        setSelectionBox({ startX: cx, startY: cy, currentX: cx, currentY: cy });
        isSelectingBoxRef.current = true;
      }
    }
  };

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPan({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy });
      return;
    }
    if (isSelectingBoxRef.current && selectionBox) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const cx = (e.clientX - rect.left - pan.x) / zoom;
        const cy = (e.clientY - rect.top - pan.y) / zoom;
        const curBox = { ...selectionBox, currentX: cx, currentY: cy };
        setSelectionBox(curBox);

        const x1 = Math.min(curBox.startX, curBox.currentX);
        const x2 = Math.max(curBox.startX, curBox.currentX);
        const y1 = Math.min(curBox.startY, curBox.currentY);
        const y2 = Math.max(curBox.startY, curBox.currentY);

        if (Math.abs(curBox.currentX - curBox.startX) > 2 || Math.abs(curBox.currentY - curBox.startY) > 2) {
          const hit = nodes.find((n) => {
            const nX1 = n.x;
            const nX2 = n.x + NODE_W;
            const nY1 = n.y;
            const nY2 = n.y + NODE_H;
            return nX1 < x2 && nX2 > x1 && nY1 < y2 && nY2 > y1;
          });
          if (hit) {
            setSelectedNode(hit.id);
            setInspectorOpen(true);
          } else {
            setSelectedNode(null);
          }
        }
      }
      return;
    }
    if (draggingNode) {
      const dx = (e.clientX - dragStartRef.current.x) / zoom;
      const dy = (e.clientY - dragStartRef.current.y) / zoom;
      setNodes((prev) => prev.map((n) => n.id === draggingNode ? { ...n, x: Math.round(dragStartRef.current.nodeX + dx), y: Math.round(dragStartRef.current.nodeY + dy) } : n));
      return;
    }
    if (drawingEdge || reconnectingEdge) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const cx = (e.clientX - rect.left - pan.x) / zoom;
        const cy = (e.clientY - rect.top - pan.y) / zoom;
        if (drawingEdge) setDrawingEdge((prev) => prev ? { ...prev, x: cx, y: cy } : null);
        if (reconnectingEdge) setDrawingEdge({ fromId: reconnectingEdge.fromId, fromHandle: reconnectingEdge.fromHandle, x: cx, y: cy });
      }
    }
  }, [isPanning, selectionBox, nodes, draggingNode, drawingEdge, reconnectingEdge, zoom, pan]);

  const handleCanvasMouseUp = useCallback(() => {
    setIsPanning(false);
    setDraggingNode(null);
    if (reconnectingEdge && !drawingEdge) {
      setReconnectingEdge(null);
    }
    if (reconnectingEdge && drawingEdge) {
      // dropped on empty canvas — just remove the edge (already deleted on grab)
      setReconnectingEdge(null);
    }
    setDrawingEdge(null);
    if (isSelectingBoxRef.current) {
      isSelectingBoxRef.current = false;
      setSelectionBox(null);
    }
  }, [reconnectingEdge, drawingEdge]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      setZoom((z) => Math.min(2, Math.max(0.25, z + delta)));
    } else {
      setPan((p) => ({
        x: p.x - e.deltaX,
        y: p.y - e.deltaY,
      }));
    }
  }, []);

  // ─── Node interactions ───────────────────────────────────────────────

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setSelectedNode(nodeId);
    setInspectorOpen(true);
    setDraggingNode(nodeId);
    const node = nodes.find((n) => n.id === nodeId)!;
    dragStartRef.current = { x: e.clientX, y: e.clientY, nodeX: node.x, nodeY: node.y };
  };

  const handleOutputMouseDown = (e: React.MouseEvent, nodeId: string, handle?: string) => {
    e.stopPropagation();
    const node = nodes.find((n) => n.id === nodeId)!;
    const pos = getOutputPos(node, handle);
    setDrawingEdge({ fromId: nodeId, fromHandle: handle, x: pos.x, y: pos.y });
  };

  const handleNodeMouseUp = useCallback((nodeId: string) => {
    if (drawingEdge && drawingEdge.fromId !== nodeId) {
      const exists = edges.some((e) => e.fromId === drawingEdge.fromId && e.toId === nodeId);
      if (!exists) {
        const newEdge: AutomationEdge = {
          id: `e-${Date.now().toString(36)}`,
          fromId: drawingEdge.fromId,
          toId: nodeId,
          fromHandle: drawingEdge.fromHandle,
          label: drawingEdge.fromHandle,
        };
        setEdges((prev) => [...prev, newEdge]);
      }
      setReconnectingEdge(null);
    }
    setDrawingEdge(null);
  }, [drawingEdge, edges]);

  // Edge hover grab to reconnect
  const handleEdgeGrab = (e: React.MouseEvent, edge: AutomationEdge) => {
    e.stopPropagation();
    // detach from target, start drawing from source
    setEdges((prev) => prev.filter((ed) => ed.id !== edge.id));
    setReconnectingEdge({ edgeId: edge.id, fromId: edge.fromId, fromHandle: edge.fromHandle });
    const fromNode = nodes.find((n) => n.id === edge.fromId);
    if (fromNode) {
      const pos = getOutputPos(fromNode, edge.fromHandle);
      setDrawingEdge({ fromId: edge.fromId, fromHandle: edge.fromHandle, x: pos.x, y: pos.y });
    }
  };

  // ─── Add node from palette ──────────────────────────────────────────

  const addNode = (item: typeof NODE_PALETTE[0]['items'][0]) => {
    const cx = canvasRef.current ? canvasRef.current.clientWidth / 2 : 400;
    const cy = canvasRef.current ? canvasRef.current.clientHeight / 2 : 300;
    const node: AutomationNode = {
      id: `n-${Date.now().toString(36)}`,
      type: item.type,
      category: '',
      title: item.title,
      subtitle: item.subtitle,
      icon: item.icon,
      color: item.color,
      config: {},
      x: Math.round((cx - pan.x) / zoom - NODE_W / 2),
      y: Math.round((cy - pan.y) / zoom - NODE_H / 2),
    };
    setNodes((prev) => [...prev, node]);
    setSelectedNode(node.id);
    setInspectorOpen(true);
    setPaletteOpen(false);
    setPaletteSearch('');
  };

  const deleteNode = (nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.fromId !== nodeId && e.toId !== nodeId));
    if (selectedNode === nodeId) { setSelectedNode(null); setInspectorOpen(false); }
    if (drawingEdge?.fromId === nodeId) setDrawingEdge(null);
    if (reconnectingEdge?.fromId === nodeId) setReconnectingEdge(null);
    setHoveredEdge(null);
  };

  const clipboardRef = useRef<{ nodes: AutomationNode[]; edges: AutomationEdge[] } | null>(null);

  const copySelectedNode = () => {
    if (!selectedNode) return;
    const copiedNodes = nodes.filter((n) => n.id === selectedNode);
    const copiedEdges = edges.filter((e) => e.fromId === selectedNode && e.toId === selectedNode);
    clipboardRef.current = { nodes: copiedNodes, edges: copiedEdges };
  };

  const pasteNodes = () => {
    const clip = clipboardRef.current;
    if (!clip || clip.nodes.length === 0) return;
    const idMap = new Map<string, string>();
    const newNodes = clip.nodes.map((n) => {
      const newId = `n-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
      idMap.set(n.id, newId);
      return { ...n, id: newId, x: n.x + 40, y: n.y + 40 };
    });
    const newEdges = clip.edges.map((e) => ({
      ...e,
      id: `e-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      fromId: idMap.get(e.fromId) ?? e.fromId,
      toId: idMap.get(e.toId) ?? e.toId,
    })).filter((e) => idMap.has(e.fromId) || clip.nodes.some((n) => n.id === e.fromId));
    setNodes((prev) => [...prev, ...newNodes]);
    setEdges((prev) => [...prev, ...newEdges]);
    setSelectedNode(newNodes[0]?.id ?? null);
  };

  // ─── Global Keyboard Shortcuts (Ctrl+A, Ctrl+X, Ctrl+C, Ctrl+V, Delete) ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.body.getAttribute('data-email-studio-active') === 'true' || isEmailStudioOpen) {
        return;
      }

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const isMod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // Ctrl + A -> Select First / All
      if (isMod && key === 'a') {
        e.preventDefault();
        if (nodes.length > 0) {
          setSelectedNode(nodes[0].id);
        }
        return;
      }

      // Ctrl + X -> Cut
      if (isMod && key === 'x') {
        e.preventDefault();
        if (selectedNode) {
          copySelectedNode();
          deleteNode(selectedNode);
        }
        return;
      }

      // Ctrl + C -> Copy
      if (isMod && key === 'c') {
        e.preventDefault();
        copySelectedNode();
        return;
      }

      // Ctrl + V -> Paste
      if (isMod && key === 'v') {
        e.preventDefault();
        pasteNodes();
        return;
      }

      // Delete / Backspace -> Delete Selected
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNode) {
          e.preventDefault();
          deleteNode(selectedNode);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, edges, selectedNode]);

  // ─── Execution with blink ──────────────────────────────────────────

  const runWorkflow = async () => {
    if (nodes.length === 0) return;
    setExecuting(true);
    setExecutedNodes(new Set());
    setExecutionLog([]);
    setBlinkingNodes({});
    setLogOpen(true);

    // clear previous execution state from nodes
    setNodes((prev) => prev.map((n) => ({ ...n, lastOutput: undefined, lastStatus: undefined, lastExecutionTimeMs: undefined })));

    const triggers = nodes.filter((n) => n.type === 'trigger');
    const starts = triggers.length > 0 ? triggers : [nodes[0]];

    const visited = new Set<string>();
    const queue = [...starts.map((n) => n.id)];

    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);

      const node = nodes.find((n) => n.id === cur);
      if (!node || node.disabled) continue;

      setExecutingNodeId(cur);
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 300));

      const result = executeSingleNode(node);
      const status = result.status;

      setNodes((prev) => prev.map((n) => n.id === cur ? { ...n, lastOutput: result.output, lastStatus: status, lastExecutionTimeMs: result.executionTimeMs } : n));
      setExecutedNodes((prev) => new Set([...prev, cur]));
      setExecutionLog((prev) => [...prev, { nodeId: cur, title: node.title, status, ms: result.executionTimeMs, output: result.output }]);

      // trigger blink
      setBlinkingNodes((prev) => ({ ...prev, [cur]: status === 'success' ? 'green' : 'red' }));
      // clear blink after animation
      setTimeout(() => {
        setBlinkingNodes((prev) => {
          const next = { ...prev };
          delete next[cur];
          return next;
        });
      }, 2000);

      if (status === 'success') {
        const next = edges.filter((e) => e.fromId === cur).map((e) => e.toId);
        queue.push(...next);
      }
      // if failed, don't continue down this branch
    }

    setExecutingNodeId(null);
    setExecuting(false);
  };

  // ─── Auto layout ────────────────────────────────────────────────────

  const autoLayout = () => {
    setNodes((prev) => autoLayoutNodes(prev, edges));
  };

  const fitView = () => {
    if (nodes.length === 0) return;
    const minX = Math.min(...nodes.map((n) => n.x));
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxX = Math.max(...nodes.map((n) => n.x + NODE_W));
    const maxY = Math.max(...nodes.map((n) => n.y + NODE_H));
    const cw = canvasRef.current?.clientWidth || 800;
    const ch = canvasRef.current?.clientHeight || 600;
    const gw = maxX - minX + 100;
    const gh = maxY - minY + 100;
    const z = Math.min(cw / gw, ch / gh, 1.5);
    setZoom(z);
    setPan({ x: (cw - gw * z) / 2 - minX * z + 50 * z, y: (ch - gh * z) / 2 - minY * z + 50 * z });
  };

  useEffect(() => {
    if (nodes.length > 0 && pan.x === 0 && pan.y === 0) fitView();
  }, [nodes.length > 0]); // eslint-disable-line

  // ─── Filtered palette ───────────────────────────────────────────────

  const filteredPalette = useMemo(() => {
    if (!paletteSearch) return NODE_PALETTE;
    const q = paletteSearch.toLowerCase();
    return NODE_PALETTE.map((cat) => ({
      ...cat,
      items: cat.items.filter((i) => i.title.toLowerCase().includes(q) || i.subtitle.toLowerCase().includes(q)),
    })).filter((cat) => cat.items.length > 0);
  }, [paletteSearch]);

  const selectedNodeData = nodes.find((n) => n.id === selectedNode);

  if (!workflow) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading workflow…</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      {/* ─── Toolbar ─────────────────────────────────────────────────── */}
      <div className="h-12 bg-white border-b border-gray-200 flex items-center px-3 gap-2 flex-shrink-0 z-20">
        <button onClick={() => { save(); navigate('/data/automations'); }} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="w-px h-6 bg-gray-200" />

        {editingTitle ? (
          <input autoFocus value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} onBlur={() => { setWorkflow((w) => w ? { ...w, title: titleDraft } : w); setEditingTitle(false); }} onKeyDown={(e) => { if (e.key === 'Enter') { setWorkflow((w) => w ? { ...w, title: titleDraft } : w); setEditingTitle(false); } }} className="text-sm font-medium text-gray-900 border-b border-indigo-400 outline-none bg-transparent px-1 py-0.5 w-60" />
        ) : (
          <button onClick={() => { setTitleDraft(workflow.title); setEditingTitle(true); }} className="text-sm font-medium text-gray-900 hover:text-indigo-600 px-1 py-0.5 truncate max-w-[240px]">{workflow.title}</button>
        )}

        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${workflow.status === 'active' ? 'bg-emerald-100 text-emerald-700' : workflow.status === 'paused' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{workflow.status}</span>

        <div className="flex-1" />

        {/* Test / Live toggle */}
        <div className="flex items-center bg-gray-100 p-0.5 rounded-xl border border-gray-200 shadow-inner mr-1">
          <button
            onClick={() => setTestMode(true)}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition-all duration-200 ${testMode ? 'bg-amber-500 text-white shadow-sm ring-1 ring-amber-600/20' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'}`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span>Test Mode</span>
          </button>
          <button
            onClick={() => setTestMode(false)}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition-all duration-200 ${!testMode ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-700/20' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'}`}
          >
            <Rocket className="w-3.5 h-3.5" />
            <span>Live Mode</span>
          </button>
        </div>

        <div className="w-px h-6 bg-gray-200" />

        <button onClick={autoLayout} className="px-2.5 py-1 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">Auto-layout</button>
        <button onClick={fitView} className="px-2.5 py-1 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">Fit</button>

        <div className="w-px h-6 bg-gray-200" />

        <div className="flex items-center gap-1 text-xs text-gray-500">
          <button onClick={() => setZoom((z) => Math.max(0.25, z - 0.1))} className="px-1.5 py-0.5 hover:bg-gray-100 rounded">−</button>
          <span className="w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(2, z + 0.1))} className="px-1.5 py-0.5 hover:bg-gray-100 rounded">+</button>
        </div>

        <div className="w-px h-6 bg-gray-200" />

        {/* Fullscreen */}
        <button onClick={toggleFullscreen} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

        <div className="w-px h-6 bg-gray-200" />

        {/* Run (test) or Publish (live) */}
        {!isEmailStudioOpen && (testMode ? (
          <button onClick={runWorkflow} disabled={executing || nodes.length === 0} className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${executing ? 'bg-gray-100 text-gray-400' : 'bg-amber-500 text-white hover:bg-amber-600'}`}>
            {executing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            {executing ? 'Running…' : 'Run Test'}
          </button>
        ) : (
          <button onClick={publish} disabled={nodes.length === 0} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors">
            <Rocket className="w-3 h-3" /> Publish
          </button>
        ))}

        <button onClick={save} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
          <Save className="w-3 h-3" /> Save
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* ─── Node palette (left) ─────────────────────────────────── */}
        {paletteOpen && (
          <div className="w-64 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 z-10 shadow-lg">
            <div className="p-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Add Node</span>
              <button onClick={() => { setPaletteOpen(false); setPaletteSearch(''); }} className="p-0.5 rounded hover:bg-gray-100"><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <div className="px-3 py-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input value={paletteSearch} onChange={(e) => setPaletteSearch(e.target.value)} placeholder="Search nodes…" className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3">
              {filteredPalette.map((cat) => (
                <div key={cat.category} className="mb-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{cat.category}</p>
                  <div className="space-y-1">
                    {cat.items.map((item) => {
                      const IconC = ICON_MAP[item.icon];
                      const clr = COLOR_MAP[item.color] || COLOR_MAP.blue;
                      return (
                        <button key={item.title} onClick={() => addNode(item)} className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left hover:${clr.bg} transition-colors group border border-transparent hover:border-gray-200`}>
                          <div className={`w-7 h-7 rounded-md ${clr.light} flex items-center justify-center flex-shrink-0`}>
                            {IconC ? <IconC className="w-3.5 h-3.5 text-gray-600" /> : <Zap className="w-3.5 h-3.5 text-gray-600" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-800 truncate">{item.title}</p>
                            <p className="text-[10px] text-gray-400 truncate">{item.subtitle}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Canvas ──────────────────────────────────────────────── */}
        <div
          ref={canvasRef}
          className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing"
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          onWheel={handleWheel}
          style={{ backgroundImage: `radial-gradient(circle, #d1d5db 1px, transparent 1px)`, backgroundSize: `${20 * zoom}px ${20 * zoom}px`, backgroundPosition: `${pan.x}px ${pan.y}px` }}
        >
          {/* Add node FAB */}
          {!paletteOpen && (
            <button onClick={() => setPaletteOpen(true)} className="absolute top-3 left-3 z-10 flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 rounded-lg shadow-sm text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-indigo-300">
              <Plus className="w-3.5 h-3.5" /> Add Node
            </button>
          )}

          {/* Transform group */}
          <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', position: 'absolute', top: 0, left: 0, width: '10000px', height: '10000px' }}>
            {/* SVG edges */}
            <svg ref={svgRef} className="absolute inset-0 pointer-events-none" style={{ width: '10000px', height: '10000px', overflow: 'visible' }}>
              <defs>
                <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <path d="M 0 0 L 8 3 L 0 6 Z" fill="#94a3b8" />
                </marker>
                <marker id="arrowhead-active" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <path d="M 0 0 L 8 3 L 0 6 Z" fill="#22c55e" />
                </marker>
                <marker id="arrowhead-failed" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <path d="M 0 0 L 8 3 L 0 6 Z" fill="#ef4444" />
                </marker>
              </defs>

              {edges.map((edge) => {
                const fromNode = nodes.find((n) => n.id === edge.fromId);
                const toNode = nodes.find((n) => n.id === edge.toId);
                if (!fromNode || !toNode) return null;
                const from = getOutputPos(fromNode, edge.fromHandle);
                const to = getInputPos(toNode);
                const path = buildBezierPath(from, to);
                const bothExecuted = executedNodes.has(edge.fromId) && executedNodes.has(edge.toId);
                const fromFailed = fromNode.lastStatus === 'failed';
                const isHovered = hoveredEdge === edge.id;

                let strokeColor = '#cbd5e1';
                let marker = 'url(#arrowhead)';
                let strokeW = 2;
                if (bothExecuted && !fromFailed) {
                  strokeColor = '#22c55e';
                  marker = 'url(#arrowhead-active)';
                  strokeW = 2.5;
                } else if (bothExecuted && fromFailed) {
                  strokeColor = '#ef4444';
                  marker = 'url(#arrowhead-failed)';
                  strokeW = 2.5;
                }
                if (isHovered) {
                  strokeColor = '#f59e0b';
                  strokeW = 3;
                }

                return (
                  <g key={edge.id} className="pointer-events-auto" style={{ cursor: isHovered ? 'grab' : 'pointer' }}>
                    {/* Fat invisible hit area */}
                    <path
                      d={path}
                      stroke="transparent"
                      strokeWidth="18"
                      fill="none"
                      onMouseEnter={() => setHoveredEdge(edge.id)}
                      onMouseLeave={() => setHoveredEdge(null)}
                      onMouseDown={(e) => handleEdgeGrab(e, edge)}
                      style={{ cursor: 'grab' }}
                    />
                    <path d={path} stroke={strokeColor} strokeWidth={strokeW} fill="none" strokeDasharray={edge.animated ? '6 4' : undefined} markerEnd={marker} style={{ transition: 'stroke 0.15s, stroke-width 0.15s', pointerEvents: 'none' }}>
                      {edge.animated && <animate attributeName="stroke-dashoffset" values="0;-20" dur="0.8s" repeatCount="indefinite" />}
                    </path>
                    {/* Hover tooltip */}
                    {isHovered && (
                      <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 12} textAnchor="middle" fill="#92400e" fontSize="10" fontWeight="600" className="select-none pointer-events-none">
                        Drag to reconnect
                      </text>
                    )}
                    {edge.label && !isHovered && (
                      <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 8} textAnchor="middle" className="text-[10px] fill-gray-400 select-none pointer-events-none">{edge.label}</text>
                    )}
                  </g>
                );
              })}

              {/* Drawing edge preview */}
              {drawingEdge && (() => {
                const fromNode = nodes.find((n) => n.id === drawingEdge.fromId);
                if (!fromNode) return null;
                const from = getOutputPos(fromNode, drawingEdge.fromHandle);
                const path = buildBezierPath(from, { x: drawingEdge.x, y: drawingEdge.y });
                return <path d={path} stroke={reconnectingEdge ? '#f59e0b' : '#6366f1'} strokeWidth="2" fill="none" strokeDasharray="6 4" className="pointer-events-none" />;
              })()}
            </svg>

            {/* Selection Marquee Box */}
            {selectionBox && (() => {
              const x = Math.min(selectionBox.startX, selectionBox.currentX);
              const y = Math.min(selectionBox.startY, selectionBox.currentY);
              const width = Math.abs(selectionBox.currentX - selectionBox.startX);
              const height = Math.abs(selectionBox.currentY - selectionBox.startY);
              if (width < 3 && height < 3) return null;
              return (
                <div
                  className="absolute border-2 border-blue-500 bg-blue-500/15 rounded-lg pointer-events-none z-30 ring-1 ring-blue-400/40"
                  style={{ left: x, top: y, width, height }}
                />
              );
            })()}

            {/* Nodes */}
            {nodes.map((node) => {
              const clr = COLOR_MAP[node.color] || COLOR_MAP.blue;
              const IconC = ICON_MAP[node.icon];
              const isSelected = selectedNode === node.id;
              const isExecuted = executedNodes.has(node.id);
              const isRunning = executingNodeId === node.id;
              const hasOutput = node.type === 'logic' && (node.title.includes('If') || node.title.includes('Switch'));
              const blinkClass = isRunning ? 'node-blink-running' : blinkingNodes[node.id] === 'green' ? 'node-blink-green' : blinkingNodes[node.id] === 'red' ? 'node-blink-red' : '';

              return (
                <div
                  key={node.id}
                  className={`absolute select-none group ${node.disabled ? 'opacity-50' : ''}`}
                  style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
                  onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                  onMouseUp={() => handleNodeMouseUp(node.id)}
                >
                  <div className={`w-full h-full rounded-xl border-2 transition-all ${blinkClass} ${isSelected ? 'border-blue-500 ring-2 ring-blue-500 shadow-lg shadow-blue-500/30' : isRunning ? 'border-emerald-400 shadow-md' : isExecuted && node.lastStatus === 'failed' ? 'border-red-400 shadow-md' : isExecuted && node.lastStatus === 'success' ? 'border-emerald-500 shadow-md shadow-emerald-500/20' : 'border-slate-300 shadow-sm'} bg-white overflow-hidden cursor-move hover:shadow-md`}>
                    <div className="flex items-center h-full px-3 gap-2.5">
                      {/* Icon */}
                      <div className={`w-9 h-9 rounded-lg ${isExecuted && node.lastStatus === 'success' ? 'bg-emerald-500' : isExecuted && node.lastStatus === 'failed' ? 'bg-red-500' : isRunning ? 'bg-indigo-500' : clr.light} flex items-center justify-center flex-shrink-0 transition-colors`}>
                        {isRunning ? (
                          <Loader2 className="w-4 h-4 text-white animate-spin" />
                        ) : IconC ? (
                          <IconC className={`w-4 h-4 ${isExecuted ? 'text-white' : 'text-gray-600'}`} />
                        ) : (
                          <Zap className={`w-4 h-4 ${isExecuted ? 'text-white' : 'text-gray-600'}`} />
                        )}
                      </div>

                      {/* Label */}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-gray-900 truncate">{node.title}</p>
                        <p className="text-[10px] text-gray-400 truncate">{node.subtitle || node.type}</p>
                      </div>

                      {/* Status indicator */}
                      {isExecuted && !isRunning && (
                        <div className="flex-shrink-0">
                          {node.lastStatus === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                        </div>
                      )}

                      {/* Exec time */}
                      {node.lastExecutionTimeMs && !isRunning && (
                        <span className="text-[9px] text-gray-400 flex-shrink-0">{node.lastExecutionTimeMs}ms</span>
                      )}
                    </div>
                  </div>

                  {/* Input handle (left) */}
                  {node.type !== 'trigger' && (
                    <div
                      className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-gray-300 bg-white hover:border-indigo-500 hover:bg-indigo-50 transition-colors cursor-crosshair"
                      onMouseUp={() => handleNodeMouseUp(node.id)}
                    />
                  )}

                  {/* Output handle(s) (right) */}
                  {hasOutput ? (
                    <>
                      <div onMouseDown={(e) => handleOutputMouseDown(e, node.id, 'true')} className="absolute right-0 top-[30%] translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-emerald-400 bg-white hover:bg-emerald-50 transition-colors cursor-crosshair z-10" title="True" />
                      <div onMouseDown={(e) => handleOutputMouseDown(e, node.id, 'false')} className="absolute right-0 top-[70%] translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-red-400 bg-white hover:bg-red-50 transition-colors cursor-crosshair z-10" title="False" />
                    </>
                  ) : (
                    <div onMouseDown={(e) => handleOutputMouseDown(e, node.id)} className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-gray-300 bg-white hover:border-indigo-500 hover:bg-indigo-50 transition-colors cursor-crosshair z-10" />
                  )}

                  {/* Delete button */}
                  <button onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }} className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-red-600" title="Delete node">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* ─── Minimap ───────────────────────────────────────────── */}
          {nodes.length > 0 && (
            <div className="absolute bottom-3 right-3 w-36 h-24 bg-white/90 border border-gray-200 rounded-lg overflow-hidden pointer-events-none z-10 shadow-sm">
              <svg viewBox={`${Math.min(...nodes.map((n) => n.x)) - 20} ${Math.min(...nodes.map((n) => n.y)) - 20} ${Math.max(...nodes.map((n) => n.x + NODE_W)) - Math.min(...nodes.map((n) => n.x)) + 40} ${Math.max(...nodes.map((n) => n.y + NODE_H)) - Math.min(...nodes.map((n) => n.y)) + 40}`} className="w-full h-full">
                {edges.map((e) => {
                  const f = nodes.find((n) => n.id === e.fromId);
                  const t = nodes.find((n) => n.id === e.toId);
                  if (!f || !t) return null;
                  return <line key={e.id} x1={f.x + NODE_W / 2} y1={f.y + NODE_H / 2} x2={t.x + NODE_W / 2} y2={t.y + NODE_H / 2} stroke="#d1d5db" strokeWidth="3" />;
                })}
                {nodes.map((n) => {
                  const fillMap: Record<string, string> = { emerald: '#10b981', amber: '#f59e0b', violet: '#8b5cf6', cyan: '#06b6d4', blue: '#3b82f6' };
                  return <rect key={n.id} x={n.x} y={n.y} width={NODE_W} height={NODE_H} rx="4" fill={fillMap[n.color] || '#94a3b8'} opacity={selectedNode === n.id ? 1 : 0.6} />;
                })}
              </svg>
            </div>
          )}
        </div>

        {/* ─── Inspector (right) ───────────────────────────────────── */}
        {inspectorOpen && selectedNodeData && (
          <div className="w-96 md:w-[420px] bg-slate-50/50 border-l border-slate-200 flex flex-col flex-shrink-0 z-10 shadow-lg transition-all duration-200">
            {/* Inspector Header */}
            <div className="px-4 py-3.5 bg-white border-b border-slate-200/80 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-600 shadow-xs">
                  {(() => { const IC = ICON_MAP[selectedNodeData.icon]; return IC ? <IC className="w-4.5 h-4.5" /> : <Zap className="w-4.5 h-4.5" />; })()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-slate-900 truncate tracking-tight">{selectedNodeData.title}</h3>
                  <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Node Configuration</p>
                </div>
              </div>
              <button
                onClick={() => setInspectorOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                title="Close panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Segmented Pill Tabs */}
            <div className="px-4 pt-3 pb-1">
              <div className="p-1 bg-slate-200/60 rounded-xl flex gap-1 shadow-inner">
                {(['params', 'output'] as const).map((t) => {
                  const isActive = inspectorTab === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setInspectorTab(t)}
                      className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all duration-150 ${
                        isActive
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {t === 'params' ? (
                        <>
                          <Sliders className="w-3.5 h-3.5" />
                          <span>Parameters</span>
                        </>
                      ) : (
                        <>
                          <Terminal className="w-3.5 h-3.5" />
                          <span>Output</span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Inspector Body Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {inspectorTab === 'params' ? (
                <InspectorParams node={selectedNodeData} onChange={(updated) => setNodes((prev) => prev.map((n) => n.id === updated.id ? updated : n))} />
              ) : (
                <div className="space-y-3">
                  {selectedNodeData.lastOutput ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                        <span>Latest Execution Output</span>
                        {selectedNodeData.lastExecutionTimeMs && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            {selectedNodeData.lastExecutionTimeMs}ms
                          </span>
                        )}
                      </div>
                      <pre className="text-[11px] font-mono text-slate-800 bg-white rounded-xl p-3.5 border border-slate-200/80 whitespace-pre-wrap break-all shadow-xs overflow-x-auto max-h-[400px]">
                        {JSON.stringify(selectedNodeData.lastOutput, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <div className="py-12 px-4 text-center border-2 border-dashed border-slate-200/80 rounded-2xl bg-white/50">
                      <Terminal className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-medium text-slate-600">No execution data yet</p>
                      <p className="text-[11px] text-slate-400 mt-1">Run the workflow to inspect live output payload</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Inspector Footer Actions */}
            <div className="p-4 bg-white border-t border-slate-200/80">
              <button
                onClick={() => deleteNode(selectedNodeData.id)}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-rose-600 bg-rose-50/70 hover:bg-rose-100/90 border border-rose-200/80 rounded-xl transition-all shadow-xs active:scale-[0.99]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Node</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Execution log (bottom) ──────────────────────────────────── */}
      {logOpen && executionLog.length > 0 && (
        <div className="bg-white border-t border-gray-200 flex-shrink-0 z-20" style={{ height: '180px' }}>
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
            <span className="text-xs font-medium text-gray-700">Execution Log ({executionLog.length} steps)</span>
            <div className="flex items-center gap-1">
              {executing && <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />}
              <button onClick={() => setLogOpen(false)} className="p-0.5 rounded hover:bg-gray-100"><X className="w-3.5 h-3.5 text-gray-400" /></button>
            </div>
          </div>
          <div className="overflow-y-auto" style={{ height: '140px' }}>
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-1.5 font-medium w-8">#</th>
                  <th className="text-left px-4 py-1.5 font-medium">Node</th>
                  <th className="text-left px-4 py-1.5 font-medium">Status</th>
                  <th className="text-left px-4 py-1.5 font-medium">Time</th>
                  <th className="text-left px-4 py-1.5 font-medium">Output Preview</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {executionLog.map((log, i) => (
                  <tr key={i} className="hover:bg-gray-50 cursor-pointer" onClick={() => { setSelectedNode(log.nodeId); setInspectorOpen(true); setInspectorTab('output'); }}>
                    <td className="px-4 py-1.5 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-1.5 font-medium text-gray-700">{log.title}</td>
                    <td className="px-4 py-1.5">
                      <span className={`inline-flex items-center gap-1 ${log.status === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {log.status === 'success' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 text-gray-500">{log.ms}ms</td>
                    <td className="px-4 py-1.5 text-gray-400 truncate max-w-[200px] font-mono">{JSON.stringify(log.output).slice(0, 60)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Inspector Parameters Component ───────────────────────────────────────

function InspectorParams({ node, onChange }: { node: AutomationNode; onChange: (n: AutomationNode) => void }) {
  const updateConfig = (key: string, value: any) => {
    onChange({ ...node, config: { ...node.config, [key]: value } });
  };

  const updateField = (key: keyof AutomationNode, value: any) => {
    onChange({ ...node, [key]: value });
  };

  return (
    <div className="space-y-3">
      <Field label="Title">
        <input value={node.title} onChange={(e) => updateField('title', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
      </Field>
      <Field label="Subtitle">
        <input value={node.subtitle || ''} onChange={(e) => updateField('subtitle', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
      </Field>

      <div className="border-t border-gray-100 pt-3">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Configuration</p>
      </div>

      {node.title.toLowerCase().includes('webhook') && (
        <>
          <Field label="Method">
            <select value={node.config.method || 'POST'} onChange={(e) => updateConfig('method', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md">
              <option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option>
            </select>
          </Field>
          <Field label="Path">
            <input value={node.config.path || '/api/webhook'} onChange={(e) => updateConfig('path', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
          </Field>
        </>
      )}

      {node.title.toLowerCase().includes('schedule') && (
        <>
          <Field label="Cron Expression">
            <input value={node.config.cron || '0 8 * * 1-5'} onChange={(e) => updateConfig('cron', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
          </Field>
          <Field label="Timezone">
            <select value={node.config.timezone || 'Asia/Kolkata'} onChange={(e) => updateConfig('timezone', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md">
              <option>Asia/Kolkata</option><option>America/New_York</option><option>Europe/London</option><option>UTC</option>
            </select>
          </Field>
        </>
      )}

      {(node.title.toLowerCase().includes('if') || node.title.toLowerCase().includes('switch')) && (
        <>
          <Field label="Field">
            <input value={node.config.field || ''} onChange={(e) => updateConfig('field', e.target.value)} placeholder="e.g. score" className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
          </Field>
          <Field label="Operator">
            <select value={node.config.op || '>'} onChange={(e) => updateConfig('op', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md">
              <option value="==">equals (==)</option><option value="!=">not equals (!=)</option>
              <option value=">">greater than (&gt;)</option><option value="<">less than (&lt;)</option>
              <option value=">=">≥</option><option value="<=">≤</option>
              <option value="contains">contains</option><option value="exists">exists</option>
            </select>
          </Field>
          <Field label="Value">
            <input value={node.config.value ?? ''} onChange={(e) => updateConfig('value', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
          </Field>
        </>
      )}

      {node.title.toLowerCase().includes('wait') && (
        <>
          <Field label="Duration">
            <input type="number" value={node.config.duration || 5} onChange={(e) => updateConfig('duration', Number(e.target.value))} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
          </Field>
          <Field label="Unit">
            <select value={node.config.unit || 'seconds'} onChange={(e) => updateConfig('unit', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md">
              <option>seconds</option><option>minutes</option><option>hours</option><option>days</option>
            </select>
          </Field>
        </>
      )}

      {(node.title.toLowerCase().includes('gpt') || node.title.toLowerCase().includes('claude') || node.title.toLowerCase().includes('classif') || node.title.toLowerCase().includes('summar') || node.title.toLowerCase().includes('sentiment')) && (
        <>
          <Field label="Model">
            <select value={node.config.model || (node.title.includes('Claude') ? 'claude-sonnet-4' : 'gpt-4o')} onChange={(e) => updateConfig('model', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md">
              <option>gpt-4o</option><option>gpt-4o-mini</option><option>claude-opus-4</option><option>claude-sonnet-4</option><option>claude-haiku-4-5</option>
            </select>
          </Field>
          <Field label="Prompt / Instructions">
            <textarea value={node.config.prompt || ''} onChange={(e) => updateConfig('prompt', e.target.value)} rows={4} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/40 resize-none" placeholder="Enter system prompt or instructions…" />
          </Field>
          <Field label="Temperature">
            <input type="number" step={0.1} min={0} max={2} value={node.config.temperature ?? 0.7} onChange={(e) => updateConfig('temperature', Number(e.target.value))} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
          </Field>
        </>
      )}

      {node.title.toLowerCase().includes('http') && (
        <>
          <Field label="Method">
            <select value={node.config.method || 'GET'} onChange={(e) => updateConfig('method', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md">
              <option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option>
            </select>
          </Field>
          <Field label="URL">
            <input value={node.config.url || ''} onChange={(e) => updateConfig('url', e.target.value)} placeholder="https://api.example.com/…" className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
          </Field>
          <Field label="Headers (JSON)">
            <textarea value={node.config.headers || '{}'} onChange={(e) => updateConfig('headers', e.target.value)} rows={2} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/40 resize-none" />
          </Field>
          <Field label="Body (JSON)">
            <textarea value={node.config.body || ''} onChange={(e) => updateConfig('body', e.target.value)} rows={3} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/40 resize-none" />
          </Field>
        </>
      )}

      {(node.title.toLowerCase().includes('email') || node.title.toLowerCase().includes('mail') || node.type === 'action_email' || node.type === 'target_email') && node.type !== 'trigger' && (
        <SendEmailActivityConfigurator
          activityName={node.title}
          onActivityNameChange={(name) => updateField('title', name)}
          config={node.config}
          onChange={(updatedConfig) => onChange({ ...node, config: updatedConfig })}
          tenantId={tenantId ?? undefined}
          environment={environment ?? 'production'}
          onStudioOpenChange={setIsEmailStudioOpen}
        />
      )}

      {node.title.toLowerCase().includes('slack') && (
        <>
          <Field label="Channel">
            <input value={node.config.channel || ''} onChange={(e) => updateConfig('channel', e.target.value)} placeholder="#general" className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
          </Field>
          <Field label="Message">
            <textarea value={node.config.message || ''} onChange={(e) => updateConfig('message', e.target.value)} rows={3} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500/40 resize-none" placeholder="Slack message…" />
          </Field>
        </>
      )}

      {node.title.toLowerCase().includes('whatsapp') && (
        <>
          <Field label="Phone">
            <input value={node.config.phone || ''} onChange={(e) => updateConfig('phone', e.target.value)} placeholder="+91 98765 43210" className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
          </Field>
          <Field label="Template ID">
            <input value={node.config.templateId || ''} onChange={(e) => updateConfig('templateId', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
          </Field>
        </>
      )}

      {node.title.toLowerCase().includes('code') && (
        <Field label="Script">
          <textarea value={node.config.script || '// Your code here\nreturn { result: items.length };'} onChange={(e) => updateConfig('script', e.target.value)} rows={8} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/40 resize-none" />
        </Field>
      )}

      {node.title.toLowerCase().includes('event') && node.type === 'trigger' && (
        <Field label="Event Name">
          <input value={node.config.eventName || ''} onChange={(e) => updateConfig('eventName', e.target.value)} placeholder="order_completed" className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
        </Field>
      )}

      {node.title.toLowerCase().includes('loop') && (
        <>
          <Field label="Input Key">
            <input value={node.config.key || ''} onChange={(e) => updateConfig('key', e.target.value)} placeholder="items" className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
          </Field>
          <Field label="Batch Size">
            <input type="number" value={node.config.limit || 10} onChange={(e) => updateConfig('limit', Number(e.target.value))} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
          </Field>
        </>
      )}

      {node.title.toLowerCase().includes('customer db') && (
        <>
          <Field label="Action">
            <select value={node.config.action || 'upsert'} onChange={(e) => updateConfig('action', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md">
              <option value="upsert">Upsert</option><option value="get">Get</option><option value="update">Update</option><option value="delete">Delete</option>
            </select>
          </Field>
          <Field label="Customer ID Field">
            <input value={node.config.idField || 'email'} onChange={(e) => updateConfig('idField', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
          </Field>
        </>
      )}

      <div className="border-t border-gray-100 pt-3">
        <Field label="Notes">
          <textarea value={node.notes || ''} onChange={(e) => updateField('notes', e.target.value)} rows={2} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500/40 resize-none" placeholder="Internal notes…" />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
        <input type="checkbox" checked={!!node.disabled} onChange={(e) => updateField('disabled', e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
        Disabled (skip during execution)
      </label>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
