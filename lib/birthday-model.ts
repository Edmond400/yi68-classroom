export const participationLabels={yes:'想参加',no:'暂不参加',unsure:'还没想好'} as const;
export type Participation=keyof typeof participationLabels;
export function daysInBirthdayMonth(month:number){return [31,29,31,30,31,30,31,31,30,31,30,31][month-1]||0;}
export type BirthdayResponse={id:string;name:string;month:number;day:number;participation:Participation;created_at:string;duplicate_count:number};
export type BirthdayResults={rows:BirthdayResponse[];total:number;counts:Record<Participation,number>};
