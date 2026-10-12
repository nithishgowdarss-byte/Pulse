// src/components/branch/DltTemplateManagerSection.tsx
import React, { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  CheckCircle2,
  XCircle,
  Tag,
  Code,
  Sparkles,
  HelpCircle,
  Copy,
  Check
} from 'lucide-react';
import { Branch, Profile } from '../../types';
import { DltTemplate, DltPurpose, DLT_PURPOSE_LABELS, DltVariable } from '../../types/dlt';
import { toast } from '../../lib/toast';

interface DltTemplateManagerSectionProps {
  branch: Branch;
  currentProfile: Profile;
}

export const DltTemplateManagerSection: React.FC<DltTemplateManagerSectionProps> = ({
  branch,
  currentProfile,
}) => {
  const [templates, setTemplates] = useState<DltTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterPurpose, setFilterPurpose] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<{
    name: string;
    purpose: DltPurpose;
    msg91_template_id: string;
    sender_id: string;
    sample_body: string;
    variables: { key: string; label: string }[];
    scope: 'org' | 'branch';
  }>({
    name: '',
    purpose: 'expiry_7d',
    msg91_template_id: '',
    sender_id: 'PULSEF',
    sample_body: '',
    variables: [
      { key: 'VAR1', label: 'first_name' },
      { key: 'VAR2', label: 'end_date' },
    ],
    scope: 'branch',
  });
  const [isSaving, setIsSaving] = useState(false);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dlt-templates?branch_id=${branch.id}`);
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
    } catch (e) {
      console.error('Error fetching DLT templates:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [branch.id]);

  const handleToggleActive = async (template: DltTemplate) => {
    try {
      const res = await fetch(`/api/dlt-templates/${template.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !template.is_active }),
      });

      if (res.ok) {
        toast.success(
          template.is_active ? 'Template Deactivated' : 'Template Activated',
          {
            description: `${template.name} is now ${
              !template.is_active ? 'available' : 'disabled'
            } for automated SMS triggers.`,
          }
        );
        fetchTemplates();
      }
    } catch (e) {
      toast.error('Failed to update template status');
    }
  };

  const handleAddVariable = () => {
    const nextIndex = formData.variables.length + 1;
    setFormData({
      ...formData,
      variables: [
        ...formData.variables,
        { key: `VAR${nextIndex}`, label: 'custom_param' },
      ],
    });
  };

  const handleRemoveVariable = (index: number) => {
    setFormData({
      ...formData,
      variables: formData.variables.filter((_, i) => i !== index),
    });
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.msg91_template_id) {
      toast.error('Please specify template name and MSG91 Flow ID');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/dlt-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch_id: formData.scope === 'branch' ? branch.id : null,
          name: formData.name.trim(),
          purpose: formData.purpose,
          msg91_template_id: formData.msg91_template_id.trim(),
          sender_id: formData.sender_id.trim().toUpperCase(),
          variable_schema: formData.variables,
          sample_body: formData.sample_body.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to save DLT template');
      }

      toast.success('DLT Template Registered', {
        description: `Template ${formData.name} linked for ${formData.purpose}`,
      });
      setShowAddModal(false);
      setFormData({
        name: '',
        purpose: 'expiry_7d',
        msg91_template_id: '',
        sender_id: 'PULSEF',
        sample_body: '',
        variables: [
          { key: 'VAR1', label: 'first_name' },
          { key: 'VAR2', label: 'end_date' },
        ],
        scope: 'branch',
      });
      fetchTemplates();
    } catch (err: any) {
      toast.error(err.message || 'Error saving template');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredTemplates = templates.filter((t) => {
    if (filterPurpose !== 'all' && t.purpose !== filterPurpose) return false;
    return true;
  });

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.info('Copied Template ID to clipboard');
  };

  return (
    <div className="p-5 bg-zinc-950 rounded-2xl border border-zinc-800 space-y-4">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div className="flex items-center space-x-2">
          <FileText className="w-4 h-4 text-indigo-400" />
          <h5 className="text-xs font-black text-white uppercase tracking-wider">
            DLT Approved Message Templates ({branch.name})
          </h5>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterPurpose}
            onChange={(e) => setFilterPurpose(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-[11px] font-bold rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Campaign Purposes</option>
            {Object.entries(DLT_PURPOSE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Template</span>
          </button>
        </div>
      </div>

      <p className="text-[11px] text-zinc-400 leading-relaxed">
        Templates must be pre-approved on your Telecom DLT portal (Jio/Airtel/Vil) and registered in MSG91. Active templates are resolved automatically during batch campaigns.
      </p>

      {/* Template Cards List */}
      <div className="space-y-3">
        {filteredTemplates.length === 0 ? (
          <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl text-center space-y-2">
            <Tag className="w-6 h-6 text-zinc-400 mx-auto" />
            <div className="text-xs text-zinc-400 font-bold">No DLT templates registered for this filter</div>
            <div className="text-[10px] text-zinc-400">
              Click &quot;Add Template&quot; to link your approved MSG91 flow IDs.
            </div>
          </div>
        ) : (
          filteredTemplates.map((tpl) => (
            <div
              key={tpl.id}
              className={`p-3.5 bg-zinc-900/70 border rounded-2xl transition-all space-y-2.5 ${
                tpl.is_active ? 'border-zinc-800' : 'border-zinc-800/40 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black text-white">{tpl.name}</span>
                    <span className="px-2 py-0.5 bg-indigo-950 text-indigo-300 border border-indigo-800/80 rounded-md text-[9px] font-bold uppercase">
                      {DLT_PURPOSE_LABELS[tpl.purpose] || tpl.purpose}
                    </span>
                    {tpl.branch_id === null ? (
                      <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded-md text-[9px] font-bold">
                        Org-Wide Default
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 border border-emerald-800/60 rounded-md text-[9px] font-bold">
                        Branch Specific
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-[10px] text-zinc-400 font-mono">
                    <span className="flex items-center gap-1">
                      <span>ID:</span>
                      <strong className="text-zinc-200">{tpl.msg91_template_id}</strong>
                      <button
                        onClick={() => copyToClipboard(tpl.msg91_template_id, tpl.id)}
                        className="hover:text-white ml-0.5"
                      >
                        {copiedId === tpl.id ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </span>
                    <span>Sender: <strong>{tpl.sender_id || 'PULSEF'}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleToggleActive(tpl)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 border transition-colors ${
                      tpl.is_active
                        ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300 hover:bg-emerald-900/60'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700'
                    }`}
                  >
                    {tpl.is_active ? (
                      <>
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>Active</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3 h-3 text-zinc-400" />
                        <span>Inactive</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Sample Body / Preview */}
              {tpl.sample_body && (
                <div className="p-2.5 bg-zinc-950/80 border border-zinc-800/80 rounded-xl text-[11px] text-zinc-300 font-sans leading-relaxed">
                  {tpl.sample_body}
                </div>
              )}

              {/* Variable Schema Chips */}
              {tpl.variable_schema && tpl.variable_schema.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <span className="text-[9px] uppercase font-bold text-zinc-400 flex items-center gap-1">
                    <Code className="w-3 h-3" />
                    <span>Schema:</span>
                  </span>
                  {tpl.variable_schema.map((v, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-md text-[10px] font-mono"
                    >
                      {v.key} <span className="text-zinc-400">&rarr;</span> {v.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add Template Modal */}
      {showAddModal && (
        <div className="p-4 bg-zinc-900 border border-indigo-500/30 rounded-2xl space-y-3.5 mt-3 animate-in fade-in">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <h6 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Register Approved DLT Template</span>
            </h6>
            <button
              onClick={() => setShowAddModal(false)}
              className="text-zinc-400 hover:text-zinc-300 text-xs"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSaveTemplate} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">
                  Template Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 7-Day Renewal WhatsApp/SMS"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">
                  Campaign Purpose *
                </label>
                <select
                  value={formData.purpose}
                  onChange={(e) =>
                    setFormData({ ...formData, purpose: e.target.value as DltPurpose })
                  }
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  {Object.entries(DLT_PURPOSE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">
                  MSG91 Flow / Template ID *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 654a1b2c3d4e5f6g7h8i9j0k"
                  value={formData.msg91_template_id}
                  onChange={(e) =>
                    setFormData({ ...formData, msg91_template_id: e.target.value })
                  }
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">
                  Sender ID
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={formData.sender_id}
                  onChange={(e) =>
                    setFormData({ ...formData, sender_id: e.target.value.toUpperCase() })
                  }
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono uppercase"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">
                Sample Approved Body Text
              </label>
              <textarea
                rows={2}
                placeholder="Hi {#VAR1#}, your Pulse membership ends on {#VAR2#}. Renew today!"
                value={formData.sample_body}
                onChange={(e) => setFormData({ ...formData, sample_body: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            {/* Variable Schema Builder */}
            <div className="space-y-2 p-3 bg-zinc-950 border border-zinc-800 rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-zinc-400 uppercase">
                  Variable Mapping Schema
                </span>
                <button
                  type="button"
                  onClick={handleAddVariable}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Variable</span>
                </button>
              </div>

              <div className="space-y-2">
                {formData.variables.map((v, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="VAR1"
                      value={v.key}
                      onChange={(e) => {
                        const updated = [...formData.variables];
                        updated[i].key = e.target.value;
                        setFormData({ ...formData, variables: updated });
                      }}
                      className="w-24 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-white font-mono"
                    />
                    <span className="text-zinc-400">&rarr;</span>
                    <input
                      type="text"
                      placeholder="first_name | end_date | discount"
                      value={v.label}
                      onChange={(e) => {
                        const updated = [...formData.variables];
                        updated[i].label = e.target.value;
                        setFormData({ ...formData, variables: updated });
                      }}
                      className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-white"
                    />
                    {formData.variables.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveVariable(i)}
                        className="text-zinc-400 hover:text-rose-400 px-1 text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-3.5 py-1.5 bg-zinc-800 text-zinc-300 rounded-xl text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !formData.name || !formData.msg91_template_id}
                className={`px-4 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-md ${
                  isSaving || !formData.name || !formData.msg91_template_id
                    ? 'bg-zinc-800 text-zinc-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                }`}
              >
                <span>{isSaving ? 'Registering...' : 'Save DLT Template'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
