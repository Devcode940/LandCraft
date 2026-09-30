/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  Activity, 
  Lightbulb, 
  ShieldAlert,
  Sliders,
  ChevronUp,
  ChevronDown,
  Layout,
  RefreshCw,
  HelpCircle,
  Clock,
  MapPin,
  Check,
  Maximize2,
  Minimize2,
  FileText,
  Image as ImageIcon,
  Camera,
  UploadCloud
} from 'lucide-react';
import { FloorPlanData, AIReviewItem, DimensionUnit } from '../types';
import { checkOverlapWarnings } from '../utils/geoUtils';

interface AiAssistantPanelProps {
  plan: FloorPlanData;
  unit: DimensionUnit;
  highContrast: boolean;
  onLoadPlan?: (plan: FloorPlanData) => void;
}

// Example prompts & matching configuration templates for demonstrations (Input -> Output)
const DEMONSTRATIONS = [
  {
    id: "demo-bungalow",
    label: "3-Bed Bungalow",
    prompt: "Generate a modern 3-bedroom bungalow with an integrated outdoor porch, master bedroom ensuite, and open-plan central family living zone.",
    plotWidth: 15,
    plotLength: 20,
    bedrooms: 3,
    bathrooms: 2,
    floors: 1,
    style: "Modern"
  },
  {
    id: "demo-cabin",
    label: "Scandinavian Cabin",
    prompt: "A cozy Scandinavian tiny cabin on a narrow lot, featuring shared wet-walls between kitchen/bath to minimize plumbing costs, and a wood stove corner.",
    plotWidth: 8,
    plotLength: 10,
    bedrooms: 1,
    bathrooms: 1,
    floors: 1,
    style: "Scandinavian"
  },
  {
    id: "demo-loft",
    label: "Minimalist Loft",
    prompt: "Minimalist industrial flat with spacious circulation paths, huge front windows, private office zone, and separate master suite with walk-in washroom.",
    plotWidth: 12,
    plotLength: 12,
    bedrooms: 2,
    bathrooms: 1,
    floors: 1,
    style: "Minimalist"
  }
];

// Contextual architectural loading phases for the spinner
const LOADING_PHASES = [
  "Drafting site layout perimeter boundaries...",
  "Running spatial packing and room boundary solver...",
  "Aligning load-bearing walls and interior dividers...",
  "Placing exterior entries and window ventilation points...",
  "Calculating clearances and styling furniture orientation...",
  "Assembling detailed architectural concept rationale..."
];

