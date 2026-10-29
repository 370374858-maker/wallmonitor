                                                                               
export const visibleMonitorIssues = issues => issues.filter(issue =>
  issue !== '当前为旧版规则试运行，阈值与入槽后初凝时长尚待现场校准。');

export const policyLabel = policy => policy.confirmed ? '现场已确认' : policy.revision === 0 ? '默认规则' : '自定义规则';

                                                                    
export const progressSetting = data => data.modelSetting ?? data.evaluation?.setting;

                                                                        
                                                                
                                                               
export const displayEvaluation = data => data?.displayEvaluation ?? data?.evaluation;

export const displayMetric = (metrics, key) => {
  const value = metrics?.[key];
  return Number.isFinite(value) ? value : null;
};

export const metricTime = (metrics, key) => metrics?.[key] || null;

export const metricTimeText = (metrics, key, fallback = '时间未知') => {
  const value = metricTime(metrics, key);
  return value ? `来源 ${value.replace('T', ' ').slice(0, 19)}` : fallback;
};
