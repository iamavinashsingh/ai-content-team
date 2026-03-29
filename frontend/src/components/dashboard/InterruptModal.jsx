import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ArticlePreview from './ArticlePreview';

export default function InterruptModal({ interruptData, articleData, onSubmit, onClose }) {
  if (!interruptData) return null;
  const isClarification = interruptData.type === 'clarifying_questions';
  const isReview = interruptData.type === 'review_article';

  return (
    <AnimatePresence>
      {interruptData && (
        <>
          <motion.div
            className="fixed inset-0 z-50 glass-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              className="glass-modal w-full max-w-2xl my-8 p-8 md:p-10 relative max-h-[90vh] overflow-y-auto"
              initial={{ scale: 0.85, y: 50, opacity: 0, filter: 'blur(10px)' }}
              animate={{ scale: 1, y: 0, opacity: 1, filter: 'blur(0px)' }}
              exit={{ scale: 0.85, y: 50, opacity: 0, filter: 'blur(10px)' }}
              transition={{ type: 'spring', stiffness: 180, damping: 22 }}
            >
              {isClarification && <ClarificationForm data={interruptData} onSubmit={onSubmit} />}
              {isReview && <ReviewForm data={interruptData} articleData={articleData} onSubmit={onSubmit} />}
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ClarificationForm({ data, onSubmit }) {
  const [answers, setAnswers] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!answers.trim()) return;
    setIsSubmitting(true);
    await onSubmit('clarification', answers.trim());
  };

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <span className="material-symbols-outlined text-primary text-[28px]">chat</span>
        </div>
        <div>
          <h2 className="text-xl font-headline font-extrabold text-white tracking-tight">Clarifying Questions</h2>
          <p className="text-xs text-on-surface-variant mt-0.5">{data.message}</p>
        </div>
      </div>

      <div className="space-y-3 mb-6">
        {data.questions?.map((q, i) => (
          <motion.div
            key={q.id || i}
            className="p-4 rounded-2xl bg-surface-container-lowest border border-white/5"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <p className="text-sm text-white/85 font-medium">{q.index || i + 1}. {q.question}</p>
            {q.reason && <p className="text-[11px] text-on-surface-variant/50 mt-1">{q.reason}</p>}
          </motion.div>
        ))}
      </div>

      <textarea
        value={answers}
        onChange={(e) => setAnswers(e.target.value)}
        placeholder="Type your answers here..."
        rows={4}
        className="w-full px-4 py-3 rounded-2xl bg-surface-container-lowest border border-white/10
                   text-white text-sm placeholder:text-on-surface-variant/25 resize-none
                   focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all mb-5"
        autoFocus
      />

      <motion.button
        onClick={handleSubmit}
        disabled={!answers.trim() || isSubmitting}
        className="w-full py-4 rounded-full font-black text-base uppercase tracking-wider flex items-center justify-center gap-3
                   bg-primary text-on-primary disabled:opacity-20 disabled:cursor-not-allowed
                   transition-all duration-500 hover:shadow-[0_0_40px_rgba(143,245,255,0.3)]"
        whileTap={{ scale: 0.98 }}
      >
        {isSubmitting ? (
          <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
        ) : (
          <>
            <span className="material-symbols-outlined text-[20px]">send</span>
            Submit Answers
          </>
        )}
      </motion.button>
    </div>
  );
}

function ReviewForm({ data, articleData, onSubmit }) {
  const [showArticle, setShowArticle] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ satisfied: false, typos: [], rewrites: [], newSections: [], comments: '' });
  const [newTypo, setNewTypo] = useState('');
  const [newRewrite, setNewRewrite] = useState('');
  const [newSection, setNewSection] = useState('');

  const handleApprove = async () => { setIsSubmitting(true); await onSubmit('review', { satisfied: true }); };
  const handleRequestChanges = async () => { setIsSubmitting(true); await onSubmit('review', feedback); };

  const addItem = (field, value, setter) => {
    if (!value.trim()) return;
    setFeedback((prev) => ({ ...prev, [field]: [...prev[field], value.trim()] }));
    setter('');
  };
  const removeItem = (field, index) => {
    setFeedback((prev) => ({ ...prev, [field]: prev[field].filter((_, i) => i !== index) }));
  };

  const article = articleData?.article;

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-secondary/10 border border-secondary/20 flex items-center justify-center">
          <span className="material-symbols-outlined text-secondary text-[28px]">rate_review</span>
        </div>
        <div>
          <h2 className="text-xl font-headline font-extrabold text-white tracking-tight">Review Article</h2>
          <p className="text-xs text-on-surface-variant mt-0.5">
            {article?.title} — {article?.wordCount} words
          </p>
        </div>
      </div>

      {article && (
        <div className="mb-6">
          <button onClick={() => setShowArticle(!showArticle)} className="text-xs text-primary hover:text-primary/80 transition-colors mb-3 font-label font-bold uppercase tracking-wider flex items-center gap-1">
            <span className="material-symbols-outlined text-[16px]">{showArticle ? 'visibility_off' : 'visibility'}</span>
            {showArticle ? 'Hide' : 'Show'} Preview
          </button>
          <AnimatePresence>
            {showArticle && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="max-h-[300px] overflow-y-auto rounded-2xl bg-surface-container-lowest border border-white/5 p-6">
                  <ArticlePreview markdown={article.markdown} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="space-y-4 mb-6">
        <FeedbackInput label="Typos & Fixes" placeholder="e.g., intro: fix 'APIs' spelling" items={feedback.typos} value={newTypo} onChange={setNewTypo} onAdd={() => addItem('typos', newTypo, setNewTypo)} onRemove={(i) => removeItem('typos', i)} />
        <FeedbackInput label="Section Rewrites" placeholder="e.g., conclusion: make punchier" items={feedback.rewrites} value={newRewrite} onChange={setNewRewrite} onAdd={() => addItem('rewrites', newRewrite, setNewRewrite)} onRemove={(i) => removeItem('rewrites', i)} />
        <FeedbackInput label="New Sections" placeholder="e.g., Add performance benchmarks" items={feedback.newSections} value={newSection} onChange={setNewSection} onAdd={() => addItem('newSections', newSection, setNewSection)} onRemove={(i) => removeItem('newSections', i)} />
        <div>
          <label className="text-[10px] text-on-surface-variant font-label font-bold uppercase tracking-widest block mb-2">Comments</label>
          <textarea value={feedback.comments} onChange={(e) => setFeedback((prev) => ({ ...prev, comments: e.target.value }))} placeholder="General feedback..." rows={2}
            className="w-full px-4 py-2.5 rounded-2xl bg-surface-container-lowest border border-white/10 text-white text-xs placeholder:text-on-surface-variant/20 resize-none focus:border-white/20 transition-all" />
        </div>
      </div>

      <div className="flex gap-4">
        <motion.button onClick={handleApprove} disabled={isSubmitting} className="flex-1 py-4 rounded-full font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 bg-primary text-on-primary disabled:opacity-30 transition-all duration-300 hover:shadow-[0_0_30px_rgba(143,245,255,0.3)]" whileTap={{ scale: 0.98 }}>
          {isSubmitting ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> : <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>}
          Approve
        </motion.button>
        <motion.button onClick={handleRequestChanges} disabled={isSubmitting || (!feedback.typos.length && !feedback.rewrites.length && !feedback.newSections.length && !feedback.comments)} className="flex-1 py-4 rounded-full font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 bg-secondary/15 border border-secondary/30 text-secondary disabled:opacity-20 transition-all duration-300 hover:shadow-[0_0_30px_rgba(192,129,255,0.2)]" whileTap={{ scale: 0.98 }}>
          <span className="material-symbols-outlined text-[18px]">edit_note</span>
          Request Changes
        </motion.button>
      </div>
    </div>
  );
}

function FeedbackInput({ label, placeholder, items, value, onChange, onAdd, onRemove }) {
  return (
    <div>
      <label className="text-[10px] text-on-surface-variant font-label font-bold uppercase tracking-widest block mb-2">{label}</label>
      <div className="flex gap-2">
        <input value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onAdd())} placeholder={placeholder}
          className="flex-1 px-4 py-2.5 rounded-full bg-surface-container-lowest border border-white/10 text-white text-xs placeholder:text-on-surface-variant/20 focus:border-white/20 transition-all" />
        <button type="button" onClick={onAdd} className="px-3 py-2.5 rounded-full bg-white/5 hover:bg-white/10 transition-colors">
          <span className="material-symbols-outlined text-on-surface-variant text-[18px]">add</span>
        </button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {items.map((item, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 text-[10px] text-on-surface-variant/70 font-label">
              {item}
              <button onClick={() => onRemove(i)} className="hover:text-error transition-colors">
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
