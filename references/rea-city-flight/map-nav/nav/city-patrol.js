// Metre-scale inspection route. Every segment after the short plaza approach
// follows a rendered road centreline; the last segment rejoins the first.
export const PATROL_WAYPOINTS=[
  {x:34,z:12},{x:34,z:-160},{x:190,z:-160},{x:190,z:-94},
  {x:110,z:-94},{x:110,z:46},{x:-112,z:46},{x:-112,z:-94},
  {x:-316,z:-94},{x:-316,z:252},{x:316,z:252},{x:316,z:205},
  {x:-316,z:205},{x:-316,z:-160}
];
export const PATROL_ALERT_AFTER=10;
export const PATROL_ALERT_HOLD=3;
export const PATROL_SPEED=10;

export function makePatrol(start){
  const nearest=PATROL_WAYPOINTS.reduce((best,p,i)=>Math.hypot(start.x-p.x,start.z-p.z)<best.distance?{index:i,distance:Math.hypot(start.x-p.x,start.z-p.z)}:best,{index:0,distance:Infinity});
  return {active:true,phase:'flying',position:{...start},velocity:{x:0,y:0,z:0},targetIndex:nearest.index,seconds:0,alertSeconds:0,alertTriggered:false,alarms:0};
}

export function stepPatrol(patrol,dt){
  if(!patrol.active)return {startedAlert:false,resumed:false};
  dt=Math.min(Math.max(dt,0),.05);
  const events={startedAlert:false,resumed:false};
  if(patrol.phase==='alert'){
    patrol.velocity={x:0,y:0,z:0};patrol.alertSeconds=Math.min(PATROL_ALERT_HOLD,patrol.alertSeconds+dt);
    if(patrol.alertSeconds>=PATROL_ALERT_HOLD-1e-8){patrol.phase='flying';events.resumed=true;}
    return events;
  }
  const movingTime=patrol.alertTriggered?dt:Math.min(dt,Math.max(0,PATROL_ALERT_AFTER-patrol.seconds));
  const old={...patrol.position};let travel=PATROL_SPEED*movingTime;
  for(let loops=0;travel>1e-8&&loops<PATROL_WAYPOINTS.length+1;loops++){
    const target=PATROL_WAYPOINTS[patrol.targetIndex],dx=target.x-patrol.position.x,dz=target.z-patrol.position.z,distance=Math.hypot(dx,dz);
    if(distance<1e-6){patrol.targetIndex=patrol.targetIndex===PATROL_WAYPOINTS.length-1?1:patrol.targetIndex+1;continue;}
    const step=Math.min(travel,distance);patrol.position.x+=dx/distance*step;patrol.position.z+=dz/distance*step;travel-=step;
    if(step>=distance-1e-7)patrol.targetIndex=patrol.targetIndex===PATROL_WAYPOINTS.length-1?1:patrol.targetIndex+1;
  }
  patrol.position.y+=(30-patrol.position.y)*Math.min(1,movingTime*1.5);
  patrol.velocity={x:(patrol.position.x-old.x)/(movingTime||1),y:(patrol.position.y-old.y)/(movingTime||1),z:(patrol.position.z-old.z)/(movingTime||1)};
  patrol.seconds+=movingTime;
  if(!patrol.alertTriggered&&patrol.seconds>=PATROL_ALERT_AFTER-1e-8){patrol.phase='alert';patrol.alertTriggered=true;patrol.alarms++;patrol.alertSeconds=0;patrol.velocity={x:0,y:0,z:0};events.startedAlert=true;}
  return events;
}
