import { config } from "./config";
export async function chooseArm(project_id:string, period:string, context:any={}){
  const res=await fetch(config.policyUrl+"/policy/choose",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({project_id, period, context})});
  if(!res.ok) throw new Error("policy_choose_failed");
  return res.json();
}
export async function updateArm(project_id:string, period:string, arm_id:string, reward_01:number, meta:any={}){
  const res=await fetch(config.policyUrl+"/policy/update",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({project_id, period, arm_id, reward_01, meta})});
  if(!res.ok) throw new Error("policy_update_failed");
  return res.json();
}
