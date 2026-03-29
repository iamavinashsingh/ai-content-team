import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { NODE_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';

export default function AgentCard({ agent, status, activeNode, isMobile }) {
  const [isHovered, setIsHovered] = useState(false);
  const isActive = status === 'active';
  const isComplete = status === 'complete';
  const nodeLabel = activeNode ? NODE_LABELS[activeNode] || activeNode : null;

  return (
    <motion.div
      className={cn(
        'relative select-none',
        isMobile ? 'w-full' : 'w-[280px]'
      )}
      drag={!isMobile}
      dragElastic={0.15}
      dragTransition={{ bounceStiffness: 300, bounceDamping: 20 }}
      dragMomentum={false}
      whileDrag={{ scale: 1.05, zIndex: 50 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      layout
    >
      {/* Card body */}
      <div
        className={cn(
          'glass-card p-6 cursor-grab active:cursor-grabbing transition-all duration-500',
          isActive && agent.glowClass,
          isHovered && !isActive && 'border-white/[0.12]',
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            {/* Icon */}
            <motion.div
              className="w-12 h-12 rounded-2xl flex items-center justify-center border border-white/10"
              style={{
                background: `${agent.color}10`,
              }}
              animate={isActive ? {
                boxShadow: [`0 0 0px ${agent.color}00`, `0 0 25px ${agent.color}50`, `0 0 0px ${agent.color}00`],
                borderColor: [`rgba(255,255,255,0.1)`, `${agent.color}60`, `rgba(255,255,255,0.1)`],
              } : {}}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <span
                className="material-symbols-outlined text-[28px]"
                style={{
                  color: agent.color,
                  fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0",
                }}
              >
                {agent.icon}
              </span>
            </motion.div>

            <div>
              <h3 className="font-headline text-sm font-bold text-white">{agent.name}</h3>
              <p className="text-[11px] text-on-surface-variant leading-tight mt-0.5">{agent.description}</p>
            </div>
          </div>

          {/* Status dot */}
          <div className="flex-shrink-0 mt-1">
            {isActive && (
              <motion.div
                className="w-3 h-3 rounded-full"
                style={{ background: agent.color }}
                animate={{ opacity: [1, 0.3, 1], scale: [1, 1.2, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
            {isComplete && (
              <motion.span
                className="material-symbols-outlined text-[20px]"
                style={{ color: '#4ade80', fontVariationSettings: "'FILL' 1" }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300 }}
              >
                check_circle
              </motion.span>
            )}
            {!isActive && !isComplete && (
              <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
            )}
          </div>
        </div>

        {/* Active task label */}
        <AnimatePresence mode="wait">
          {isActive && nodeLabel && (
            <motion.div
              key={nodeLabel}
              className="px-3 py-2 rounded-xl text-[11px] font-label font-semibold tracking-wide uppercase flex items-center gap-2"
              style={{
                background: `${agent.color}08`,
                border: `1px solid ${agent.color}20`,
                color: agent.color,
              }}
              initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            >
              <motion.span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: agent.color }}
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              {nodeLabel}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Progress bar for active state */}
        {isActive && (
          <motion.div
            className="mt-3 h-[2px] rounded-full overflow-hidden bg-white/5"
          >
            <motion.div
              className="h-full rounded-full"
              style={{ background: agent.color }}
              animate={{ width: ['0%', '100%'] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
