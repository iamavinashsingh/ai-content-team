import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function BriefModal({ isOpen, onSubmit, onClose }) {
  const [brief, setBrief] = useState('');
  const [cmsTarget, setCmsTarget] = useState('none');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCms, setShowCms] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!brief.trim() || brief.trim().length < 10) return;
    setIsSubmitting(true);
    try {
      await onSubmit(brief.trim(), cmsTarget);
    } catch (err) {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-50 glass-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              className="glass-modal w-full max-w-xl p-8 md:p-10 relative"
              initial={{ scale: 0.9, y: 30, filter: 'blur(10px)' }}
              animate={{ scale: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ scale: 0.9, y: 30, filter: 'blur(10px)' }}
              transition={{ type: 'spring', stiffness: 200, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close */}
              <button onClick={onClose} className="absolute top-5 right-5 material-symbols-outlined text-on-surface-variant/40 hover:text-white transition-colors text-[20px]">
                close
              </button>

              {/* Header */}
              <div className="mb-8">
                <div className="inline-flex items-center px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 mb-5">
                  <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-ping" />
                  <span className="text-primary text-[10px] font-bold tracking-[0.15em] uppercase font-label">New Project</span>
                </div>
                <h2 className="text-2xl font-headline font-extrabold text-white mb-2 tracking-tight">
                  What should we create?
                </h2>
                <p className="text-sm text-on-surface-variant">
                  Describe your content. Include audience, tone, and length for best results.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <textarea
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    placeholder="Write a 2000-word blog post about the future of AI agents in software development. Target audience: engineering managers. Tone: authoritative but accessible..."
                    rows={5}
                    className="w-full px-4 py-3 rounded-2xl bg-surface-container-lowest border border-white/10
                               text-white text-sm placeholder:text-on-surface-variant/30 resize-none font-body
                               focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all duration-300"
                    autoFocus
                  />
                  <div className="flex justify-between mt-2">
                    <span className="text-[10px] text-on-surface-variant/30 font-label">
                      {brief.length < 10 ? 'Minimum 10 characters' : ''}
                    </span>
                    <span className="text-[10px] text-on-surface-variant/30 font-mono">{brief.length} chars</span>
                  </div>
                </div>

                {/* CMS target */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowCms(!showCms)}
                    className="flex items-center gap-2 text-xs text-on-surface-variant/40 hover:text-on-surface-variant/70 transition-colors font-label"
                  >
                    <span className="material-symbols-outlined text-[16px]">{showCms ? 'expand_less' : 'expand_more'}</span>
                    Publishing target
                  </button>
                  <AnimatePresence>
                    {showCms && (
                      <motion.div
                        className="mt-3 flex gap-2"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                      >
                        {['none', 'wordpress', 'ghost'].map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setCmsTarget(opt)}
                            className={`px-4 py-2 rounded-full text-xs font-bold font-label transition-all border
                              ${cmsTarget === opt
                                ? 'bg-primary/10 border-primary/30 text-primary'
                                : 'bg-surface-container-lowest border-white/5 text-on-surface-variant/50 hover:text-white/70'
                              }`}
                          >
                            {opt === 'none' ? 'Local / Manual' : opt.charAt(0).toUpperCase() + opt.slice(1)}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Submit */}
                <motion.button
                  type="submit"
                  disabled={brief.trim().length < 10 || isSubmitting}
                  className="w-full py-4 rounded-full font-black text-base uppercase tracking-wider flex items-center justify-center gap-3
                             bg-primary text-on-primary
                             disabled:opacity-20 disabled:cursor-not-allowed
                             transition-all duration-500 hover:scale-[1.02] hover:shadow-[0_0_40px_rgba(143,245,255,0.3)]"
                  whileTap={{ scale: 0.98 }}
                >
                  {isSubmitting ? (
                    <>
                      <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                      Initializing pipeline...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>send</span>
                      Launch Content Team
                    </>
                  )}
                </motion.button>
              </form>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
