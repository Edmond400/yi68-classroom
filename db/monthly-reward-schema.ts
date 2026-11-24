import {sqliteTable,text,primaryKey,uniqueIndex,index} from 'drizzle-orm/sqlite-core';
export const monthlyAwards=sqliteTable('incentive_monthly_awards',{
 semesterId:text('semester_id').notNull(),studentId:text('student_id').notNull(),periodId:text('period_id').notNull(),awardedAt:text('awarded_at').notNull(),
},t=>[primaryKey({columns:[t.semesterId,t.studentId]}),uniqueIndex('idx_monthly_award_person_period').on(t.periodId,t.studentId),index('idx_monthly_awards_period').on(t.periodId)]);
export const prizeDeliveries=sqliteTable('incentive_prize_deliveries',{
 periodId:text('period_id').notNull(),studentId:text('student_id').notNull(),deliveredAt:text('delivered_at').notNull(),
},t=>[primaryKey({columns:[t.periodId,t.studentId]})]);
export const monthlyRedemptions=sqliteTable('incentive_monthly_redemptions',{
 semesterId:text('semester_id').notNull(),studentId:text('student_id').notNull(),periodId:text('period_id').notNull(),deliveredAt:text('delivered_at').notNull(),
},t=>[primaryKey({columns:[t.semesterId,t.studentId]})]);
