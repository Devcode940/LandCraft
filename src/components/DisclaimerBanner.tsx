/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';

interface DisclaimerBannerProps {
  highContrast?: boolean;
}

export default function DisclaimerBanner({ highContrast }: DisclaimerBannerProps) {
  return (
    <div 
      id="landcraft-disclaimer"
      className={`p-3.5 border-t text-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${
        highContrast 
          ? 'bg-white border-black text-black font-bold' 
          : 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-300'
      }`}
    >
      <div className="flex items-start gap-2.5 max-w-4xl">
        <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${highContrast ? 'text-black' : 'text-amber-600 dark:text-amber-400'}`} />
        <p className="leading-relaxed">
          <strong className="font-semibold">Disclaimer:</strong> LandCraft AI generates floor plans for conceptual visualization and architectural drafting purposes only. All dimensions, wall layouts, door placements, and calculations must be verified by a licensed professional architect or structural engineer before construction, ordering materials, or initiating permits.
        </p>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] font-medium opacity-80 shrink-0 self-end md:self-auto border-l pl-3 border-amber-300/40">
        <ShieldCheck className="w-3.5 h-3.5" />
        <span>Pre-Permit Concept draft</span>
      </div>
    </div>
  );
}
