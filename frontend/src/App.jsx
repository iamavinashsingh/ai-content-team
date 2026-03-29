import { useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import Navbar from '@/components/landing/Navbar';
import Hero from '@/components/landing/Hero';
import Canvas from '@/components/dashboard/Canvas';
import Dock from '@/components/dashboard/Dock';
import BriefModal from '@/components/dashboard/BriefModal';
import InterruptModal from '@/components/dashboard/InterruptModal';
import SuccessScreen from '@/components/dashboard/SuccessScreen';
import useProjectStream from '@/hooks/useProjectStream';
import { initProject, submitFeedback } from '@/hooks/useApi';

// ══════════════════════════════════════════════════════════════
// App State Machine
//
// 'landing'   →  Hero page with CTA + bento grid
// 'brief'     →  Brief submission modal (over landing)
// 'dashboard' →  Zero-gravity workspace with live SSE
// 'complete'  →  Success screen
// ══════════════════════════════════════════════════════════════

export default function App() {
  const [view, setView] = useState('landing');
  const [projectId, setProjectId] = useState(null);
  const [showConsole, setShowConsole] = useState(false);
  const [showBriefModal, setShowBriefModal] = useState(false);

  const {
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
  } = useProjectStream(projectId);

  const handleInitialize = useCallback(() => {
    setShowBriefModal(true);
  }, []);

  const handleBriefSubmit = useCallback(async (brief, cmsTarget) => {
    try {
      const result = await initProject(brief, cmsTarget);
      setProjectId(result.projectId);
      setShowBriefModal(false);
      setView('dashboard');
      setShowConsole(true);
    } catch (err) {
      console.error('Failed to init project:', err);
      throw err;
    }
  }, []);

  const handleFeedbackSubmit = useCallback(async (type, payload) => {
    if (!projectId) return;
    try {
      await submitFeedback(projectId, type, payload);
      clearInterrupt();
    } catch (err) {
      console.error('Failed to submit feedback:', err);
    }
  }, [projectId, clearInterrupt]);

  const handleNewProject = useCallback(() => {
    setProjectId(null);
    setView('landing');
    setShowConsole(false);
    setShowBriefModal(false);
  }, []);

  const showSuccess = publishedUrl && view === 'dashboard';

  return (
    <div className="relative min-h-screen bg-black">
      {/* Grain overlay */}
      <div className="grain-overlay" />

      {/* Persistent Navbar */}
      <Navbar onInitialize={handleInitialize} />

      {/* View transitions */}
      <div className="relative z-10">
        <AnimatePresence mode="wait">
          {view === 'landing' && (
            <Hero key="hero" onInitialize={handleInitialize} />
          )}
          {view === 'dashboard' && (
            <Canvas
              key="dashboard"
              agentStates={agentStates}
              activeNodes={activeNodes}
              consoleLog={consoleLog}
              budget={budget}
              showConsole={showConsole}
              onToggleConsole={setShowConsole}
              onNewProject={() => setShowBriefModal(true)}
              phase={phase}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Dock — removed from landing page for ALCHEMIST design */}

      {/* Brief Modal */}
      <BriefModal
        isOpen={showBriefModal}
        onSubmit={handleBriefSubmit}
        onClose={() => {
          setShowBriefModal(false);
          if (view !== 'dashboard') setView('landing');
        }}
      />

      {/* Interrupt Modal */}
      <InterruptModal
        interruptData={interruptData}
        articleData={articleData}
        onSubmit={handleFeedbackSubmit}
        onClose={clearInterrupt}
      />

      {/* Success Screen */}
      <AnimatePresence>
        {showSuccess && (
          <SuccessScreen
            key="success"
            publishedUrl={publishedUrl}
            onNewProject={handleNewProject}
          />
        )}
      </AnimatePresence>

      {/* Error toast */}
      <AnimatePresence>
        {error && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50">
            <div className="glass-card-low px-6 py-3 text-sm text-error flex items-center gap-3">
              <span className="material-symbols-outlined text-error text-[18px]">error</span>
              {error}
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
