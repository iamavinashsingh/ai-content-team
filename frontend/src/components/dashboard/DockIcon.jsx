import { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';

export default function DockIcon({ icon: Icon, label, onClick, isActive, color }) {
  const ref = useRef(null);
  const mouseDistance = useMotionValue(1); // 0 = closest, 1 = far
  
  const scale = useSpring(
    useTransform(mouseDistance, [0, 0.5, 1], [1.4, 1.1, 1]),
    { stiffness: 300, damping: 20 }
  );
  const y = useSpring(
    useTransform(mouseDistance, [0, 0.5, 1], [-12, -4, 0]),
    { stiffness: 300, damping: 20 }
  );

  const handleMouseMove = (e) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const center = rect.left + rect.width / 2;
    const dist = Math.abs(e.clientX - center) / 80;
    mouseDistance.set(Math.min(1, dist));
  };

  return (
    <motion.div
      ref={ref}
      className="relative group"
      style={{ scale, y }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => mouseDistance.set(1)}
    >
      <motion.button
        onClick={onClick}
        className={cn(
          'w-11 h-11 rounded-xl flex items-center justify-center',
          'transition-colors duration-300',
          'hover:bg-white/10',
          isActive ? 'bg-white/10' : 'bg-white/[0.03]',
        )}
        whileTap={{ scale: 0.9 }}
        style={isActive && color ? { background: `${color}15`, border: `1px solid ${color}30` } : {}}
      >
        <Icon
          className="w-[18px] h-[18px]"
          style={{ color: isActive && color ? color : 'rgba(255,255,255,0.6)' }}
        />
      </motion.button>

      {/* Active dot */}
      {isActive && (
        <motion.div
          className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
          style={{ background: color || '#fff' }}
          layoutId="dock-active-dot"
        />
      )}

      {/* Tooltip */}
      <div className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 
                       bg-white/10 backdrop-blur-xl rounded-md text-[10px] text-white/70 
                       font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 
                       transition-opacity duration-200 pointer-events-none">
        {label}
      </div>
    </motion.div>
  );
}
