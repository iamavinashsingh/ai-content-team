import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { AGENTS } from '@/lib/constants';

// Floating abstract orbs that represent the AI nodes in the background
export default function FloatingNodes() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Central beam of light — inspired by the reference design */}
      <motion.div
        className="absolute left-1/2 top-0 -translate-x-1/2 w-[2px] h-full"
        style={{
          background: 'linear-gradient(to bottom, transparent 0%, rgba(139, 92, 246, 0.4) 30%, rgba(6, 182, 212, 0.6) 50%, rgba(139, 92, 246, 0.4) 70%, transparent 100%)',
          filter: 'blur(1px)',
        }}
        initial={{ opacity: 0, scaleY: 0 }}
        animate={{ opacity: 1, scaleY: 1 }}
        transition={{ duration: 2, ease: 'easeOut' }}
      />
      {/* Wider glow behind the beam */}
      <motion.div
        className="absolute left-1/2 top-0 -translate-x-1/2 w-[200px] h-full"
        style={{
          background: 'linear-gradient(to bottom, transparent 0%, rgba(139, 92, 246, 0.06) 30%, rgba(6, 182, 212, 0.1) 50%, rgba(139, 92, 246, 0.06) 70%, transparent 100%)',
          filter: 'blur(40px)',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 2.5, delay: 0.3 }}
      />

      {/* Floating orbs for each agent */}
      {AGENTS.map((agent, i) => (
        <FloatingOrb key={agent.id} agent={agent} index={i} />
      ))}

      {/* Connection lines between orbs */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.04]">
        <motion.line
          x1="20%" y1="35%" x2="50%" y2="20%"
          stroke="white" strokeWidth="0.5"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 3, delay: 1.5 }}
        />
        <motion.line
          x1="50%" y1="20%" x2="80%" y2="35%"
          stroke="white" strokeWidth="0.5"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 3, delay: 1.8 }}
        />
        <motion.line
          x1="20%" y1="35%" x2="35%" y2="70%"
          stroke="white" strokeWidth="0.5"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 3, delay: 2.0 }}
        />
        <motion.line
          x1="80%" y1="35%" x2="65%" y2="70%"
          stroke="white" strokeWidth="0.5"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 3, delay: 2.2 }}
        />
      </svg>
    </div>
  );
}

function FloatingOrb({ agent, index }) {
  const positions = [
    { left: '50%', top: '18%' },
    { left: '20%', top: '38%' },
    { left: '80%', top: '38%' },
    { left: '30%', top: '68%' },
    { left: '70%', top: '68%' },
  ];

  const pos = positions[index];
  const delay = index * 0.4;

  return (
    <motion.div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: pos.left, top: pos.top }}
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        opacity: [0, 0.6, 0.4],
        scale: [0, 1.2, 1],
      }}
      transition={{ duration: 2, delay: 0.8 + delay, ease: 'easeOut' }}
    >
      {/* Outer glow */}
      <motion.div
        className="w-20 h-20 rounded-full"
        style={{
          background: `radial-gradient(circle, ${agent.color}30 0%, transparent 70%)`,
          filter: 'blur(20px)',
        }}
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.3, 0.6, 0.3],
        }}
        transition={{
          duration: 4 + index,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      {/* Core dot */}
      <motion.div
        className="absolute inset-0 m-auto w-3 h-3 rounded-full"
        style={{ background: agent.color, boxShadow: `0 0 12px ${agent.color}` }}
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: index * 0.5 }}
      />
    </motion.div>
  );
}
