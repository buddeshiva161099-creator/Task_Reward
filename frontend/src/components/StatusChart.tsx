'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useState, useEffect } from 'react';

interface StatusData {
  name: string;
  value: number;
  color: string;
}

interface StatusChartProps {
  data: StatusData[];
  total: number;
  completed: number;
  size?: number;
}

export default function StatusChart({ data, total, completed, size = 240 }: StatusChartProps) {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <div style={{ height: size }} />;

  return (
    <div className="relative flex items-center justify-center w-full">
      <ResponsiveContainer width="100%" height={size} debounce={100}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={size / 3.5}
            outerRadius={size / 2.5}
            paddingAngle={2}
            dataKey="value"
            stroke="#fff"
            strokeWidth={2}
            animationBegin={0}
            animationDuration={1000}
            cornerRadius={4}
          >
            {data.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.color} 
                className="hover:opacity-80 transition-opacity cursor-pointer outline-none"
              />
            ))}
          </Pie>
          <Tooltip 
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const item = payload[0].payload;
                const itemPercentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : 0;
                return (
                  <div className="bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] border border-slate-100 min-w-40 animate-in fade-in zoom-in duration-200">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: item.color }} />
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{item.name}</p>
                    </div>
                    <div className="flex items-end gap-1.5">
                      <span className="text-2xl font-black text-slate-900 leading-none">{item.value}</span>
                      <span className="text-xs font-bold text-slate-500 mb-0.5">Tasks</span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-slate-50">
                      <p className="text-xs font-bold text-indigo-500">{itemPercentage}% contribution</p>
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      
      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mb-1">
        <span className="text-3xl font-black text-slate-900 leading-none bg-gradient-to-br from-slate-900 to-slate-500 bg-clip-text text-transparent">
          {percentage}%
        </span>
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] mt-1.5">Success Rate</span>
      </div>
    </div>
  );
}
