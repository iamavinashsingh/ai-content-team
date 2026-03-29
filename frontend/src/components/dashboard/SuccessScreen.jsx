import { motion } from 'framer-motion';
import { useState } from 'react';

export default function SuccessScreen({ publishedUrl, onNewProject }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(publishedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center glass-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 30 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1.5 h-1.5 rounded-full"
            style={{
              background: ['#8ff5ff', '#c081ff', '#4ade80', '#fbbf24', '#fb7185'][i % 5],
              left: `${Math.random() * 100}%`,
              top: '50%',
            }}
            initial={{ y: 0, opacity: 1, scale: 1 }}
            animate={{
              y: [0, -(Math.random() * 400 + 200)],
              x: [(Math.random() - 0.5) * 200],
              opacity: [1, 0],
              scale: [1, 0],
            }}
            transition={{ duration: 2 + Math.random() * 2, delay: Math.random() * 0.5, ease: 'easeOut' }}
          />
        ))}
      </div>

      <motion.div
        className="glass-modal max-w-md w-full mx-4 p-10 md:p-12 text-center relative z-10"
        initial={{ scale: 0.8, y: 40 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 150, damping: 20, delay: 0.2 }}
      >
        <motion.div
          className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-8"
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, delay: 0.4 }}
        >
          <span className="material-symbols-outlined text-primary text-[36px]" style={{ fontVariationSettings: "'FILL' 1" }}>rocket_launch</span>
        </motion.div>

        <motion.h2 className="text-2xl font-headline font-extrabold mb-3 tracking-tight" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          Article Published! 🎉
        </motion.h2>

        <motion.p className="text-sm text-on-surface-variant mb-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
          Your content has been delivered successfully.
        </motion.p>

        <motion.div
          className="flex items-center gap-2 p-3 rounded-2xl bg-surface-container-lowest border border-white/10 mb-8"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
        >
          <span className="flex-1 text-xs text-primary font-mono truncate text-left">{publishedUrl}</span>
          <button onClick={handleCopy} className="p-2 rounded-full hover:bg-white/5 transition-colors flex-shrink-0">
            <span className="material-symbols-outlined text-[18px]" style={{ color: copied ? '#4ade80' : 'rgba(255,255,255,0.4)' }}>
              {copied ? 'check' : 'content_copy'}
            </span>
          </button>
        </motion.div>

        <motion.button
          onClick={onNewProject}
          className="w-full py-4 rounded-full font-black text-sm uppercase tracking-wider flex items-center justify-center gap-3
                     border border-outline/30 text-white hover:bg-white/5 transition-all"
          whileTap={{ scale: 0.98 }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Start New Project
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
