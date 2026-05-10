import { format } from 'date-fns';
import { UnitsStore, COMPONENTS } from '../types';

export interface BurndownPoint {
  date: string; // yyyy-MM-dd
  n: number;
  s: number;
  total: number;
}

const dateOnly = (iso: string) => iso.split('T')[0];

export function computeBurndown(units: UnitsStore, days = 30): BurndownPoint[] {
  const all = Object.values(units);
  const points: BurndownPoint[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - i);
    const dayStr = format(day, 'yyyy-MM-dd');

    let n = 0, s = 0;

    for (const unit of all) {
      let count = 0;

      for (const comp of COMPONENTS) {
        for (const issue of unit.components[comp.key].issues) {
          if (issue.deleted) continue;
          if (dateOnly(issue.dateFound) > dayStr) continue;
          if (issue.resolved && issue.dateFixed && dateOnly(issue.dateFixed) <= dayStr) continue;
          count++;
        }
      }

      for (const m of (unit.miscEquipment ?? [])) {
        if (m.deleted) continue;
        for (const issue of (m.issues ?? [])) {
          if (issue.deleted) continue;
          if (dateOnly(issue.dateFound) > dayStr) continue;
          if (issue.resolved && issue.dateFixed && dateOnly(issue.dateFixed) <= dayStr) continue;
          count++;
        }
      }

      if (unit.side === 'North') n += count;
      else s += count;
    }

    points.push({ date: dayStr, n, s, total: n + s });
  }

  return points;
}
