import React, { useState } from 'react';
import { User, Phone, Mail, Calendar, HeartHandshake, CheckCircle2, ArrowRight, ShieldCheck, Dumbbell, AlertCircle, ArrowLeft } from 'lucide-react';
import { Profile, Member } from '../types';
import { isValidIndianMobile, normalizeIndianPhone } from '../lib/phoneUtils';
import { toast } from '../lib/toast';

interface ClientHandoverFormProps {
  currentTrainer: Profile;
  onSubmitSuccess: (newMember: Member) => void;
  onExitHandoverMode?: () => void;
}

export const ClientHandoverForm: React.FC<ClientHandoverFormProps> = ({
  currentTrainer,
  onSubmitSuccess,
  onExitHandoverMode
}) => {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other' | 'Prefer not to say' | ''>('');
  const [email, setEmail] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [notes, setNotes] = useState('');

  const [errors, setErrors] = useState<{ fullName?: string; phone?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedMember, setSubmittedMember] = useState<Member | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: { fullName?: string; phone?: string } = {};

    if (!fullName.trim()) {
      newErrors.fullName = 'Please enter your full name.';
    }

    const cleanPhone = normalizeIndianPhone(phone);
    if (!phone.trim()) {
      newErrors.phone = 'Phone number is mandatory.';
    } else if (!isValidIndianMobile(phone)) {
      newErrors.phone = 'Please enter a valid 10-digit mobile number (e.g. 9876543210).';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          phone: cleanPhone,
          age: age ? parseInt(age) : undefined,
          gender: gender || undefined,
          email: email.trim() || undefined,
          emergency_contact: emergencyContact.trim() || undefined,
          notes: notes.trim() || undefined,
          onboarded_by: currentTrainer.id
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save client record');
      }

      const member: Member = await response.json();
      setSubmittedMember(member);
      onSubmitSuccess(member);
    } catch (err) {
      console.error(err);
      toast.error('Unable to submit form. Please check network connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setFullName('');
    setPhone('');
    setAge('');
    setGender('');
    setEmail('');
    setEmergencyContact('');
    setNotes('');
    setSubmittedMember(null);
  };

  if (submittedMember) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="bg-zinc-900 border-2 border-emerald-500/50 rounded-3xl p-6 sm:p-10 max-w-lg w-full text-center shadow-2xl shadow-emerald-950/40 relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-emerald-500/10 rounded-full blur-2xl"></div>
          
          <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6 ring-8 ring-emerald-500/10 animate-bounce">
            <CheckCircle2 className="w-12 h-12" />
          </div>

          <h2 className="text-3xl font-extrabold text-white tracking-tight mb-2">
            Welcome to Pulse Fitness!
          </h2>
          <p className="text-emerald-400 font-semibold text-lg mb-6">
            Registration Submitted Successfully
          </p>

          <div className="bg-zinc-950/80 border border-zinc-800 rounded-2xl p-5 mb-8 text-left space-y-3">
            <div className="flex justify-between items-center text-sm border-b border-zinc-800/80 pb-2">
              <span className="text-zinc-400">Name:</span>
              <span className="text-white font-bold">{submittedMember.full_name}</span>
            </div>
            <div className="flex justify-between items-center text-sm border-b border-zinc-800/80 pb-2">
              <span className="text-zinc-400">Phone:</span>
              <span className="text-white font-mono font-bold">+91 {submittedMember.phone}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-zinc-400">Onboarding Trainer:</span>
              <span className="text-amber-400 font-bold">{currentTrainer.full_name}</span>
            </div>
          </div>

          <div className="bg-amber-950/30 border border-amber-800/50 rounded-xl p-4 mb-8 text-amber-300 text-sm text-center">
            👉 Please hand the phone back to your trainer <strong>{currentTrainer.full_name}</strong> to finalize your membership plan.
          </div>

          <div className="space-y-3">
            <button
              onClick={handleReset}
              className="w-full py-4 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-bold text-lg rounded-2xl shadow-lg shadow-red-600/30 transition-all flex items-center justify-center space-x-2"
            >
              <span>Onboard Another Client</span>
              <ArrowRight className="w-5 h-5" />
            </button>

            {onExitHandoverMode && (
              <button
                onClick={onExitHandoverMode}
                className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-sm rounded-xl transition-all"
              >
                Back to Trainer Dashboard
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      
      {/* Handover Banner */}
      <div className="bg-gradient-to-r from-red-950/80 via-zinc-900 to-zinc-900 border-2 border-red-500/40 rounded-3xl p-6 mb-8 text-white shadow-xl relative overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-red-600 rounded-2xl text-white shadow-md">
              <Dumbbell className="w-8 h-8 transform -rotate-12" />
            </div>
            <div>
              <span className="text-xs font-bold text-red-400 tracking-wider uppercase">CLIENT REGISTRATION</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Pulse Fitness Gym</h1>
            </div>
          </div>

          {onExitHandoverMode && (
            <button
              onClick={onExitHandoverMode}
              className="flex items-center space-x-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-xs font-semibold text-zinc-300 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Trainer View</span>
            </button>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-zinc-800 flex items-center justify-between text-sm">
          <div className="flex items-center space-x-2 text-zinc-300">
            <User className="w-4 h-4 text-amber-400" />
            <span>Assigned Trainer: <strong className="text-white">{currentTrainer.full_name}</strong></span>
          </div>
          <span className="px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full text-xs font-semibold">
            Handover Form
          </span>
        </div>
      </div>

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
        <div className="border-b border-zinc-800 pb-4">
          <h2 className="text-xl font-extrabold text-white">Enter Your Details</h2>
          <p className="text-sm text-zinc-400">Fill in your contact information below to get started with your gym trial or membership.</p>
        </div>

        {/* Full Name */}
        <div>
          <label className="block text-sm sm:text-base font-bold text-zinc-200 mb-2">
            Full Name <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <User className="w-6 h-6 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="e.g. Rahul Sharma"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={`w-full bg-zinc-950 text-white pl-13 pr-4 py-4 rounded-2xl border-2 ${
                errors.fullName ? 'border-red-500 focus:ring-red-500' : 'border-zinc-800 focus:border-red-500'
              } text-lg font-medium focus:outline-none transition-all placeholder:text-zinc-400`}
            />
          </div>
          {errors.fullName && (
            <p className="text-red-400 text-xs mt-2 flex items-center space-x-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{errors.fullName}</span>
            </p>
          )}
        </div>

        {/* Phone Number */}
        <div>
          <label className="block text-sm sm:text-base font-bold text-zinc-200 mb-2">
            Mobile Number <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center space-x-2 text-zinc-400 font-bold text-lg border-r border-zinc-800 pr-3">
              <Phone className="w-5 h-5 text-red-500" />
              <span>+91</span>
            </div>
            <input
              type="tel"
              placeholder="9876543210"
              maxLength={13}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={`w-full bg-zinc-950 text-white pl-28 pr-4 py-4 rounded-2xl border-2 ${
                errors.phone ? 'border-red-500 focus:ring-red-500' : 'border-zinc-800 focus:border-red-500'
              } text-lg font-mono font-medium focus:outline-none transition-all placeholder:text-zinc-400`}
            />
          </div>
          {errors.phone ? (
            <p className="text-red-400 text-xs mt-2 flex items-center space-x-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{errors.phone}</span>
            </p>
          ) : (
            <p className="text-zinc-400 text-xs mt-1">10-digit Indian mobile number for gym updates & member pass</p>
          )}
        </div>

        {/* Grid for Age & Gender */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          
          {/* Age */}
          <div>
            <label className="block text-sm font-semibold text-zinc-300 mb-2">
              Age <span className="text-zinc-400">(Optional)</span>
            </label>
            <div className="relative">
              <Calendar className="w-5 h-5 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="number"
                placeholder="e.g. 25"
                min={10}
                max={99}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="w-full bg-zinc-950 text-white pl-12 pr-4 py-3.5 rounded-2xl border-2 border-zinc-800 focus:border-red-500 text-base font-medium focus:outline-none transition-all placeholder:text-zinc-400"
              />
            </div>
          </div>

          {/* Gender */}
          <div>
            <label className="block text-sm font-semibold text-zinc-300 mb-2">
              Gender <span className="text-zinc-400">(Optional)</span>
            </label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value as any)}
              className="w-full bg-zinc-950 text-white px-4 py-3.5 rounded-2xl border-2 border-zinc-800 focus:border-red-500 text-base font-medium focus:outline-none transition-all cursor-pointer"
            >
              <option value="">Select Gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </div>
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-semibold text-zinc-300 mb-2">
            Email Address <span className="text-zinc-400">(Optional)</span>
          </label>
          <div className="relative">
            <Mail className="w-5 h-5 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="email"
              placeholder="e.g. client@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-zinc-950 text-white pl-12 pr-4 py-3.5 rounded-2xl border-2 border-zinc-800 focus:border-red-500 text-base font-medium focus:outline-none transition-all placeholder:text-zinc-400"
            />
          </div>
        </div>

        {/* Emergency Contact */}
        <div>
          <label className="block text-sm font-semibold text-zinc-300 mb-2">
            Emergency Contact Number <span className="text-zinc-400">(Optional)</span>
          </label>
          <div className="relative">
            <HeartHandshake className="w-5 h-5 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Family / Friend contact & relationship"
              value={emergencyContact}
              onChange={(e) => setEmergencyContact(e.target.value)}
              className="w-full bg-zinc-950 text-white pl-12 pr-4 py-3.5 rounded-2xl border-2 border-zinc-800 focus:border-red-500 text-base font-medium focus:outline-none transition-all placeholder:text-zinc-400"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-semibold text-zinc-300 mb-2">
            Fitness Goals / Health Notes <span className="text-zinc-400">(Optional)</span>
          </label>
          <textarea
            rows={2}
            placeholder="e.g. Weight loss, posture improvement, past injuries..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-zinc-950 text-white p-4 rounded-2xl border-2 border-zinc-800 focus:border-red-500 text-base font-medium focus:outline-none transition-all placeholder:text-zinc-400"
          ></textarea>
        </div>

        {/* DPDP Consent */}
        <div className="flex items-start space-x-3 bg-zinc-950/60 p-4 rounded-2xl border border-zinc-800 text-xs text-zinc-400">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <p>
            By tapping Submit, you agree that Pulse Fitness Gyms may securely store your contact details for membership service, workout updates, and official communications in accordance with privacy guidelines.
          </p>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-5 bg-gradient-to-r from-red-600 via-red-500 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white font-extrabold text-xl rounded-2xl shadow-xl shadow-red-600/30 transition-all flex items-center justify-center space-x-3 transform active:scale-[0.98] disabled:opacity-50"
        >
          {isSubmitting ? (
            <span>Saving Registration...</span>
          ) : (
            <>
              <span>SAVE / SUBMIT REGISTRATION</span>
              <ArrowRight className="w-6 h-6" />
            </>
          )}
        </button>
      </form>
    </div>
  );
};
