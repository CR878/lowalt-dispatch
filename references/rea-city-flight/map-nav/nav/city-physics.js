// Pure simulation math: independent of frame rate, renderer, and keyboard events.
export function makeFlight(start){return {position:{...start},velocity:{x:0,y:0,z:0},distance:0,blocked:false};}
export function stepFlight(state,input,dt,colliders,bounds={x:168,z:140}){
  dt=Math.min(Math.max(dt,0),.05);state.blocked=false;
  const length=Math.hypot(input.x,input.z)||1,den=Math.max(1,length);
  const desired={x:input.x/den*12,y:input.y*5,z:input.z/den*12};
  const blend=1-Math.exp(-dt*4.5);
  for(const axis of ['x','y','z'])state.velocity[axis]+=(desired[axis]-state.velocity[axis])*blend;
  const inside=p=>colliders.some(b=>Math.abs(p.x-b.x)<b.w/2+.8&&Math.abs(p.z-b.z)<b.d/2+.8&&p.y<b.height+.8);
  const steps=Math.max(1,Math.ceil(Math.hypot(...Object.values(state.velocity))*dt/.45));
  const old={...state.position};
  for(let i=0;i<steps;i++)for(const axis of ['x','z','y']){
    const next={...state.position};next[axis]+=state.velocity[axis]*dt/steps;
    if(next.x < -bounds.x||next.x>bounds.x||next.z < -bounds.z||next.z>bounds.z||next.y<2||next.y>120||inside(next)){state.velocity[axis]=0;state.blocked=true;}
    else state.position=next;
  }
  state.distance+=Math.hypot(state.position.x-old.x,state.position.y-old.y,state.position.z-old.z);
  return state;
}
export function signalPhase(time,offset=0){
  const t=((time+offset)%38+38)%38;
  return {ns:t<12?'green':t<14?'amber':'red',ew:t>=15&&t<27?'green':t>=27&&t<29?'amber':'red',pedestrian:t>=30,t};
}
