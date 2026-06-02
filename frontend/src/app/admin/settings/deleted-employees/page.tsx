'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Employee } from '@/types';
import { formatDate } from '@/lib/utils';
import {
  Trash2, RefreshCw, Loader2, AlertTriangle, Users, ShieldAlert, ArrowLeft, Check, X
} from 'lucide-react';
import Link from 'next/link';
import { TableSkeleton } from '@/components/SkeletonLoaders';

export default function DeletedEmployeesPage() {
  const [deletedEmployees, setDeletedEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Permanent Delete Modal State
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [typedName, setTypedName] = useState('');
  const [isPermanentDeleting, setIsPermanentDeleting] = useState(false);

  const fetchDeletedEmployees = useCallback(async () => {
    try {
      const res = await api.get('/admin/employees/deleted');
      setDeletedEmployees(res.data);
    } catch (err) {
      console.error('Failed to fetch deleted employees:', err);
      setError('Failed to load deleted employees.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeletedEmployees();
  }, [fetchDeletedEmployees]);

  const handleRestore = async (emp: Employee) => {
    if (!confirm(`Are you sure you want to restore employee "${emp.name}"?`)) return;
    setRestoringId(emp.id);
    setError('');
    setSuccess('');
    try {
      await api.post(`/admin/employees/${emp.id}/restore`);
      setSuccess(`Employee "${emp.name}" has been restored successfully.`);
      fetchDeletedEmployees();
    } catch (err: any) {
      console.error('Failed to restore employee:', err);
      setError(err.response?.data?.detail || 'Failed to restore employee.');
    } finally {
      setRestoringId(null);
    }
  };

  const openPermanentDeleteModal = (emp: Employee) => {
    setSelectedEmployee(emp);
    setTypedName('');
    setError('');
    setSuccess('');
  };

  const closePermanentDeleteModal = () => {
    setSelectedEmployee(null);
    setTypedName('');
  };

  const handlePermanentDelete = async () => {
    if (!selectedEmployee) return;
    if (typedName !== selectedEmployee.name) {
      alert('Verification name does not match.');
      return;
    }

    setIsPermanentDeleting(true);
    setError('');
    setSuccess('');
    try {
      await api.delete(`/admin/employees/${selectedEmployee.id}/permanent`);
      setSuccess(`Employee "${selectedEmployee.name}" and all associated data have been permanently deleted.`);
      closePermanentDeleteModal();
      fetchDeletedEmployees();
    } catch (err: any) {
      console.error('Failed to permanently delete employee:', err);
      setError(err.response?.data?.detail || 'Failed to permanently delete employee.');
    } finally {
      setIsPermanentDeleting(false);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
      case 'employee': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  if (loading) {
    return <TableSkeleton cols={4} rows={6} />;
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/admin/employees" className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Trash2 className="w-6 h-6 text-slate-500" />
              Deleted Employees
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              View soft-deleted employees, restore them to active status, or permanently purge their data.
            </p>
          </div>
        </div>
      </div>

      {success && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
          <Check className="w-4 h-4" />
          {success}
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Main Grid/Table */}
      <div className="glass rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-left text-sm min-w-[800px] lg:min-w-full">
          <thead className="bg-slate-50 text-muted-foreground font-medium border-b border-border">
            <tr>
              <th className="px-6 py-4">Employee</th>
              <th className="px-6 py-4">Role</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {deletedEmployees.map((emp) => (
              <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 font-bold text-sm">
                      {emp.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 leading-none">{emp.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">{emp.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getRoleBadge(emp.role)}`}>
                    {emp.role.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-rose-50 text-rose-600 border-rose-100">
                    Deleted (In Trash)
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleRestore(emp)}
                      disabled={restoringId === emp.id}
                      className="btn btn-secondary text-xs px-3 py-1.5 flex items-center gap-1 bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100"
                    >
                      {restoringId === emp.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      Restore
                    </button>
                    <button
                      onClick={() => openPermanentDeleteModal(emp)}
                      className="btn btn-danger text-xs px-3 py-1.5 flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Permanently
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {deletedEmployees.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-16 text-muted-foreground">
                  <div className="max-w-xs mx-auto text-center space-y-3">
                    <Users className="w-12 h-12 text-slate-300 mx-auto" />
                    <p className="font-bold text-slate-500">Trash Bin is Empty</p>
                    <p className="text-xs text-slate-400">There are no soft-deleted employees in the system.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Permanent Delete Confirmation Modal */}
      {selectedEmployee && (
        <div className="modal-overlay" onClick={closePermanentDeleteModal}>
          <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-6 text-rose-600">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center shadow-lg shadow-rose-100">
                <ShieldAlert className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900">Permanent Cascading Deletion</h2>
                <p className="text-[10px] font-black uppercase tracking-widest text-rose-500 mt-0.5">Critical Operation</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-xs leading-relaxed space-y-2">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  This action is completely IRREVERSIBLE!
                </p>
                <p>
                  Hard-deleting <strong>{selectedEmployee.name}</strong> will permanently remove them from the database, along with all associated:
                </p>
                <ul className="list-disc pl-4 space-y-0.5 font-semibold">
                  <li>Tasks & Assignments</li>
                  <li>Attendance & Punch Logs</li>
                  <li>Leave Requests & Balances</li>
                  <li>Payroll Runs & Salary Structures</li>
                  <li>Activity Logs & Notifications</li>
                </ul>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                  Type <span className="font-mono text-rose-600 font-bold">"{selectedEmployee.name}"</span> to confirm:
                </label>
                <input
                  type="text"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  className="input h-11 border-2 border-slate-200 focus:border-rose-500 transition-colors"
                  placeholder="Type exact employee name"
                  required
                />
              </div>

              <div className="flex gap-4 pt-2">
                <button
                  type="button"
                  onClick={closePermanentDeleteModal}
                  className="btn btn-secondary flex-1 h-12 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isPermanentDeleting || typedName !== selectedEmployee.name}
                  onClick={handlePermanentDelete}
                  className="btn btn-danger flex-1 h-12 rounded-xl shadow-xl shadow-rose-100 flex items-center justify-center gap-1 disabled:opacity-50"
                >
                  {isPermanentDeleting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Confirm Purge
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
