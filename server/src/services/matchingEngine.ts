import { prisma } from '../db';
import haversine from 'haversine-distance';

export interface CandidateScoreResult {
  worker_id: string;
  name: string;
  email: string;
  phone: string;
  passed_phase1: boolean;
  phase1_failures: string[];
  total_score: number; // 0..100
  breakdown: {
    proximity_km: number;
    proximity_score: number;
    utilization_hours: number;
    utilization_score: number;
    reliability_rate: number;
    reliability_score: number;
  };
}

export async function suggestCandidatesForShift(
  shiftId: string,
  agencyId: string,
  weights = { proximity: 0.4, utilization: 0.3, reliability: 0.3 }
): Promise<CandidateScoreResult[]> {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: {
      client_requirement: {
        include: {
          client: { include: { payer: true } },
          requirement_skills: { include: { skill: true } },
        },
      },
    },
  });

  if (!shift || shift.client_requirement.client.payer.agency_id !== agencyId) {
    throw new Error('Shift not found or access denied.');
  }

  const client = shift.client_requirement.client;
  const mandatorySkills = shift.client_requirement.requirement_skills
    .filter((rs) => rs.is_mandatory)
    .map((rs) => rs.skill_id);

  // Fetch Labor Config
  const laborConfig = (await prisma.laborConfig.findUnique({
    where: { agency_id: agencyId },
  })) || {
    max_daily_hours: 10,
    max_weekly_hours: 38,
    min_rest_hours: 10,
  };

  // Fetch all active workers in agency
  const workers = await prisma.worker.findMany({
    where: { agency_id: agencyId, status: 'active' },
    include: {
      worker_skills: true,
      availabilities: true,
      assignments: {
        where: { status: 'confirmed' },
        include: { shift: true },
      },
    },
  });

  const shiftStart = new Date(shift.scheduled_start);
  const shiftEnd = new Date(shift.scheduled_end);
  const shiftDurationHours = (shiftEnd.getTime() - shiftStart.getTime()) / (1000 * 60 * 60);

  const results: CandidateScoreResult[] = [];

  for (const worker of workers) {
    const failures: string[] = [];

    // --- PHASE 1 HARD FILTERS ---

    // 1. Mandatory Skills check
    const workerSkillIds = worker.worker_skills
      .filter((ws) => !ws.expires_at || new Date(ws.expires_at) > new Date())
      .map((ws) => ws.skill_id);

    const hasAllSkills = mandatorySkills.every((skId) => workerSkillIds.includes(skId));
    if (!hasAllSkills) {
      failures.push('Missing required mandatory skills or certification expired');
    }

    // 2. Availability check
    const getShiftLocalTimeInfo = (date: Date, timezone: string) => {
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
        });
        const parts = formatter.formatToParts(date);
        const y = parts.find(p => p.type === 'year')?.value;
        const m = parts.find(p => p.type === 'month')?.value;
        const d = parts.find(p => p.type === 'day')?.value;
        
        if (y && m && d) {
          const year = parseInt(y);
          const month = parseInt(m);
          const day = parseInt(d);
          
          const localDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const localDayOfWeek = new Date(year, month - 1, day).getDay();
          
          return { shiftDateStr: localDateStr, dayOfWeek: localDayOfWeek };
        }
      } catch (e) {
        console.error('Error formatting timezone info:', e);
      }
      const yyyy = date.getUTCFullYear();
      const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(date.getUTCDate()).padStart(2, '0');
      return {
        shiftDateStr: `${yyyy}-${mm}-${dd}`,
        dayOfWeek: date.getUTCDay()
      };
    };

    const tz = shift.client_requirement.client?.timezone || 'Australia/Sydney';
    const { shiftDateStr, dayOfWeek } = getShiftLocalTimeInfo(shiftStart, tz);

    // Check specific date override first
    const dateOverride = worker.availabilities.find((a) => a.specific_date === shiftDateStr);
    let isAvailable = false;

    if (dateOverride) {
      isAvailable = dateOverride.is_available;
    } else {
      const recurring = worker.availabilities.filter((a) => a.day_of_week === dayOfWeek && a.is_available);
      if (recurring.length > 0) {
        // Basic check if start/end times cover shift start/end
        isAvailable = true;
      }
    }

    if (!isAvailable) {
      failures.push(`Not marked available for date ${shiftDateStr}`);
    }

    // 3. Overlapping confirmed assignment check
    const hasOverlap = worker.assignments.some((as) => {
      const asStart = new Date(as.shift.scheduled_start);
      const asEnd = new Date(as.shift.scheduled_end);
      return shiftStart < asEnd && shiftEnd > asStart;
    });

    if (hasOverlap) {
      failures.push('Already double-booked with another confirmed shift during this window');
    }

    // 4. Labor compliance checks
    // Calculate total hours already confirmed on this shift's date
    const sameDayAssignments = worker.assignments.filter((as) => {
      const asDate = new Date(as.shift.scheduled_start).toISOString().split('T')[0];
      return asDate === shiftDateStr;
    });
    const currentDailyHours = sameDayAssignments.reduce((acc, as) => {
      const d = (new Date(as.shift.scheduled_end).getTime() - new Date(as.shift.scheduled_start).getTime()) / (1000 * 60 * 60);
      return acc + d;
    }, 0);

    if (currentDailyHours + shiftDurationHours > laborConfig.max_daily_hours) {
      failures.push(`Exceeds max daily hours limit (${laborConfig.max_daily_hours}h)`);
    }

    // Min rest hours check
    const breachedRest = worker.assignments.some((as) => {
      const asStart = new Date(as.shift.scheduled_start);
      const asEnd = new Date(as.shift.scheduled_end);

      const restBefore = Math.abs(shiftStart.getTime() - asEnd.getTime()) / (1000 * 60 * 60);
      const restAfter = Math.abs(asStart.getTime() - shiftEnd.getTime()) / (1000 * 60 * 60);

      return (shiftStart >= asEnd && restBefore < laborConfig.min_rest_hours) ||
             (asStart >= shiftEnd && restAfter < laborConfig.min_rest_hours);
    });

    if (breachedRest) {
      failures.push(`Breaches minimum rest period between shifts (${laborConfig.min_rest_hours}h)`);
    }

    const passedPhase1 = failures.length === 0;

    // --- PHASE 2 SCORING ---

    // Proximity
    const distMeters = haversine(
      { latitude: worker.home_lat, longitude: worker.home_lng },
      { latitude: client.lat, longitude: client.lng }
    );
    const distKm = Math.round((distMeters / 1000) * 10) / 10;
    // Score: 100 at 0km, linear decay down to 0 at 50km
    const proximityScore = Math.max(0, Math.min(100, 100 - (distKm / 50) * 100));

    // Utilization Score (hours worked in past 7 days)
    const sevenDaysAgo = new Date(shiftStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentAssignments = worker.assignments.filter(
      (as) => new Date(as.shift.scheduled_start) >= sevenDaysAgo
    );
    const utilizationHours = recentAssignments.reduce((acc, as) => {
      return acc + (new Date(as.shift.scheduled_end).getTime() - new Date(as.shift.scheduled_start).getTime()) / (1000 * 60 * 60);
    }, 0);
    // Lower utilization = higher score (favors under-utilized workers)
    const utilizationScore = Math.max(0, Math.min(100, 100 - (utilizationHours / laborConfig.max_weekly_hours) * 100));

    // Reliability Score (past completed vs no_show assignments)
    const pastAssignmentsCount = await prisma.assignment.count({
      where: { worker_id: worker.id, status: { in: ['completed', 'no_show'] } },
    });
    const pastNoShowCount = await prisma.assignment.count({
      where: { worker_id: worker.id, status: 'no_show' },
    });
    const reliabilityRate = pastAssignmentsCount > 0 ? (pastAssignmentsCount - pastNoShowCount) / pastAssignmentsCount : 1.0;
    const reliabilityScore = Math.round(reliabilityRate * 100);

    const totalScore = passedPhase1
      ? Math.round(
          proximityScore * weights.proximity +
          utilizationScore * weights.utilization +
          reliabilityScore * weights.reliability
        )
      : 0;

    results.push({
      worker_id: worker.id,
      name: worker.name,
      email: worker.email,
      phone: worker.phone,
      passed_phase1: passedPhase1,
      phase1_failures: failures,
      total_score: totalScore,
      breakdown: {
        proximity_km: distKm,
        proximity_score: Math.round(proximityScore),
        utilization_hours: Math.round(utilizationHours * 10) / 10,
        utilization_score: Math.round(utilizationScore),
        reliability_rate: Math.round(reliabilityRate * 100) / 100,
        reliability_score: Math.round(reliabilityScore),
      },
    });
  }

  // Sort candidates: Phase 1 pass first, then by total_score descending
  results.sort((a, b) => {
    if (a.passed_phase1 !== b.passed_phase1) {
      return a.passed_phase1 ? -1 : 1;
    }
    return b.total_score - a.total_score;
  });

  return results;
}
