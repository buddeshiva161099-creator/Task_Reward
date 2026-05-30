'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, X, Users, ClipboardList, Building2, Command } from 'lucide-react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

interface SearchResults {
  employees: { id: string; name: string; role: string; company_id: string }[];
  tasks: { id: string; title: string; status: string }[];
  companies: { id: string; name: string }[];
}

type ResultType = 'employee' | 'task' | 'company';

export default function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>({ employees: [], tasks: [], companies: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();

  const flatResults = useMemo(() => {
    return [
      ...results.employees.map(e => ({ ...e, type: 'employee' as const })),
      ...results.companies.map(c => ({ ...c, type: 'company' as const })),
      ...results.tasks.map(t => ({ ...t, type: 'task' as const })),
    ];
  }, [results]);

  const handleNavigate = useCallback((type: ResultType, id: string) => {
    setIsOpen(false);
    setQuery('');
    setResults({ employees: [], tasks: [], companies: [] });
    setSelectedIndex(0);

    switch (type) {
      case 'employee':
        router.push(`/admin/employees?id=${id}`);
        break;
      case 'task':
        router.push(`/admin/tasks?id=${id}`);
        break;
      case 'company':
        router.push(`/admin/companies?id=${id}`);
        break;
    }
  }, [router]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setQuery('');
        setResults({ employees: [], tasks: [], companies: [] });
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
    const search = async () => {
      if (query.length < 2) {
        setResults({ employees: [], tasks: [], companies: [] });
        return;
      }

      setIsLoading(true);
      try {
        const response = await api.get(`/search/global?q=${query}`);
        setResults(response.data);
        setSelectedIndex(0);
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setIsLoading(false);
      }
    };

    const debounce = setTimeout(search, 300);
    return () => clearTimeout(debounce);
  }, [query]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (flatResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % flatResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + flatResults.length) % flatResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = flatResults[selectedIndex];
      if (selected) {
        handleNavigate(selected.type, selected.id);
      }
    }
  };

  return (
    <>
      <button
        onClick={() => {
          setQuery('');
          setResults({ employees: [], tasks: [], companies: [] });
          setSelectedIndex(0);
          setIsOpen(true);
        }}
        className="flex items-center gap-3 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl transition-all w-full max-w-md group"
      >
        <Search className="w-4 h-4 group-hover:text-indigo-600 transition-colors" />
        <span className="text-sm font-medium flex-1 text-left">Search anything...</span>
        <div className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[10px] font-bold">Ctrl</kbd>
          <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[10px] font-bold">K</kbd>
        </div>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
            onClick={() => setIsOpen(false)}
          />
          
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl relative overflow-hidden flex flex-col max-h-[70vh] ring-1 ring-slate-200">
            <div className="p-4 border-b border-slate-100 flex items-center gap-4">
              <Search className="w-5 h-5 text-slate-400" />
              <input
                autoFocus
                className="flex-1 bg-transparent border-none outline-none text-slate-900 placeholder:text-slate-400 text-lg"
                placeholder="Search employees, tasks, companies..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
              />
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {query.length > 0 && query.length < 2 && (
                <div className="p-8 text-center">
                  <p className="text-slate-500 text-sm">Type at least 2 characters to search...</p>
                </div>
              )}

              {query.length >= 2 && flatResults.length === 0 && !isLoading && (
                <div className="p-8 text-center">
                  <p className="text-slate-500 text-sm">No results found for &quot;{query}&quot;</p>
                </div>
              )}

              {flatResults.length > 0 && (
                <div className="space-y-4 p-2">
                  {results.employees.length > 0 && (
                    <div>
                      <h3 className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Employees</h3>
                      <div className="space-y-1">
                        {results.employees.map((emp) => {
                          const flatIndex = flatResults.findIndex(f => f.type === 'employee' && f.id === emp.id);
                          const isSelected = flatIndex === selectedIndex;
                          return (
                            <button
                              key={emp.id}
                              onClick={() => handleNavigate('employee', emp.id)}
                              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-left group ${
                                isSelected ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-slate-50'
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                                isSelected ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'
                              }`}>
                                <Users className="w-4 h-4" />
                              </div>
                              <div>
                                <p className={`text-sm font-bold ${isSelected ? 'text-indigo-900' : 'text-slate-700'}`}>{emp.name}</p>
                                <p className="text-[10px] text-slate-500">{emp.role}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {results.companies.length > 0 && (
                    <div>
                      <h3 className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Companies</h3>
                      <div className="space-y-1">
                        {results.companies.map((comp) => {
                          const flatIndex = flatResults.findIndex(f => f.type === 'company' && f.id === comp.id);
                          const isSelected = flatIndex === selectedIndex;
                          return (
                            <button
                              key={comp.id}
                              onClick={() => handleNavigate('company', comp.id)}
                              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-left group ${
                                isSelected ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-slate-50'
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                                isSelected ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'
                              }`}>
                                <Building2 className="w-4 h-4" />
                              </div>
                              <div>
                                <p className={`text-sm font-bold ${isSelected ? 'text-indigo-900' : 'text-slate-700'}`}>{comp.name}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {results.tasks.length > 0 && (
                    <div>
                      <h3 className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Tasks</h3>
                      <div className="space-y-1">
                        {results.tasks.map((task) => {
                          const flatIndex = flatResults.findIndex(f => f.type === 'task' && f.id === task.id);
                          const isSelected = flatIndex === selectedIndex;
                          return (
                            <button
                              key={task.id}
                              onClick={() => handleNavigate('task', task.id)}
                              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-left group ${
                                isSelected ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-slate-50'
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                                isSelected ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'
                              }`}>
                                <ClipboardList className="w-4 h-4" />
                              </div>
                              <div>
                                <p className={`text-sm font-bold ${isSelected ? 'text-indigo-900' : 'text-slate-700'}`}>{task.title}</p>
                                <p className="text-[10px] text-slate-500 capitalize">{task.status}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[10px] font-bold shadow-sm">
                    <Command className="w-2.5 h-2.5" />
                  </kbd>
                  <span className="text-[10px] font-medium text-slate-500">Search</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex gap-0.5">
                    <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[10px] font-bold shadow-sm">↑</kbd>
                    <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[10px] font-bold shadow-sm">↓</kbd>
                  </div>
                  <span className="text-[10px] font-medium text-slate-500">Navigate</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[10px] font-bold shadow-sm">↵</kbd>
                  <span className="text-[10px] font-medium text-slate-500">Select</span>
                </div>
              </div>
              <p className="text-[10px] font-medium text-slate-400">Press Esc to close</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
