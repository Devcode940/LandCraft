/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Room schedule: a tabulated area take-off.
 *
 * Pure so it can be unit-tested and reused by exports. Rooms are
 * rectangles, so area and perimeter are exact; the schedule says
 * so rather than implying polygon precision.
 */

import type { DimensionUnit, FloorPlanData } from '../types';
import { calculateRoomArea, formatDimension } from '../utils/geoUtils';

export interface RoomScheduleRow {
  id: string;
  label: string;
  width: string;
  height: string;
  area: string;
  perimeter: string;
  /** Numeric area in the displayed unit's base (m² or ft²), for totals. */
  areaValue: number;
}

export interface RoomSchedule {
  rows: RoomScheduleRow[];
  totalArea: string;
  totalAreaValue: number;
}

export function roomSchedule(plan: FloorPlanData, unit: DimensionUnit): RoomSchedule {
  let total = 0;
  const rows = plan.rooms.map((room) => {
    const { area, formatted } = calculateRoomArea(room.width, room.height, unit);
    total += area;
    return {
      id: room.id,
      label: room.label,
      width: formatDimension(room.width, unit),
      height: formatDimension(room.height, unit),
      area: formatted,
      perimeter: `${formatDimension(2 * (room.width + room.height), unit)}`,
      areaValue: area,
    };
  });

  return {
    rows,
    totalAreaValue: total,
    totalArea: unit === 'm' ? `${total.toFixed(1)} m²` : `${Math.round(total)} sq ft`,
  };
}

/** RFC-4180-ish CSV: quotes fields containing commas or quotes. */
export function scheduleToCsv(schedule: RoomSchedule): string {
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = 'Room,Width,Height,Area,Perimeter';
  const lines = schedule.rows.map((r) =>
    [r.label, r.width, r.height, r.area, r.perimeter].map(escape).join(','),
  );
  return [header, ...lines, '', `Total,, ,${schedule.totalArea},`].join('\n');
}
