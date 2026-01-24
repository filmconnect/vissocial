import numpy as np
def choose(arms):
  best=None; bests=-1
  for k,ab in arms.items():
    a=float(ab.get("a",1.0)); b=float(ab.get("b",1.0))
    s=float(np.random.beta(a,b))
    if s>bests: bests=s; best=k
  return best or list(arms.keys())[0]
def update(arms, arm_id, reward):
  r=max(0.0,min(1.0,float(reward)))
  arms.setdefault(arm_id, {"a":1.0,"b":1.0})
  arms[arm_id]["a"]=float(arms[arm_id].get("a",1.0))+r
  arms[arm_id]["b"]=float(arms[arm_id].get("b",1.0))+(1.0-r)
  return arms
