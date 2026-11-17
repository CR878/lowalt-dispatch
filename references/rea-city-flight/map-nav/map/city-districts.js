import * as T from 'three';
import {CITY,STREETS,riverZ} from './city-layout.js?v=city-style-v3';

export function extendDistricts(api){
  const {world,mats,box,cyl,add,rod,tree,building,outline,approach,colliders,mapBuildings,intersections}=api;
  const landmarks=[];let treeCount=0;
  for(const [name,color] of Object.entries({red:0xc63742,green:0x178b83,gold:0xc99a49,mountain:0xc8dbe4,field:0x67b86e,crop:0x3c986a,grass:0x91cf8b,irrigation:0x59c7df}))mats[name]=new T.MeshStandardMaterial({color,roughness:.8});
  const forest=(x,z,h)=>{tree(x,z,h);treeCount++;};
  let seed=41023;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  function label(text,x,y,z,w=24,h=4,color='#2274b3',angle=0){
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=192;const ctx=canvas.getContext('2d');
    ctx.fillStyle=color;ctx.fillRect(0,0,1024,192);ctx.fillStyle='#fff';ctx.font='600 84px "PingFang SC","Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,100,950);
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;
    const mesh=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshStandardMaterial({map:texture,roughness:.75,side:T.DoubleSide}));mesh.position.set(x,y,z);mesh.rotation.y=angle;mesh.name='Building identifier: '+text;world.add(mesh);return mesh;
  }
  function landmark(name,x,z,w,d,h,accent){building(x,z,w,d,h,h>25?'tower':'office');box(accent,x,h*.76,z,w+.3,2,d+.3);box(accent,x,h+1.2,z,w*.55,.65,d*.55);landmarks.push({name,x,z});}
  function hRoad(z,a,b){const middle=(a+b)/2,len=b-a;box('white',middle,.12,z,len,.3,16);box('road',middle,.31,z,len,.12,11.2);for(let x=a+3;x<b-2;x+=6)if(!STREETS.some(r=>r.axis==='z'&&Math.abs(r.at-x)<9))box('line',x,.39,z,2.6,.02,.22);}
  function vRoad(x,a,b){const middle=(a+b)/2,len=b-a;box('white',x,.12,middle,16,.3,len);box('road',x,.31,middle,11.2,.12,len);for(let z=a+3;z<b-2;z+=6)if(!STREETS.some(r=>r.axis==='x'&&Math.abs(r.at-z)<9))box('line',x,.39,z,.22,.02,2.6);}
  // The original business district is retained at the centre, with new roads beyond it.
  for(const z of [-94,-20,46,124])hRoad(z,-455,-162);
  for(const z of [-94,-20])hRoad(z,162,455);
  for(const z of [-160,252])hRoad(z,-455,455);
  for(const x of CITY.xRoads){vRoad(x,-174,-139);vRoad(x,138,274);}
  for(const x of [-430,-316,-190,190,316,430]){
    vRoad(x,-174,274);const rz=riverZ(x);box('white',x,5.6,rz,16,.8,45);box('road',x,6.06,rz,11.2,.12,45);
    for(const side of [-1,1]){box('white',x+side*7.2,7,rz,.3,1.5,45);for(const end of [-1,1])cyl('white',x+side*6.6,2.8,rz+end*16,.65,5.6);approach(x,rz+side*22,6,rz+side*34,.4,16,'white');approach(x,rz+side*22,6.1,rz+side*34,.5,11.2,'road');}
    for(let z=rz-20;z<rz+22;z+=6)box('line',x,6.14,z,.2,.02,2.7);
  }
  for(const a of STREETS.filter(r=>r.axis==='z'))for(const b of STREETS.filter(r=>r.axis==='x'&&!r.height)){
    if(a.at<b.min||a.at>b.max||b.at<a.min||b.at>a.max||intersections.some(p=>p.x===a.at&&p.z===b.at))continue;
    const x=a.at,z=b.at;intersections.push({x,z});box('road',x,.39,z,11.3,.12,11.3);
    for(let i=-4;i<=4;i++){box('line',x+i,.48,z-8,.5,.025,3);box('line',x+i,.48,z+8,.5,.025,3);box('line',x-8,.48,z+i,3,.025,.5);box('line',x+8,.48,z+i,3,.025,.5);}
    for(const sx of [-1,1])for(const sz of [-1,1]){cyl('navy',x+sx*7,2.5,z+sz*7,.14,4.7);box('navy',x+sx*7,4.5,z+sz*7,.6,1.75,.6);}
  }
  // Northern ridge: triangulated, differently proportioned peaks with a forest belt.
  const mountains=[[-505,-331,61,54,56],[-397,-337,66,50,79],[-283,-342,68,52,104],[-161,-332,62,48,71],[-37,-348,79,55,135],[97,-340,73,53,114],[225,-335,72,48,84],[350,-342,66,53,105],[480,-337,63,49,66]];
  for(const [x,z,rx,rz,h] of mountains){
    const vertices=[],indices=[],rings=3,n=13;vertices.push(x+rx*.13,h,z-rz*.1);
    for(let ring=1;ring<=rings;ring++)for(let i=0;i<n;i++){const a=i*2*Math.PI/n,variation=.88+random()*.2,r=ring/rings;vertices.push(x+Math.cos(a)*rx*r*variation,h*(1-r)*(.78+random()*.25),z+Math.sin(a)*rz*r*variation);}
    for(let i=0;i<n;i++)indices.push(0,1+(i+1)%n,1+i);
    for(let ring=0;ring<rings-1;ring++)for(let i=0;i<n;i++){const a=1+ring*n+i,b=1+ring*n+(i+1)%n,c=a+n,d=b+n;indices.push(a,b,c,b,d,c);}
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();
    const shade=new T.Color(0x78a0b6),light=new T.Color(0xb9d8e7),snow=new T.Color(0xeaf7ff),colors=[];
    for(let i=0;i<vertices.length;i+=3){const height=vertices[i+1]/h,side=(vertices[i]-x)/rx;
      const tone=new T.Color().copy(shade).lerp(light,Math.max(.08,Math.min(.83,.42-side*.2+height*.12)));
      tone.lerp(snow,Math.max(0,Math.min(1,(height-.48)/.48)));colors.push(tone.r,tone.g,tone.b);
    }
    geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    const mesh=new T.Mesh(geo,new T.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true,side:T.DoubleSide}));mesh.castShadow=true;mesh.receiveShadow=true;mesh.name='Blue and snow mountain ridge';world.add(mesh);colliders.push({x,z,w:rx*1.55,d:rz*1.5,height:h});
    for(let i=0;i<25;i++){const a=random()*Math.PI*2,r=.8+random()*.5;const tx=x+Math.cos(a)*rx*r,tz=z+Math.sin(a)*rz*r;if(Math.abs(tx)<535&&tz< -292&&tz> -385)forest(tx,tz,4+random()*7);}
  }
  for(let i=0;i<210;i++){const x=-530+random()*1060,z=-301-random()*15;forest(x,z,3.5+random()*5);}
  // Large eastern lake opens directly into the navigable canal.
  const lake={x:253,z:60,rx:53,rz:57},vertices=[lake.x,.17,lake.z],indices=[],shore=[];
  for(let i=0;i<=90;i++){const a=i/90*Math.PI*2,r=1+.05*Math.sin(a*3)+.035*Math.cos(a*5),x=lake.x+Math.cos(a)*lake.rx*r,z=lake.z+Math.sin(a)*lake.rz*r;vertices.push(x,.17,z);shore.push(new T.Vector3(x,.25,z));if(i<90)indices.push(0,i+2,i+1);}
  const lg=new T.BufferGeometry();lg.setAttribute('position',new T.Float32BufferAttribute(vertices,3));lg.setIndex(indices);lg.computeVertexNormals();const lakeMesh=new T.Mesh(lg,mats.water);lakeMesh.receiveShadow=true;world.add(lakeMesh);world.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(shore,true),120,.75,6,true),mats.white));
  for(let i=0;i<110;i++){const a=random()*Math.PI*2,r=1.12+random()*.16,x=lake.x+Math.cos(a)*lake.rx*r,z=lake.z+Math.sin(a)*lake.rz*r;if(x>203&&x<304&&Math.abs(z-riverZ(x))>17)forest(x,z,3.5+random()*5);}
  box('white',255,.5,-2,33,.7,5);box('white',255,.5,5,4,.7,15);label('镜湖公园',253,4,-5,18,3,'#348c99');landmarks.push({name:'镜湖公园',x:253,z:60});
  // Recognizable service buildings: coloured massing plus readable façade identifiers.
  landmark('公安',-247,-122,48,30,22,'blue');building(-278,-122,13,23,34,'tower');label('公安  POLICE',-247,17,-106.85,35,5);label('公安',-271,29,-110.4,12,4);box('blue',-247,.45,-100,44,.12,9);
  landmark('消防救援',-247,15,48,25,15,'red');label('消防救援',-247,13.8,27.7,38,4,'#bc3541');
  for(let i=0;i<5;i++){const x=-265+i*9;box('navy',x,4.4,27.8,6.2,6.7,.2);outline(x,28,6.4,.35,7.8,.25,'red');box('red',x,1.7,33,2.2,2.3,6.5);box('glass',x,2.4,35,2.24,.6,1.7);box('white',x,3,32,1.5,.22,4.2);for(const dx of [-1.1,1.1])for(const z of [31,35])cyl('navy',x+dx,.65,z,.45,.6);}
  landmark('城市商场',250,-120,73,45,22,'blue');building(265,-126,34,29,31,'tower');box('glass',250,11,-97.25,69,14,.3);label('CITY MALL  城市商场',249,19,-97,57,5,'#1d80af');for(let i=0;i<8;i++)forest(219+i*9,-87,4.4);
  landmark('加油站',-250,-58,24,13,6,'green');box('green',-250,7.5,-43,49,1.7,24);box('white',-250,8.45,-43,49,.3,24);label('能源加油站',-250,7.55,-30.85,14,1.55,'#178b83');
  for(const x of [-268,-250,-232]){for(const z of [-50,-37]){box('white',x,3.8,z,.5,7.4,.5);box('green',x,1.6,z,1.3,2.6,.7);box('navy',x,2,z+.4,.8,.65,.05);rod([x+.8,2,z],[x+.8,.5,z],.07,'navy');}}
  box('white',-284,6,-40,2,12,2);label('加油站',-284,10,-38.9,8,3,'#178b83');
  label('城市医院',-81,15,24.7,22,3);landmarks.push({name:'城市医院',x:-81,z:11});
  // Substation, power corridor, warehouse district, and low-rise residential blocks.
  box('ivory',-252,.35,166,103,.5,39);landmark('变电站',-282,164,22,21,9,'gold');label('变电站',-282,7.4,174.7,17,3,'#91784c');
  for(let i=0;i<6;i++){const x=-256+i*10;box('white',x,2.4,164,5,4,9);for(const dx of [-1.7,1.7])cyl('navy',x+dx,5.6,164,.3,3);}
  for(const z of [150,179])for(let x=-286;x<=-215;x+=23){for(const side of [-1,1])rod([x+side*3,.2,z],[x+side,23,z],.17,'navy');for(let y=3;y<22;y+=4){rod([x-2.8,y,z],[x+2.8,y+4,z],.1,'navy');rod([x+2.8,y,z],[x-2.8,y+4,z],.1,'navy');}box('navy',x,21,z,10,.35,.6);box('navy',x,25,z,7,.35,.6);}
  for(let x=-276;x<290;x+=42){if(Math.abs(x-190)<22||Math.abs(x+190)<24||Math.abs(x+112)<15||Math.abs(x+42)<15||Math.abs(x-34)<15||Math.abs(x-110)<15||Math.abs(x+316)<16||Math.abs(x-316)<16)continue;building(x,-181,21,14,10+Math.floor(random()*13));building(x,273,22,14,7+Math.floor(random()*11));}
  for(const x of [-150,-78,-3,70,145,229,271]){building(x,170,23,25,9+random()*8);box('blue',x,1,184,25,.3,2);for(let i=0;i<4;i++)forest(x-12+i*8,190,4);}
  for(let i=0;i<90;i++){const x=-339+random()*36,z=-144+random()*264;if(STREETS.some(r=>r.axis==='x'&&Math.abs(z-r.at)<12)||Math.abs(z-riverZ(x))<17||Math.abs(x+316)<10)continue;forest(x,z,4+random()*6);}
  for(let i=0;i<90;i++){const x=209+random()*90,z=133+random()*23;forest(x,z,3.5+random()*6);}
  // A four-lane elevated expressway with pier caps, safety rails and direction signs.
  box('white',0,17.8,205,1085,1.4,24);box('road',0,18.57,205,1085,.15,22);box('white',0,18.9,205,1085,.45,.7);
  for(const z of [193.3,216.7]){box('white',0,19.2,z,1085,.9,.3);box('navy',0,19.8,z,1085,.12,.14);}
  for(let x=-535;x<537;x+=7)for(const z of [199.7,210.3])box('line',x,18.67,z,3.2,.025,.22);
  for(let x=-522;x<528;x+=32){for(const z of [197,213]){box('white',x,8.5,z,1.6,17,1.6);box('ivory',x,.5,z,5,1,5);}box('white',x,16.6,205,3,1.2,21);}
  for(const x of [-140,125]){for(const z of [193.5,216.5])box('navy',x,22.8,z,.4,8,.4);box('navy',x,26.5,205,.45,.4,24);label(x<0?'青云高架  →':'城市中心  →',x,25,205,19,3,'#287d72',Math.PI/2);}
  landmarks.push({name:'青云高架',x:0,z:205});
  // Street trees and furnishings in each expanded district, avoiding junctions.
  for(const x of [-430,-316,-190,190,316,430])for(let z=-143;z<263;z+=16){if(Math.abs(z-riverZ(x))<39||Math.abs(z-205)<18||STREETS.some(r=>r.axis==='x'&&Math.abs(r.at-z)<13))continue;for(const side of [-1,1])forest(x+side*10,z,4+random()*1.5);cyl('navy',x+7.5,3.4,z+5,.1,6.6);box('white',x+7.5,6.7,z+4,1,.18,2);}
  // A dense layered skyline sits in front of the mountain ridge; small buildings
  // use the same instanced materials as the interactive city, keeping it fast.
  for(let row=0;row<3;row++)for(let x=-525;x<=525;x+=13){
    const xx=x+(random()-.5)*4,z=-270+row*22+(random()-.5)*3;
    if(Math.abs(xx)<26&&row===2)continue;
    const h=(row===0?9:13)+random()*(row===2?37:24),w=6+random()*5,d=7+random()*6;
    box(row===0?'ivory':'white',xx,h/2+.35,z,w,h,d);
    box(random()>.78?'blue':'glass',xx,h*.7,z+d/2+.05,w*.72,h*.24,.12);
    box('ivory',xx,h+.55,z,w+.7,.35,d+.7);
  }
  // Western and eastern city wings give the panorama depth without shifting the
  // original dispatch targets or the flight paths used by existing demonstrations.
  for(const side of [-1,1])for(let ix=0;ix<4;ix++)for(let iz=0;iz<6;iz++){
    const x=side*(359+ix*40),z=-139+iz*68;
    if(Math.abs(z-riverZ(x))<37||Math.abs(z-205)<26||Math.abs(x-430)<13||Math.abs(z-252)<17)continue;
    const h=9+random()*18+(iz<3&&ix===2?14:0);
    building(x,z,14+random()*8,16+random()*9,h,h>25?'tower':'office');
  }
  // Agricultural south-west: segmented fields, irrigation, greenhouses and
  // an elevated crop-survey drone rather than a generic city block.
  box('field',-403,.12,330,263,.18,116);
  for(let i=0;i<5;i++){
    const x=-510+i*53;box(i%2?'grass':'crop',x,.27,327,47,.08,93);
    for(let j=0;j<11;j++)box(i%2?'crop':'grass',x,.34,287+j*8,44,.09,2.4);
    box('irrigation',x+24,.35,327,1.6,.06,93);
  }
  for(const [x,z] of [[-516,286],[-470,367],[-345,353]]){box('white',x,2.4,z,26,4.7,13);box('glass',x,5,z,26,.3,13);for(let j=-10;j<=10;j+=5)box('white',x+j,5.2,z,.35,.3,13);}
  box('blue',-401,1.1,270,55,.3,2);label('智慧农业',-403,9,275,34,6,'#23876c');
  // Natural resources: broad forest plots, a small reservoir, and a lookout.
  box('grass',-493,.12,-32,77,.13,220);
  box('field',-111,.12,330,178,.13,116);
  for(let i=0;i<230;i++){
    const x=i<125?-527+random()*62:-193+random()*165;
    const z=i<125?-139+random()*208:278+random()*104;
    if(Math.abs(z-riverZ(x))<25||Math.abs(z-252)<16)continue;
    forest(x,z,4+random()*7);
  }
  cyl('white',-486,14,-18,1.4,28);box('blue',-486,28,-18,10,1.1,10);
  for(const dx of [-4,4])for(const dz of [-4,4])rod([-486+dx,3,-18+dz],[-486,27,-18],.19,'navy');
  label('自然资源监测',-486,30,-11,32,5,'#187e82');
  // Larger eastern waterside district with a second marina, warehouses and
  // public spaces. The animated canal remains navigable through this area.
  box('grass',487,.15,302,104,.16,139);
  for(let i=0;i<65;i++){const x=442+random()*89,z=267+random()*99;forest(x,z,3.5+random()*5.5);}
  for(let x=374;x<=514;x+=30)for(const z of [-219,-189,291,329]){
    if(Math.abs(x-430)<13)continue;
    building(x,z,18,14,9+random()*22,random()>.7?'tower':'office');
  }
  for(const x of [-497,498]){box('white',x,.55,riverZ(x)+23,58,.6,7);for(let i=0;i<4;i++)box('blue',x-18+i*12,1.2,riverZ(x)+22,8,1.2,3);}
  // Fill the southern edge with a walkable residential campus and a wetland
  // belt. These blocks sit beyond the through-roads, so traffic paths remain
  // continuous while the default panorama has no vacant foreground.
  box('ivory',153,.17,333,274,.15,120);
  for(const z of [286,335,380]){box('white',153,.29,z,274,.16,7);box('grass',153,.38,z+5,274,.08,4);}
  for(const x of [31,76,121,166,211,256]){
    box('white',x,.31,333,5,.13,111);
    for(const z of [307,359]){
      const h=11+random()*16+(x===121||x===211?random()*15:0);
      building(x+14,z,16+random()*6,19,h,h>27?'tower':'office');
      box('blue',x+14,h+1.9,z,Math.min(9,h*.3),.35,7);
      for(const side of [-1,1])forest(x+side*11,z+side*14,3.5+random()*2);
    }
  }
  for(const [x,z] of [[41,331],[131,333],[221,331]]){
    cyl('white',x,.46,z,8,.3);cyl('grass',x,.66,z,6,.12);
    for(let i=0;i<6;i++){const a=i*Math.PI/3;forest(x+Math.cos(a)*5,z+Math.sin(a)*5,3.5);}
  }
  const wetland=new T.Mesh(new T.CircleGeometry(1,72),mats.water);
  wetland.rotation.x=-Math.PI/2;wetland.position.set(366,.29,337);wetland.scale.set(58,40,1);wetland.receiveShadow=true;world.add(wetland);
  for(let i=0;i<120;i++){
    const angle=random()*Math.PI*2,r=.95+random()*.28,x=366+Math.cos(angle)*58*r,z=337+Math.sin(angle)*40*r;
    if(x>282&&x<531&&z>275&&z<390)forest(x,z,3+random()*4);
  }
  for(const x of [326,364,405]){box('white',x,.5,379,27,.5,7);box('blue',x,1.2,379,12,.15,4);}
  // Western riverfront logistics yards, loading sheds and a compact service
  // neighbourhood provide visual activity beyond the original central blocks.
  for(const x of [-511,-482,-454])for(const z of [164,186,228]){
    if(Math.abs(x+430)<12)continue;
    building(x,z,18,15,9+random()*11);
    for(let i=0;i<3;i++)box(i===1?'blue':'white',x-7+i*7,.9,z+11,5,1.3,3);
  }
  for(const x of [-518,-488,-459])for(let i=0;i<5;i++)forest(x,278+i*18,4+random()*3);
  // Distinct civic and commercial rooflines around the new outer boulevards.
  for(const x of [-366,365,396,474])for(const z of [-145,-79,-12,144]){
    if(Math.abs(z-riverZ(x))<33||Math.abs(x-430)<12)continue;
    const h=13+random()*20;
    building(x,z,15+random()*5,16+random()*6,h,h>27?'tower':'office');
  }
  // Three restrained aircraft silhouettes hint at agriculture, survey and
  // the cargo network; live mission aircraft are still controlled separately.
  function distantDrone(x,y,z,s=1){box('white',x,y,z,3*s,.7*s,2.2*s);for(const dx of [-3.1,3.1])for(const dz of [-2.5,2.5]){rod([x,y,z],[x+dx*s,y+.2*s,z+dz*s],.17*s);cyl('navy',x+dx*s,y+.5*s,z+dz*s,.65*s,.36*s);box('navy',x+dx*s,y+.78*s,z+dz*s,2.7*s,.06*s,.22*s);}box('glass',x,y-.45*s,z+1.1*s,.9*s,.8*s,.7*s);}
  distantDrone(-405,28,323,1.1);distantDrone(-484,38,-72,1);distantDrone(392,42,-211,1.1);
  return {landmarks,lake,mountains,forestTrees:treeCount,roads:STREETS};
}
