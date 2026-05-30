'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, User, Building2, ClipboardList, X, Command, Loader2 } from 'lucide-react';
import api from '@/lib/api';

interface SearchResult {
  id: string;
  name?: string;
  description?: string;
  email?: string;
  status?: string;
  type: 'employee' | 'company' | 'task';
}

export default function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{
    employees: SearchResult[];
    companies: SearchResult[];
    tasks: SearchResult[];
  }>({ employees: [], companies: [], tasks: [] });
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSelectedIndex(0);
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.length >= 2) {
        setLoading(true);
        try {
          const res = await api.get(`/search?q=${query}`);
          setResults(res.data);
          setSelectedIndex(0);
        } catch (err) {
          console.error('Search failed:', err);
        } finally {
          setLoading(false);
        }
      } else {
        setResults({ employees: [], companies: [], tasks: [] });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const flatResults = [...results.employees, ...results.companies, ...results.tasks];

  const handleNavigate = (type: string, id: string) => {
    setIsOpen(false);
    switch (type) {
      case 'employee':
        router.push(`/admin/employees/detail?id=${id}`);
        break;
      case 'company':
        router.push(`/admin/companies`); // or detail if we add it
        break;
      case 'task':
        router.push(`/admin/tasks`); // or specific scroll/filter
        break;
    }
  };

  const hasResults = results.employees.length > 0 || results.companies.length > 0 || results.tasks.length > 0;

  return (
    <>
      {/* Search Trigger (Input-like button) */}
      <button
        onClick={() => {
          setQuery('');
          setResults({ employees: [], companies: [], tasks: [] });
          setSelectedIndex(0);
          setIsOpen(true);
        }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100/50 hover:bg-slate-100 border border-slate-200 transition-all text-muted-foreground flex-1 max-w-[180px] sm:max-w-xs"
      >
        <Search className="w-4 h-4" />
        <span className="text-xs flex-1 text-left">Quick Search...</span>
        <div className="hidden md:flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[10px] font-mono">
          <Command className="w-2.5 h-2.5" />
          <span>K</span>
        </div>
      </button>

      {/* Search Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => {
            setIsOpen(false);
            setQuery('');
            setResults({ employees: [], companies: [], tasks: [] });
            setSelectedIndex(0);
          }} />
          
          <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Input Section */}
            <div className="p-4 border-b border-slate-100 flex items-center gap-3">
              <Search className="w-5 h-5 text-indigo-500" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelectedIndex((prev) => (prev + 1) % flatResults.length);
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelectedIndex((prev) => (prev - 1 + flatResults.length) % flatResults.length);
                  } else if (e.key === 'Enter' && flatResults[selectedIndex]) {
                    handleNavigate(flatResults[selectedIndex].type, flatResults[selectedIndex].id);
                  }
                }}
                placeholder="Search for employees, tasks, or companies..."
                className="flex-1 bg-transparent border-none outline-none text-slate-800 placeholder:text-slate-400"
              />
              {loading ? (
                <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
              ) : (
                <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-slate-100 rounded-md">
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              )}
            </div>

            {/* Results Section */}
            <div className="max-h-[60vh] overflow-y-auto custom-scrollbar p-2">
              {query.length < 2 ? (
                <div className="p-12 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
                    <Command className="w-6 h-6 text-indigo-500" />
                  </div>
                  <p className="text-sm font-medium text-slate-900">Global Omni-Search</p>
                  <p className="text-xs text-slate-500 mt-1">Start typing to find anything instantly.</p>
                </div>
              ) : !loading && !hasResults ? (
                <div className="p-12 text-center text-slate-500">
                  <Search className="w-8 h-8 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No results found for &quot;{query}&quot;</p>
                </div>
              ) : (
                <div className="space-y-4 p-2">
                  {/* Employees */}
                  {results.employees.length > 0 && (
                    <div>
                      <h3 className="px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Employees</h3>
                      <div className="mt-1 space-y-0.5">
                        {results.employees.map((emp, i) => (
                          <button
                            key={emp.id}
                            onClick={() => handleNavigate('employee', emp.id)}
                            className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-colors text-left group ${selectedIndex === i ? 'bg-indigo-50 ring-2 ring-indigo-200' : 'hover:bg-indigo-50'}`}
                          >
                            <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                              <User className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{emp.name}</p>
                              <p className="text-[10px] text-slate-500">{emp.email}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Companies */}
                  {results.companies.length > 0 && (
                    <div>
                      <h3 className="px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Companies</h3>
                      <div className="mt-1 space-y-0.5">
                        {results.companies.map((comp, i) => (
                          <button
                            key={comp.id}
                            onClick={() => handleNavigate('company', comp.id)}
                            className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-colors text-left group ${selectedIndex === results.employees.length + i ? 'bg-emerald-50 ring-2 ring-emerald-200' : 'hover:bg-emerald-50'}`}
                          >
                            <div className="w-9 h-9 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                              <Building2 className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-800 group-hover:text-emerald-600 transition-colors">{comp.name}</p>
                              <p className="text-[10px] text-slate-500">Client Partner</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tasks */}
                  {results.tasks.length > 0 && (
                    <div>
                      <h3 className="px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Work Items</h3>
                      <div className="mt-1 space-y-0.5">
                        {results.tasks.map((task, i) => (
                          <button
                            key={task.id}
                            onClick={() => handleNavigate('task', task.id)}
                            className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-colors text-left group ${selectedIndex === results.employees.length + results.companies.length + i ? 'bg-amber-50 ring-2 ring-amber-200' : 'hover:bg-amber-50'}`}
                          >
                            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
                              <ClipboardList className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-800 group-hover:text-amber-600 transition-colors truncate">{task.description}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[9px] uppercase tracking-wider font-black text-slate-400">Status: {task.status}</span>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                  <kbd className="px-1.5 py-0.5 rounded border border-slate-200 bg-white font-mono">↑↓</kbd>
                  <span>to navigate</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                  <kbd className="px-1.5 py-0.5 rounded border border-slate-200 bg-white font-mono">Enter</kbd>
                  <span>to select</span>
                </div>
              </div>
              <div className="text-[10px] text-slate-400">
                Press <kbd className="px-1.5 py-0.5 rounded border border-slate-200 bg-white font-mono">Esc</kbd> to close
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
