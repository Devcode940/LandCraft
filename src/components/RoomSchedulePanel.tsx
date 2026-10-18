/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Room schedule: a printable area take-off of every room,
 * with CSV export for estimates and client documents.
 */

import { useMemo } from 'react';
import { CalendarRange, Download, X } from 'lucide-react';
import type { DimensionUnit, FloorPlanData } from '../types';
import { roomSchedule, scheduleToCsv } from '../lib/schedule';
import { downloadBlob } from '../lib/download';
import Modal from './Modal';

interface RoomSchedulePanelProps {
  plan: FloorPlanData;
  unit: DimensionUnit;
  onClose: () => void;
}

export default function RoomSchedulePanel({ plan, unit, onClose }: RoomSchedulePanelProps) {
  const schedule = useMemo(() => roomSchedule(plan, unit), [plan, unit]);

  const handleExportCsv = () => {
    downloadBlob(`landcraft-room-schedule-${Date.now()}.csv`, scheduleToCsv(schedule), 'text/csv');
  };

  return (
    <Modal
      label="Room schedule"
      onClose={onClose}
      overlayClassName="bg-slate-950/70 backdrop-blur-xs"
      className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col max-h-[85vh] bg-white dark:bg-slate-900"
    >
      <div className="p-4 sm:p-5 flex items-center justify-between border-b border-slate-800 bg-slate-950/60">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
            <CalendarRange className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-100 text-sm">Room Schedule</h3>
            <p className="text-[10px] text-slate-400">
              Area take-off · {schedule.rows.length} room
              {schedule.rows.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"
          aria-label="Close room schedule"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {schedule.rows.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">
            No rooms yet. Draw or stamp rooms to build the schedule.
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-700">
                <th className="pb-2 font-semibold">Room</th>
                <th className="pb-2 font-semibold text-right">Width</th>
                <th className="pb-2 font-semibold text-right">Depth</th>
                <th className="pb-2 font-semibold text-right">Area</th>
                <th className="pb-2 font-semibold text-right">Perimeter</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {schedule.rows.map((row) => (
                <tr key={row.id} className="text-slate-200">
                  <td className="py-1.5 font-medium">{row.label}</td>
                  <td className="py-1.5 text-right font-mono">{row.width}</td>
                  <td className="py-1.5 text-right font-mono">{row.height}</td>
                  <td className="py-1.5 text-right font-mono text-emerald-400 font-semibold">{row.area}</td>
                  <td className="py-1.5 text-right font-mono">{row.perimeter}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-600 text-slate-100 font-bold">
                <td className="pt-2">Total build area</td>
                <td colSpan={3} />
                <td className="pt-2 text-right font-mono text-emerald-400">{schedule.totalArea}</td>
              </tr>
            </tfoot>
          </table>
        )}
        <p className="mt-3 text-[10px] text-slate-500">
          Rooms are rectangular, so areas are exact for the rectangles drawn. Overlapping rooms double-count
          -- the canvas flags those conflicts.
        </p>
      </div>

      <div className="p-4 border-t border-slate-800 flex justify-end gap-2">
        <button
          onClick={handleExportCsv}
          disabled={schedule.rows.length === 0}
          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-bold cursor-pointer transition-colors flex items-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>
    </Modal>
  );
}
