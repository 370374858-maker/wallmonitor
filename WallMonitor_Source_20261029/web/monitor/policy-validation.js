import {POLICY_INTERVALS,policyIntervalIssues} from '../../shared/policy-intervals.js';
import {showFieldErrors} from '../ui/form-feedback.js';

export function syncPolicyIntervalInputs(form,{showErrors=false}={}) {
  const controls=POLICY_INTERVALS.flatMap(group=>['normalMin','normalMax','warningMin','warningMax'].map(key=>form.elements.namedItem(group[key])));
  const values=Object.fromEntries(controls.map(input=>[input.name,input.value.trim()===''?NaN:Number(input.value)]));
  const issues=policyIntervalIssues(values);
  for(const input of controls){
    input.setCustomValidity(issues[input.name]||'');
    if(showErrors){input.removeAttribute('aria-invalid');delete input.dataset.noticeInvalid;}
  }
  if(showErrors)showFieldErrors(form,issues,null,{focus:false});
  return issues;
}
