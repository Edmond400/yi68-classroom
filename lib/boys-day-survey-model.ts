export const boysDaySurveyPath = '/survey/boys-day';
export const boysDaySurveyApi = '/api/survey/boys-day';
export const boysDayAdminApi = '/api/admin/surveys/boys-day';

export const boysDayCopyFields = {
  title: { label: '问卷标题', max: 100 },
  description: { label: '开头说明', max: 600, multiline: true },
  nameLabel: { label: '姓名题题干', max: 100 },
  nameHint: { label: '姓名题提示', max: 160, optional: true },
  pairsLabel: { label: '词对题题干', max: 100 },
  pairsHint: { label: '词对题提示', max: 400, multiline: true, optional: true },
  pairsExample: { label: '词对示例', max: 300, multiline: true, optional: true },
  introductionLabel: { label: '自我介绍题题干', max: 100 },
  introductionHint: { label: '自我介绍题提示', max: 400, multiline: true, optional: true },
  submitLabel: { label: '提交按钮文字', max: 24 },
  successTitle: { label: '提交成功标题', max: 100 },
  successText: { label: '提交成功说明', max: 400, multiline: true, optional: true },
  closedText: { label: '截止提示', max: 400, multiline: true },
} satisfies Record<string, { label: string; max: number; multiline?: boolean; optional?: boolean }>;

export type BoysDayCopyKey = keyof typeof boysDayCopyFields;
export type BoysDaySurvey = { open: boolean; copy: Record<BoysDayCopyKey, string> };

export const defaultBoysDaySurvey: BoysDaySurvey = {
  open: true,
  copy: {
    title: '艺68男生节｜「谁是卧底」征题',
    description: '男生节联谊准备玩「谁是卧底」，想请艺68的同学一起出题。食物、娱乐活动、体育项目、专业、清华园日常，或者六字班新生梗，都可以出。想到一对就可以填，有几对也欢迎一起交。',
    nameLabel: '你的姓名',
    nameHint: '',
    pairsLabel: '你想给「谁是卧底」出什么词对？',
    pairsHint: '两个词有点像、又有点区别就好。有多组的话，每行写一对。词对和自我介绍，填其中一项也可以。',
    pairsExample: '奶茶／果茶\n羽毛球／网球',
    introductionLabel: '想留一句自我介绍吗？',
    introductionHint: '有趣一点可以，简单一句也行。如果你出的词对被选中，揭晓后可以用这句话跟大家打个招呼。',
    submitLabel: '提交',
    successTitle: '提交成功，谢谢你！',
    successText: '你的投稿已经收到。',
    closedText: '这一轮征题已截止，谢谢大家。',
  },
};

export const boysDayResponseLimits = { name: 40, pairs: 2000, introduction: 160 };

export type BoysDayResponse = {
  id: string;
  name: string;
  pairs: string;
  introduction: string;
  created_at: string;
};
