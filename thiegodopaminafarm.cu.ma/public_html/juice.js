/* Thiago Dopamina Farm - juice.js - Motor 3 camadas */
(function(){'use strict';
var J=window.Juice={};
var N=function(){return window.Num;};
var G=function(){return window.Game;};
var Fx=function(){return window.Fx;};
var AudioFX=function(){return window.AudioFX;};
var UI=function(){return window.UI;};
var BL=2.2,LIFE=14,ABSORB_MAX=1.8,STREAK_FULL=32,FLOAT_MAX=22;
var MILESTONES=[1e3,1e6,1e9,1e12,1e15,1e18,1e21,1e24,1e27,1e30,1e33,1e36,1e39,1e42,1e45,1e48];
var rt={orbTimer:8,streak:0,absorbed:0,grandScale:-1,orbs:[],floats:[],pool:[],sealEl:null,streakEl:null,abs:1,absTimer:0,absMult:1,nextOrb:0,lastMilestone:0,_lastDopa:0,lastPop:false,_popT:0,_popV:false,attractor:null,attractorEl:null,streakFull:false,_macroCelebrating:-1,_bound:false};
J.rt = rt;
J.init=function(s){try{if(!s)s={};if(s.juice)Object.assign(rt,s.juice);if(rt.nextOrb<1)rt.nextOrb=12+Math.random()*6;buildHUD();}catch(e){console.error('Juice init error:',e.message);};};
J.tick=function(dt){dt=dt||0.016;var g=G();if(!g||!g.s)return;var s=g.s;
if(s.dopamina>rt._lastDopa){rt._popV=true;rt._popT=0.5;}else if(rt._popV){rt._popT-=dt;if(rt._popT<=0)rt._popV=false;}
rt._lastDopa=s.dopamina;var popCls=rt._popV?"pop active":"pop";if(rt._lastPop!==rt._popV){rt._lastPop=rt._popV;if(rt.sealEl)rt.sealEl.className="hud-dopa-wrap "+popCls+(s.dopamina<s.nextDopamineThreshold?" low":" ok");}
rt.nextOrb-=dt;if(rt.nextOrb<=0){spawnOrb(s);rt.nextOrb=12+Math.random()*9;if(Math.random()<0.03*dt*60)attractToMouse(s);}
var ms=milestoneCheck(s);if(ms)celebrateMacro(ms,g);
  updateOrbs(dt);updateFloats(dt);updateAbsorb(dt);updateStreak(dt);updateHUD(s);};

  /* ===================== ORBS ===================== */
  function spawnOrb(s){var r=10+Math.random()*(window.innerWidth-20);var tier=(s.dopamina>s.nextDopamineThreshold*2&&Math.random()<0.12)?1:0;orb(tier,r,-10);}
  function orb(t,x,y){var a=Math.random()*Math.PI*2,spd=24+Math.random()*12;var o={x:x,y:y,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd-40,life:LIFE,tier:t||0,el:null,ay:120,ax:0};rt.orbs.push(o);var el=document.createElement('div');el.className='juice-orb'+(t>0?' juice-orb-rare':'');el.style.left=x+'px';el.style.top=y+'px';el.innerHTML='<div class="joi"></div>';el.__orb=o;el.addEventListener('click',function(e){e.stopPropagation();orbClick(o,e);});document.body.appendChild(el);o.el=el;}
  function orbClick(o,e){e.stopPropagation();if(o.el&&o.el.parentNode)o.el.parentNode.removeChild(o.el);o.el=null;o.life=0;var g=G(),base=rt.abs*0.5;if(o.tier>0)base*=6;var f=Fx();f&&f.ring&&f.ring(o.x,o.y,44,o.tier>0?'#ffdd00':'#ffd700',0.45);absorb(e.clientX||o.x,e.clientY||o.y,base+1);var a=AudioFX();a&&a.sfx&&a.sfx.pickup&&a.sfx.pickup();if(UI())UI().toast(o.tier>0?'RARO! +'+Math.round(base+1)+' dopamina':'+'+Math.round(base+1)+' dopamina',o.tier>0?'gold':'info',2200);g&&g.addDopamine?g.addDopamine(base*(o.tier>0?6:1),'orb_'+(o.tier>0?'rare':'common')):(g&&g.click?g.click():null);g&&g.flash&&g.flash(o.tier>0?'#ffdd00':'#ffd700',o.tier>0?260:110);}
  function attractToMouse(s){if(!rt.orbs.length||s.dopamina<50)return;if(!rt.attractorEl){rt.attractorEl=document.createElement('div');rt.attractorEl.className='juice-attractor';rt.attractorEl.style.pointerEvents='none';document.body.appendChild(rt.attractorEl);}rt.attractor={x:Math.random()*window.innerWidth,y:80+Math.random()*300,life:4+Math.random()*4};}
  function updateOrbs(d){if(!rt.orbs.length){rt.attractor=null;if(rt.attractorEl)rt.attractorEl.style.display='none';return;}
  if(rt.attractor){rt.attractor.life-=d;if(rt.attractor.life<=0){rt.attractor=null;if(rt.attractorEl)rt.attractorEl.style.display='none';}else if(rt.attractorEl){rt.attractorEl.style.display='block';rt.attractorEl.style.left=rt.attractor.x+'px';rt.attractorEl.style.top=rt.attractor.y+'px';}}else if(rt.attractorEl)rt.attractorEl.style.display='none';
  var j=0;for(var i=0;i<rt.orbs.length;i++){var o=rt.orbs[i];if(rt.attractor&&o.life>3){var dx=rt.attractor.x-o.x,dy=rt.attractor.y-o.y;var dist=Math.sqrt(dx*dx+dy*dy)||1;o.ax=(dx/dist)*200;o.ay=(dy/dist)*180-110;}else{o.ax=0;o.ay=120;}
  o.vx+=o.ax*d;o.vy+=o.ay*d;o.vx*=(1-0.9*d);o.vy*=(1-0.3*d);o.x+=o.vx*d;o.y+=o.vy*d;o.life-=d;
    if(o.el){o.el.style.left=o.x+'px';o.el.style.top=o.y+'px';o.el.style.transform='scale('+(0.9+0.1*Math.sin(performance.now()/333))+') rotate('+(o.vx*0.3)+'deg)';}
    if(o.life>0&&o.y<window.innerHeight+200&&o.x>-100&&o.x<window.innerWidth+100)rt.orbs[j++]=o;else{if(o.el&&o.el.parentNode)o.el.parentNode.removeChild(o.el);}}rt.orbs.length=j;}

  /* ===================== FLOATS ===================== */
  function absorb(x,y,val){val=val||0;var n=Math.min(5+(rt.abs||1)+Math.floor(val||0),FLOAT_MAX);var b=document.getElementById('farm-btn');var tx=b?b.getBoundingClientRect().left+b.offsetWidth/2:x;var ty=b?b.getBoundingClientRect().top+b.offsetHeight/2:y;var i=0;for(i=0;i<n;i++){rt.floats.push({x:x,y:y,vx:Math.random()*40-20,vy:Math.random()*40-100,tx:tx+(Math.random()-0.5)*80,ty:ty+(Math.random()-0.5)*80,life:BL+(rt.abs||1)*0.03,val:(val||0)*0.1+(rt.abs||1)*0.15});}}
  function updateFloats(d){if(!rt.floats.length)return;var c=document.getElementById('fx-overlay');if(!c){rt.floats=[];return;}var p=rt.pool;var nn=N();var i=0;for(i=0;i<Math.min(rt.floats.length,FLOAT_MAX);i++){var fl=rt.floats[i];if(!fl.el){fl.el=p.pop()||document.createElement('div');fl.el.className='float-num';c.appendChild(fl.el);}fl.el.style.transform='translate('+fl.x+'px,'+fl.y+'px)';fl.el.style.opacity=String(Math.max(0,0.9-fl.life/3));try{fl.el.textContent=nn?nn.toString(fl.val):(Math.round(fl.val*10)/10).toLocaleString();}catch(e){fl.el.textContent=Math.round(fl.val)+'';}fl.el.style.color='#ffdd00';fl.el.style.fontSize='11px';fl.el.style.textShadow='0 0 3px #000';fl.el.style.whiteSpace='nowrap';fl.el.style.pointerEvents='none';}
  var j=0;for(i=0;i<rt.floats.length;i++){var fl=rt.floats[i];if(fl.tx!=null){var dx=fl.tx-fl.x,dy=fl.ty-fl.y;fl.vx+=(dx*3-fl.vx)*d*8;fl.vy+=(dy*3-fl.vy)*d*8;}fl.x+=fl.vx*d;fl.y+=fl.vy*d;fl.life-=d;if(fl.life>0&&fl.y>-200&&fl.x>-200&&fl.x<window.innerWidth+200)rt.floats[j++]=fl;else if(fl.el){if(p.length<60)p.push(fl.el);else if(fl.el.parentNode)fl.el.parentNode.removeChild(fl.el);}}rt.floats.length=j;}

  /* ===================== ABSORB + STREAK + HUD ===================== */
  function updateAbsorb(d){rt.absTimer-=d;if(rt.absTimer<=0&&rt.abs>1)rt.abs=Math.max(1,rt.abs-d*0.4);else if(rt.absTimer>0&&rt.abs<ABSORB_MAX)rt.abs=Math.min(ABSORB_MAX,rt.abs+d*0.6);}
  function updateStreak(d){rt.streak-=d*0.3;if(rt.streak<0)rt.streak=0;if(rt.streakEl){var pct=Math.min(1,rt.streak/STREAK_FULL);rt.streakEl.style.height=(pct*100)+'%';rt.streakEl.style.background='linear-gradient(180deg,hsl('+(60+pct*30)+',100%,50%),hsl('+(40+pct*20)+',100%,45%))';if(pct>=1&&!rt.streakFull){rt.streakFull=true;var g=G();g&&g.flash&&g.flash('#ff9e00',220);if(UI())UI().toast('STREAK MÁXIMO! Buff 60s', 'gold', 4000);rt.absMult=2.2;setTimeout(function(){rt.streakFull=false;rt.absMult=1;},60000);}}}

  /* ===================== HUD BUILD ===================== */
  function buildHUD(){var h=document.getElementById('hud-dopa');if(!h)return;var w=h.parentNode;if(!w.classList.contains('hud-dopa-wrap')){w.classList.add('hud-dopa-wrap');var seal=document.createElement('div');seal.className='juice-seal';seal.id='juice-seal';seal.innerHTML='<span class="juice-seal-text">✨+</span>';w.appendChild(seal);var sw=document.createElement('div');sw.className='juice-streak-wrap';sw.innerHTML='<div class="juice-streak-bar"></div>';w.appendChild(sw);rt.streakEl=sw.firstChild;}rt.sealEl=document.getElementById('juice-seal');if(rt.sealEl&&!rt._bound){rt._bound=true;rt.sealEl.addEventListener('click',J.toggleSeal);}}
  J.toggleSeal=function(){rt.sealVisible=!rt.sealVisible;if(rt.sealEl)rt.sealEl.style.opacity=rt.sealVisible?'1':'0.45';};

  function updateHUD(s){if(!rt.sealEl)return;var text=rt.sealEl.querySelector('.juice-seal-text');if(!text)return;var bonus=(rt.abs-1)*100;text.textContent=bonus>1?'✨+'+(Math.round(bonus))+'%':'✨';text.style.color=bonus>1?'#ffd700':'#ffdd00';text.style.textShadow=bonus>1?'0 0 6px #ffdd00':'none';text.style.transform='scale('+(1+bonus*0.02)+')';}

  /* ===================== MILESTONES ===================== */
  function milestoneCheck(s){for(var i=rt.grandScale+1;i<MILESTONES.length;i++){if(s.totalEarned>=MILESTONES[i]){rt.grandScale=i;return{idx:i,val:MILESTONES[i]};}}return null;}
  function celebrateMacro(ms,g){if(rt._macroCelebrating===ms.idx)return;rt._macroCelebrating=ms.idx;var n=N();var label=n&&n.toSuffix?n.toSuffix(ms.val):ms.val.toLocaleString();var f=Fx();if(f){if(f.flash)f.flash('#00ffff',300);if(f.ring)f.ring(window.innerWidth/2,window.innerHeight/2,340,'#00ffff',0.7);if(f.screenShake)f.screenShake(0.42,240);if(f.toaster)f.toaster('⚡ ORDEM DE GRANDEZA! +'+label,'#00ffff',4200);}if(g&&g.s){g.s.juice=g.s.juice||{};g.s.juice.grandScale=rt.grandScale;}setTimeout(function(){if(g&&g.s&&g.s.juice){g.s.juice.grandScale=rt.grandScale;if(g.save)g.save();}},5000);if(UI())UI().toast('⚡ ORDEM DE GRANDEZA! +'+label+' dopamina total', 'gold', 4500);}

  /* ===================== SAVE ===================== */
  J.persist=function(){return{orbTimer:rt.orbTimer,streak:rt.streak,grandScale:rt.grandScale,nextOrb:rt.nextOrb,abs:rt.abs,lastMilestone:rt.lastMilestone,streakFull:rt.streakFull,absMult:rt.absMult};};
  J.hydrate=function(s){if(s&&s.juice){rt.abs=s.juice.abs||1;rt.grandScale=s.juice.grandScale||-1;rt.streak=s.juice.streak||0;rt.nextOrb=s.juice.nextOrb||12;rt.orbTimer=s.juice.orbTimer||8;}};
  window.addEventListener('beforeunload',function(){var g=G();if(g&&g.s&&rt.grandScale!==g.s.juice){g.s.juice=rt.grandScale;}});

  /* ===================== API PÚBLICA ===================== */
  J.addDopamine=function(val,x,y){if(val>0&&val<1)val=val*(rt.abs||1)*10;else val*=(rt.abs||1);rt.abs=Math.min(ABSORB_MAX,rt.abs+val*0.06);rt.absTimer=1.2;rt.streak+=1;absorb(x||(window.event&&window.event.clientX)||window.innerWidth/2,y||(window.event&&window.event.clientY)||window.innerHeight/2,val);};
  J.onClick=function(e){rt.streak+=1;rt._popV=true;rt._popT=0.5;};
  J.spawnOrb=function(tier,x,y){orb(tier,x||10+Math.random()*(window.innerWidth-20),y||-10);};
  J.testOrb=function(tier){J.spawnOrb(tier||0);};

})();
