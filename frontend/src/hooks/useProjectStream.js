import { useState, useEffect, useRef, useCallback } from 'react';
import { NODE_TO_AGENT, API_BASE } from '@/lib/constants';

// ══════════════════════════════════════════════════════════════
// useProjectStream — SSE Event Source Hook
// Connects to the backend SSE stream and drives all dashboard UI state.
//
// Returns:
//   agentStates    — { pm: 'idle'|'active'|'complete', ... }
//   activeNodes    — { pm: 'pmStrategist', ... } (currently executing node name)
//   consoleLog     — [{ type, text, node, timestamp }]
//   interruptData  — { type, questions, message, article } or null
//   articleData    — Full article_ready payload or null
//   budget         — { totalTokensUsed, estimatedCostUsd }
//   publishedUrl   — string or null
//   phase          — 'Connecting' | 'Strategy' | 'Research' | ... | 'Complete'
//   error          — string or null
//   isConnected    — boolean
// ══════════════════════════════════════════════════════════════

const PHASE_MAP = {
  pmStrategist: 'Strategy',
  humanInput: 'Awaiting Input',
  researchStep1: 'Research',
  researchStep2: 'Research',
  architectOutline: 'Architecture',
  blueprintValidator: 'Architecture',
  plannerAgent: 'Planning',
  setupWorkspace: 'Setup',
  workspaceHealthCheck: 'Health Check',
  selectNextTask: 'Writing',
  contextBuilder: 'Writing',
  writerAgent: 'Writing',
  updateRegistry: 'Writing',
  editorAgent: 'Editing',
  factCheckValidator: 'Fact-Checking',
  mediaAgent: 'Media Generation',
  snapshotManager: 'Saving',
  phaseVerification: 'Verification',
  brandVoiceExtractor: 'Voice Analysis',
  stateCompactor: 'Optimization',
  simplifyTask: 'Simplifying',
  documentAssembler: 'Assembly',
  presentToUser: 'Preview',
  feedbackCollector: 'Review',
  feedbackRouter: 'Routing',
  humanEscalation: 'Escalation',
  publisherAgent: 'Publishing',
};

