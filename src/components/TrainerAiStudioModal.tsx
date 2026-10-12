import React, { useState } from 'react';
import {
  Sparkles,
  Dumbbell,
  Utensils,
  Share2,
  Copy,
  Check,
  X,
  Send,
  Zap,
  Clock,
  Flame,
  ShieldAlert,
  ChevronRight,
  User,
  Heart
} from 'lucide-react';
import { Member, FreeLLMGymWorkoutPlan, FreeLLMGymDietPlan } from '../types';

interface TrainerAiStudioModalProps {
  members: Member[];
  trainerName: string;
  initialMember?: Member | null;
  onClose: () => void;
  onPlanSaved?: () => void;
}

export const TrainerAiStudioModal: React.FC<TrainerAiStudioModalProps> = ({
  members,
  trainerName,
  initialMember,
  onClose,
  onPlanSaved,
}) => {
  const [activeTab, setActiveTab] = useState<'workout' | 'nutrition'>('workout');
  const [selectedMemberId, setSelectedMemberId] = useState<string>(
    initialMember ? initialMember.id : members[0]?.id || ''
  );

  // Form states for workout
  const [workoutGoal, setWorkoutGoal] = useState('Muscle Hypertrophy & Tone');
  const [difficulty, setDifficulty] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Intermediate');
  const [daysPerWeek, setDaysPerWeek] = useState(4);
  const [injuries, setInjuries] = useState('');
  const [isGeneratingWorkout, setIsGeneratingWorkout] = useState(false);
  const [workoutPlan, setWorkoutPlan] = useState<FreeLLMGymWorkoutPlan | null>(null);

  // Form states for nutrition
  const [dietPreference, setDietPreference] = useState<'Vegetarian' | 'Non-Vegetarian' | 'Eggetarian' | 'Vegan'>('Vegetarian');
  const [targetGoal, setTargetGoal] = useState('Fat Loss & Lean Muscle');
  const [budgetLevel, setBudgetLevel] = useState<'Budget-Friendly' | 'Standard' | 'Premium'>('Standard');
  const [routineNotes, setRoutineNotes] = useState('Works in Tech park, sits 8 hrs/day, workouts at 6:30 PM');
  const [isGeneratingDiet, setIsGeneratingDiet] = useState(false);
  const [dietPlan, setDietPlan] = useState<FreeLLMGymDietPlan | null>(null);

  const [copied, setCopied] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const currentMember = members.find((m) => m.id === selectedMemberId);

  // Generate Workout
  const handleGenerateWorkout = async () => {
    try {
      setIsGeneratingWorkout(true);
      setWorkoutPlan(null);
      setSavedSuccess(false);

      const res = await fetch('/api/freellmapi/workout-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: currentMember?.id,
          memberName: currentMember?.full_name || 'Gym Member',
          age: currentMember?.age,
          gender: currentMember?.gender,
          goal: workoutGoal,
          difficulty,
          daysPerWeek,
          injuriesOrNotes: injuries,
          trainerName,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setWorkoutPlan(data);
        if (onPlanSaved) onPlanSaved();
      }
    } catch (e) {
      console.error('Failed to generate workout plan', e);
    } finally {
      setIsGeneratingWorkout(false);
    }
  };

  // Generate Diet
  const handleGenerateDiet = async () => {
    try {
      setIsGeneratingDiet(true);
      setDietPlan(null);
      setSavedSuccess(false);

      const res = await fetch('/api/freellmapi/diet-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: currentMember?.id,
          memberName: currentMember?.full_name || 'Gym Member',
          goal: targetGoal,
          dietaryPreference: dietPreference,
          budgetLevel,
          dailyRoutine: routineNotes,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setDietPlan(data);
        if (onPlanSaved) onPlanSaved();
      }
    } catch (e) {
      console.error('Failed to generate diet plan', e);
    } finally {
      setIsGeneratingDiet(false);
    }
  };

  // Share to WhatsApp
  const handleShareWhatsApp = () => {
    if (!currentMember?.phone) return;
    const cleanPhone = currentMember.phone.replace(/\D/g, '');
    const phoneWithCountry = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    let text = '';
    if (activeTab === 'workout' && workoutPlan) {
      text = `*Pulse Fitness - Your Custom Workout Protocol* 🏋️‍♂️%0A%0A`;
      text += `*Member:* ${currentMember.full_name}%0A`;
      text += `*Goal:* ${workoutPlan.goal} (${workoutPlan.daysPerWeek} Days/Week - ${workoutPlan.difficulty})%0A%0A`;
      workoutPlan.schedule.forEach((s) => {
        text += `*${s.day}* (${s.focus})%0A`;
        s.exercises.forEach((ex) => {
          text += `• ${ex.name}: ${ex.sets} sets x ${ex.reps} (${ex.rpeOrRest})%0A`;
        });
        text += `%0A`;
      });
      text += `_Designed by ${trainerName} via Pulse FreeLLMAPI_`;
    } else if (activeTab === 'nutrition' && dietPlan) {
      text = `*Pulse Fitness - High-Protein Nutrition Blueprint* 🥗%0A%0A`;
      text += `*Member:* ${currentMember.full_name}%0A`;
      text += `*Target:* ${dietPlan.targetCalories} kcal | ${dietPlan.proteinGrams}g Protein | ${dietPlan.hydrationGoalLitres}L Water%0A%0A`;
      dietPlan.meals.forEach((m) => {
        text += `*${m.mealTime}: ${m.name}*%0A`;
        m.options.forEach((opt) => {
          text += `• ${opt}%0A`;
        });
        text += `%0A`;
      });
      text += `_Nutrition Blueprint by Pulse Fitness Desk_`;
    }

    window.open(`https://wa.me/${phoneWithCountry}?text=${text}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden ring-1 ring-white/10">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-red-600 via-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-lg font-black text-white tracking-wide uppercase">
                  Trainer AI Studio
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-orange-500/20 border border-orange-500/40 text-orange-400 text-[10px] font-mono font-bold flex items-center gap-1">
                  <Zap className="w-3 h-3" /> Powered by FreeLLMAPI
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Design custom workout splits &amp; Indian macro diets for members in seconds at zero cost.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Member Selector Bar */}
        <div className="p-4 bg-zinc-900/40 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2">
            <User className="w-4 h-4 text-orange-400" />
            <span className="font-bold text-zinc-300 uppercase">Target Member:</span>
            <select
              value={selectedMemberId}
              onChange={(e) => setSelectedMemberId(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 text-white rounded-xl px-3 py-1.5 focus:outline-none focus:border-orange-500 font-bold"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name} ({m.package_type || 'General'} - {m.phone})
                </option>
              ))}
            </select>
          </div>

          {currentMember && (
            <div className="flex items-center space-x-3 text-[11px] text-zinc-400 font-mono">
              <span>Age: <strong className="text-white">{currentMember.age || 'N/A'}</strong></span>
              <span>•</span>
              <span>Gender: <strong className="text-white">{currentMember.gender || 'Athlete'}</strong></span>
              <span>•</span>
              <span>Branch: <strong className="text-white">{currentMember.branch_name?.replace('Pulse Fitness - ', '') || 'Pulse'}</strong></span>
            </div>
          )}
        </div>

        {/* Tab Selection */}
        <div className="flex items-center px-4 pt-3 border-b border-zinc-800 bg-zinc-950 gap-2 text-xs font-bold">
          <button
            onClick={() => setActiveTab('workout')}
            className={`pb-3 px-4 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'workout'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Dumbbell className="w-4 h-4" />
            <span>Workout Protocol Architect</span>
          </button>

          <button
            onClick={() => setActiveTab('nutrition')}
            className={`pb-3 px-4 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'nutrition'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Utensils className="w-4 h-4" />
            <span>Indian Nutrition &amp; Macro Planner</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5 text-xs">

          {/* TAB: WORKOUT */}
          {activeTab === 'workout' && (
            <div className="space-y-5">
              
              {/* Workout Config Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
                <div className="space-y-1">
                  <label className="font-bold text-zinc-400 uppercase text-[10px]">Fitness Goal</label>
                  <select
                    value={workoutGoal}
                    onChange={(e) => setWorkoutGoal(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-white focus:outline-none"
                  >
                    <option value="Muscle Hypertrophy & Tone">Muscle Hypertrophy &amp; Tone</option>
                    <option value="Rapid Fat Loss & Conditioning">Rapid Fat Loss &amp; Conditioning</option>
                    <option value="Max Strength & Powerlifting">Max Strength &amp; Powerlifting</option>
                    <option value="Athletic Speed & Agility">Athletic Speed &amp; Agility</option>
                    <option value="Senior Mobility & Joint Longevity">Senior Mobility &amp; Joint Longevity</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-zinc-400 uppercase text-[10px]">Experience Level</label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as any)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-white focus:outline-none"
                  >
                    <option value="Beginner">Beginner (0-6 months)</option>
                    <option value="Intermediate">Intermediate (1-3 years)</option>
                    <option value="Advanced">Advanced (3+ years)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-zinc-400 uppercase text-[10px]">Training Days / Week</label>
                  <select
                    value={daysPerWeek}
                    onChange={(e) => setDaysPerWeek(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-white focus:outline-none"
                  >
                    <option value={3}>3 Days (Full Body)</option>
                    <option value={4}>4 Days (Push / Pull / Legs / Upper)</option>
                    <option value={5}>5 Days (Bro Split or PPL Upper)</option>
                    <option value={6}>6 Days (PPL x 2 High Volume)</option>
                  </select>
                </div>

                <div className="sm:col-span-3 space-y-1 mt-1">
                  <label className="font-bold text-zinc-400 uppercase text-[10px]">
                    Injuries or Special Limitations
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Mild lower back stiffness, avoid heavy overhead pressing, tight hamstrings"
                    value={injuries}
                    onChange={(e) => setInjuries(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div className="sm:col-span-3 flex justify-end mt-2">
                  <button
                    onClick={handleGenerateWorkout}
                    disabled={isGeneratingWorkout}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 via-orange-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-extrabold uppercase tracking-wide flex items-center space-x-2 shadow-lg shadow-orange-600/30 transition-all disabled:opacity-50"
                  >
                    <Sparkles className={`w-4 h-4 ${isGeneratingWorkout ? 'animate-spin' : ''}`} />
                    <span>{isGeneratingWorkout ? 'Generating Protocol...' : 'Generate Workout Blueprint'}</span>
                  </button>
                </div>
              </div>

              {/* Generated Workout Plan Card */}
              {workoutPlan && (
                <div className="p-5 rounded-2xl bg-zinc-900 border border-orange-500/40 space-y-4 animate-in fade-in duration-200">
                  <div className="flex flex-wrap items-center justify-between border-b border-zinc-800 pb-3 gap-2">
                    <div>
                      <h3 className="text-base font-black text-white">{workoutPlan.title}</h3>
                      <div className="flex items-center space-x-2 text-zinc-400 text-xs mt-0.5">
                        <span className="text-orange-400 font-bold">{workoutPlan.daysPerWeek} Days/Week</span>
                        <span>•</span>
                        <span>{workoutPlan.difficulty}</span>
                        <span>•</span>
                        <span className="text-zinc-400 font-mono">Via FreeLLMAPI ({workoutPlan.modelUsed})</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={handleShareWhatsApp}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center space-x-1.5 shadow-md shadow-emerald-600/30 transition-colors"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        <span>Send on WhatsApp</span>
                      </button>

                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(JSON.stringify(workoutPlan, null, 2));
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className="p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                      >
                        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Day by Day Schedule */}
                  <div className="space-y-3">
                    {workoutPlan.schedule.map((dayItem, idx) => (
                      <div key={idx} className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-orange-400 text-xs uppercase tracking-wide">
                            {dayItem.day}
                          </span>
                          <span className="text-[11px] text-zinc-400 font-medium">{dayItem.focus}</span>
                        </div>

                        {/* Warmup */}
                        {dayItem.warmup && dayItem.warmup.length > 0 && (
                          <div className="text-[11px] text-zinc-400 flex items-center gap-1.5 flex-wrap">
                            <span className="text-zinc-400 font-bold">Warmup:</span>
                            {dayItem.warmup.map((w, wIdx) => (
                              <span key={wIdx} className="px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-300">
                                {w}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Exercise Table */}
                        <div className="space-y-1 mt-1">
                          {dayItem.exercises.map((ex, exIdx) => (
                            <div
                              key={exIdx}
                              className="flex items-center justify-between py-1 border-b border-zinc-900 text-xs"
                            >
                              <div className="flex items-center space-x-2">
                                <span className="w-5 h-5 rounded-md bg-zinc-900 text-zinc-400 text-[10px] font-mono flex items-center justify-center">
                                  {exIdx + 1}
                                </span>
                                <span className="font-bold text-white">{ex.name}</span>
                                {ex.notes && (
                                  <span className="text-[10px] text-zinc-400 italic hidden sm:inline">
                                    ({ex.notes})
                                  </span>
                                )}
                              </div>
                              <div className="font-mono text-zinc-300 text-right">
                                <span className="font-bold text-orange-300">{ex.sets} sets</span> × {ex.reps}{' '}
                                <span className="text-zinc-400 text-[10px]">({ex.rpeOrRest})</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Coach Tips */}
                  {workoutPlan.trainerTips && (
                    <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800 space-y-1">
                      <div className="font-bold text-zinc-300 text-[11px] uppercase tracking-wider">
                        Master Trainer Coaching Cues
                      </div>
                      <ul className="list-disc list-inside text-[11px] text-zinc-400 space-y-0.5">
                        {workoutPlan.trainerTips.map((tip, tIdx) => (
                          <li key={tIdx}>{tip}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB: NUTRITION */}
          {activeTab === 'nutrition' && (
            <div className="space-y-5">
              
              {/* Nutrition Form */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
                <div className="space-y-1">
                  <label className="font-bold text-zinc-400 uppercase text-[10px]">Dietary Style</label>
                  <select
                    value={dietPreference}
                    onChange={(e) => setDietPreference(e.target.value as any)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-white focus:outline-none"
                  >
                    <option value="Vegetarian">Vegetarian (Paneer, Soya, Sattu, Dal)</option>
                    <option value="Eggetarian">Eggetarian (Eggs + Veg staples)</option>
                    <option value="Non-Vegetarian">Non-Vegetarian (Chicken, Fish, Eggs)</option>
                    <option value="Vegan">Vegan (Plant-based, Tofu, Lentils)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-zinc-400 uppercase text-[10px]">Nutritional Goal</label>
                  <select
                    value={targetGoal}
                    onChange={(e) => setTargetGoal(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-white focus:outline-none"
                  >
                    <option value="Fat Loss & Lean Muscle">Fat Loss &amp; Lean Muscle (Deficit)</option>
                    <option value="Clean Bulk & Hypertrophy">Clean Bulk &amp; Hypertrophy (Surplus)</option>
                    <option value="Strength & Power Maintenance">Strength &amp; Maintenance</option>
                    <option value="Endurance & Performance">Endurance &amp; Stamina</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-zinc-400 uppercase text-[10px]">Budget &amp; Sourcing</label>
                  <select
                    value={budgetLevel}
                    onChange={(e) => setBudgetLevel(e.target.value as any)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-white focus:outline-none"
                  >
                    <option value="Standard">Standard (Local Bangalore Markets)</option>
                    <option value="Budget-Friendly">Budget-Friendly (Sattu, Chana, Eggs)</option>
                    <option value="Premium">Premium (Whey Isolate, Salmon, Avocados)</option>
                  </select>
                </div>

                <div className="sm:col-span-3 space-y-1 mt-1">
                  <label className="font-bold text-zinc-400 uppercase text-[10px]">
                    Daily Routine &amp; Work Hours
                  </label>
                  <input
                    type="text"
                    value={routineNotes}
                    onChange={(e) => setRoutineNotes(e.target.value)}
                    placeholder="e.g. IT employee, workout at 6:30 PM, needs quick office-friendly meals"
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div className="sm:col-span-3 flex justify-end mt-2">
                  <button
                    onClick={handleGenerateDiet}
                    disabled={isGeneratingDiet}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-extrabold uppercase tracking-wide flex items-center space-x-2 shadow-lg shadow-emerald-600/30 transition-all disabled:opacity-50"
                  >
                    <Utensils className={`w-4 h-4 ${isGeneratingDiet ? 'animate-spin' : ''}`} />
                    <span>{isGeneratingDiet ? 'Designing Diet...' : 'Generate Indian Diet Blueprint'}</span>
                  </button>
                </div>
              </div>

              {/* Generated Diet Plan Card */}
              {dietPlan && (
                <div className="p-5 rounded-2xl bg-zinc-900 border border-emerald-500/40 space-y-4 animate-in fade-in duration-200">
                  <div className="flex flex-wrap items-center justify-between border-b border-zinc-800 pb-3 gap-2">
                    <div>
                      <h3 className="text-base font-black text-white">{dietPlan.title}</h3>
                      <div className="flex items-center space-x-2 text-zinc-400 text-xs mt-0.5">
                        <span className="text-emerald-400 font-bold">{dietPlan.dietaryPreference}</span>
                        <span>•</span>
                        <span className="text-zinc-400 font-mono">Via FreeLLMAPI ({dietPlan.modelUsed})</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={handleShareWhatsApp}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center space-x-1.5 shadow-md shadow-emerald-600/30 transition-colors"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        <span>Send on WhatsApp</span>
                      </button>

                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(JSON.stringify(dietPlan, null, 2));
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className="p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                      >
                        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Target Macros Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-center">
                      <div className="text-[10px] text-zinc-400 font-bold uppercase">Calories</div>
                      <div className="text-sm font-black text-white font-mono">{dietPlan.targetCalories} kcal</div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-center">
                      <div className="text-[10px] text-zinc-400 font-bold uppercase">Protein Target</div>
                      <div className="text-sm font-black text-emerald-400 font-mono">{dietPlan.proteinGrams}g / day</div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-center">
                      <div className="text-[10px] text-zinc-400 font-bold uppercase">Carbs &amp; Fats</div>
                      <div className="text-sm font-black text-amber-400 font-mono">
                        {dietPlan.carbsGrams}g C / {dietPlan.fatsGrams}g F
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-center">
                      <div className="text-[10px] text-zinc-400 font-bold uppercase">Water Intake</div>
                      <div className="text-sm font-black text-cyan-400 font-mono">
                        {dietPlan.hydrationGoalLitres} Litres
                      </div>
                    </div>
                  </div>

                  {/* Meals Schedule */}
                  <div className="space-y-2.5">
                    {dietPlan.meals.map((meal, mIdx) => (
                      <div key={mIdx} className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-emerald-400 text-xs uppercase">
                            {meal.mealTime} - {meal.name}
                          </span>
                          <span className="font-mono text-zinc-400 text-[11px]">
                            ~{meal.calories} kcal ({meal.proteinGrams}g Protein)
                          </span>
                        </div>

                        <ul className="list-disc list-inside text-xs text-zinc-300 space-y-1">
                          {meal.options.map((opt, oIdx) => (
                            <li key={oIdx} className="leading-relaxed">
                              {opt}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>

                  {/* Nutrition Rules */}
                  {dietPlan.guidelines && (
                    <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800 space-y-1">
                      <div className="font-bold text-zinc-300 text-[11px] uppercase tracking-wider">
                        Nutrition Desk Guidelines
                      </div>
                      <ul className="list-disc list-inside text-[11px] text-zinc-400 space-y-0.5">
                        {dietPlan.guidelines.map((g, gIdx) => (
                          <li key={gIdx}>{g}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between text-xs">
          <span className="text-zinc-400">
            Plans are logged into member CRM timeline for trainer audit truth.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold transition-colors"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
