(function (G) {
  'use strict';
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var easeIO = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  // 局部 ENU，3000 x 3000 m，z 为离地高度。全部硬编码草稿几何。
  var SCENE = {
    buildings: [
      [300,400,180,160,90],[700,300,150,220,140],[1100,650,220,150,80],
      [1600,300,160,180,120],[2100,500,200,160,100],[2600,350,180,200,150],
      [400,1100,200,150,110],[900,1250,160,200,70],[1350,1000,220,180,130],
      [1850,1200,170,190,90],[2350,1050,200,150,120],[2750,1300,160,180,80],
      [350,1800,180,200,100],[800,2000,200,160,140],[1250,1750,160,180,85],
      [1750,2050,220,150,110],[2250,1850,170,200,95],[2650,2100,200,160,130],
      [550,2500,190,170,80],[1500,2600,210,180,120],[2450,2600,180,190,100]
    ],
    zones: [
      [1300,1300,400,400,190,'R01','#ff6b5a'],
      [2250,600,300,250,150,'R02','#ffb454'],
      [400,700,250,220,140,'R03','#ffb454'],
      [2445,2445,110,110,220,'R04','#ff6b5a']
    ],
    route: [
      [150,150,60],[420,420,110],[900,900,135],[1300,1300,150],
      [1700,1700,155],[2100,2100,140],[2500,2500,120],[2650,2750,90]
    ],
    sites: [[400,2200,'L1'],[1500,700,'L2'],[2700,1500,'L3'],[2400,2700,'L4']]
  };

  // 针孔相机：fwd / right / up 正交基，Z<near 由调用方裁剪
  function projector(eye, yaw, pitch, fov, W, H) {
    var cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
    var f = (H / 2) / Math.tan(fov / 2);
    var fx = cp * cy, fy = cp * sy, fz = sp;
    var rx = -sy, ry = cy;
    var ux = -sp * cy, uy = -sp * sy, uz = cp;
    return function (p) {
      var dx = p[0] - eye[0], dy = p[1] - eye[1], dz = p[2] - eye[2];
      var Z = dx * fx + dy * fy + dz * fz;
      if (Z < 2) return null;
      return { x: W / 2 + f * (dx * rx + dy * ry) / Z,
               y: H / 2 - f * (dx * ux + dy * uy + dz * uz) / Z, z: Z };
    };
  }

  function path3(P, pts, ctx, close) {
    var started = false;
    for (var i = 0; i < pts.length; i++) {
      var q = P(pts[i]);
      if (!q) { started = false; continue; }
      if (!started) { ctx.moveTo(q.x, q.y); started = true; } else ctx.lineTo(q.x, q.y);
    }
    if (close) ctx.closePath();
    return started;
  }

  function stroke3(P, a, b, ctx, color, width, n) {
    n = n || 40;
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
    var started = false;
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      var q = P([lerp(a[0],b[0],t), lerp(a[1],b[1],t), lerp(a[2],b[2],t)]);
      if (!q) { started = false; continue; }
      if (!started) { ctx.moveTo(q.x, q.y); started = true; } else ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
  }

  function boxFaces(b) {
    var x=b[0], y=b[1], w=b[2], d=b[3], h=b[4];
    var v = [[x,y,0],[x+w,y,0],[x+w,y+d,0],[x,y+d,0],
             [x,y,h],[x+w,y,h],[x+w,y+d,h],[x,y+d,h]];
    return { v:v, faces:[[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],[4,5,6,7]] };
  }

  function drawScene(ctx, G2, P, cfg, env, t) {
    var W = cfg.W, H = cfg.H, pal = cfg.pal, mode = cfg.mode;

    // 天空 + 大气
    var sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, pal.sky0); sky.addColorStop(.62, pal.sky1); sky.addColorStop(1, pal.sky2);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    // 地面网格（透视收束）
    ctx.lineWidth = 1;
    for (var g = -1000; g <= 4200; g += 250) {
      var a = clamp(1 - Math.abs(g - 1500) / 5200, .12, .7);
      stroke3(P, [g,-1000,0], [g,4200,0], ctx, pal.grid.replace('ALPHA', a.toFixed(2)), 1, 48);
      stroke3(P, [-1000,g,0], [4200,g,0], ctx, pal.grid.replace('ALPHA', a.toFixed(2)), 1, 48);
    }

    // 限制区体积：地面 + 四角立柱 + 顶面
    for (var zi = 0; zi < SCENE.zones.length; zi++) {
      var z = SCENE.zones[zi], zx=z[0], zy=z[1], zw=z[2], zd=z[3], zh=z[4];
      var q = [[zx,zy,0],[zx+zw,zy,0],[zx+zw,zy+zd,0],[zx,zy+zd,0]].map(P);
      if (q.every(Boolean)) {
        ctx.beginPath(); path3(P, [[zx,zy,0],[zx+zw,zy,0],[zx+zw,zy+zd,0],[zx,zy+zd,0]], ctx, true);
        ctx.fillStyle = pal.zoneFill; ctx.fill();
        ctx.strokeStyle = z[6]; ctx.lineWidth = 1.4; ctx.stroke();
      }
      for (var c = 0; c < 4; c++) {
        var bx = zx + (c===1||c===2?zw:0), by = zy + (c>=2?zd:0);
        stroke3(P, [bx,by,0], [bx,by,zh], ctx, z[6], 1, 2);
      }
      var top = [[zx,zy,zh],[zx+zw,zy,zh],[zx+zw,zy+zd,zh],[zx,zy+zd,zh]];
      ctx.beginPath(); if (path3(P, top, ctx, true)) { ctx.strokeStyle = z[6]; ctx.lineWidth = 1; ctx.stroke(); }
      var lab = P([zx+zw/2, zy+zd/2, zh+30]);
      if (lab) { ctx.fillStyle = z[6]; ctx.font = '10px monospace'; ctx.textAlign='center'; ctx.fillText(z[5], lab.x, lab.y); ctx.textAlign='left'; }
    }

    // 建筑：按深度从远到近
    var boxes = SCENE.buildings.map(function (b) {
      var c = P([b[0]+b[2]/2, b[1]+b[3]/2, b[4]/2]);
      return { b:b, z:c ? c.z : -1 };
    }).sort(function (a,b) { return b.z - a.z; });
    for (var bi = 0; bi < boxes.length; bi++) {
      var bf = boxFaces(boxes[bi].b);
      var pv = bf.v.map(P);
      for (var fi = 0; fi < bf.faces.length; fi++) {
        var ids = bf.faces[fi];
        if (ids.some(function (id) { return !pv[id]; })) continue;
        var pts = ids.map(function (id) { return [pv[id].x, pv[id].y]; });
        ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]);
        for (var pi=1;pi<pts.length;pi++) ctx.lineTo(pts[pi][0],pts[pi][1]);
        ctx.closePath();
        var fade = clamp(1 - boxes[bi].z/5000, .15, 1);
        ctx.fillStyle = fi===4 ? pal.boxTop.replace('ALPHA',(fade*.85).toFixed(2))
                               : pal.boxSide.replace('ALPHA',(fade*.42).toFixed(2));
        ctx.fill();
        ctx.strokeStyle = pal.boxEdge.replace('ALPHA',(fade*.75).toFixed(2));
        ctx.lineWidth = 1; ctx.stroke();
      }
    }

    // 备降点：地面圆环 + 光柱
    for (var si = 0; si < SCENE.sites.length; si++) {
      var s = SCENE.sites[si], ring = [];
      for (var k = 0; k <= 18; k++) {
        var ang = k/18*Math.PI*2;
        ring.push([s[0]+Math.cos(ang)*60, s[1]+Math.sin(ang)*60, 2]);
      }
      ctx.beginPath(); if (path3(P, ring, ctx, false)) { ctx.strokeStyle = pal.site; ctx.lineWidth = 2; ctx.stroke(); }
      stroke3(P, [s[0],s[1],0], [s[0],s[1],140], ctx, pal.site, 1, 2);
      var lp = P([s[0],s[1],165]);
      if (lp) { ctx.fillStyle = pal.site; ctx.font='10px monospace'; ctx.textAlign='center'; ctx.fillText(s[2], lp.x, lp.y); ctx.textAlign='left'; }
    }

    // 航线：主画布 + 低分辨率 glow 缓冲双写（HALOFLUX 手法）
    var route = SCENE.route;
    ctx.save(); ctx.lineJoin='round'; ctx.lineCap='round';
    ctx.setLineDash([14,10]); ctx.lineDashOffset = -t*0.03;
    ctx.strokeStyle = pal.route; ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (var ri=0; ri<route.length-1; ri++) {
      var a=route[ri], b=route[ri+1], first=true;
      for (var s2=0;s2<=24;s2++){
        var tt=s2/24, q2=P([lerp(a[0],b[0],tt),lerp(a[1],b[1],tt),lerp(a[2],b[2],tt)]);
        if(!q2){first=true;continue;}
        if(first){ctx.moveTo(q2.x,q2.y);first=false;} else ctx.lineTo(q2.x,q2.y);
      }
    }
    ctx.stroke(); ctx.setLineDash([]); ctx.restore();

    var gx = G2.getContext('2d');
    gx.setTransform(1,0,0,1,0,0); gx.clearRect(0,0,G2.width,G2.height);
    gx.save(); gx.scale(cfg.gs,cfg.gs); gx.strokeStyle = pal.glow.replace('ALPHA',(.5+env*.5).toFixed(2));
    gx.lineWidth = 7; gx.beginPath();
    for (var rj=0;rj<route.length-1;rj++){
      var a2=route[rj], b2=route[rj+1], f2=true;
      for(var s3=0;s3<=24;s3++){
        var t3=s3/24, q3=P([lerp(a2[0],b2[0],t3),lerp(a2[1],b2[1],t3),lerp(a2[2],b2[2],t3)]);
        if(!q3){f2=true;continue;}
        var gqx=q3.x/cfg.gs, gqy=q3.y/cfg.gs;
        if(f2){gx.moveTo(gqx,gqy);f2=false;} else gx.lineTo(gqx,gqy);
      }
    }
    gx.stroke(); gx.restore();

    // 无人机线框（跟拍视角）
    if (mode === 'chase') {
      var uav = cfg.uav;
      var arm = 55, rot = t*0.004;
      var uc = P(uav);
      if (uc) {
        ctx.strokeStyle = pal.hud; ctx.lineWidth = 2;
        for (var a3=0;a3<4;a3++){
          var ang2 = a3*Math.PI/2 + Math.PI/4 + rot;
          var ep = P([uav[0]+Math.cos(ang2)*arm, uav[1]+Math.sin(ang2)*arm, uav[2]]);
          if(!ep) continue;
          ctx.beginPath(); ctx.moveTo(uc.x,uc.y); ctx.lineTo(ep.x,ep.y); ctx.stroke();
          ctx.beginPath(); ctx.arc(ep.x,ep.y,9,0,Math.PI*2); ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(uc.x,uc.y,13,0,Math.PI*2); ctx.fillStyle=pal.hud; ctx.fill();
      }
    }

    // FPV 准星 + 姿态地平线
    if (mode === 'fpv') {
      ctx.strokeStyle = pal.hud.replace('ALPHA','0.75'); ctx.lineWidth=1;
      ctx.beginPath();
      ctx.moveTo(W/2-26,H/2); ctx.lineTo(W/2-8,H/2);
      ctx.moveTo(W/2+8,H/2); ctx.lineTo(W/2+26,H/2);
      ctx.moveTo(W/2,H/2-26); ctx.lineTo(W/2,H/2-8);
      ctx.moveTo(W/2,H/2+8); ctx.lineTo(W/2,H/2+26);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(W/2,H/2,3,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W*.18,H*.62); ctx.lineTo(W*.82,H*.62); ctx.stroke();
    }
  }

  function create(canvas, cfg) {
    var ctx = canvas.getContext('2d');
    var W=0, H=0, DPR=1, gs=cfg.glowScale||3;
    var glow = document.createElement('canvas');
    var views = cfg.views;
    var vi=0, vt=0, hold=views[0].hold||5, move=2.0, phase='hold', from=null;
    var PATTERN=[.5,.25,.25,.5,.5,.75,.25,.25,.25,1];
    var beatT=.4, bi=0, since=9, env=0, last=performance.now();

    function interp(a,b,k){
      return { eye:[lerp(a.eye[0],b.eye[0],k),lerp(a.eye[1],b.eye[1],k),lerp(a.eye[2],b.eye[2],k)],
               yaw:lerp(a.yaw,b.yaw,k), pitch:lerp(a.pitch,b.pitch,k),
               fov:Math.exp(lerp(Math.log(a.fov),Math.log(b.fov),k)) };
    }
    function resize(){
      var r=canvas.getBoundingClientRect();
      DPR=Math.min(devicePixelRatio||1,2); W=Math.max(1,r.width); H=Math.max(1,r.height);
      canvas.width=Math.ceil(W*DPR); canvas.height=Math.ceil(H*DPR);
      glow.width=Math.ceil(W/gs); glow.height=Math.ceil(H/gs);
      cfg.W=W; cfg.H=H; cfg.gs=gs;
    }
    function frame(now){
      var dt=Math.min(.05,(now-last)/1000); last=now;
      beatT-=dt; since+=dt;
      if(beatT<=0){beatT+=PATTERN[bi++%PATTERN.length]*.92/(cfg.tempo||1);since=0;}
      env=Math.exp(-since*4.5);
      vt+=dt;
      var cur=views[vi], nxt=views[(vi+1)%views.length], cam;
      if(phase==='hold'){
        cam={eye:cur.eye.slice(),yaw:cur.yaw,pitch:cur.pitch,fov:cur.fov};
        cam.fov*=1+.02*Math.sin(vt*.5)*env;
        if(vt>=hold){phase='move';vt=0;from=cam;}
      } else {
        var k=easeIO(Math.min(1,vt/move));
        cam=interp(from,nxt,k);
        if(vt>=move){vi=(vi+1)%views.length;hold=views[vi].hold||5;phase='hold';vt=0;}
      }
      if(cfg.mode==='chase') cfg.uav=[cam.eye[0]+Math.cos(cam.yaw)*260, cam.eye[1]+Math.sin(cam.yaw)*260, cam.eye[2]-70];
      ctx.setTransform(DPR,0,0,DPR,0,0);
      ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1;
      var P=projector(cam.eye,cam.yaw,cam.pitch,cam.fov*Math.PI/180,W,H);
      drawScene(ctx,glow,P,cfg,env,now);
      ctx.save(); ctx.setTransform(DPR,0,0,DPR,0,0);
      ctx.globalCompositeOperation='lighter';
      if('filter' in ctx) ctx.filter='blur(7px)';
      ctx.globalAlpha=clamp(.55+env*.45,0,1);
      ctx.drawImage(glow,0,0,W,H);
      if('filter' in ctx) ctx.filter='none';
      ctx.restore();
      if(cfg.onFrame) cfg.onFrame({view:vi,cam:cam,env:env,beat:bi});
      requestAnimationFrame(frame);
    }
    resize();
    new ResizeObserver(resize).observe(canvas);
    requestAnimationFrame(frame);
    return {resize:resize};
  }

  // C 方案里那块 ASCII 战术地图，作为侧窗复用
  function asciiMap(el) {
    var MW=54, MH=19;
    var m=Array.from({length:MH},function(){return Array(MW).fill(' ');});
    for(var y=0;y<MH;y++)for(var x=0;x<MW;x++){
      var d=Math.sin(x*.24)+Math.cos(y*.37);
      m[y][x]=d>1.3?'=':d>.7?':':d>.2?'.':' ';
    }
    var bld=[[4,2,3,2],[13,5,2,2],[22,2,3,2],[40,4,3,2],[8,11,2,2],[27,14,3,2],[44,12,2,2],[34,9,2,2],[18,16,3,1]];
    bld.forEach(function(b){for(var j=b[1];j<b[1]+b[3];j++)for(var i=b[0];i<b[0]+b[2];i++)if(m[j]&&i<MW)m[j][i]='#';});
    [[20,7,9,5],[38,2,7,3],[6,5,5,3],[45,15,5,3]].forEach(function(z){
      for(var j=z[1];j<z[1]+z[3];j++)for(var i=z[0];i<z[0]+z[2];i++)if(m[j]&&i<MW)m[j][i]='X';});
    var wp=[[2,17],[9,17],[9,13],[16,13],[16,10],[23,10],[31,6],[39,6],[45,2],[51,2]];
    for(var w=0;w<wp.length-1;w++){
      var a=wp[w],b=wp[w+1],dx=Math.abs(b[0]-a[0]),dy=Math.abs(b[1]-a[1]),
          sx=a[0]<b[0]?1:-1,sy=a[1]<b[1]?1:-1,err=dx-dy,x0=a[0],y0=a[1];
      while(true){ if(m[y0]&&x0>=0&&x0<MW)m[y0][x0]='*';
        if(x0===b[0]&&y0===b[1])break;
        var e2=2*err; if(e2>-dy){err-=dy;x0+=sx;} if(e2<dx){err+=dx;y0+=sy;} }
    }
    [[6,3],[26,16],[43,9],[49,17]].forEach(function(p){if(m[p[1]])m[p[1]][p[0]]='L';});
    m[wp[0][1]][wp[0][0]]='S'; m[wp[wp.length-1][1]][wp[wp.length-1][0]]='D';
    function paint(row){var o='';for(var i=0;i<row.length;i++){
      var c=row[i],e=c==='&'?'&amp;':c==='<'?'&lt;':c==='>'?'&gt;':c;
      if(c==='*'||c==='S'||c==='D')o+='<b class="r">'+e+'</b>';
      else if(c==='X')o+='<b class="z">'+e+'</b>';
      else if(c==='L')o+='<b class="l">'+e+'</b>';
      else if(c==='|'||c==='-'||c==='+')o+='<b class="a">'+e+'</b>';
      else o+=e;
    }return o;}
    var bar='+'+'-'.repeat(MW)+'+';
    el.innerHTML='<span class="a">'+bar+'</span>\n'+
      m.map(function(r){return '<span class="a">|</span>'+paint(r.join(''))+'<span class="a">|</span>';}).join('\n')+
      '\n<span class="a">'+bar+'</span>';
    return {cols:MW+2, rows:MH+3, width:MW, height:MH};
  }

  G.View3D = { create:create, asciiMap:asciiMap, SCENE:SCENE };
})(window);
