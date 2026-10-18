import React from 'react';
import { useAuth } from '../context/AuthContext';
import { BookOpen, FileCheck, Trophy, Shield } from 'lucide-react';

export type NavTab = 'courses' | 'exams' | 'results' | 'admin';

interface BottomNavProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  const { role } = useAuth();

  const navItems = [
    { id: 'courses' as NavTab, label: 'Courses', icon: BookOpen },
    { id: 'exams' as NavTab, label: 'Exams', icon: FileCheck },
    { id: 'results' as NavTab, label: 'Results', icon: Trophy },
    ...(role === 'admin' ? [{ id: 'admin' as NavTab, label: 'Admin', icon: Shield }] : [])
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-t border-slate-200/80 dark:border-slate-800/80 shadow-2xl transition-colors">
      <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center w-16 py-1.5 transition-all duration-150 cursor-pointer ${
                isActive
                  ? 'text-blue-600 dark:text-blue-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <div
                className={`p-1.5 rounded-xl transition-all ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-950/60 ring-1 ring-blue-500/20'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-900'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