export default function AiAssistantPanel({ plan, unit, highContrast, onLoadPlan }: AiAssistantPanelProps) {
  // Navigation & Sizing
  const [activeTab, setActiveTab] = useState<'generator' | 'photo' | 'audit'>('generator');
  const [isExpanded, setIsExpanded] = useState(true);

  // Form Parameters State
  const [promptInput, setPromptInput] = useState("");
  const [plotWidth, setPlotWidth] = useState(15);
  const [plotLength, setPlotLength] = useState(20);
  const [bedrooms, setBedrooms] = useState(3);
  const [bathrooms, setBathrooms] = useState(2);
  const [floors, setFloors] = useState(1);
  const [style, setStyle] = useState("Modern");
  const [variantsCount, setVariantsCount] = useState(2);

  // Photo Upload State
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Generation Results State
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [generatedVariants, setGeneratedVariants] = useState<any[]>([]);
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);
  const [rationaleSubTab, setRationaleSubTab] = useState<'concept' | 'zoning' | 'flow' | 'light'>('concept');

  // Continuous Static Verification Rules State
  const [reviews, setReviews] = useState<AIReviewItem[]>([]);
  const [isAuditing, setIsAuditing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'structure' | 'flow' | 'accessibility' | 'safety'>('all');
  const [optimizedPlan, setOptimizedPlan] = useState<FloorPlanData | null>(null);

  // Run dynamic verification whenever the parent editor's floor plan updates
  useEffect(() => {
    runStaticAudit();
    setOptimizedPlan(null); // Reset optimized plan when user makes changes
  }, [plan, unit]);

  // Loading animation phase rotator
  useEffect(() => {
    if (!isGenerating) return;
    let phaseIndex = 0;
    setLoadingPhase(LOADING_PHASES[0]);
    const interval = setInterval(() => {
      phaseIndex = (phaseIndex + 1) % LOADING_PHASES.length;
      setLoadingPhase(LOADING_PHASES[phaseIndex]);
    }, 2000);
    return () => clearInterval(interval);
  }, [isGenerating]);

  // Handle template selection
  const handleApplyDemo = (demo: typeof DEMONSTRATIONS[0]) => {
    setPromptInput(demo.prompt);
    setPlotWidth(demo.plotWidth);
    setPlotLength(demo.plotLength);
    setBedrooms(demo.bedrooms);
    setBathrooms(demo.bathrooms);
    setFloors(demo.floors);
    setStyle(demo.style);
  };

  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      setPhotoPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateFromPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photoPreview) {
      setErrorMsg("Please upload a plot photo first.");
      return;
    }
    
    setIsGenerating(true);
    setErrorMsg(null);
    setGeneratedVariants([]);

    try {
      const response = await fetch('/api/design-from-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: photoPreview,
          mimeType: photoFile?.type || "image/jpeg",
          prompt: promptInput,
          plotWidth,
          plotLength,
          bedrooms,
          bathrooms,
          floors,
          style,
          variantsCount
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || result.error || "Failed to analyze photo and generate plan.");
      }

      if (result.success && result.variants && result.variants.length > 0) {
        setGeneratedVariants(result.variants);
        setSelectedVariantIdx(0);
        if (onLoadPlan && result.variants[0].plan) {
          onLoadPlan(result.variants[0].plan);
        }
      } else {
        throw new Error("Received an empty response from layout coordinator.");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || "An unexpected generation error occurred.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Submit request to the Express server Proxy
  const handleGenerateAIPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setErrorMsg(null);
    setGeneratedVariants([]);

    try {
      const response = await fetch('/api/generate-floor-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptInput,
          plotWidth,
          plotLength,
          bedrooms,
          bathrooms,
          floors,
          style,
          variantsCount
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || result.error || "Failed to communicate with AI Architect.");
      }

      if (result.success && result.variants && result.variants.length > 0) {
        setGeneratedVariants(result.variants);
        setSelectedVariantIdx(0);
        // Automatically load the first layout option if callback is active
        if (onLoadPlan && result.variants[0].plan) {
          onLoadPlan(result.variants[0].plan);
        }
      } else {
        throw new Error("Received an empty response from layout coordinator. Please check your plot criteria.");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || "An unexpected generation error occurred. Please verify your connection and try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Apply a specific variant onto the editor canvas
  const handleLoadSelectedVariant = (idx: number) => {
    setSelectedVariantIdx(idx);
    const targetVariant = generatedVariants[idx];
    if (onLoadPlan && targetVariant && targetVariant.plan) {
      onLoadPlan(targetVariant.plan);
    }
  };

  // Dynamic Rule-Based Safety and Code Verifications
  const runStaticAudit = () => {
    const items: AIReviewItem[] = [];
    const { walls, rooms, openings, furniture } = plan;

    const roomLabels = rooms.map(r => r.label.toLowerCase());
    const hasBed = roomLabels.some(l => l.includes('bed') || l.includes('sleeping'));
    const hasBath = roomLabels.some(l => l.includes('bath') || l.includes('wc') || l.includes('toilet'));
    const hasLiving = roomLabels.some(l => l.includes('living') || l.includes('lounge') || l.includes('studio'));
    const hasKitchen = roomLabels.some(l => l.includes('kitchen') || l.includes('cooking') || l.includes('studio'));

    if (rooms.length === 0) {
      items.push({
        id: 'no-rooms',
        type: 'info',
        category: 'structure',
        title: 'Define Room Zones',
        message: 'Draw or stamp Room Zones to enable total area calculation and professional room labeling.'
      });
    } else {
      if (!hasBed) {
        items.push({
          id: 'missing-bedroom',
          type: 'warning',
          category: 'structure',
          title: 'Zoning: No Bedroom Zone',
          message: 'An ideal home layout requires dedicated personal space. Add a Bedroom zone to organize sleeping quarters.'
        });
      }
      if (!hasBath) {
        items.push({
          id: 'missing-bathroom',
          type: 'error',
          category: 'structure',
          title: 'Code: Bathroom Required',
          message: 'Residential building codes mandate at least one fully partitioned bathroom with proper plumbing clearance.'
        });
      }
      if (!hasKitchen) {
        items.push({
          id: 'missing-kitchen',
          type: 'warning',
          category: 'structure',
          title: 'Zoning: Food Preparation',
          message: 'Consider partitioning or stamping a Kitchen area with a wet-wall for water & drain utility alignment.'
        });
      }
    }

    const doors = openings.filter(o => o.type === 'door');
    const windows = openings.filter(o => o.type === 'window');

    if (walls.length > 0 && doors.length === 0) {
      items.push({
        id: 'no-doors',
        type: 'error',
        category: 'flow',
        title: 'Safety: Missing Exterior Doors',
        message: 'No doors detected! Your building shell lacks an active point of entry and safe emergency escape routes.'
      });
    }

    if (walls.length > 0 && windows.length === 0) {
      items.push({
        id: 'no-windows',
        type: 'warning',
        category: 'flow',
        title: 'Daylighting & Ventilation',
        message: 'No windows detected. International Building Code (IBC) requires natural light window area to be at least 8-10% of room floor area.'
      });
    }

    const narrowDoors = doors.filter(d => d.width < 32);
    if (narrowDoors.length > 0) {
      items.push({
        id: 'narrow-doors',
        type: 'warning',
        category: 'accessibility',
        title: 'ADA Access: Narrow Doorways',
        message: `Detected ${narrowDoors.length} doorway(s) under 32" (0.8m). Universal Design recommends 32"-36" doors for wheelchair accessibility.`
      });
    } else if (doors.length > 0) {
      items.push({
        id: 'accessible-doors',
        type: 'success',
        category: 'accessibility',
        title: 'Accessible Door Passages',
        message: 'Excellent! All configured doorways meet the standard 32"+ clearance threshold for full wheelchair access.'
      });
    }

    const bathRooms = rooms.filter(r => r.label.toLowerCase().includes('bath'));
    bathRooms.forEach(br => {
      if (br.width < 60 || br.height < 60) {
        items.push({
          id: `bath-turning-${br.id}`,
          type: 'warning',
          category: 'accessibility',
          title: 'Universal Design: Bath Turning Radius',
          message: `'${br.label}' lacks space for a 5-foot (1.5m) turning circle, hindering wheelchair maneuverability.`
        });
      }
    });

    const overlaps = checkOverlapWarnings(rooms, openings, furniture);
    overlaps.forEach((ov, idx) => {
      items.push({
        id: `overlap-${idx}`,
        type: 'error',
        category: 'safety',
        title: 'Structural Overlap / Block',
        message: ov.message
      });
    });

    if (overlaps.length === 0 && rooms.length > 0) {
      items.push({
        id: 'no-overlaps',
        type: 'success',
        category: 'safety',
        title: 'Clear Circulation Paths',
        message: 'No furniture overlaps or door swing blocks detected. Interior pathways have optimal physical clearances.'
      });
    }

    items.push({
      id: 'passive-solar',
      type: 'info',
      category: 'flow',
      title: 'Passive Solar Design Hint',
      message: 'Place primary living room windows on the south-facing wall (northern hemisphere) to optimize thermal gain during winter months.'
    });

    setReviews(items);
  };

  const handleDeepAiAudit = async () => {
    setIsAuditing(true);
    setErrorMsg(null);
    setOptimizedPlan(null);

    try {
      const response = await fetch('/api/analyze-blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan })
      });

      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Audit failed');
      }

      const aiInsights = (data.issues || []).map((issue: any) => ({
        ...issue,
        id: issue.id || `deep-${Date.now()}-${Math.random()}`
      }));

      setReviews(prev => [...aiInsights, ...prev.filter(x => !x.id.startsWith('deep-'))]);
      
      if (data.optimizedPlan) {
        setOptimizedPlan(data.optimizedPlan);
      }
      
    } catch (err: any) {
      console.error("Audit error:", err);
      // Fallback or error display
      const errorInsight: AIReviewItem = {
        id: `deep-error-${Date.now()}`,
        type: 'error',
        category: 'structure',
        title: 'Audit Failed',
        message: err.message || 'Could not connect to AI architect service.'
      };
      setReviews(prev => [errorInsight, ...prev.filter(x => !x.id.startsWith('deep-'))]);
    } finally {
      setIsAuditing(false);
    }
  };

  const filteredReviews = reviews.filter(
    r => selectedCategory === 'all' || r.category === selectedCategory
  );

  // UI styling classes based on theme/expand state
  const panelHeightClass = isExpanded ? 'h-[460px] md:h-[480px]' : 'h-14';
  const panelBg = highContrast
    ? 'bg-white border-t-2 border-black text-black'
    : 'bg-slate-900/95 dark:bg-slate-950/95 text-slate-100 border-t border-slate-800';

  const categoryBtnStyle = (cat: typeof selectedCategory) => {
    const isActive = selectedCategory === cat;
    if (highContrast) {
      return isActive 
        ? 'bg-black text-white px-2 py-1 rounded text-[10px] font-bold border border-black'
        : 'bg-white text-black px-2 py-1 rounded text-[10px] font-bold border border-gray-300';
    }
    return isActive
      ? 'bg-emerald-600 text-white px-2.5 py-1 rounded-md text-[10px] font-medium'
      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 px-2.5 py-1 rounded-md text-[10px]';
  };

  return (
    <div 
      id="ai-assistant-panel" 
      className={`flex flex-col overflow-hidden transition-all duration-300 relative ${panelHeightClass} ${panelBg}`}
    >
      {/* 1. TOP HEADER & NAVIGATION CONTROL RAIL */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/80 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="p-1 bg-emerald-500/20 rounded text-emerald-400">
              <Sparkles className="w-4 h-4 animate-pulse" />
            </div>
            <h3 className="text-xs font-black tracking-wider uppercase">
              LandCraft AI Assistant Workbench
            </h3>
          </div>

          {/* Tab Selection */}
          <div className="flex gap-1.5 border-l border-slate-800 pl-4">
            <button
              onClick={() => {
                setActiveTab('generator');
                setIsExpanded(true);
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                activeTab === 'generator'
                  ? 'bg-slate-800 text-emerald-400 border border-emerald-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layout className="w-3.5 h-3.5" />
              <span>AI Floor Plan Generator</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('photo');
                setIsExpanded(true);
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                activeTab === 'photo'
                  ? 'bg-slate-800 text-emerald-400 border border-emerald-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Design from Land Photo</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('audit');
                setIsExpanded(true);
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                activeTab === 'audit'
                  ? 'bg-slate-800 text-emerald-400 border border-emerald-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Code & Safety Verification</span>
            </button>
          </div>
        </div>

        {/* Workbench Sizing Trigger */}
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded border border-slate-700/30">
            {activeTab === 'generator' ? 'Text-to-Floor-Plan Model' : activeTab === 'photo' ? 'Image-to-Plan Model' : 'Active Compliance Diagnostics'}
          </span>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors cursor-pointer"
            title={isExpanded ? "Collapse Workbench" : "Expand Workbench"}
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* COMPACT MODE SUMMARY BAR (Only visible when collapsed) */}
      {!isExpanded && (
        <div className="flex-1 flex items-center justify-between px-5 text-xs text-slate-400 py-1.5">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>Ready to compile layouts. Choose style preset or type/upload requirements.</span>
          </div>
          <button
            onClick={() => setIsExpanded(true)}
            className="text-[10px] text-emerald-400 hover:underline font-bold cursor-pointer"
          >
            Open Architectural Controls &rarr;
          </button>
        </div>
      )}

      {/* 2. MAIN ACTIVE TAB WORKSPACE PANEL */}
      {isExpanded && (
        <div className="flex-1 overflow-hidden flex flex-col">
          
          {/* TAB A: AI DESIGN GENERATOR */}
          {activeTab === 'generator' && (
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-800/80">
              
              {/* LEFT FRAME: GENERATION INPUT FORM & PROMPTS */}
              <form 
                onSubmit={handleGenerateAIPlan}
                className="w-full md:w-[45%] p-4 overflow-y-auto space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-4">
                  {/* Demo input chips */}
                  <div>
                    <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block mb-1.5">
                      Input & Demonstrations Presets (1-Click Fill)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {DEMONSTRATIONS.map(demo => (
                        <button
                          key={demo.id}
                          type="button"
                          onClick={() => handleApplyDemo(demo)}
                          className="px-2.5 py-1 text-[10px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded border border-slate-700 transition-all cursor-pointer"
                        >
                          {demo.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Prompt Text Input */}
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
                      {activeTab === 'generator' ? 'Custom Design Brief (Natural Language Request)' : 'Context & Hints (e.g., North direction, nice views)'}
                    </label>
                    <textarea
                      value={promptInput}
                      onChange={(e) => setPromptInput(e.target.value)}
                      placeholder={activeTab === 'generator' 
                        ? "e.g. A Scandinavian bungalow with a wrap-around kitchen deck, separate mudroom entry, and compact private ensuite master bedroom..."
                        : "e.g. The street is at the bottom of the photo. Beautiful views to the top-right."}
                      className="w-full h-18 px-3 py-2 text-xs rounded border border-slate-700 bg-slate-950/80 focus:border-emerald-500 focus:outline-none placeholder-slate-500 text-slate-100 leading-normal resize-none"
                    />
                  </div>

                  {/* Grid of structured criteria fields */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Plot size */}
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
                        Plot Width (Meters)
                      </label>
                      <input
                        type="number"
                        min="5"
                        max="50"
                        value={plotWidth}
                        onChange={(e) => setPlotWidth(Math.max(5, parseInt(e.target.value) || 0))}
                        className="w-full px-2 py-1 text-xs rounded border border-slate-700 bg-slate-950 text-slate-100"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
                        Plot Length (Meters)
                      </label>
                      <input
                        type="number"
                        min="5"
                        max="50"
                        value={plotLength}
                        onChange={(e) => setPlotLength(Math.max(5, parseInt(e.target.value) || 0))}
                        className="w-full px-2 py-1 text-xs rounded border border-slate-700 bg-slate-950 text-slate-100"
                      />
                    </div>

                    {/* Bed/Bath */}
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
                        Bedrooms Wanted
                      </label>
                      <select
                        value={bedrooms}
                        onChange={(e) => setBedrooms(parseInt(e.target.value))}
                        className="w-full px-2 py-1 text-xs rounded border border-slate-700 bg-slate-950 text-slate-100 focus:outline-none"
                      >
                        {[1, 2, 3, 4, 5].map(n => (
                          <option key={n} value={n}>{n} Bedroom{n > 1 ? 's' : ''}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
                        Bathrooms Wanted
                      </label>
                      <select
                        value={bathrooms}
                        onChange={(e) => setBathrooms(parseInt(e.target.value))}
                        className="w-full px-2 py-1 text-xs rounded border border-slate-700 bg-slate-950 text-slate-100 focus:outline-none"
                      >
                        {[1, 1.5, 2, 2.5, 3].map(n => (
                          <option key={n} value={n}>{n} Bathroom{n > 1 ? 's' : ''}</option>
                        ))}
                      </select>
                    </div>

                    {/* Style & Variants count */}
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
                        Architectural Style
                      </label>
                      <select
                        value={style}
                        onChange={(e) => setStyle(e.target.value)}
                        className="w-full px-2 py-1 text-xs rounded border border-slate-700 bg-slate-950 text-slate-100 focus:outline-none"
                      >
                        {["Modern", "Scandinavian", "Minimalist", "Traditional", "Brutalist"].map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
                        Variants to Coordinate
                      </label>
                      <select
                        value={variantsCount}
                        onChange={(e) => setVariantsCount(parseInt(e.target.value))}
                        className="w-full px-2 py-1 text-xs rounded border border-slate-700 bg-slate-950 text-slate-100 focus:outline-none font-bold text-emerald-400"
                      >
                        <option value={1}>1 Option (Fastest)</option>
                        <option value={2}>2 Options (Balanced)</option>
                        <option value={3}>3 Options (Comprehensive)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Generate CTA with conceptual disclaimer */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isGenerating}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 text-xs font-bold py-2 px-4 rounded-md transition-colors cursor-pointer flex items-center justify-center gap-2 shadow"
                  >
                    <Sliders className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                    <span>{isGenerating ? "Drafting Blueprint Layouts..." : "Generate AI Blueprint Options"}</span>
                  </button>
                  <span className="text-[8px] text-slate-400 block text-center mt-1.5 font-medium leading-relaxed uppercase tracking-wider border border-slate-800/60 rounded p-1 bg-slate-900/40">
                    ⚠️ Conceptual design only - requires licensed professional review.
                  </span>
                </div>
              </form>

              {/* RIGHT FRAME: AI DESIGN FEEDBACK & VARIANT VIEWER */}
              <div className="flex-1 p-4 overflow-y-auto flex flex-col justify-between">
                
                {/* 1. INITIAL PLACEHOLDER STATE */}
                {!isGenerating && generatedVariants.length === 0 && !errorMsg && (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-3">
                    <div className="p-3 bg-slate-800/40 border border-slate-800 rounded-full text-slate-500">
                      <Sliders className="w-8 h-8" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-300">No Layout Generated Yet</p>
                      <p className="text-[10px] text-slate-400 max-w-xs leading-normal">
                        Submit your spatial plot size and design requirements. The AI will coordinate walls, windows, and custom furniture placements.
                      </p>
                    </div>
                  </div>
                )}

                {/* 2. LOADING ENGINE STATE */}
                {isGenerating && (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-4">
                    <div className="relative">
                      <div className="w-12 h-12 border-2 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin"></div>
                      <Sparkles className="w-4 h-4 text-emerald-400 absolute inset-0 m-auto animate-pulse" />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-bold text-slate-200">Generating Spatial Layout</p>
                      <div className="bg-emerald-950/20 text-emerald-400 text-[10px] font-mono px-3 py-1.5 rounded border border-emerald-900/30 max-w-xs mx-auto animate-pulse leading-snug">
                        {loadingPhase}
                      </div>
                      <p className="text-[9px] text-slate-500 italic">This usually completes in 4 to 8 seconds</p>
                    </div>
                  </div>
                )}

                {/* 3. SERVER ERROR FALLBACK DISPLAY */}
                {errorMsg && (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-4 space-y-3">
                    <div className="p-2 bg-red-950/20 border border-red-900/30 rounded text-red-400">
                      <ShieldAlert className="w-8 h-8" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-red-200">Drafting Coordinator Failed</p>
                      <p className="text-[10px] text-slate-400 max-w-xs leading-normal bg-slate-950/60 p-2.5 rounded border border-slate-800">
                        {errorMsg}
                      </p>
                    </div>
                    <button
                      onClick={() => setErrorMsg(null)}
                      className="px-3 py-1.5 text-[10px] font-bold bg-slate-800 text-slate-300 hover:text-white rounded border border-slate-700 cursor-pointer"
                    >
                      Clear & Try Again
                    </button>
                  </div>
                )}

                {/* 4. DESIGN VARIANT LAYOUT BOARD */}
                {generatedVariants.length > 0 && (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    
                    {/* Variant Selector Headers */}
                    <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5 shrink-0">
                      <span className="text-[9px] uppercase tracking-wider text-slate-400 font-extrabold mr-1">
                        Select Variant Option:
                      </span>
                      <div className="flex gap-1.5 flex-1 overflow-x-auto pb-0.5">
                        {generatedVariants.map((variant, idx) => (
                          <button
                            key={variant.id}
                            type="button"
                            onClick={() => handleLoadSelectedVariant(idx)}
                            className={`px-3 py-1 text-[10px] font-bold rounded-full transition-all cursor-pointer border ${
                              selectedVariantIdx === idx
                                ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700/60'
                            }`}
                          >
                            {variant.title || `Option ${idx + 1}`}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Selected Variant Summary Card */}
                    <div className="flex-1 overflow-y-auto py-3 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h4 className="text-xs font-black text-emerald-400 tracking-tight leading-snug">
                            {generatedVariants[selectedVariantIdx].name || `Variant Layout ${selectedVariantIdx + 1}`}
                          </h4>
                          <div className="flex items-center gap-2 mt-0.5 text-[9px] font-mono text-slate-400">
                            <span className="bg-slate-800 px-1 rounded font-bold uppercase text-slate-300">
                              {style}
                            </span>
                            <span>&bull;</span>
                            <span>Plot: {generatedVariants[selectedVariantIdx].dimensions?.widthMeters}m x {generatedVariants[selectedVariantIdx].dimensions?.lengthMeters}m</span>
                            <span>&bull;</span>
                            <span className="text-emerald-400 font-bold">Area: {generatedVariants[selectedVariantIdx].dimensions?.totalBuildAreaM2} m²</span>
                          </div>
                        </div>

                        {/* Apply Trigger */}
                        <button
                          type="button"
                          onClick={() => handleLoadSelectedVariant(selectedVariantIdx)}
                          className="px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wider bg-emerald-500/10 hover:bg-emerald-500 hover:text-slate-950 text-emerald-400 border border-emerald-500/30 rounded flex items-center gap-1 cursor-pointer shadow"
                        >
                          <Check className="w-3 h-3" />
                          <span>Load Blueprint</span>
                        </button>
                      </div>

                      {/* AI Architectural Rationale Tab Bar */}
                      <div className="space-y-2 bg-slate-950/40 p-2.5 rounded border border-slate-800/80">
                        <div className="flex border-b border-slate-800 pb-1.5 gap-2.5 overflow-x-auto text-[9px] font-bold text-slate-400">
                          <button
                            type="button"
                            onClick={() => setRationaleSubTab('concept')}
                            className={rationaleSubTab === 'concept' ? 'text-emerald-400 border-b border-emerald-400' : 'hover:text-slate-200'}
                          >
                            Design Concept
                          </button>
                          <button
                            type="button"
                            onClick={() => setRationaleSubTab('zoning')}
                            className={rationaleSubTab === 'zoning' ? 'text-emerald-400 border-b border-emerald-400' : 'hover:text-slate-200'}
                          >
                            Zoning Logic
                          </button>
                          <button
                            type="button"
                            onClick={() => setRationaleSubTab('flow')}
                            className={rationaleSubTab === 'flow' ? 'text-emerald-400 border-b border-emerald-400' : 'hover:text-slate-200'}
                          >
                            Circulation Flow
                          </button>
                          <button
                            type="button"
                            onClick={() => setRationaleSubTab('light')}
                            className={rationaleSubTab === 'light' ? 'text-emerald-400 border-b border-emerald-400' : 'hover:text-slate-200'}
                          >
                            Daylighting & Vents
                          </button>
                        </div>

                        {/* Rationale content display */}
                        <div className="text-[10px] leading-relaxed text-slate-300 font-medium">
                          {rationaleSubTab === 'concept' && (
                            <p>{generatedVariants[selectedVariantIdx].rationale?.architecturalConcept || "A detailed conceptual setup outlining window orientation, zoning spacing, and furniture density ratios."}</p>
                          )}
                          {rationaleSubTab === 'zoning' && (
                            <p>{generatedVariants[selectedVariantIdx].rationale?.zoningRationale || "A clear explanation of the public social living areas versus private personal bedrooms."}</p>
                          )}
                          {rationaleSubTab === 'flow' && (
                            <p>{generatedVariants[selectedVariantIdx].rationale?.circulationFlow || "Analyses of corridors, entrance doors, and safety escape layouts."}</p>
                          )}
                          {rationaleSubTab === 'light' && (
                            <p>{generatedVariants[selectedVariantIdx].rationale?.naturalLightAndVents || "Explores cross-ventilation rules and southern exposures for energy savings."}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB B: DESIGN FROM LAND PHOTO */}
          {activeTab === 'photo' && (
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-800/80">
              {/* LEFT FRAME: UPLOAD & SETTINGS */}
              <form 
                onSubmit={handleGenerateFromPhoto}
                className="w-full md:w-[45%] p-4 overflow-y-auto space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-4">
                  {/* Photo Upload Area */}
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
                      Plot Photo Upload
                    </label>
                    <div className="relative border-2 border-dashed border-slate-700 bg-slate-900/50 rounded-lg p-4 text-center hover:bg-slate-800/50 transition-colors">
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        onChange={handlePhotoFileChange}
                      />
                      {photoPreview ? (
                        <div className="relative h-24 w-full flex items-center justify-center overflow-hidden rounded">
                          <img src={photoPreview} alt="Plot preview" className="object-cover max-h-full max-w-full rounded" />
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center space-y-2 py-2">
                          <UploadCloud className="w-6 h-6 text-slate-500" />
                          <span className="text-[10px] text-slate-400">Click or drag a land photo here</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Optional Custom Instructions */}
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
                      Context / Requirements (Optional)
                    </label>
                    <textarea
                      value={promptInput}
                      onChange={(e) => setPromptInput(e.target.value)}
                      placeholder="e.g. Optimize for morning sun from the east, avoid building near the big oak tree."
                      className="w-full h-12 px-3 py-2 text-xs rounded border border-slate-700 bg-slate-950/80 focus:border-emerald-500 focus:outline-none placeholder-slate-500 text-slate-100 leading-normal resize-none"
                    />
                  </div>

                  {/* Grid of structured criteria fields */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Plot Width (m)</label>
                      <input type="number" value={plotWidth} onChange={(e) => setPlotWidth(Math.max(5, parseInt(e.target.value) || 0))} className="w-full px-2 py-1 text-xs rounded border border-slate-700 bg-slate-950 text-slate-100" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Plot Length (m)</label>
                      <input type="number" value={plotLength} onChange={(e) => setPlotLength(Math.max(5, parseInt(e.target.value) || 0))} className="w-full px-2 py-1 text-xs rounded border border-slate-700 bg-slate-950 text-slate-100" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Bedrooms</label>
                      <select value={bedrooms} onChange={(e) => setBedrooms(parseInt(e.target.value))} className="w-full px-2 py-1 text-xs rounded border border-slate-700 bg-slate-950 text-slate-100 focus:outline-none">
                        {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Bathrooms</label>
                      <select value={bathrooms} onChange={(e) => setBathrooms(parseInt(e.target.value))} className="w-full px-2 py-1 text-xs rounded border border-slate-700 bg-slate-950 text-slate-100 focus:outline-none">
                        {[1, 1.5, 2, 2.5, 3].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Style</label>
                      <select value={style} onChange={(e) => setStyle(e.target.value)} className="w-full px-2 py-1 text-xs rounded border border-slate-700 bg-slate-950 text-slate-100 focus:outline-none">
                        {["Modern", "Scandinavian", "Minimalist", "Traditional", "Brutalist"].map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Variants</label>
                      <select value={variantsCount} onChange={(e) => setVariantsCount(parseInt(e.target.value))} className="w-full px-2 py-1 text-xs rounded border border-slate-700 bg-slate-950 text-slate-100 focus:outline-none text-blue-400 font-bold">
                        <option value={1}>1 Option</option>
                        <option value={2}>2 Options</option>
                        <option value={3}>3 Options</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Generate CTA */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isGenerating || !photoPreview}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold py-2 px-4 rounded-md transition-colors cursor-pointer flex items-center justify-center gap-2 shadow"
                  >
                    {isGenerating ? <Sliders className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                    <span>{isGenerating ? "Analyzing Image..." : "Analyze & Generate Plan"}</span>
                  </button>
                </div>
              </form>

              {/* RIGHT FRAME: AI DESIGN FEEDBACK & VARIANT VIEWER */}
              <div className="flex-1 p-4 overflow-y-auto flex flex-col justify-between">
                
                {/* 1. INITIAL PLACEHOLDER STATE */}
                {!isGenerating && generatedVariants.length === 0 && !errorMsg && (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-3">
                    <div className="p-3 bg-slate-800/40 border border-slate-800 rounded-full text-slate-500">
                      <ImageIcon className="w-8 h-8" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-300">Awaiting Plot Photo</p>
                      <p className="text-[10px] text-slate-400 max-w-xs leading-normal">
                        Upload an image of your land, map segment, or rough sketch. AI will assess dimensions and visual context to map out an optimized floor plan.
                      </p>
                    </div>
                  </div>
                )}

                {/* 2. LOADING ENGINE STATE */}
                {isGenerating && (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-4">
                    <div className="relative">
                      <div className="w-12 h-12 border-2 border-blue-500/20 border-t-blue-400 rounded-full animate-spin"></div>
                      <Camera className="w-4 h-4 text-blue-400 absolute inset-0 m-auto animate-pulse" />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-bold text-slate-200">Vision Analysis in Progress</p>
                      <div className="bg-blue-950/20 text-blue-400 text-[10px] font-mono px-3 py-1.5 rounded border border-blue-900/30 max-w-xs mx-auto animate-pulse leading-snug">
                        Processing image context...
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. SERVER ERROR FALLBACK DISPLAY */}
                {errorMsg && (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-4 space-y-3">
                    <div className="p-2 bg-red-950/20 border border-red-900/30 rounded text-red-400">
                      <ShieldAlert className="w-8 h-8" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-red-200">Vision Coordinator Failed</p>
                      <p className="text-[10px] text-slate-400 max-w-xs leading-normal bg-slate-950/60 p-2.5 rounded border border-slate-800">
                        {errorMsg}
                      </p>
                    </div>
                    <button
                      onClick={() => setErrorMsg(null)}
                      className="px-3 py-1.5 text-[10px] font-bold bg-slate-800 text-slate-300 hover:text-white rounded border border-slate-700 cursor-pointer"
                    >
                      Clear & Try Again
                    </button>
                  </div>
                )}

                {/* 4. DESIGN VARIANT LAYOUT BOARD */}
                {generatedVariants.length > 0 && !isGenerating && !errorMsg && (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Variant Selector Headers */}
                    <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5 shrink-0">
                      <span className="text-[9px] uppercase tracking-wider text-slate-400 font-extrabold mr-1">
                        Vision Variants:
                      </span>
                      <div className="flex gap-1.5 flex-1 overflow-x-auto pb-0.5">
                        {generatedVariants.map((variant, idx) => (
                          <button
                            key={variant.id}
                            type="button"
                            onClick={() => handleLoadSelectedVariant(idx)}
                            className={`px-3 py-1 text-[10px] font-bold rounded-full transition-all cursor-pointer border ${
                              selectedVariantIdx === idx
                                ? 'bg-blue-600 text-white border-blue-500 shadow-md'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700/60'
                            }`}
                          >
                            {variant.title || `Vision Option ${idx + 1}`}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Selected Variant Summary Card */}
                    <div className="flex-1 overflow-y-auto py-3 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h4 className="text-xs font-black text-blue-400 tracking-tight leading-snug">
                            {generatedVariants[selectedVariantIdx].name || `Vision Layout ${selectedVariantIdx + 1}`}
                          </h4>
                          <div className="flex items-center gap-2 mt-0.5 text-[9px] font-mono text-slate-400">
                            <span className="bg-slate-800 px-1 rounded font-bold uppercase text-slate-300">
                              {style}
                            </span>
                            <span>&bull;</span>
                            <span>Plot: {generatedVariants[selectedVariantIdx].dimensions?.widthMeters}m x {generatedVariants[selectedVariantIdx].dimensions?.lengthMeters}m</span>
                            <span>&bull;</span>
                            <span className="text-blue-400 font-bold">Area: {generatedVariants[selectedVariantIdx].dimensions?.totalBuildAreaM2} m²</span>
                          </div>
                        </div>

                        {/* Apply Trigger */}
                        <button
                          type="button"
                          onClick={() => handleLoadSelectedVariant(selectedVariantIdx)}
                          className="px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wider bg-blue-500/10 hover:bg-blue-600 hover:text-white text-blue-400 border border-blue-500/30 rounded flex items-center gap-1 cursor-pointer shadow"
                        >
                          <Check className="w-3 h-3" />
                          <span>Load Vision Plan</span>
                        </button>
                      </div>

                      {/* Vision Insights Tab Bar */}
                      <div className="space-y-2 bg-slate-950/40 p-2.5 rounded border border-slate-800/80">
                        <div className="flex border-b border-slate-800 pb-1.5 gap-2.5 overflow-x-auto text-[9px] font-bold text-slate-400">
                          <button type="button" onClick={() => setRationaleSubTab('concept')} className={rationaleSubTab === 'concept' ? 'text-blue-400 border-b border-blue-400' : 'hover:text-slate-200'}>Design Concept</button>
                          <button type="button" onClick={() => setRationaleSubTab('zoning')} className={rationaleSubTab === 'zoning' ? 'text-blue-400 border-b border-blue-400' : 'hover:text-slate-200'}>Zoning Logic</button>
                          <button type="button" onClick={() => setRationaleSubTab('flow')} className={rationaleSubTab === 'flow' ? 'text-blue-400 border-b border-blue-400' : 'hover:text-slate-200'}>Circulation Flow</button>
                          <button type="button" onClick={() => setRationaleSubTab('light')} className={rationaleSubTab === 'light' ? 'text-blue-400 border-b border-blue-400' : 'hover:text-slate-200'}>Light & Vents</button>
                        </div>
                        <div className="text-[10px] leading-relaxed text-slate-300 font-medium">
                          {rationaleSubTab === 'concept' && <p>{generatedVariants[selectedVariantIdx].rationale?.architecturalConcept || "Concept setup."}</p>}
                          {rationaleSubTab === 'zoning' && <p>{generatedVariants[selectedVariantIdx].rationale?.zoningRationale || "Zoning setup."}</p>}
                          {rationaleSubTab === 'flow' && <p>{generatedVariants[selectedVariantIdx].rationale?.circulationFlow || "Flow analyses."}</p>}
                          {rationaleSubTab === 'light' && <p>{generatedVariants[selectedVariantIdx].rationale?.naturalLightAndVents || "Vents."}</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB C: CODE & SAFETY VERIFICATION */}
          {activeTab === 'audit' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Category Filter bar */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/80 bg-slate-950/20 shrink-0">
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  {(['all', 'structure', 'flow', 'accessibility', 'safety'] as const).map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={categoryBtnStyle(cat)}
                    >
                      <span className="capitalize">{cat}</span>
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleDeepAiAudit}
                  disabled={isAuditing}
                  className="flex items-center gap-1 text-[9px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded border border-slate-700 cursor-pointer disabled:opacity-50"
                >
                  <Activity className={`w-3 h-3 ${isAuditing ? 'animate-spin' : ''}`} />
                  <span>{isAuditing ? 'Analyzing Blueprint...' : 'Run Deep AI Architect Audit'}</span>
                </button>
              </div>

              {/* Optimization Banner */}
              {optimizedPlan && (
                <div className="mx-4 mt-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-blue-400" />
                    <div>
                      <p className="text-xs font-bold text-blue-200">AI Optimization Available</p>
                      <p className="text-[10px] text-blue-300">The architect AI has generated a modified layout to resolve the identified issues.</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      if (onLoadPlan) {
                        onLoadPlan(optimizedPlan);
                      }
                      setOptimizedPlan(null); // Clear after applying
                      setReviews([]); // Clear reviews since they might be stale
                    }}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded cursor-pointer transition-colors shadow"
                  >
                    Apply Optimization
                  </button>
                </div>
              )}

              {/* Warnings Scroll View */}
              <div className="flex-1 p-4 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredReviews.length === 0 ? (
                  <div className="col-span-full flex flex-col items-center justify-center py-8 text-center text-slate-400">
                    <CheckCircle2 className="w-8 h-8 text-slate-600 mb-2" />
                    <p className="text-xs font-bold">All clear for this filter category</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">No critical warnings or code violations are registered.</p>
                  </div>
                ) : (
                  filteredReviews.map((item) => {
                    let Icon = Info;
                    let cardStyle = "border-slate-800 bg-slate-800/30 text-slate-200";
                    let tagStyle = "bg-slate-800 text-slate-400";
                    
                    if (item.type === 'error') {
                      Icon = ShieldAlert;
                      cardStyle = "border-red-950/40 bg-red-950/10 text-red-200";
                      tagStyle = "bg-red-950/40 text-red-400 border border-red-900/30";
                    } else if (item.type === 'warning') {
                      Icon = AlertTriangle;
                      cardStyle = "border-amber-950/40 bg-amber-950/10 text-amber-200";
                      tagStyle = "bg-amber-950/40 text-amber-400 border border-amber-900/30";
                    } else if (item.type === 'success') {
                      Icon = CheckCircle2;
                      cardStyle = "border-emerald-950/40 bg-emerald-950/10 text-emerald-200";
                      tagStyle = "bg-emerald-950/40 text-emerald-400 border border-emerald-900/30";
                    } else if (item.type === 'info') {
                      Icon = Lightbulb;
                      cardStyle = "border-blue-950/40 bg-blue-950/10 text-blue-200";
                      tagStyle = "bg-blue-950/40 text-blue-400 border border-blue-900/30";
                    }

                    if (highContrast) {
                      cardStyle = "border-black bg-white text-black border";
                      tagStyle = "bg-black text-white";
                    }

                    return (
                      <div 
                        key={item.id} 
                        className={`p-3 rounded-lg border flex gap-2.5 items-start transition-all hover:scale-[1.01] ${cardStyle}`}
                      >
                        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${
                          highContrast ? 'text-black' : 
                          item.type === 'error' ? 'text-red-400' :
                          item.type === 'warning' ? 'text-amber-400' :
                          item.type === 'success' ? 'text-emerald-400' : 'text-blue-400'
                        }`} />
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-[11px] leading-tight">{item.title}</span>
                            <span className={`text-[8px] uppercase tracking-wider px-1 rounded font-bold ${tagStyle}`}>
                              {item.category}
                            </span>
                          </div>
                          <p className="text-[10px] leading-relaxed text-slate-300 dark:text-slate-400">
                            {item.message}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
