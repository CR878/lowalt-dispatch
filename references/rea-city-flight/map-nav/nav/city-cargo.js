// A self-contained, metre-scale transport route between the hospital and mall roofs.
export const CARGO_START=Object.freeze({x:-81,y:27,z:11});
export const CARGO_END=Object.freeze({x:228,y:28.5,z:-120});
export const CARGO_CRUISE_HEIGHT=100;
export const CARGO_TIMING=Object.freeze({climb:4.5,cruise:13,descent:4.5});

const lerp=(a,b,t)=>a+(b-a)*t;
const ease=t=>t*t*(3-2*t);

export function makeCargoMission(){
  const distanceMeters=Math.hypot(CARGO_END.x-CARGO_START.x,CARGO_END.z-CARGO_START.z);
  return {phase:'climb',seconds:0,phaseSeconds:0,position:{...CARGO_START},velocity:{x:0,y:0,z:0},distanceMeters,
    totalSeconds:CARGO_TIMING.climb+CARGO_TIMING.cruise+CARGO_TIMING.descent,delivered:false};
}

export function stepCargoMission(mission,dt){
  if(!Number.isFinite(dt)||dt<=0||dt>.2)throw new Error('Invalid cargo timestep');
  const before={...mission.position},events={atCruise:false,atMall:false,delivered:false};
  if(mission.delivered){mission.velocity={x:0,y:0,z:0};return events;}
  mission.seconds+=dt;mission.phaseSeconds+=dt;
  if(mission.phase==='climb'){
    const u=Math.min(1,(mission.phaseSeconds+1e-8)/CARGO_TIMING.climb);
    mission.position.y=lerp(CARGO_START.y,CARGO_CRUISE_HEIGHT,ease(u));
    if(u>=1){mission.phase='cruise';mission.phaseSeconds=0;mission.position.y=CARGO_CRUISE_HEIGHT;events.atCruise=true;}
  }else if(mission.phase==='cruise'){
    const u=Math.min(1,(mission.phaseSeconds+1e-8)/CARGO_TIMING.cruise),t=ease(u);
    mission.position.x=lerp(CARGO_START.x,CARGO_END.x,t);
    mission.position.z=lerp(CARGO_START.z,CARGO_END.z,t);
    mission.position.y=CARGO_CRUISE_HEIGHT;
    if(u>=1){mission.phase='descent';mission.phaseSeconds=0;mission.position.x=CARGO_END.x;mission.position.z=CARGO_END.z;events.atMall=true;}
  }else if(mission.phase==='descent'){
    const u=Math.min(1,(mission.phaseSeconds+1e-8)/CARGO_TIMING.descent);
    mission.position.y=lerp(CARGO_CRUISE_HEIGHT,CARGO_END.y,ease(u));
    if(u>=1){mission.phase='delivered';mission.phaseSeconds=0;mission.position.y=CARGO_END.y;mission.seconds=mission.totalSeconds;mission.delivered=true;events.delivered=true;}
  }
  mission.velocity={x:(mission.position.x-before.x)/dt,y:(mission.position.y-before.y)/dt,z:(mission.position.z-before.z)/dt};
  return events;
}
