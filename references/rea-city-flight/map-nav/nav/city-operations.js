import * as T from 'three';
import {ROOFTOP_DOCKS,SCENARIOS} from './city-dispatch.js?v=city-response-v18';

const white=new T.MeshStandardMaterial({color:0xf5fbff,roughness:.56,metalness:.16});
const pale=new T.MeshStandardMaterial({color:0xd8e8f2,roughness:.62,metalness:.12});
const dark=new T.MeshStandardMaterial({color:0x293c50,roughness:.58,metalness:.18});
const glass=new T.MeshStandardMaterial({color:0x7ac8e8,roughness:.22,metalness:.28});
const cyan=new T.MeshStandardMaterial({color:0x3bc7e8,emissive:0x1185b0,emissiveIntensity:.75,roughness:.4});
const green=new T.MeshBasicMaterial({color:0x28ec91,transparent:true,opacity:.65,depthWrite:false});

function box(parent,mat,w,h,d,x=0,y=0,z=0){const o=new T.Mesh(new T.BoxGeometry(w,h,d),mat);o.position.set(x,y,z);parent.add(o);return o;}
function cylinder(parent,mat,rt,rb,h,x=0,y=0,z=0){const o=new T.Mesh(new T.CylinderGeometry(rt,rb,h,12),mat);o.position.set(x,y,z);parent.add(o);return o;}
function ring(parent,mat,r,y=0,tube=.045){const o=new T.Mesh(new T.TorusGeometry(r,tube,6,48),mat.clone());o.rotation.x=Math.PI/2;o.position.y=y;parent.add(o);return o;}
function textSprite(text,color='#1689ba',scale=6.2){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=112;const c=canvas.getContext('2d');
  c.fillStyle='rgba(22,45,64,.88)';c.fillRect(0,0,512,112);c.fillStyle=color;c.fillRect(0,0,8,112);
  c.fillStyle=color;c.textAlign='center';c.textBaseline='middle';c.font='600 53px "PingFang SC",sans-serif';c.fillText(text,263,59,470);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));sprite.scale.set(scale,scale*112/512,1);return sprite;
}
function signalGlow(parent){
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
  const c=canvas.getContext('2d'),gradient=c.createRadialGradient(64,64,4,64,64,64);
  gradient.addColorStop(0,'rgba(255,255,255,.9)');gradient.addColorStop(.25,'rgba(255,255,255,.32)');gradient.addColorStop(1,'rgba(255,255,255,0)');
  c.fillStyle=gradient;c.fillRect(0,0,128,128);
  const texture=new T.CanvasTexture(canvas);
  const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,color:0x13bc73,transparent:true,opacity:.55,depthWrite:false}));
  sprite.position.set(0,1.45,0);sprite.scale.set(13,13,1);parent.add(sprite);return sprite;
}
function makeDock(root,loc){
  const g=new T.Group();g.name=`Rooftop dock · ${loc.name}`;g.position.set(loc.x,loc.y,loc.z);root.add(g);
  box(g,pale,4.5,.24,3.75,0,-.17,0);box(g,dark,3.35,.85,2.6,0,.38,0);
  box(g,white,3.45,.25,2.68,0,.91,0);
  for(const x of [-1.76,1.76]){box(g,white,.16,.96,2.74,x,.39,0);box(g,cyan,.045,.24,.44,x*1.052,.49,-.9);}
  for(const z of [-1.38,1.38])box(g,white,3.4,.94,.14,0,.42,z);
  const lids=[];
  for(const side of [-1,1]){
    const pivot=new T.Group();pivot.position.set(side*1.7,1.11,0);g.add(pivot);
    box(pivot,white,1.7,.15,2.65,-side*.85,.03,0);
    box(pivot,dark,1.48,.04,2.34,-side*.85,-.065,0);
    lids.push({pivot,side});
  }
  cylinder(g,pale,.12,.18,.55,1.87,1.38,-1.13);
  cylinder(g,dark,.15,.15,.10,1.87,1.7,-1.13);
  const label=textSprite(loc.name,'#8de5ff',5.8);label.position.set(0,3.5,0);g.add(label);
  const halo=ring(g,green,2.35,1.26,.11);halo.material.opacity=.32;
  const waves=[];
  for(let i=0;i<3;i++){const wave=ring(g,green,2.35,1.31+i*.035,.09);wave.material.opacity=.5;waves.push(wave);}
  const glow=signalGlow(g);
  const beacon=cylinder(g,green.clone(),.13,.13,.28,-1.91,.77,-1.46);
  const redLight=new T.PointLight(0xff264c,0,10,2);redLight.position.set(0,1.7,0);g.add(redLight);
  return {loc,g,lids,halo,waves,glow,beacon,redLight,open:0};
}
function makeCommand(root,x,z,y){
  const g=new T.Group();g.name='Rotating command centre';g.position.set(x,y,z);root.add(g);
  cylinder(g,white,2.5,2.8,.36,0,.18,0);cylinder(g,dark,1.5,1.6,1.7,0,1.2,0);
  cylinder(g,glass,1.22,1.3,1.4,0,1.27,0);
  const spin=new T.Group();spin.position.y=2.9;g.add(spin);
  const rings=[];for(const [r,angle] of [[2.25,0],[1.73,.82],[1.22,-.45]]){const mesh=new T.Mesh(new T.TorusGeometry(r,.11,8,48),new T.MeshBasicMaterial({color:0x38bfff,transparent:true,opacity:.82}));mesh.rotation.set(angle,0,Math.PI/2);spin.add(mesh);rings.push(mesh);}
  cylinder(spin,cyan,.22,.22,1.5);const core=new T.Mesh(new T.OctahedronGeometry(.68),new T.MeshStandardMaterial({color:0x87ddff,emissive:0x139bd7,emissiveIntensity:.85}));spin.add(core);
  const label=textSprite('指挥中心','#98e9ff',8.5);label.position.y=7.25;g.add(label);
  return {g,spin,rings};
}
function makeRoofBrand(root){
  // The round, blue-centred roof is at (-4, 13), not the tallest tower facade.
  const g=new T.Group();g.name='Rotating Sky Pioneer rooftop brand';g.position.set(-4,12.18,13);root.add(g);
  const roofBlue=new T.MeshStandardMaterial({color:0x1679b9,metalness:.13,roughness:.42});
  cylinder(g,roofBlue,8.7,8.7,.22,0,.18,0);cylinder(g,glass,7.9,7.9,.08,0,.34,0);
  const roofCanvas=document.createElement('canvas');roofCanvas.width=1024;roofCanvas.height=256;
  const rc=roofCanvas.getContext('2d');rc.clearRect(0,0,1024,256);rc.fillStyle='#ffffff';rc.textAlign='center';rc.textBaseline='middle';rc.font='900 153px "PingFang SC","Microsoft YaHei",sans-serif';rc.fillText('空域先锋',512,132,950);
  const roofTexture=new T.CanvasTexture(roofCanvas);roofTexture.colorSpace=T.SRGBColorSpace;
  const roofLettering=new T.Mesh(new T.PlaneGeometry(16,4),new T.MeshBasicMaterial({map:roofTexture,transparent:true,depthWrite:false,side:T.DoubleSide}));roofLettering.rotation.x=-Math.PI/2;roofLettering.position.y=.391;g.add(roofLettering);
  const spin=new T.Group();spin.position.y=.5;g.add(spin);
  spin.rotation.y=.65;
  for(const x of [-7.3,0,7.3])box(spin,pale,.65,3.7,.6,x,2.15,0);
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
  const c=canvas.getContext('2d');c.clearRect(0,0,1024,256);
  c.textAlign='center';c.textBaseline='middle';c.font='900 169px "PingFang SC","Microsoft YaHei",sans-serif';
  c.strokeStyle='#0d4c81';c.lineWidth=13;c.strokeText('空域先锋',512,132,950);c.fillStyle='#f6fdff';c.fillText('空域先锋',512,132,950);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;
  box(spin,dark,22.4,6.1,.8,0,5.1,0);
  box(spin,cyan,22.1,.21,.92,0,8.09,0);
  for(const side of [-1,1]){
    const face=new T.Mesh(new T.PlaneGeometry(21.6,5.4),new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:T.DoubleSide}));
    face.position.set(0,5.12,side*.44);face.rotation.y=side<0?Math.PI:0;spin.add(face);
  }
  return {g,spin};
}
function makeServiceVehicle(root,type){
  const emergency=type==='fire',g=new T.Group();g.name=emergency?'Fire engine responding':'Police patrol vehicle';root.add(g);
  const paint=new T.MeshStandardMaterial({color:emergency?0xcf3541:0xf5fbff,metalness:.2,roughness:.52});
  box(g,paint,emergency?2.55:2.15,.8,emergency?5.4:4.5,0,.74,0);
  box(g,emergency?paint:glass,emergency?2.3:1.75,.75,emergency?2.1:2.05,0,1.49,-.55);
  box(g,emergency?white:new T.MeshStandardMaterial({color:0x2779ba,roughness:.5}),emergency?2.4:2.18,.28,emergency?2.9:4.1,0,.82,.45);
  for(const x of [-1.13,1.13])for(const z of [-1.45,1.45])box(g,dark,.36,.57,.76,x,.38,z);
  const beacon=box(g,new T.MeshBasicMaterial({color:emergency?0xff3a39:0x188fff}),1,.22,.4,0,2.04,-.55);
  const glow=new T.PointLight(emergency?0xff3344:0x278efe,0,11,2);glow.position.set(0,2,-.55);g.add(glow);
  return {g,beacon,glow};
}
function placeVehicle(vehicle,points,t){
  const edges=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1]));
  let remaining=Math.max(0,Math.min(1,t))*edges.reduce((a,b)=>a+b,0),i=0;
  while(i<edges.length-1&&remaining>edges[i])remaining-=edges[i++];
  const a=points[i],b=points[i+1],u=Math.min(1,remaining/edges[i]);
  vehicle.g.position.set(a[0]+(b[0]-a[0])*u,0,a[1]+(b[1]-a[1])*u);
  vehicle.g.rotation.y=Math.atan2(b[0]-a[0],b[1]-a[1]);
}
function makeFire(root,site){
  const g=new T.Group();g.position.set(site.target.x,site.target.y,site.target.z);root.add(g);
  const flames=[];for(let i=0;i<7;i++){const material=new T.MeshBasicMaterial({color:i%2?0xff5d19:0xffb52d,transparent:true,opacity:.9});const f=new T.Mesh(new T.ConeGeometry(.85+i*.07,2+i*.25,7),material);f.position.set((i%3-1)*.72,1.05+i*.1,(Math.floor(i/3)-1)*.6);g.add(f);flames.push(f);}
  const smoke=[];for(let i=0;i<12;i++){const material=new T.MeshStandardMaterial({color:0x4e6070,transparent:true,opacity:.36,depthWrite:false,roughness:1});const s=new T.Mesh(new T.SphereGeometry(.65+i*.04,8,6),material);g.add(s);smoke.push(s);}
  const light=new T.PointLight(0xff6e22,3,19,2);light.position.y=2;g.add(light);
  return {g,update(time){flames.forEach((f,i)=>{f.scale.y=.68+.28*Math.sin(time*7+i*2.3);f.rotation.y=time*1.4+i;});smoke.forEach((s,i)=>{const u=(time*.13+i/12)%1;s.position.set(Math.sin(i*2.3+time*.35)*(1+u*2),1.7+u*13,Math.cos(i*1.8+time*.22)*(1+u*2));s.scale.setScalar(.8+u*2.7);s.material.opacity=(1-u)*.33;});light.intensity=2.7+.5*Math.sin(time*9);}};
}
function makeTraffic(root,site){
  const g=new T.Group();g.position.set(site.target.x,site.target.y,site.target.z);root.add(g);
  const car=(x,z,angle,color)=>{const vehicle=new T.Group();vehicle.position.set(x,.48,z);vehicle.rotation.y=angle;g.add(vehicle);const mat=new T.MeshStandardMaterial({color,metalness:.23,roughness:.48});box(vehicle,mat,4.6,.9,2.15);box(vehicle,glass,2.15,.78,1.85,.15,.78,0);for(const dx of [-1.5,1.5])for(const dz of [-1,1])cylinder(vehicle,dark,.44,.44,.24,dx,-.25,dz);};
  car(-2,-2.2,.25,0xf8fbff);car(2.8,2.4,-.24,0x2b79b4);
  for(const z of [-4.6,4.6]){const cone=new T.Mesh(new T.ConeGeometry(.32,.9,8),new T.MeshBasicMaterial({color:0xff7636}));cone.position.set(0,.5,z);g.add(cone);}
  const light=new T.PointLight(0xff8041,0,13,2);light.position.set(0,1.4,0);g.add(light);
  return {g,update(time){light.intensity=1.5+1.2*Math.sin(time*5)**2;}};
}
function makeRiver(root,site){
  const g=new T.Group();g.position.set(site.target.x,site.target.y,site.target.z);root.add(g);
  const bits=[];for(let i=0;i<8;i++){const mat=new T.MeshStandardMaterial({color:i%3?0xc9d7dc:0x57a0bd,roughness:.85});const b=box(g,mat,.6+(i%3)*.17,.12,.38+(i%2)*.2,Math.sin(i*2.4)*3.3,.15,Math.cos(i*2.1)*2.4);b.rotation.y=i*.64;bits.push(b);}
  const locator=ring(g,new T.MeshBasicMaterial({color:0x03a9cf,transparent:true,opacity:.65,depthWrite:false}),3.6,.25);
  return {g,update(time){bits.forEach((b,i)=>{b.position.x+=Math.sin(time*.6+i)*.0008;b.position.y=.13+Math.sin(time*1.7+i)*.055;});locator.rotation.z=time*.13;}};
}
function makePower(root,site){
  const g=new T.Group();g.position.set(site.target.x,site.target.y,site.target.z);root.add(g);
  const sparks=[];for(let i=0;i<5;i++){const o=new T.Mesh(new T.OctahedronGeometry(.3+i*.08),new T.MeshBasicMaterial({color:i%2?0xffd865:0xff703b,transparent:true,opacity:.8}));o.position.set(Math.sin(i*2.4)*1.5,Math.cos(i*1.7)*1.1,Math.cos(i*2.4)*1.4);g.add(o);sparks.push(o);}
  const light=new T.PointLight(0xffb340,0,12,2);g.add(light);
  return {g,update(time){sparks.forEach((o,i)=>{o.scale.setScalar(.55+.55*Math.sin(time*9+i*3)**2);o.rotation.y=time*3+i;});light.intensity=1+2*Math.sin(time*6)**2;}};
}

