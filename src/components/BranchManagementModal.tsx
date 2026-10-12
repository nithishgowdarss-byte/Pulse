import React, { useState } from 'react';
import { Branch, Profile } from '../types';
import { Building2, Plus, MapPin, Phone, Mail, FileText, Check, ShieldCheck } from 'lucide-react';
import { DltTemplateManagerSection } from './branch/DltTemplateManagerSection';

interface BranchManagementModalProps {
  currentProfile: Profile;
  branches: Branch[];
  activeBranchId: string;
  onSelectBranch: (branchId: string) => void;
  onRefreshBranches: () => void;
  onClose: () => void;
}

export const BranchManagementModal: React.FC<BranchManagementModalProps> = ({
  currentProfile,
  branches,
  activeBranchId,
  onSelectBranch,
  onRefreshBranches,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'branches' | 'dlt'>('branches');
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    city: '',
    address: '',
    phone: '',
    email: '',
    gst_number: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedBranchObj = branches.find(b => b.id === activeBranchId) || branches[0];

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.code || !formData.city || !formData.address || !formData.phone) {
      setError('Please fill in all mandatory branch details.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to create branch');
      }

      const created: Branch = await res.json();
      onRefreshBranches();
      onSelectBranch(created.id);
      setShowAddForm(false);
      setFormData({ name: '', code: '', city: '', address: '', phone: '', email: '', gst_number: '' });
    } catch (err: any) {
      setError(err.message || 'Error creating branch');
    } finally {
      setLoading(false);
    }
  };

  const isManagement = currentProfile.role === 'super_owner' || currentProfile.role === 'owner';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-2xl">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-white tracking-wide uppercase">
                Enterprise Multi-Branch Management
              </h3>
              <p className="text-xs text-zinc-400">
                Manage Gym Locations, Branch Details, and DLT Templates
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        {isManagement && (
          <div className="flex items-center gap-2 px-6 pt-3 border-b border-zinc-800 bg-zinc-950/40 text-xs font-bold">
            <button
              onClick={() => setActiveTab('branches')}
              className={`pb-3 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
                activeTab === 'branches'
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Branches ({branches.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('dlt')}
              className={`pb-3 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
                activeTab === 'dlt'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>DLT Templates</span>
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl text-xs flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="text-rose-300 font-bold">✕</button>
            </div>
          )}

          {activeTab === 'branches' && (
            <div className="space-y-6">
              {/* Add New Branch Button for Super Owners */}
              {currentProfile.role === 'super_owner' && !showAddForm && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="w-full py-3 border-2 border-dashed border-zinc-700 hover:border-indigo-500 text-zinc-300 hover:text-white rounded-2xl font-bold text-xs flex items-center justify-center space-x-2 transition-all"
                >
                  <Plus className="w-4 h-4 text-indigo-400" />
                  <span>Add New Gym Branch / Facility</span>
                </button>
              )}

              {/* Add Branch Inline Form */}
              {showAddForm && (
                <form onSubmit={handleCreateBranch} className="p-5 bg-zinc-950 rounded-2xl border border-zinc-800 space-y-4">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                    <h4 className="text-xs font-black text-white uppercase tracking-wider">
                      New Branch Onboarding
                    </h4>
                    <button
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      className="text-zinc-400 hover:text-zinc-300 text-xs font-bold"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Branch Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Pulse Fitness - Bandra West"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Branch Code (Unique) *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. BW02"
                        value={formData.code}
                        onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white font-mono uppercase focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">City *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Mumbai"
                        value={formData.city}
                        onChange={e => setFormData({ ...formData, city: e.target.value })}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Contact Phone *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. 9876543210"
                        value={formData.phone}
                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Full Facility Address *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. 4th Floor, Crystal Point Mall, Linking Road"
                        value={formData.address}
                        onChange={e => setFormData({ ...formData, address: e.target.value })}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Email Address</label>
                      <input
                        type="email"
                        placeholder="e.g. bandra@pulsefitness.com"
                        value={formData.email}
                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">GST Number (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. 27AAAAA0000A1Z5"
                        value={formData.gst_number}
                        onChange={e => setFormData({ ...formData, gst_number: e.target.value })}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-xl"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-xl shadow-lg transition-all"
                    >
                      {loading ? 'Creating Branch...' : 'Save & Register Branch'}
                    </button>
                  </div>
                </form>
              )}

              {/* Branch Cards List */}
              <div className="space-y-3">
                <h4 className="text-xs font-black text-zinc-400 uppercase tracking-wider">
                  Configured Branches ({branches.length})
                </h4>

                {branches.map(b => {
                  const isSelected = b.id === activeBranchId;
                  return (
                    <div
                      key={b.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        isSelected
                          ? 'bg-zinc-800/80 border-indigo-500 shadow-lg shadow-indigo-950/40 ring-1 ring-indigo-500/50'
                          : 'bg-zinc-950/60 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-black text-white">{b.name}</span>
                            <span className="px-2 py-0.5 bg-indigo-950 border border-indigo-800/80 text-indigo-300 rounded-md text-[10px] font-mono font-bold">
                              {b.code}
                            </span>
                            {isSelected && (
                              <span className="px-2 py-0.5 bg-emerald-950 border border-emerald-800 text-emerald-300 rounded-md text-[10px] font-bold">
                                Active Context
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400 pt-1">
                            <div className="flex items-center space-x-1">
                              <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                              <span>{b.city} — {b.address}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Phone className="w-3.5 h-3.5 text-zinc-400" />
                              <span>{b.phone}</span>
                            </div>
                            {b.email && (
                              <div className="flex items-center space-x-1">
                                <Mail className="w-3.5 h-3.5 text-zinc-400" />
                                <span>{b.email}</span>
                              </div>
                            )}
                            {b.gst_number && (
                              <div className="flex items-center space-x-1">
                                <FileText className="w-3.5 h-3.5 text-zinc-400" />
                                <span className="font-mono text-[11px]">GST: {b.gst_number}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col items-end space-y-2">
                          <button
                            onClick={() => onSelectBranch(b.id)}
                            className={`px-4 py-2 text-xs font-black rounded-xl border transition-all flex items-center space-x-1 ${
                              isSelected
                                ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                                : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5" />}
                            <span>{isSelected ? 'Active View' : 'Switch Context'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'dlt' && isManagement && selectedBranchObj && (
            <DltTemplateManagerSection
              branch={selectedBranchObj}
              currentProfile={currentProfile}
            />
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs text-zinc-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Multi-Tenant Data Isolation Active</span>
          </div>

          <button onClick={onClose} className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-xl">
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
