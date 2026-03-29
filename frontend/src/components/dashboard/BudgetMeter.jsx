import { motion } from 'framer-motion';
import { formatTokens, formatCost } from '@/lib/utils';

export default function BudgetMeter({ budget }) {
  const tokensUsed = budget?.totalTokensUsed || 0;
  const maxTokens = 50000;
  const percent = Math.min((tokensUsed / maxTokens) * 100, 100);
  const costUsd = budget?.estimatedCostUsd || 0;
  const color = percent > 80 ? '#fb7185' : percent > 50 ? '#fbbf24' : '#4ade80';

  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (percent / 100) * circumference;

  return (
    <div className="glass-card-low px-4 py-3 flex items-center gap-3">
      <div className="relative w-[68px] h-[68px]">
        <svg width="68" height="68" className="-rotate-90">
          <circle cx="34" cy="34" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
          <motion.circle
            cx="34" cy="34" r={radius}
            fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
            style={{ filter: `drop-shadow(0 0 6px ${color}60)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] font-bold font-headline" style={{ color }}>{Math.round(percent)}%</span>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-on-surface-variant text-[14px]">memory</span>
          <span className="text-[11px] text-on-surface-variant font-mono">{formatTokens(tokensUsed)} / {formatTokens(maxTokens)}</span>
        </div>
        <span className="text-[11px] text-on-surface-variant/60 font-mono">{formatCost(costUsd)} est.</span>
      </div>
    </div>
  );
}
