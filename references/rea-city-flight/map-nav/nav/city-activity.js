import * as T from 'three';
import {CITY,riverZ} from './city-world.js?v=city-style-v3';
import {STREETS,roadLift} from './city-layout.js?v=city-style-v3';
import {signalPhase} from './city-physics.js';
import {streetRoute,routePosition,stepTraffic} from './city-traffic.js';

export function animateCity(scene,city){
  const group=new T.Group();group.name='City traffic, pedestrians and vessels';scene.add(group);
  const box=new T.BoxGeometry(1,1,1),sphere=new T.SphereGeometry(1,8,6),cylinder=new T.CylinderGeometry(1,1,1,8).rotateZ(Math.PI/2);
  const white=new T.MeshStandardMaterial({color:0xf6fafc,roughness:.5}),blue=new T.MeshStandardMaterial({color:0x247fc4,roughness:.4}),glass=new T.MeshStandardMaterial({color:0x28596f,roughness:.28}),rubber=new T.MeshStandardMaterial({color:0x455762,roughness:.8});
  const dummy=new T.Object3D(),color=new T.Color();let lastTime=0;
  function instance(geo,mat,count,name){const m=new T.InstancedMesh(geo,mat,count);m.name=name;m.instanceMatrix.setUsage(T.DynamicDrawUsage);m.castShadow=true;group.add(m);return m;}
  function place(mesh,index,x,y,z,sx,sy,sz,yaw=0,rx=0){dummy.position.set(x,y,z);dummy.rotation.set(rx,yaw,0);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);}
  const routes=STREETS.map(r=>streetRoute(r,city.intersections));
  const vehicles=[];routes.forEach((r,j)=>{const count=Math.max(8,Math.round(r.length/74));for(let i=0;i<count;i++)vehicles.push({route:j,s:(i+.3)*r.length/count,speed:0,cruise:(r.road.height?14:6.5)+(i%3)*.7,length:i%7===0?7.3:4.1,bus:i%7===0,waiting:false});});
  const bodies=instance(box,white,vehicles.length,'Traffic bodies'),cabins=instance(box,glass,vehicles.length,'Traffic windows'),roofs=instance(box,white,vehicles.length,'Traffic roofs'),wheels=instance(cylinder,rubber,vehicles.length*4,'Traffic wheels');
  vehicles.forEach((v,i)=>bodies.setColorAt(i,color.set(i%19===0?0xc94248:i%4===0?0x288ccc:i%4===1?0xc4ddeb:0xffffff)));
  const bulbs=instance(sphere,new T.MeshBasicMaterial({color:0xffffff}),city.intersections.length*12,'Cycling signal lamps');bulbs.castShadow=false;
  const people=[];
  STREETS.filter(r=>r.axis==='z').forEach((r,i)=>{const x=r.at;for(const [a,b] of [[-134,-107],[-81,-34],[-7,33],[143,188],[220,238]])for(const side of [-1,1])people.push({x:x+side*6.8,a,b,z:a,phase:i*.13,speed:1.1+(i%2)*.2,cross:false});});
  city.intersections.forEach((p,i)=>{for(const j of [-1,1])people.push({cross:true,intersection:i,z:p.z+j*8,x:p.x-6.8,baseX:p.x,progress:0,direction:1,cycle:-1,offset:j===1?.25:.8});});
  const skin=new T.MeshStandardMaterial({color:0xc6cdd1,roughness:.8}),cloth=new T.MeshStandardMaterial({color:0x7297ab,roughness:.8});
  const heads=instance(sphere,skin,people.length,'Pedestrian heads'),torsos=instance(box,cloth,people.length,'Pedestrian bodies'),legs=instance(box,glass,people.length*2,'Pedestrian walking legs'),arms=instance(box,cloth,people.length*2,'Pedestrian walking arms');
  people.forEach((p,i)=>torsos.setColorAt(i,color.set(i%3===0?0x459ed3:i%3===1?0xf6fcff:0x9bbebd)));
  const boats=[];
  function part(parent,w,h,d,x,y,z,mat){const m=new T.Mesh(box,mat);m.scale.set(w,h,d);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;}
  for(let i=0;i<4;i++){
    const ship=new T.Group();ship.name=i%2?'Electric river ferry':'Container river vessel';group.add(ship);
    const hull=new T.Mesh(new T.ConeGeometry(2.2,3.4,4),blue);hull.rotation.x=Math.PI/2;hull.rotation.z=Math.PI/4;hull.position.set(0,.35,7);hull.scale.x=1.05;ship.add(hull);
    part(ship,4.2,1.2,13,0,.35,0,white);part(ship,4.1,.5,12,0,.9,0,blue);
    if(i%2){part(ship,3.5,1.8,9,0,1.8,0,white);part(ship,3.6,.8,8.8,0,1.9,0,glass);part(ship,3.7,.2,9.2,0,2.8,0,white);}else{for(let j=0;j<5;j++)part(ship,3.1,1.4,2.6,0,1.8,j*2.4-4,j%2?white:blue);part(ship,3.8,2.4,2.8,0,2,-5,white);part(ship,3.85,.65,2.1,0,2.4,-5,glass);ship.scale.set(1.5,1.1,2);}
    boats.push(ship);
  }
  function update(dt,time){
    stepTraffic(vehicles,routes,time,dt);
    vehicles.forEach((v,i)=>{
      const p=routePosition(routes[v.route],v.s),h=v.bus?2.6:1.25,y=roadLift(routes[v.route].road,p.x,p.z);
      place(bodies,i,p.x,y+.52+h*.32,p.z,1.85,h*.58,v.length,p.yaw);
      place(cabins,i,p.x,y+.66+h*.72,p.z,1.65,h*.48,v.length*(v.bus?.86:.58),p.yaw);
      place(roofs,i,p.x,y+.75+h*.94,p.z,1.7,.13,v.length*(v.bus?.90:.6),p.yaw);
      for(let k=0;k<4;k++){const a=k%2?1:-1,b=k<2?-1:1,l=v.length*.31,px=p.x+a*Math.cos(p.yaw)+b*l*Math.sin(p.yaw),pz=p.z-a*Math.sin(p.yaw)+b*l*Math.cos(p.yaw);place(wheels,i*4+k,px,y+.72,pz,.19,.34,.34,p.yaw);}
    });
    city.intersections.forEach((p,i)=>{
      const phase=signalPhase(time,i*2.1);let j=0;
      for(const sx of [-1,1])for(const sz of [-1,1]){const ns=sx===sz,selected=phase[ns?'ns':'ew'];for(let k=0;k<3;k++){
        const n=i*12+j*3+k,c=['red','amber','green'][k];place(bulbs,n,p.x+sx*7+(ns?0:sx*.33),4.99-k*.49,p.z+sz*7+(ns?sz*.33:0),.195,.195,.195);
        bulbs.setColorAt(n,color.set(c===selected?({red:0xfb4739,amber:0xffbe32,green:0x18d4a0}[c]):0x233b49));
      }j++;}
    });
    people.forEach((p,i)=>{
      let x=p.x,z=p.z,yaw=0,walking=true;
      if(p.cross){const local=time+p.intersection*2.1,phase=signalPhase(time,p.intersection*2.1),cycle=Math.floor(local/38);
        if(phase.pedestrian&&phase.t>=30+p.offset&&phase.t<31.5&&cycle!==p.cycle){p.cycle=cycle;p.direction=cycle%2?-1:1;p.progress=.001;}
        if(p.progress>0&&p.progress<1)p.progress=Math.min(1,p.progress+dt/6.3);
        const progress=p.progress||0;x=p.baseX+p.direction*(-6.8+progress*13.6);yaw=p.direction*Math.PI/2;walking=p.progress>0&&p.progress<1;
      }else{const t=(time*p.speed/(p.b-p.a)+p.phase)%2,dir=t<1?1:-1;z=p.a+(t<1?t:2-t)*(p.b-p.a);yaw=dir===1?0:Math.PI;}
      p.current={x,z};const swing=walking?Math.sin(time*7+i)*.32:0;
      place(heads,i,x,2.09,z,.18,.2,.18);place(torsos,i,x,1.62,z,.42,.59,.28,yaw);
      for(let j=0;j<2;j++){const side=j?1:-1,dx=Math.cos(yaw)*side*.115,dz=-Math.sin(yaw)*side*.115;place(legs,i*2+j,x+dx,1.06,z+dz,.13,.65,.16,yaw,swing*side);place(arms,i*2+j,x+dx*2.3,1.56,z+dz*2.3,.12,.58,.13,yaw,-swing*side);}
    });
    boats.forEach((ship,i)=>{const direction=i%2?-1:1,x=((time*(i%2?2.2:1.6)+i*167)%670-335)*direction;ship.position.set(x,.08+Math.sin(time+i)*.04,riverZ(x)+(i%2?4.2:-4.2));ship.rotation.y=Math.atan2(direction,.042*Math.cos((x+45)*.014)*direction);});
    for(const mesh of [bodies,cabins,roofs,wheels,bulbs,heads,torsos,legs,arms]){mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();}bulbs.instanceColor.needsUpdate=true;
  }
  update(0,0);
  return {update,stats:{vehicles:vehicles.length,pedestrians:people.length,vessels:boats.length,trafficRoutes:routes.length,coveredRoads:STREETS.map(r=>r.id)},getState:()=>({signals:city.intersections.map((p,i)=>({...p,...signalPhase(lastTime,i*2.1)})),vehicles:vehicles.map(v=>({...routePosition(routes[v.route],v.s),road:routes[v.route].road.id,speed:v.speed,waiting:v.waiting})),vessels:boats.map(b=>({x:b.position.x,z:b.position.z})),pedestrians:people.slice(-24).map(p=>({...p.current,progress:p.progress}))}),tick(dt,time){lastTime=time;update(dt,time);}};
}
