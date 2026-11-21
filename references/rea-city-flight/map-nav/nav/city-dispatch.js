import {riverZ} from './city-layout.js?v=city-style-v3';

// Metre-scale positions match the buildings and roads in city-world.js.
export const ROOFTOP_DOCKS=Object.freeze([
  {id:'central',name:'中央高楼机库',x:14,z:-52.5,y:80.18},
  {id:'police',name:'公安机库',x:-229,z:-111,y:23.18},
  {id:'fire',name:'消防机库',x:-229,z:24,y:16.18},
  {id:'mall',name:'商场机库',x:278,z:-103,y:23.18},
  {id:'skyway',name:'高架机库',x:108,z:224,y:19.22},
  {id:'hospital',name:'医院机库',x:-91,z:20,y:19.18}
]);

export const SCENARIOS=Object.freeze([
  {id:'fire',name:'火情巡检',type:'火情告警',tag:'消防协同',target:{x:86,z:-70,y:45},brief:'商业楼顶出现明火和烟雾',action:'发现火情 · 拍照及直播回传',result:'火点坐标已回传指挥中心，直播画面已接入，消防车正在赶赴现场。'},
  {id:'traffic',name:'交通事故',type:'事故告警',tag:'交通协同',target:{x:153,z:205,y:20},brief:'青云高架发生车辆碰撞',action:'现场取证 · 双次语音喊话',result:'事故影像已回传指挥中心，喊话已完成两遍。'},
  {id:'river',name:'河道巡检',type:'河道告警',tag:'网格处置',target:{x:-75,z:riverZ(-75),y:.5},brief:'河道发现垃圾漂浮物',action:'拍照定位 · 自动模拟派单',result:'漂浮物位置及照片已回传，已模拟派单给滨水网格员 07。'},
  {id:'power',name:'电力设施巡检',type:'设备告警',tag:'电力协同',target:{x:-286,z:150,y:26},brief:'变电站电塔出现异常闪光',action:'设备拍照 · 预警回传',result:'电塔异常画面已回传指挥中心，待人工复核。'}
]);

export function nearestDock(target,docks=ROOFTOP_DOCKS){
  return docks.reduce((best,dock)=>!best||Math.hypot(dock.x-target.x,dock.z-target.z)<Math.hypot(best.x-target.x,best.z-target.z)?dock:best,null);
}

export function startDispatch(id,docks=ROOFTOP_DOCKS){
  const scenario=SCENARIOS.find(item=>item.id===id);
  if(!scenario)throw new Error(`Unknown scenario: ${id}`);
  const dock=nearestDock(scenario.target,docks);
  const start={x:dock.x,y:dock.y+.58,z:dock.z};
  const end={x:scenario.target.x,y:Math.max(scenario.target.y+9,19),z:scenario.target.z-4};
  const cruiseY=Math.max(start.y+7,end.y+7,34);
  const distance=Math.hypot(end.x-start.x,end.z-start.z);
  const travelSeconds=Math.max(3,Math.min(5,3+distance/110));
  return {scenario,dock,phase:'opening',seconds:0,phaseSeconds:0,position:{...start},velocity:{x:0,y:0,z:0},start,end,cruiseY,distanceMeters:distance,travelSeconds,detected:false,photoSent:false,arrived:false};
}

const mix=(a,b,t)=>a+(b-a)*t;
const smooth=t=>t*t*(3-2*t);
export const DOCK_OPEN_SECONDS=2.4;
export const DOCK_LAUNCH_SECONDS=1.45;
export function stepDispatch(dispatch,dt){
  if(!Number.isFinite(dt)||dt<=0||dt>.2)throw new Error('Invalid dispatch timestep');
  const events={lifted:false,departed:false,arrived:false,detected:false,photoReady:false};
  const before={...dispatch.position};
  dispatch.seconds+=dt;dispatch.phaseSeconds+=dt;
  if(dispatch.phase==='opening'&&dispatch.phaseSeconds>=DOCK_OPEN_SECONDS){dispatch.phase='launching';dispatch.phaseSeconds=0;events.lifted=true;}
  if(dispatch.phase==='launching'){
    dispatch.position.y=mix(dispatch.start.y,dispatch.start.y+6.5,smooth(Math.min(1,dispatch.phaseSeconds/DOCK_LAUNCH_SECONDS)));
    if(dispatch.phaseSeconds>=DOCK_LAUNCH_SECONDS){dispatch.phase='flying';dispatch.phaseSeconds=0;events.departed=true;}
  }
  if(dispatch.phase==='flying'){
    const t=Math.min(1,dispatch.phaseSeconds/dispatch.travelSeconds),s=smooth(t);
    dispatch.position.x=mix(dispatch.start.x,dispatch.end.x,s);
    dispatch.position.z=mix(dispatch.start.z,dispatch.end.z,s);
    dispatch.position.y=t<.35?mix(dispatch.start.y+6.5,dispatch.cruiseY,smooth(t/.35)):t>.72?mix(dispatch.cruiseY,dispatch.end.y,smooth((t-.72)/.28)):dispatch.cruiseY;
    if(t>=1){dispatch.phase='observing';dispatch.phaseSeconds=0;dispatch.arrived=true;events.arrived=true;}
  }else if(dispatch.phase==='observing'){
    dispatch.position.y=dispatch.end.y+Math.sin(dispatch.phaseSeconds*1.7)*.15;
    if(dispatch.phaseSeconds>=1.05&&!dispatch.detected){dispatch.detected=true;events.detected=true;}
    if(dispatch.phaseSeconds>=2.25&&!dispatch.photoSent){dispatch.photoSent=true;events.photoReady=true;}
  }
  dispatch.velocity={x:(dispatch.position.x-before.x)/dt,y:(dispatch.position.y-before.y)/dt,z:(dispatch.position.z-before.z)/dt};
  return events;
}
