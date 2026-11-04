/* Sparkle butterfly — same butterfly-curve particle approach as the app's home hero (refresh.js "starfield + butterfly"),
   re-tuned for light backgrounds: richer gold, warm glow, bright central body line, soft twinkle. */
(function(){
 var RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
 function rnd(a,b){return a+Math.random()*(b-a)}
 function make(cv){
  var night=cv.dataset.mode==='night', n=+cv.dataset.n||520, simple=cv.hasAttribute('data-simple'), vortN=+(cv.dataset.vortex||0);
  var d=Math.min(devicePixelRatio||1,2)*(simple?2:1.5), W=cv.clientWidth, H=cv.clientHeight; cv.width=W*d; cv.height=H*d;
  var x=cv.getContext('2d'); x.setTransform(d,0,0,d,0,0);
  // butterfly curve sample (mirrored like the app), fill density falls toward the edges
  var pts=[];
  for(var i=0;i<n;i++){var t=Math.random()*Math.PI*2,side=Math.random()<.5?-1:1;
   var r=(Math.exp(Math.sin(t))-2*Math.cos(4*t)+Math.pow(Math.sin((2*t-Math.PI)/24),5))*(Math.random()<(simple?.92:.5)?rnd(.94,1.01):Math.pow(Math.random(),.5));
   var edge=Math.pow(Math.random(),.35)>.0;
   pts.push({bx:Math.abs(Math.sin(t)*r)*side,by:-Math.cos(t)*r,j:Math.random()*6,c:Math.random()<(night?.18:.07),
     s:simple?rnd(.7,1.25):(Math.random()<.06?rnd(1.6,2.3):rnd(.5,1.25)),star:Math.random()<(simple?.1:.05)});}
  // curve spans x≈±3.9, y≈-2.9..4.3 → fit
  var k=Math.min(W/6.4,H/5.6), cx=W/2, cy=H/2;
  var vort=Array.from({length:vortN},function(){return{a:Math.random()*7,r:k*rnd(2.6,3.6),s:rnd(.4,1.5),j:Math.random()*6,c:Math.random()<.25,w:rnd(.002,.006)}});
  var gold=night?['255,224,150','255,236,190','240,200,120']:['168,120,32','196,148,58','222,178,92','150,104,26','236,200,120'];
  var teal=night?'110,240,228':'92,170,160';
  function star(px,py,s,a,col){x.fillStyle='rgba('+col+','+a*.8+')';x.fillRect(px-s*2.6,py-.3,s*5.2,.6);x.fillRect(px-.3,py-s*2.6,.6,s*5.2);}
  function frame(T){
   x.clearRect(0,0,W,H);
   // warm glow
   var R=Math.min(W,H)/2,g=x.createRadialGradient(cx,cy,0,cx,cy,R);
   g.addColorStop(0,night?'rgba(255,214,140,.22)':'rgba(246,206,120,.38)');g.addColorStop(.55,night?'rgba(255,214,140,.06)':'rgba(246,214,150,.14)');g.addColorStop(1,'rgba(246,214,150,0)');
   if(!simple){x.fillStyle=g;x.fillRect(0,0,W,H);}
   x.globalCompositeOperation=night?'lighter':'source-over';
   if(!night){x.shadowColor='rgba(232,186,90,.75)';x.shadowBlur=simple?1.5:3;}
   for(var i=0;i<pts.length;i++){var p=pts[i],tw=.55+.45*Math.sin(T*1.6+p.j*3);
    var px=cx+p.bx*k*.92+Math.sin(T*.6+p.j)*.6, py=cy+p.by*k*.9+Math.cos(T*.5+p.j)*.6;
    var col=p.c?teal:gold[(p.j*10|0)%gold.length], a=p.c?(night?.75:.45)*tw:(night?.85:.95)*tw;
    x.fillStyle='rgba('+col+','+a+')';x.beginPath();x.arc(px,py,p.s,0,7);x.fill();
    if(p.star)star(px,py,p.s,tw,night?'255,246,214':'214,166,70');}
   x.shadowBlur=0;
   for(var q=0;q<vort.length;q++){var v=vort[q];if(!RM)v.a+=v.w;var tw2=.25+.6*Math.abs(Math.sin(T*1.4+v.j));
    var vx=cx+Math.cos(v.a)*v.r,vy=cy+Math.sin(v.a)*v.r*.55;
    var c2=v.c?teal:(night?'255,226,150':'200,152,60');x.fillStyle='rgba('+c2+','+tw2*(night?1:.7)+')';x.beginPath();x.arc(vx,vy,v.s,0,7);x.fill();
    if(v.s>1.2)star(vx,vy,v.s,tw2,c2);}
   // bright central body line
   var bt=cy-k*1.1,bb=cy+k*1.0,lg=x.createLinearGradient(0,bt,0,bb);
   lg.addColorStop(0,'rgba(255,246,214,0)');lg.addColorStop(.25,night?'rgba(255,246,214,.95)':'rgba(255,240,200,1)');lg.addColorStop(.8,night?'rgba(255,236,190,.8)':'rgba(236,196,110,.95)');lg.addColorStop(1,'rgba(255,236,190,0)');
   x.shadowColor=night?'rgba(255,230,160,.9)':'rgba(214,160,60,.9)';x.shadowBlur=simple?3:8;x.fillStyle=lg;
   var bw=simple?1.4:Math.max(1.4,k*.06);x.fillRect(cx-bw/2,bt,bw,bb-bt);x.shadowBlur=0;
   x.globalCompositeOperation='source-over';
  }
  return frame;
 }
 var list=[];
 function init(){list=[].map.call(document.querySelectorAll('canvas.spark-bf'),make);}
 init(); var t0=performance.now();
 function loop(now){var T=(now-t0)/1000;list.forEach(function(f){f(T)});if(!RM)requestAnimationFrame(loop);}
 requestAnimationFrame(loop);
 var rt;addEventListener('resize',function(){clearTimeout(rt);rt=setTimeout(init,150)});
})();
