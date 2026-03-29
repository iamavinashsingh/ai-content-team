import { motion } from 'framer-motion';
import { AGENTS } from '@/lib/constants';
import AgentCard from './AgentCard';
import Dock from './Dock';
import LiveConsole from './LiveConsole';
import BudgetMeter from './BudgetMeter';
import { useEffect, useState } from 'react';

const AGENT_POSITIONS = [
  { x: 50, y: 16 },   // PM — top center
  { x: 16, y: 44 },   // Researcher — left
  { x: 84, y: 44 },   // Writer — right
  { x: 24, y: 74 },   // Editor — bottom left
  { x: 76, y: 74 },   // Publisher — bottom right
];

export default function Canvas({
  agentStates,
  activeNodes,
  consoleLog,
  budget,
  onToggleConsole,
  showConsole,
  onNewProject,
  phase,
}) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return (
    <motion.div
      className="relative w-full min-h-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
    >
      {/* Background blurs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="ethereal-blur absolute top-1/4 left-1/4 w-[600px] h-[600px] animate-pulse-slow" />
        <div className="ethereal-blur absolute bottom-1/4 right-1/3 w-[400px] h-[400px] animate-pulse-slow" style={{ animationDelay: '2s' }} />
      </div>

      {/* Agent Cards */}
      {isMobile ? (
        <div className="px-4 pt-24 pb-32 space-y-4 max-w-lg mx-auto">
          {AGENTS.map((agent, i) => (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 100, damping: 20, delay: i * 0.08 }}
            >
              <AgentCard
                agent={agent}
                status={agentStates[agent.id] || 'idle'}
                activeNode={activeNodes[agent.id] || null}
                isMobile={true}
              />
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="relative w-full h-screen">
          {AGENTS.map((agent, i) => {
            const pos = AGENT_POSITIONS[i];
            return (
              <motion.div
                key={agent.id}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                initial={{ opacity: 0, scale: 0, y: 40 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{
                  type: 'spring',
                  stiffness: 80,
                  damping: 15,
                  delay: 0.15 + i * 0.1,
                }}
              >
                {/* Float wrapper */}
                <motion.div
                  animate={{ y: [0, -10, 0, 6, 0] }}
                  transition={{
                    duration: 5 + i * 0.7,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: i * 0.4,
                  }}
                >
                  <AgentCard
                    agent={agent}
                    status={agentStates[agent.id] || 'idle'}
                    activeNode={activeNodes[agent.id] || null}
                    isMobile={false}
                  />
                </motion.div>
              </motion.div>
            );
          })}

          {/* Budget meter — top right */}
          <motion.div
            className="absolute top-20 right-6"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
          >
            <BudgetMeter budget={budget} />
          </motion.div>

          {/* Phase indicator — top left */}
          <motion.div
            className="absolute top-20 left-6"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 }}
          >
            <div className="glass-card-low px-5 py-3 flex items-center gap-3">
              <span className="flex h-2 w-2 rounded-full bg-primary animate-ping" />
              <span className="text-[10px] font-label font-bold text-on-surface-variant uppercase tracking-[0.15em]">
                {phase || 'Ready'}
              </span>
            </div>
          </motion.div>
        </div>
      )}

      {/* Live Console */}
      <LiveConsole
        logs={consoleLog}
        isOpen={showConsole}
        onClose={() => onToggleConsole(false)}
      />

      {/* Dock */}
      <Dock
        onToggleConsole={() => onToggleConsole(!showConsole)}
        onNewProject={onNewProject}
        showConsole={showConsole}
      />
    </motion.div>
  );
}
