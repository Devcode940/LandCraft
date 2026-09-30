import React, { useState, useMemo, useEffect } from 'react';
import { FloorPlanData, DimensionUnit } from '../types';
import { X, DollarSign, Calculator, AlertTriangle, Lightbulb, Settings, Building2 } from 'lucide-react';
import { calculateRoomArea } from '../utils/geoUtils';

interface CostEstimatorPanelProps {
  plan: FloorPlanData;
  unit: DimensionUnit;
  onClose: () => void;
}

// Simple material cost database (per sq meter or item)
const MATERIAL_COSTS = {
  budget: {
    flooring: 25,
    wallFinish: 15,
    door: 150,
    window: 250,
    baseRate: 800, // base construction cost per m2
  },
  standard: {
    flooring: 60,
    wallFinish: 30,
    door: 350,
    window: 600,
    baseRate: 1500,
  },
  premium: {
    flooring: 150,
    wallFinish: 80,
    door: 800,
    window: 1500,
    baseRate: 3000,
  }
};

const REGION_MULTIPLIERS: Record<string, number> = {
  'north-america': 1.2,
  'europe': 1.1,
  'asia': 0.8,
  'south-america': 0.7,
  'global-average': 1.0,
};

export default function CostEstimatorPanel({ plan, unit, onClose }: CostEstimatorPanelProps) {
  const [qualityLevel, setQualityLevel] = useState<'budget' | 'standard' | 'premium'>('standard');
  const [region, setRegion] = useState<string>('global-average');
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [isLoadingAi, setIsLoadingAi] = useState(false);

  // Calculate metrics
  const metrics = useMemo(() => {
    let totalAreaPixels = 0;
    plan.rooms.forEach(r => {
      totalAreaPixels += r.width * r.height;
    });
    
    // 40px = 1m -> 1600px^2 = 1m^2
    const totalAreaM2 = totalAreaPixels / 1600;
    
    let totalWallLengthPixels = 0;
    plan.walls.forEach(w => {
      const dx = w.x2 - w.x1;
      const dy = w.y2 - w.y1;
      totalWallLengthPixels += Math.sqrt(dx*dx + dy*dy);
    });
    const totalWallLengthM = totalWallLengthPixels / 40;

    let doorsCount = 0;
    let windowsCount = 0;
    plan.openings.forEach(o => {
      if (o.type === 'door') doorsCount++;
      if (o.type === 'window') windowsCount++;
    });

    return {
      areaM2: totalAreaM2,
      wallLengthM: totalWallLengthM,
      doors: doorsCount,
      windows: windowsCount
    };
  }, [plan]);

  // Calculate costs
  const costs = useMemo(() => {
    const rates = MATERIAL_COSTS[qualityLevel];
    const multiplier = REGION_MULTIPLIERS[region];

    const structuralCost = metrics.areaM2 * rates.baseRate * multiplier;
    const flooringCost = metrics.areaM2 * rates.flooring * multiplier;
    const wallFinishCost = metrics.wallLengthM * 2.7 /* avg height */ * rates.wallFinish * multiplier;
    const fixturesCost = (metrics.doors * rates.door + metrics.windows * rates.window) * multiplier;
    
    const subtotal = structuralCost + flooringCost + wallFinishCost + fixturesCost;
    const contingency = subtotal * 0.15; // 15% contingency
    const total = subtotal + contingency;

    return {
      structural: structuralCost,
      flooring: flooringCost,
      wallFinish: wallFinishCost,
      fixtures: fixturesCost,
      subtotal,
      contingency,
      total
    };
  }, [metrics, qualityLevel, region]);

  // Format currency
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
  };

  // Simulated AI Optimization
  useEffect(() => {
    let active = true;
    setIsLoadingAi(true);

    const fetchOptimizations = async () => {
      try {
        const response = await fetch('/api/optimize-costs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan,
            metrics,
            costs,
            qualityLevel,
            region
          })
        });

        if (!active) return;

        const data = await response.json();
        if (data.success && data.suggestions && data.suggestions.length > 0) {
          setAiSuggestions(data.suggestions);
        } else {
          // Fallback static suggestions if API fails or is unconfigured
          const staticSuggestions = [];
          if (metrics.windows > 10 && qualityLevel === 'premium') {
            staticSuggestions.push("High window count on premium tier significantly increases cost. Consider consolidating smaller windows into larger single panes.");
          }
          if (metrics.areaM2 > 150) {
            staticSuggestions.push("Footprint exceeds 150m². Optimizing hallway space could reduce structural costs by 5-8%.");
          }
          if (metrics.doors > plan.rooms.length * 1.5) {
            staticSuggestions.push("High door-to-room ratio. Using open archways in communal areas could save on fixture costs.");
          }
          if (staticSuggestions.length === 0) {
            staticSuggestions.push("Layout is highly efficient for the selected quality tier. No major cost sinks identified.");
          }
          setAiSuggestions(staticSuggestions);
        }
      } catch (err) {
        if (!active) return;
        setAiSuggestions([
          "Unable to reach AI Architect. Local static analysis active.",
          metrics.windows > 8 ? "Consider reducing window count to lower fixture costs." : "Window ratio is efficient.",
          "Ensure structural base rate accounts for local building codes."
        ]);
      } finally {
        if (active) setIsLoadingAi(false);
      }
    };

    fetchOptimizations();

    return () => {
      active = false;
    };
  }, [metrics, qualityLevel, region, plan, costs.total, costs.subtotal]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
              <Calculator className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">Construction Cost Estimator</h2>
              <p className="text-xs text-slate-400">Rough order of magnitude (ROM) estimate</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Left Column: Settings & Quantities */}
          <div className="space-y-6">
            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 space-y-4">
              <h3 className="text-sm font-bold flex items-center gap-2 border-b border-slate-700 pb-2">
                <Settings className="w-4 h-4 text-slate-400" />
                Parameters
              </h3>
              
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400">Quality Level</label>
                <select 
                  value={qualityLevel} 
                  onChange={e => setQualityLevel(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="budget">Budget / Standard</option>
                  <option value="standard">Mid-Range / Custom</option>
                  <option value="premium">Premium / Luxury</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400">Region Modifier</label>
                <select 
                  value={region} 
                  onChange={e => setRegion(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="global-average">Global Average (Baseline)</option>
                  <option value="north-america">North America (+20%)</option>
                  <option value="europe">Europe (+10%)</option>
                  <option value="asia">Asia (-20%)</option>
                  <option value="south-america">South America (-30%)</option>
                </select>
              </div>
            </div>

            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 space-y-3">
              <h3 className="text-sm font-bold flex items-center gap-2 border-b border-slate-700 pb-2">
                <Building2 className="w-4 h-4 text-slate-400" />
                Material Takeoff
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-900 p-2 rounded border border-slate-800">
                  <span className="block text-slate-500 mb-1">Total Area</span>
                  <span className="font-bold text-slate-200">{metrics.areaM2.toFixed(1)} m²</span>
                </div>
                <div className="bg-slate-900 p-2 rounded border border-slate-800">
                  <span className="block text-slate-500 mb-1">Linear Walls</span>
                  <span className="font-bold text-slate-200">{metrics.wallLengthM.toFixed(1)} m</span>
                </div>
                <div className="bg-slate-900 p-2 rounded border border-slate-800">
                  <span className="block text-slate-500 mb-1">Doors</span>
                  <span className="font-bold text-slate-200">{metrics.doors}</span>
                </div>
                <div className="bg-slate-900 p-2 rounded border border-slate-800">
                  <span className="block text-slate-500 mb-1">Windows</span>
                  <span className="font-bold text-slate-200">{metrics.windows}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Middle & Right: Breakdown & AI Suggestions */}
          <div className="md:col-span-2 space-y-6">
            
            {/* Total Estimate */}
            <div className="bg-gradient-to-br from-emerald-900/30 to-slate-900 p-6 rounded-2xl border border-emerald-500/20 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div>
                <h3 className="text-sm font-bold text-slate-400 mb-1">Estimated Total Cost</h3>
                <div className="text-4xl font-black text-emerald-400 tracking-tight">
                  {formatCurrency(costs.total)}
                </div>
                <p className="text-[10px] text-slate-500 mt-2 max-w-xs leading-relaxed">
                  *Excludes land acquisition, permits, site prep, and architectural fees. Values are rough approximations.
                </p>
              </div>
              <div className="w-full sm:w-auto flex-1 max-w-xs space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Base Build</span>
                  <span className="font-bold">{formatCurrency(costs.subtotal)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Contingency (15%)</span>
                  <span className="font-bold">{formatCurrency(costs.contingency)}</span>
                </div>
                <div className="h-px bg-slate-700 w-full my-2" />
                <div className="flex justify-between text-sm font-bold text-emerald-400">
                  <span>Total</span>
                  <span>{formatCurrency(costs.total)}</span>
                </div>
              </div>
            </div>

            {/* Breakdown Bars */}
            <div className="bg-slate-800/30 p-5 rounded-xl border border-slate-700/50">
              <h3 className="text-sm font-bold mb-4">Cost Breakdown</h3>
              <div className="space-y-4">
                {[
                  { label: 'Structural & Base', val: costs.structural, color: 'bg-blue-500' },
                  { label: 'Flooring', val: costs.flooring, color: 'bg-emerald-500' },
                  { label: 'Wall Finishes', val: costs.wallFinish, color: 'bg-amber-500' },
                  { label: 'Fixtures (Doors/Windows)', val: costs.fixtures, color: 'bg-purple-500' },
                ].map(item => (
                  <div key={item.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300 font-medium">{item.label}</span>
                      <span className="text-slate-400">{formatCurrency(item.val)} ({((item.val / costs.subtotal) * 100).toFixed(1)}%)</span>
                    </div>
                    <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${item.color} rounded-full`} 
                        style={{ width: `${Math.max(2, (item.val / costs.subtotal) * 100)}%` }} 
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Optimization Suggestions */}
            <div className="bg-blue-950/20 p-5 rounded-xl border border-blue-500/20">
              <h3 className="text-sm font-bold text-blue-400 flex items-center gap-2 mb-3">
                <Lightbulb className="w-4 h-4" />
                AI Cost Optimization Insights
              </h3>
              
              {isLoadingAi ? (
                <div className="flex items-center gap-3 text-slate-400 text-xs py-4">
                  <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                  Analyzing material ratios and layout efficiency...
                </div>
              ) : (
                <ul className="space-y-3">
                  {aiSuggestions.map((sug, i) => (
                    <li key={i} className="text-xs text-slate-300 flex items-start gap-2 bg-blue-950/40 p-3 rounded-lg border border-blue-900/50 leading-relaxed">
                      <span className="text-blue-400 mt-0.5">•</span>
                      {sug}
                    </li>
                  ))}
                </ul>
              )}
            </div>

          </div>
        </div>

        {/* Footer Disclaimer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
          <p className="text-[10px] text-slate-500 leading-normal">
            <strong>Disclaimer:</strong> This cost estimator provides a Rough Order of Magnitude (ROM) estimate based on generalized square-meter rates. It does not account for specific site conditions, localized material inflation, specialized structural requirements, or contractor markups. Always consult with a licensed contractor and quantity surveyor before finalizing budgets.
          </p>
        </div>

      </div>
    </div>
  );
}