export default function useProjectStream(projectId) {
  const [agentStates, setAgentStates] = useState({
    pm: 'idle', researcher: 'idle', writer: 'idle', editor: 'idle', publisher: 'idle',
  });
  const [activeNodes, setActiveNodes] = useState({});
  const [consoleLog, setConsoleLog] = useState([]);
  const [interruptData, setInterruptData] = useState(null);
  const [articleData, setArticleData] = useState(null);
  const [budget, setBudget] = useState({ totalTokensUsed: 0, estimatedCostUsd: 0 });
  const [publishedUrl, setPublishedUrl] = useState(null);
  const [phase, setPhase] = useState('Connecting');
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  const eventSourceRef = useRef(null);
  const logIdRef = useRef(0);

  const addLog = useCallback((type, text, node = null) => {
    setConsoleLog((prev) => [
      ...prev.slice(-200), // Keep last 200 entries
      {
        id: ++logIdRef.current,
        type,
        text,
        node,
        timestamp: new Date().toISOString(),
      },
    ]);
  }, []);

  const setAgentActive = useCallback((nodeName) => {
    const agentId = NODE_TO_AGENT[nodeName];
    if (!agentId) return;

    setAgentStates((prev) => ({
      ...prev,
      [agentId]: 'active',
    }));
    setActiveNodes((prev) => ({
      ...prev,
      [agentId]: nodeName,
    }));
    setPhase(PHASE_MAP[nodeName] || 'Processing');
  }, []);

  const setAgentComplete = useCallback((nodeName) => {
    const agentId = NODE_TO_AGENT[nodeName];
    if (!agentId) return;

    setAgentStates((prev) => ({
      ...prev,
      [agentId]: 'complete',
    }));
    setActiveNodes((prev) => {
      const next = { ...prev };
      delete next[agentId];
      return next;
    });
  }, []);

  // Dismiss interrupt (after user submits feedback)
  const clearInterrupt = useCallback(() => {
    setInterruptData(null);
  }, []);

  useEffect(() => {
    if (!projectId) return;

    const url = `${API_BASE}/project/${projectId}/stream`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
      setError(null);
      addLog('system', 'Connected to project stream');
    };

    es.onerror = () => {
      setIsConnected(false);
      // EventSource auto-reconnects, so just log
      addLog('error', 'Connection lost — reconnecting...');
    };

    // ── node_start ─────────────────────────────────────
    es.addEventListener('node_start', (e) => {
      const data = JSON.parse(e.data);
      setAgentActive(data.node);
      addLog('node', `▸ ${data.node}`, data.node);
    });

    // ── node_complete ──────────────────────────────────
    es.addEventListener('node_complete', (e) => {
      const data = JSON.parse(e.data);
      setAgentComplete(data.node);
      addLog('node', `✓ ${data.node}`, data.node);
    });

    // ── token (streaming LLM output) ──────────────────
    es.addEventListener('token', (e) => {
      const data = JSON.parse(e.data);
      setConsoleLog((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.type === 'token') {
          // Append to last token entry instead of creating new one
          return [
            ...prev.slice(0, -1),
            { ...last, text: last.text + data.text },
          ];
        }
        return [
          ...prev.slice(-200),
          { id: ++logIdRef.current, type: 'token', text: data.text, timestamp: new Date().toISOString() },
        ];
      });
    });

    // ── status ─────────────────────────────────────────
    es.addEventListener('status', (e) => {
      const data = JSON.parse(e.data);
      addLog('status', data.message);
    });

    // ── budget_update ──────────────────────────────────
    es.addEventListener('budget_update', (e) => {
      const data = JSON.parse(e.data);
      setBudget(data);
    });

    // ── interrupt (clarifying questions or review) ─────
    es.addEventListener('interrupt', (e) => {
      const data = JSON.parse(e.data);
      setInterruptData(data);
      addLog('interrupt', `⏸ Interrupt: ${data.type}`);
      if (data.type === 'clarifying_questions') {
        setPhase('Awaiting Input');
      } else if (data.type === 'review_article') {
        setPhase('Review');
      }
    });

    // ── clarifying_questions ──────────────────────────
    es.addEventListener('clarifying_questions', (e) => {
      const data = JSON.parse(e.data);
      setInterruptData({ type: 'clarifying_questions', ...data });
      setPhase('Awaiting Input');
      addLog('interrupt', `⏸ ${data.questions?.length || 0} clarifying question(s)`);
    });

    // ── article_ready ─────────────────────────────────
    es.addEventListener('article_ready', (e) => {
      const data = JSON.parse(e.data);
      setArticleData(data);
      addLog('system', `📄 Article ready: "${data.article?.title}" (${data.article?.wordCount} words)`);
    });

    // ── published ─────────────────────────────────────
    es.addEventListener('published', (e) => {
      const data = JSON.parse(e.data);
      setPublishedUrl(data.url);
      setPhase('Complete');
      addLog('system', `🚀 Published: ${data.url}`);
    });

    // ── escalated ─────────────────────────────────────
    es.addEventListener('escalated', (e) => {
      const data = JSON.parse(e.data);
      setError(data.reason);
      setPhase('Escalated');
      addLog('error', `⚠ Escalated: ${data.reason}`);
    });

    // ── error ─────────────────────────────────────────
    es.addEventListener('error', (e) => {
      try {
        const data = JSON.parse(e.data);
        setError(data.message);
        addLog('error', `✕ Error: ${data.message}`);
      } catch {
        // Ignore parse errors from SSE error events
      }
    });

    // ── complete ──────────────────────────────────────
    es.addEventListener('complete', (e) => {
      const data = JSON.parse(e.data);
      setPhase('Complete');
      addLog('system', '✅ Graph execution finished');
      es.close();
    });

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [projectId, addLog, setAgentActive, setAgentComplete]);

  return {
    agentStates,
    activeNodes,
    consoleLog,
    interruptData,
    articleData,
    budget,
    publishedUrl,
    phase,
    error,
    isConnected,
    clearInterrupt,
  };
}
