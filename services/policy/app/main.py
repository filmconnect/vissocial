from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Any, Dict
import json, uuid
from datetime import datetime, timezone
from .db import get_conn
from .bandit import choose, update

app=FastAPI(title="Vissocial Policy", version="0.1.0")

class ChooseReq(BaseModel):
  project_id:str
  period:str
  context:Dict[str,Any]=Field(default_factory=dict)

class ChooseResp(BaseModel):
  arm_id:str
  arm_params:Dict[str,Any]
  policy_state:Dict[str,Any]

class UpdateReq(BaseModel):
  project_id:str
  period:str
  arm_id:str
  reward_01:float
  meta:Dict[str,Any]=Field(default_factory=dict)

class UpdateResp(BaseModel):
  ok:bool=True
  policy_state:Dict[str,Any]

def now(): return datetime.now(timezone.utc)

def load_arms(conn):
  rows=conn.execute("SELECT id, params FROM bandit_arms ORDER BY id").fetchall()
  if not rows: raise HTTPException(500,"No arms in DB")
  return {r["id"]: r["params"] for r in rows}

def load_latest_state(conn, project_id, period, arms):
  row=conn.execute("SELECT state FROM policy_snapshots WHERE project_id=%s AND period=%s ORDER BY created_at DESC LIMIT 1",(project_id,period)).fetchone()
  if row and row.get("state"): state=row["state"]
  else:
    state={"arms":{k:{"a":1.0,"b":1.0} for k in arms.keys()}, "prefs":{"promo_ratio":0.35}}
  state.setdefault("arms",{})
  for k in arms.keys(): state["arms"].setdefault(k, {"a":1.0,"b":1.0})
  state.setdefault("prefs",{"promo_ratio":0.35})
  return state

@app.post("/policy/choose", response_model=ChooseResp)
def policy_choose(req:ChooseReq):
  with get_conn() as conn:
    arms=load_arms(conn)
    state=load_latest_state(conn, req.project_id, req.period, arms)
    arm_id=choose(state["arms"])
    return ChooseResp(arm_id=arm_id, arm_params=arms[arm_id], policy_state=state)

@app.post("/policy/update", response_model=UpdateResp)
def policy_update(req:UpdateReq):
  with get_conn() as conn:
    arms=load_arms(conn)
    state=load_latest_state(conn, req.project_id, req.period, arms)
    state["arms"]=update(state["arms"], req.arm_id, req.reward_01)
    sid="pol_"+uuid.uuid4().hex
    conn.execute("INSERT INTO policy_snapshots(id, project_id, period, state, created_at) VALUES (%s,%s,%s,%s,%s)",
                 (sid, req.project_id, req.period, json.dumps(state), now()))
    conn.commit()
    return UpdateResp(policy_state=state)
