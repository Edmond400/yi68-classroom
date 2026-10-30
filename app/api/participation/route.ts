import { z } from 'zod';
import { requireStudent,throttle } from '@/lib/accounts';
import { fail,json,readJson } from '@/lib/http';
import { actualTime,key,kindSchema,studentParticipation,submitClaim } from '@/lib/incentives';
import { validate } from '@/lib/validation';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const student=await requireStudent(request);return json({student,...await studentParticipation(student.student_id)})}catch(e){return fail(e)}}
export async function POST(request:Request){try{const student=await requireStudent(request);const p=validate(z.object({id:z.string().uuid(),activity_id:key.optional(),task_title:z.string().trim().min(1).max(150),kind:kindSchema,occurred_at:z.string().min(1).max(40),content:z.string().trim().min(1).max(3000),note:z.string().max(2000)}).strict(),await readJson(request));await throttle(request,'claim',student.student_id);await submitClaim(student.student_id,p);return json({ok:true})}catch(e){return fail(e)}}