export function buildOperations(scene){
  const root=new T.Group();root.name='Sky Pioneer command and response network';scene.add(root);
  // Cantilevered maintenance bay beside the elevated roadway, outside both traffic lanes.
  box(root,white,9,.7,8,108,18.58,224);
  box(root,pale,9,.25,8,108,18.99,224);
  for(const x of [105,111])cylinder(root,pale,.42,.55,17.8,x,8.9,224);
  for(const z of [220.3,227.7])box(root,glass,9,.22,.16,108,19.45,z);
  const docks=new Map(ROOFTOP_DOCKS.map(loc=>[loc.id,makeDock(root,loc)]));
  const commands=[makeCommand(root,11,13,12.18)];
  const roofBrand=makeRoofBrand(root);
  const fireTruck=makeServiceVehicle(root,'fire');fireTruck.g.visible=false;
  const policeCar=makeServiceVehicle(root,'police');
  const fireRoute=[[-247,46],[-190,46],[-190,-20],[-112,-20],[-112,-94],[110,-94]];
  const policeRoute=[[-310,-94],[-190,-94],[-190,-20],[-316,-20],[-316,-94],[-310,-94]];
  const effects=new Map();for(const scenario of SCENARIOS){const factory={fire:makeFire,traffic:makeTraffic,river:makeRiver,power:makePower}[scenario.id];const effect=factory(root,scenario);effect.g.visible=false;effects.set(scenario.id,effect);}
  let active=null,activeDock=null,activeDetected=false,fireResponseSeconds=0;
  return {root,docks,commands,roofBrand,fireTruck,policeCar,effects,
    select(id){active=id;fireResponseSeconds=0;fireTruck.g.visible=false;placeVehicle(fireTruck,fireRoute,0);for(const [key,effect] of effects)effect.g.visible=key===id;},
    clear(){active=null;activeDock=null;activeDetected=false;fireResponseSeconds=0;fireTruck.g.visible=false;for(const effect of effects.values())effect.g.visible=false;},
    update(dt,time,dispatch){
      activeDock=dispatch?.dock.id??null;activeDetected=Boolean(dispatch?.detected);
      commands.forEach((c,i)=>{c.spin.rotation.y+=(i%2?-1:1)*dt*.26;c.rings[1].rotation.x+=dt*.14;});
      roofBrand.spin.rotation.y+=dt*.16;
      placeVehicle(policeCar,policeRoute,(time*7/620)%1);
      if(active==='fire'&&activeDetected){fireResponseSeconds+=dt;fireTruck.g.visible=true;placeVehicle(fireTruck,fireRoute,Math.min(1,fireResponseSeconds/9));}
      else fireTruck.g.visible=false;
      policeCar.glow.intensity=1.8+1.1*Math.sin(time*5)**2;
      fireTruck.glow.intensity=fireTruck.g.visible?2.8+1.5*Math.sin(time*8)**2:0;
      for(const dock of docks.values()){
        const selected=dispatch?.dock.id===dock.loc.id;
        const urgent=selected&&dispatch.detected;
        const target=selected?1:0;dock.open+=(target-dock.open)*Math.min(1,dt*2);
        dock.lids.forEach(({pivot,side})=>{pivot.rotation.z=-side*dock.open*1.02;});
        const signal=urgent?0xff3150:0x28ec91;
        dock.glow.material.color.setHex(urgent?0xff3150:0x13bc73);dock.glow.material.opacity=urgent?.76:.54+.09*Math.sin(time*1.3)**2;
        dock.halo.material.color.setHex(signal);dock.halo.material.opacity=urgent?.4:.28+.07*Math.sin(time*1.3)**2;
        dock.waves.forEach((wave,i)=>{const u=(time*.22+i/3)%1;wave.scale.setScalar(1+u*3.2);wave.material.color.setHex(signal);wave.material.opacity=(urgent?.7:.58)*(1-u)**1.35;});
        dock.beacon.material.color.setHex(signal);dock.beacon.material.opacity=urgent?.95:.8;dock.redLight.intensity=urgent?2.3:0;
      }
      if(active)effects.get(active)?.update(time);
    },
    getState(){return {docks:[...docks.values()].map(d=>({id:d.loc.id,name:d.loc.name,open:Number(d.open.toFixed(2)),signal:d.loc.id===activeDock&&activeDetected?'red':'green'})),command_centres:commands.length,command_location:'圆形建筑楼顶',rooftop_brand_rotating:true,police_patrolling:true,fire_engine_dispatched:fireTruck.g.visible,active_effect:active};}
  };
}
