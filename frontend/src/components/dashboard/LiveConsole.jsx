import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { NODE_TO_AGENT, AGENTS } from '@/lib/constants';
import { formatTime } from '@/lib/utils';

export default function LiveConsole({ logs, isOpen, onClose }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed top-0 right-0 h-full z-30 w-[400px] max-w-[90vw]"
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 28 }}
        >
          <div className="h-full bg-surface-container border-l border-white/5 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-primary text-[20px]">terminal</span>
                <span className="text-sm font-headline font-bold text-white/80">Live Console</span>
                <span className="px-2 py-0.5 rounded-full bg-white/5 text-[10px] text-on-surface-variant font-mono">
                  {logs.length}
                </span>
              </div>
              <button
                onClick={onClose}
                className="material-symbols-outlined text-on-surface-variant hover:text-white transition-colors text-[20px] p-1"
              >
                close
              </button>
            </div>

            {/* Log entries */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1 font-mono text-[11px]">
              {logs.length === 0 && (
                <div className="text-on-surface-variant/30 text-center py-12 text-xs">
                  Waiting for events...
                </div>
              )}
              {logs.map((log) => (
                <LogEntry key={log.id} log={log} />
              ))}
              <div ref={bottomRef} />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LogEntry({ log }) {
  const agentId = log.node ? NODE_TO_AGENT[log.node] : null;
  const agent = agentId ? AGENTS.find((a) => a.id === agentId) : null;
  const color = agent?.color || null;

  const typeColors = {
    system: 'text-on-surface-variant/50',
    node: 'text-on-surface-variant/70',
    token: 'text-on-surface-variant/60',
    interrupt: 'text-secondary',
    error: 'text-error',
    status: 'text-on-surface-variant/40',
  };

  if (log.type === 'token') {
    return (
      <motion.div
        className="text-on-surface-variant/60 leading-relaxed whitespace-pre-wrap break-words"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {log.text}
      </motion.div>
    );
  }

  return (
    <motion.div
      className="flex items-start gap-2 py-0.5"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
        style={{ background: color || 'rgba(255,255,255,0.1)' }}
      />
      <span className={typeColors[log.type] || 'text-on-surface-variant/50'}>{log.text}</span>
      <span className="text-on-surface-variant/20 ml-auto flex-shrink-0">{formatTime(log.timestamp)}</span>
    </motion.div>
  );
}
