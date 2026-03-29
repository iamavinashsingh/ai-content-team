import { motion } from 'framer-motion';

const DOCK_ITEMS = [
  { icon: 'home_app_logo', label: 'Home', id: 'home' },
  { icon: 'smart_toy', label: 'Agents', id: 'agents', active: true, filled: true },
  { icon: 'grid_view', label: 'Workspace', id: 'workspace' },
  { icon: 'insights', label: 'Analytics', id: 'analytics' },
  { icon: 'inventory_2', label: 'Archive', id: 'archive' },
  { icon: 'power_settings_new', label: 'Power', id: 'power' },
];

export default function Dock({ onToggleConsole, onNewProject, showConsole }) {
  const handleClick = (id) => {
    if (id === 'workspace') onNewProject?.();
    if (id === 'agents') onToggleConsole?.();
  };

  return (
    <motion.nav
      className="fixed bottom-0 left-0 right-0 flex justify-center pb-6 md:pb-8 z-[100]"
      initial={{ opacity: 0, y: 60 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 100, damping: 20, delay: 0.5 }}
    >
      <div className="glass-dock px-4 md:px-6 py-2.5 md:py-3 flex items-center space-x-1 md:space-x-2">
        {DOCK_ITEMS.map((item) => (
          <motion.button
            key={item.id}
            onClick={() => handleClick(item.id)}
            className={`flex items-center justify-center p-2.5 md:p-3 transition-all duration-500 ease-out
              ${item.active
                ? 'bg-primary text-on-primary scale-125 mx-2 md:mx-4 shadow-[0_0_20px_rgba(143,245,255,0.4)] rounded-full'
                : 'text-on-surface-variant hover:scale-150'
              }
            `}
            whileTap={{ scale: 0.9 }}
          >
            <span
              className="material-symbols-outlined text-[20px] md:text-[24px]"
              style={item.filled ? { fontVariationSettings: "'FILL' 1" } : {}}
            >
              {item.icon}
            </span>
          </motion.button>
        ))}
      </div>
    </motion.nav>
  );
}
