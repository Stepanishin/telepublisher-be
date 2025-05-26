import { Frequency, TimeUnit } from '../models/user.model';

interface ScheduleParams {
  frequency: Frequency;
  customInterval?: number;
  customTimeUnit?: TimeUnit;
  preferredTime?: string;
  preferredDays?: string[];
}

/**
 * Calculate the next scheduled date for an autoposting rule
 */
export const calculateNextScheduledDate = (params: ScheduleParams): Date => {
  const {
    frequency,
    customInterval = 1,
    customTimeUnit = TimeUnit.DAYS,
    preferredTime = '12:00',
    preferredDays = ['monday', 'wednesday', 'friday']
  } = params;

  const now = new Date();
  const [hours, minutes] = preferredTime.split(':').map(Number);
  
  // Set the base date with the preferred time
  const baseDate = new Date(now);
  baseDate.setHours(hours || 12, minutes || 0, 0, 0);
  
  // If the base date is in the past, move it to the future
  if (baseDate.getTime() <= now.getTime()) {
    baseDate.setDate(baseDate.getDate() + 1);
  }
  
  let nextDate: Date;
  
  switch (frequency) {
    case Frequency.DAILY:
      // Simply use the base date (tomorrow if today's preferred time has passed)
      nextDate = baseDate;
      break;
      
    case Frequency.WEEKLY:
      // Find the next preferred day of the week
      nextDate = findNextWeekdayDate(baseDate, preferredDays);
      break;
      
    case Frequency.CUSTOM:
      // For custom intervals, we should calculate from current time, not baseDate
      // This ensures that posts happen every X minutes/hours/days from NOW
      nextDate = addTimeToDate(now, customInterval, customTimeUnit);
      break;
      
    default:
      nextDate = baseDate; // Default to daily if frequency is unknown
  }
  
  return nextDate;
};

/**
 * Find the next date that falls on one of the preferred weekdays
 */
const findNextWeekdayDate = (baseDate: Date, preferredDays: string[]): Date => {
  if (!preferredDays.length) {
    return baseDate; // If no preferred days, just return the base date
  }
  
  const weekdayMap: Record<string, number> = {
    'sunday': 0,
    'monday': 1,
    'tuesday': 2,
    'wednesday': 3,
    'thursday': 4,
    'friday': 5,
    'saturday': 6
  };
  
  // Convert preferred days to numbers
  const preferredDayNumbers = preferredDays
    .map(day => weekdayMap[day.toLowerCase()])
    .filter(dayNum => dayNum !== undefined)
    .sort((a, b) => a - b);
  
  if (!preferredDayNumbers.length) {
    return baseDate; // If no valid preferred days, just return the base date
  }
  
  const currentDayOfWeek = baseDate.getDay();
  
  // Find the next preferred day
  let daysToAdd = 0;
  let found = false;
  
  // First check if there's a preferred day later this week
  for (const dayNum of preferredDayNumbers) {
    if (dayNum > currentDayOfWeek) {
      daysToAdd = dayNum - currentDayOfWeek;
      found = true;
      break;
    }
  }
  
  // If not found, use the first preferred day next week
  if (!found) {
    daysToAdd = 7 - currentDayOfWeek + preferredDayNumbers[0];
  }
  
  const nextDate = new Date(baseDate);
  nextDate.setDate(nextDate.getDate() + daysToAdd);
  
  return nextDate;
};

/**
 * Add a time interval to a date
 */
const addTimeToDate = (date: Date, interval: number, unit: TimeUnit): Date => {
  const result = new Date(date);
  
  switch (unit) {
    case TimeUnit.MINUTES:
      result.setMinutes(result.getMinutes() + interval);
      break;
      
    case TimeUnit.HOURS:
      result.setHours(result.getHours() + interval);
      break;
      
    case TimeUnit.DAYS:
      result.setDate(result.getDate() + interval);
      break;
      
    default:
      // Default to days if unit is unknown
      result.setDate(result.getDate() + interval);
  }
  
  return result;
}; 