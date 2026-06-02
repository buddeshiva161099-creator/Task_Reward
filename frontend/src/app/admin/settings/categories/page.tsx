'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Category } from '@/types';
import {
  Tag, Plus, X, Pencil, Trash2, Loader2, CheckCircle2, Palette
} from 'lucide-react';
import { CardSkeleton } from '@/components/SkeletonLoaders';

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  '#6b7280', '#0ea5e9', '#d946ef', '#f43f5e', '#84cc16',
];

export default function CategoriesSettingsPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', color: '#6366f1' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchCategories = useCallback(async () => {
    try {
      const res = await api.get('/categories');
      setCategories(res.data);
    } catch (err) {
      console.error('Failed to fetch categories:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', color: '#6366f1' });
    setError('');
    setShowModal(true);
  };

  const openEdit = (cat: Category) => {
    setEditing(cat);
    setForm({ name: cat.name, color: cat.color });
    setError('');
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await api.put(`/categories/${editing.id}`, form);
      } else {
        await api.post('/categories', form);
      }
      setShowModal(false);
      fetchCategories();
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } } };
      setError(axiosError.response?.data?.detail || 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (cat: Category) => {
    try {
      await api.put(`/categories/${cat.id}`, { is_active: !cat.is_active });
      fetchCategories();
    } catch (err) {
      console.error('Failed to toggle category:', err);
    }
  };

  const handleDelete = async (cat: Category) => {
    if (!confirm(`Delete category "${cat.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/categories/${cat.id}`);
      fetchCategories();
    } catch (err) {
      console.error('Failed to delete category:', err);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {[...Array(6)].map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Category Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Create and manage task categories for organized workflows</p>
        </div>
        <button onClick={openCreate} className="btn btn-primary h-11 rounded-xl shadow-xl shadow-indigo-100 px-6">
          <Plus className="w-4 h-4 mr-2" /> New Category
        </button>
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {categories.map((cat) => (
          <div key={cat.id} className="glass rounded-2xl p-6 border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all duration-300">
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -mr-16 -mt-16 opacity-20" style={{ backgroundColor: cat.color }} />
            
            <div className="flex items-start justify-between mb-4 relative">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center border" style={{ backgroundColor: cat.color + '15', borderColor: cat.color + '30' }}>
                  <Tag className="w-5 h-5" style={{ color: cat.color }} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">{cat.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="w-3 h-3 rounded-full border" style={{ backgroundColor: cat.color, borderColor: cat.color }} />
                    <span className={`text-[10px] font-black uppercase tracking-widest ${cat.is_active ? 'text-emerald-500' : 'text-slate-400'}`}>
                      {cat.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
              <button onClick={() => openEdit(cat)} className="btn btn-ghost text-xs flex-1 h-9 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
              </button>
              <button onClick={() => handleToggle(cat)} className={`btn btn-ghost text-xs flex-1 h-9 rounded-lg transition-colors ${cat.is_active ? 'hover:bg-amber-50 hover:text-amber-600' : 'hover:bg-emerald-50 hover:text-emerald-600'}`}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> {cat.is_active ? 'Disable' : 'Enable'}
              </button>
              <button onClick={() => handleDelete(cat)} className="btn btn-ghost text-xs h-9 rounded-lg px-3 hover:bg-rose-50 hover:text-rose-600 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}

        {categories.length === 0 && (
          <div className="col-span-full text-center py-20">
            <Tag className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-400 mb-1">No Categories Yet</h3>
            <p className="text-sm text-slate-400 mb-6">Create your first category to organize tasks</p>
            <button onClick={openCreate} className="btn btn-primary h-10 rounded-xl px-6">
              <Plus className="w-4 h-4 mr-2" /> Create Category
            </button>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: form.color + '15' }}>
                  <Tag className="w-6 h-6" style={{ color: form.color }} />
                </div>
                <h2 className="text-xl font-bold text-slate-900">{editing ? 'Edit Category' : 'New Category'}</h2>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            {error && (
              <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm font-medium">{error}</div>
            )}

            <form onSubmit={handleSave} className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Category Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input h-12 text-base"
                  placeholder="e.g. Development, Marketing, Design..."
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-3 uppercase tracking-wide">
                  <Palette className="w-4 h-4 text-indigo-500" /> Color
                </label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setForm({ ...form, color })}
                      className={`w-9 h-9 rounded-xl transition-all duration-200 border-2 ${form.color === color ? 'scale-110 shadow-lg ring-2 ring-offset-2' : 'hover:scale-105 border-transparent'}`}
                      style={{ backgroundColor: color, borderColor: form.color === color ? color : 'transparent' }}
                    />
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-400 uppercase">Custom:</label>
                  <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="w-8 h-8 rounded-lg cursor-pointer border-0" />
                  <span className="text-xs font-mono text-slate-500">{form.color}</span>
                </div>
              </div>

              <div className="flex gap-4 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary flex-1 h-12 rounded-xl">Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary flex-1 h-12 rounded-xl shadow-xl shadow-indigo-100">
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <>{editing ? 'Update' : 'Create'} Category</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
