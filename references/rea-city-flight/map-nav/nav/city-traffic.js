// Arc-length routes and deterministic traffic logic, independent of rendering.
import {signalPhase} from './city-physics.js';
export function streetRoute(road,intersections){
  const lane=road.lane||2.65,start=road.min+10,end=road.max-10,straight=end-start,points=[];let length=0;
  const append=(u,v)=>{const p=road.axis==='x'?{x:u,z:road.at+v}:{x:road.at-v,z:u};if(points.length)length+=Math.hypot(p.x-points.at(-1).x,p.z-points.at(-1).z);points.push({...p,s:length});};
  append(start,lane);append(end,lane);
  for(let i=1;i<=20;i++){const a=i*Math.PI/20;append(end+lane*Math.sin(a),lane*Math.cos(a));}
  const half=length;append(start,-lane);
  for(let i=1;i<=20;i++){const a=i*Math.PI/20;append(start-lane*Math.sin(a),-lane*Math.cos(a));}
  const stops=[];
  if(!road.height)intersections.forEach((p,i)=>{const aligned=road.axis==='x'?p.z===road.at:p.x===road.at,u=road.axis==='x'?p.x:p.z;if(!aligned||u<start+20||u>end-20)return;stops.push({s:u-start-13,axis:road.axis==='x'?'ew':'ns',intersection:i},{s:half+end-u-13,axis:road.axis==='x'?'ew':'ns',intersection:i});});
  return {points,length,stops,road,straight};
}
export function rectangleRoute(left,right,top,bottom,intersections){
  const lane=2.65,radius=5;
  const corners=[{x:left+lane,z:top+lane},{x:right-lane,z:top+lane},{x:right-lane,z:bottom-lane},{x:left+lane,z:bottom-lane}];
  const actual=[[left,top],[right,top],[right,bottom],[left,bottom]],points=[],stops=[];
  let length=0;
  const append=p=>{if(points.length)length+=Math.hypot(p.x-points.at(-1).x,p.z-points.at(-1).z);points.push({...p,s:length});};
  for(let i=0;i<4;i++){
    const p=corners[i],prev=corners[(i+3)%4],next=corners[(i+1)%4];
    const incoming={x:Math.sign(p.x-prev.x),z:Math.sign(p.z-prev.z)},outgoing={x:Math.sign(next.x-p.x),z:Math.sign(next.z-p.z)};
    const a={x:p.x-incoming.x*radius,z:p.z-incoming.z*radius},b={x:p.x+outgoing.x*radius,z:p.z+outgoing.z*radius};
    append(a);stops.push({s:length-9,axis:incoming.x?'ew':'ns',intersection:intersections.findIndex(v=>v.x===actual[i][0]&&v.z===actual[i][1])});
    for(let k=1;k<=12;k++){const t=k/12,u=1-t;append({x:u*u*a.x+2*u*t*p.x+t*t*b.x,z:u*u*a.z+2*u*t*p.z+t*t*b.z});}
  }
  append(points[0]);for(const s of stops)s.s=(s.s+length)%length;
  return {points,stops,length};
}
export function routePosition(route,distance){
  const s=((distance%route.length)+route.length)%route.length,ps=route.points;
  let i=1;while(i<ps.length-1&&ps[i].s<s)i++;
  const a=ps[i-1],b=ps[i],t=(s-a.s)/(b.s-a.s||1),dx=b.x-a.x,dz=b.z-a.z;
  return {x:a.x+dx*t,z:a.z+dz*t,yaw:Math.atan2(dx,dz)};
}
export function stepTraffic(vehicles,routes,time,dt){
  const snapshots=vehicles.map(v=>v.s);
  vehicles.forEach((car,i)=>{
    const route=routes[car.route];let allowance=Infinity,waiting=false;
    for(const stop of route.stops){
      let ahead=(stop.s-car.s+route.length)%route.length;
      // A rounding error at the exact stop line must not become a full lap.
      if(ahead>route.length-1e-6)ahead=0;
      if(signalPhase(time,stop.intersection*2.1)[stop.axis]!=='green'&&ahead<26){allowance=Math.min(allowance,ahead);waiting=true;}
    }
    vehicles.forEach((other,j)=>{if(i===j||other.route!==car.route)return;const gap=(snapshots[j]-car.s+route.length)%route.length-(car.length+other.length)/2-2;if(gap<28)allowance=Math.min(allowance,Math.max(0,gap));});
    const desired=Math.min(car.cruise,Math.sqrt(Math.max(0,allowance)*4));
    car.speed+=(desired-car.speed)*(1-Math.exp(-dt*3));
    const step=Math.min(Math.max(0,allowance),car.speed*dt);if(step<.005&&allowance<.12)car.speed=0;
    car.s=(car.s+step)%route.length;car.waiting=waiting&&car.speed<.3;
  });
}
