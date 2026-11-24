// Only fixed, non-sensitive error codes may appear in the post/redirect/get URL.
export const accountAccessErrors: Record<string, string> = {
  invalid: '提交内容有误，请检查姓名、密码和激活码后重试。密码至少4位。',
  credentials: '姓名或密码不正确，或账号尚未激活。请检查后重试。',
  activation: '姓名或激活码不匹配，或激活码已过期。请联系班长核对。',
  conflict: '账号已激活或名册存在同名，请尝试登录，或联系班长核对。',
  source: '请求来源无法核实，请从本站重新打开登录页面后重试。',
  throttled: '尝试次数较多，请15分钟后再试。',
  unavailable: '暂时无法完成登录，请稍后重试。',
  cookies: '登录状态未能保留。请重新输入姓名，系统将使用兼容登录方式。',
};
