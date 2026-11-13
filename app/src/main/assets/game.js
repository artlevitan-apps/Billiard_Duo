/* Геворк Бильярдинский 3.0 — designed for Android TV D-pad. No dependencies. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const cv = $('table'), ctx = cv.getContext('2d');
const W=1600,H=820,L=116,R=1484,T=116,B=704,RAD=15.2,POCKET_RADIUS=32;
const pockets=[[L,T],[(L+R)/2,T],[R,T],[L,B],[(L+R)/2,B],[R,B]];
const poolColors=['#ffffff','#f3c927','#2458b5','#d52e37','#7130a6','#e88c21','#287f50','#9c3d26','#141417'];
const names=['ГЕВОРКИУС','МАРИО'];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist=(x,y)=>Math.hypot(x,y);
const unit=(x,y)=>{const d=dist(x,y)||1;return [x/d,y/d];};
const labelName=i=> names[i]+(i===1&&playerMode==='one'?' · ПК':'');
const SAVE='gevork_billiardinsky_v3';
let balls=[],kind='russian',playerMode='two',menuStep='players',menuPlayerMode='two',screen='menu',modal='',callbacks=[],menuIndex=0,modalIndex=0;
let active=0,groups=[null,null],scores=[0,0],phase='aim',seconds=60,angle=0,spin=0,power=0,charging=false,chargeAt=0;
let shot=null,moving=false,finished=false,selectedPocket=0,pendingCall=false,lowTick=-1,aiAt=0,aimAt=0;
let shotEffect=null;
let guideCache=null,guideKey='',guideLast=0,toastDeadline=0,toastText='',lastFrame=0,strokeAt=0;
let currentWorld=null,saveQueued=false,notifications=[];
let musicOn=(localStorage.getItem('gevork_music')??'1')==='1',soundsOn=(localStorage.getItem('gevork_fx')??'1')==='1',audioContext=null;
let lastBallFX=0,lastRailFX=0,lastRollFX=0;
const isComputer=()=>playerMode==='one'&&active===1;
const group=b=> b.id===0?'cue':b.id===8?'black':b.id<=7?'solid':'stripe';
const ballColor=id=>poolColors[id===0?0:id>8?id-8:id];
function audio(){try{if(!audioContext)audioContext=new (window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume();return audioContext;}catch(_){return null;}}
function chirp(freq=480,time=.07,amp=.04,shape='sine'){const a=audio();if(!a||!soundsOn)return;const o=a.createOscillator(),g=a.createGain(),t=a.currentTime;o.type=shape;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(45,freq*.52),t+time);g.gain.setValueAtTime(amp,t);g.gain.exponentialRampToValueAtTime(.0001,t+time);o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+time+.005);}
function noise(duration,amp,cutoff){const a=audio();if(!a||!soundsOn)return;const n=a.createBuffer(1,Math.ceil(a.sampleRate*duration),a.sampleRate),arr=n.getChannelData(0);for(let i=0;i<arr.length;i++)arr[i]=Math.random()*2-1;const s=a.createBufferSource(),lo=a.createBiquadFilter(),g=a.createGain();s.buffer=n;lo.type='lowpass';lo.frequency.value=cutoff;g.gain.setValueAtTime(amp,a.currentTime);g.gain.exponentialRampToValueAtTime(.0001,a.currentTime+duration);s.connect(lo);lo.connect(g);g.connect(a.destination);s.start();}
function fx(type,intensity=1){if(!soundsOn)return;const now=performance.now();const v=clamp(intensity,.1,1.7);
 if(type==='cue'){chirp(185,.12,.072*v,'triangle');noise(.037,.026*v,1700);}
 else if(type==='ball'&&now-lastBallFX>30){lastBallFX=now;chirp(520,.085,.057*v,'sine');chirp(900,.035,.013*v,'triangle');}
 else if(type==='rail'&&now-lastRailFX>65){lastRailFX=now;chirp(180,.11,.055*v,'triangle');noise(.055,.021*v,500);}
 else if(type==='pocket'){chirp(115,.26,.11,'triangle');noise(.18,.046,420);}
 else if(type==='roll'&&now-lastRollFX>280){lastRollFX=now;noise(.11,.012*v,290);}
 else if(type==='tick')chirp(1000,.05,.045,'sine');
 else if(type==='win'){chirp(640,.25,.07);setTimeout(()=>chirp(810,.3,.065),130);}
 else if(type==='tap')chirp(440,.045,.023);
}
function syncMusic(){const el=$('music');if(!el)return;el.volume=.20;if(musicOn&&screen==='game'&&!modal){const p=el.play();if(p&&p.catch)p.catch(()=>{});}else el.pause();}
function save(){if(finished)return;try{localStorage.setItem(SAVE,JSON.stringify({balls,kind,playerMode,active,groups,scores,phase,seconds,angle,spin,selectedPocket,finished:false}));}catch(_){}}
function load(){try{const s=JSON.parse(localStorage.getItem(SAVE));if(!s||s.finished||!Array.isArray(s.balls)||s.balls.length!==16)return false;kind=s.kind||'eight';playerMode=s.playerMode||'two';active=s.active||0;groups=s.groups||[null,null];scores=s.scores||[0,0];balls=s.balls.map(b=>({...b,vx:0,vy:0,spin:0}));phase=s.phase==='moving'?'aim':s.phase;seconds=clamp(s.seconds||60,1,60);angle=s.angle||0;spin=s.spin||0;selectedPocket=s.selectedPocket??0;finished=false;charging=false;moving=false;currentWorld=null;screen='game';$('menu').classList.remove('active');$('game').classList.add('active');invalidateGuide();hud();syncMusic();if(isComputer())aiAt=performance.now()+1300;return true;}catch(_){return false;}}
function showMenu(){screen='menu';charging=false;moving=false;currentWorld=null;$('game').classList.remove('active');$('menu').classList.add('active');closeModal();menuStep='players';menuIndex=0;renderMenu();syncMusic();}
function menuButtons(entries){const root=$('menu-actions');root.innerHTML='';entries.forEach((e,i)=>{const b=document.createElement('button');b.type='button';b.className='action'+(i?' secondary':'');b.textContent=e[0];b.onclick=()=>{menuIndex=i;fx('tap');audio();e[1]();};root.appendChild(b);});menuIndex=clamp(menuIndex,0,entries.length-1);focusMenu();}
function renderMenu(){if(menuStep==='players'){$('menu-eyebrow').textContent='БИЛЬЯРДНЫЙ КЛУБ · 3.0';$('menu-tag').textContent='Выбери, кто играет';menuButtons([['1 игрок · против компьютера',()=>choosePlayers('one')],['2 игрока · на одном ТВ',()=>choosePlayers('two')],...(localStorage.getItem(SAVE)?[['Продолжить прошлую партию',()=>load()]]:[]),['Правила игр',()=>rules(false)],['Звук и музыка',()=>settings(false)]]);}else{$('menu-eyebrow').textContent=menuPlayerMode==='one'?'ИГРА С КОМПЬЮТЕРОМ':'ИГРА ВДВОЁМ';$('menu-tag').textContent='Выбери вид бильярда';menuButtons([['Русский бильярд · пирамида',()=>startGame('russian',menuPlayerMode)],['Пул · восьмёрка',()=>startGame('eight',menuPlayerMode)],['← Назад к выбору игроков',()=>{menuStep='players';menuIndex=0;renderMenu();}]]);}}
function choosePlayers(m){menuPlayerMode=m;menuStep='games';menuIndex=0;renderMenu();}
function focusMenu(){[...$('menu-actions').querySelectorAll('button')].forEach((b,i)=>b.classList.toggle('focused',i===menuIndex));}
function focusModal(){[...$('modalActions').querySelectorAll('button')].forEach((b,i)=>b.classList.toggle('focused',i===modalIndex));}
function menuMove(dir){let list=modal?[...$('modalActions').querySelectorAll('button')]:[...$('menu-actions').querySelectorAll('button')];if(!list.length)return;if(modal){modalIndex=(modalIndex+dir+list.length)%list.length;focusModal();}else{menuIndex=(menuIndex+dir+list.length)%list.length;focusMenu();}fx('tap');}
function menuChoose(){const list=[...$('menu-actions').querySelectorAll('button')];list[menuIndex]?.click();}
function showModal(id,title,body,labels,fns,winning=false){modal=id;callbacks=fns||[];modalIndex=0;$('modalTitle').textContent=title;$('modalBody').innerHTML=body;$('modalActions').innerHTML='';labels.forEach((t,i)=>{const b=document.createElement('button');b.className='action'+(i?' secondary':'');b.textContent=t;b.onclick=()=>{fx('tap');callbacks[i]?.();};$('modalActions').append(b);});$('overlay').classList.toggle('win',winning);$('overlay').classList.add('active');focusModal();syncMusic();}
function closeModal(){$('overlay').classList.remove('active');$('overlay').classList.remove('win');modal='';callbacks=[];syncMusic();}
function pause(){if(screen!=='game'||finished)return;if(modal==='pause'){closeModal();return;}if(modal)return;charging=false;power=0;showModal('pause','Пауза','<p>Время и движение шаров остановлены.</p>',['Продолжить','Правила','Звук и музыка','Новая партия','Главное меню'],[closeModal,()=>rules(true),()=>settings(true),()=>showModal('confirm','Начать заново?','<p>Текущая партия будет сброшена.</p>',['Начать заново','Назад'],[()=>startGame(kind,playerMode),()=>{closeModal();pause();}]),()=>{save();showMenu();}]);}
function rules(inGame){const e='<p><b>Пул «восьмёрка»</b>: Геворкиус и Марио получают группы после первого правильно забитого шара: сплошные 1–7 или полосатые 9–15. Забивай свою группу; потом выбери лузу для чёрной 8. Ошибочно забитая восьмёрка возвращается на стол, а соперник получает свободный биток (домашний вариант).</p>';
 const r='<p><b>Русская пирамида</b> (комбинированная, упрощённая): белый биток и 15 светлых прицельных шаров. За каждый правильно забитый прицельный шар — 1 очко. Если биток после правильного касания попал в лузу, тоже 1 очко («свояк»), после чего его возвращают на стол. Кто первым забил 8 — победил.</p>';
 const controls='<p><b>Пульт:</b> ← → — прицел, короткие нажатия по 0,12°; удерживание — быстрее. ↑ — накат (биток идёт вперёд после контакта), ↓ — оттяжка (отходит назад). OK держать до нужной силы, отпустить — удар. Назад — пауза.</p><p class="small">Линии — прогноз по упрощённой физической модели при показанной силе; реальные сложные рикошеты могут чуть отличаться. Домашние правила, не судейский регламент.</p>';
 showModal('rules','Правила клуба',r+e+controls,['Понятно'],[()=>{closeModal();if(inGame)pause();}]);}
function settings(inGame){const h=`<p>Фоновая музыка: <b>${musicOn?'включена':'выключена'}</b><br>Эффекты бильярда: <b>${soundsOn?'включены':'выключены'}</b></p><p class="small">Музыка тихая, без вокала. Звуки ударов, качения, бортов и луз регулируются отдельно.</p>`;showModal('settings','Звук клуба',h,['Музыка: '+(musicOn?'выключить':'включить'),'Эффекты: '+(soundsOn?'выключить':'включить'),'Назад'],[()=>{musicOn=!musicOn;localStorage.setItem('gevork_music',musicOn?'1':'0');settings(inGame);},()=>{soundsOn=!soundsOn;localStorage.setItem('gevork_fx',soundsOn?'1':'0');settings(inGame);},()=>{closeModal();if(inGame)pause();}]);}
function note(msg,ms=1700){toastText=msg;const t=$('toast');t.textContent=msg;t.classList.add('show');toastDeadline=performance.now()+ms;}
function makeBall(id,x,y){return {id,x,y,vx:0,vy:0,on:true,spin:0,roll:0};}
function rack(){balls=[makeBall(0,420,410)];const arrangement=kind==='eight'?[1,9,2,10,8,11,3,12,4,13,5,14,6,7,15]:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15];let index=0;for(let row=0;row<5;row++)for(let j=0;j<=row;j++){let id=arrangement[index++];balls.push(makeBall(id,1005+row*RAD*1.77,410+(j-row/2)*(RAD*2+.4)));}}
function startGame(k,m){kind=k;playerMode=m;groups=[null,null];scores=[0,0];active=0;seconds=60;angle=0;spin=0;power=0;charging=false;moving=false;phase='aim';selectedPocket=0;pendingCall=false;shot=null;finished=false;currentWorld=null;rack();screen='game';$('menu').classList.remove('active');$('game').classList.add('active');closeModal();invalidateGuide();note(k==='eight'?'Разбивка · играем в восьмёрку':'Русская пирамида · первым забить 8',2300);save();hud();syncMusic();}
function canBlack(i){return kind==='eight'&&groups[i]!==null&&!balls.some(b=>b.on&&group(b)===groups[i]);}
function legalFirst(){return kind==='russian'?'object':canBlack(active)?'black':groups[active]||'open';}
function changeTurn(){active=1-active;seconds=60;spin=0;power=0;charging=false;lowTick=-1;selectedPocket=0;invalidateGuide();if(isComputer())aiAt=performance.now()+1300;}
function colorGroup(g){return g==='solid'?'Сплошные · 1–7':g==='stripe'?'Полосатые · 9–15':'Группы не выбраны';}
function hud(){if(screen!=='game')return;let countGroup=g=>balls.filter(b=>!b.on&&group(b)===g).length;for(let i=0;i<2;i++){const p=$('p'+i);p.classList.toggle('current',active===i);$('s'+i).textContent=kind==='russian'?scores[i]:groups[i]?countGroup(groups[i]):'0';$('t'+i).textContent=kind==='russian'?'Из 8 для победы':canBlack(i)?'ЗАБИТЬ ЧЁРНУЮ ВОСЬМЁРКУ':colorGroup(groups[i]);$('n'+i).textContent=labelName(i);$('badge'+i).textContent=active===i?'● СЕЙЧАС ХОДИТ':'';}
 {const t=Math.max(0,Math.ceil(seconds));$('time').textContent=String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');}$('timer').classList.toggle('low',seconds<=10);$('powerFill').style.width=(power*100).toFixed(1)+'%';
 const hint=spin>=.02?`НАКАТ +${Math.round(spin*100)}% · биток идёт вперёд`:spin<=-.02?`ОТТЯЖКА −${Math.round(-spin*100)}% · биток отходит назад`:'Без вращения · ↑ накат / ↓ оттяжка';$('spin').textContent=hint;
 $('status').textContent=phase==='place'?'СВОБОДНЫЙ БИТОК · стрелки — положение · OK — подтвердить':phase==='call'?`ЗАКАЖИ ЛУЗУ №${selectedPocket+1} · ← → выбирают · OK подтвердить`:isComputer()?'МАРИО рассчитывает удар…':`← → точность 0,12° · ↑ ↓ вращение · OK сила · ${kind==='russian'?'Пирамида':'8-ball'}`;
 $('power-title').textContent=charging?'СИЛА '+Math.round(power*100)+'%':'СИЛА';}
function freePosition(x,y,arr=balls){x=clamp(x,L+RAD+3,R-RAD-3);y=clamp(y,T+RAD+3,B-RAD-3);if(!arr.some(b=>b.on&&b.id!==0&&dist(b.x-x,b.y-y)<RAD*2+3))return[x,y];for(let d=8;d<600;d+=17)for(let a=0;a<Math.PI*2;a+=.24){const u=clamp(x+d*Math.cos(a),L+RAD+3,R-RAD-3),v=clamp(y+d*Math.sin(a),T+RAD+3,B-RAD-3);if(!arr.some(b=>b.on&&b.id!==0&&dist(b.x-u,b.y-v)<RAD*2+3))return[u,v];}return[420,410];}
function place(dx,dy){const b=balls[0],p=freePosition(b.x+dx*12,b.y+dy*12);b.x=p[0];b.y=p[1];invalidateGuide();}
function confirmPlace(){phase=canBlack(active)?'call':'aim';selectedPocket=0;seconds=60;note(phase==='call'?'Выбери лузу для восьмёрки':'Биток установлен · прицелься',1600);invalidateGuide();save();}
function choosePocket(n){selectedPocket=(selectedPocket+n+6)%6;fx('tap');}
function confirmPocket(){phase='aim';note('Заказана луза №'+(selectedPocket+1),1300);invalidateGuide();save();}
function beginCharge(){if(phase!=='aim'||moving||charging||modal||finished||isComputer())return;charging=true;chargeAt=performance.now();power=0;audio();}
function shotSpeed(f){return 190+2550*Math.pow(clamp(f,0,1),.93);}
function launch(f){const b=balls[0];if(!b.on||moving)return;const p=clamp(f,.02,1),v=shotSpeed(p),dx=Math.cos(angle),dy=Math.sin(angle);b.vx=dx*v;b.vy=dy*v;b.spin=spin;b.roll=0;shot={player:active,kind,legal:legalFirst(),blackReady:canBlack(active),call:selectedPocket,firstContact:null,railAfter:false,potted:[],blackPocket:-1,cuePocket:false};currentWorld={balls,shot};moving=true;phase='moving';charging=false;power=0;strokeAt=performance.now();shotEffect={x:b.x,y:b.y,a:angle};guideCache=null;fx('cue',.4+p);}
function release(){if(charging){const p=Math.max(power,.055);charging=false;if(screen==='game'&&!modal)launch(p);}}
// One dynamics implementation is used by real play and the ghost-shot prediction.
// Screen coordinates: 1 px = virtual distance, velocities px/s, impulses are equal-mass collisions.
function stepWorld(w,dt,isReal){const arr=w.balls,ss=w.shot;let any=false;const sub=Math.max(2,Math.ceil(dt*260)),dd=dt/sub;
 for(let st=0;st<sub;st++){
  for(let b of arr){if(!b.on)continue;const speed=dist(b.vx,b.vy);if(speed<8){b.vx=b.vy=0;continue;}any=true;
   // Wool cloth: a short slide phase followed by rolling resistance; spin fades with friction.
   const slowing=(b.id===0&&Math.abs(b.spin)>.25?255:230)*dd;
   const v=Math.max(0,speed-slowing),scale=v/speed;
   b.vx*=scale;b.vy*=scale;b.spin*=Math.exp(-.40*dd);
   b.x+=b.vx*dd;b.y+=b.vy*dd;
   let pocketIndex=-1;for(let i=0;i<6;i++)if(dist(b.x-pockets[i][0],b.y-pockets[i][1])<POCKET_RADIUS-1){pocketIndex=i;break;}
   if(pocketIndex>=0){b.on=false;b.vx=b.vy=0;ss.potted.push(b.id);if(b.id===0)ss.cuePocket=true;if(b.id===8)ss.blackPocket=pocketIndex;if(isReal)fx('pocket');continue;}
   let rail=false;const restitution=.87;
   if(b.x<L+RAD){b.x=L+RAD;b.vx=Math.abs(b.vx)*restitution;rail=true;}
   if(b.x>R-RAD){b.x=R-RAD;b.vx=-Math.abs(b.vx)*restitution;rail=true;}
   if(b.y<T+RAD){b.y=T+RAD;b.vy=Math.abs(b.vy)*restitution;rail=true;}
   if(b.y>B-RAD){b.y=B-RAD;b.vy=-Math.abs(b.vy)*restitution;rail=true;}
   if(rail){if(ss.firstContact!==null)ss.railAfter=true;if(isReal)fx('rail',clamp(speed/1500,.2,1.3));}
  }
  for(let i=0;i<arr.length;i++){const a=arr[i];if(!a.on)continue;
   for(let j=i+1;j<arr.length;j++){const b=arr[j];if(!b.on)continue;let dx=b.x-a.x,dy=b.y-a.y,d=dist(dx,dy);if(d>=RAD*2)continue;if(d<.001){dx=RAD*2;dy=0;d=RAD*2;}
    const nx=dx/d,ny=dy/d,depth=RAD*2-d;
    a.x-=nx*(depth*.50+.01);a.y-=ny*(depth*.50+.01);b.x+=nx*(depth*.50+.01);b.y+=ny*(depth*.50+.01);
    const rel=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;if(rel>=0)continue;
    const restitution=.945,impulse=-(1+restitution)*rel*.5;
    a.vx-=impulse*nx;a.vy-=impulse*ny;b.vx+=impulse*nx;b.vy+=impulse*ny;
    const isCue=(a.id===0||b.id===0),first=isCue&&ss.firstContact===null;
    if(first){const target=a.id===0?b:a;ss.firstContact=target.id;
     // Topspin/follow and backspin/draw of the cue after the FIRST object-ball impact.
     const cue=a.id===0?a:b;const sign=a.id===0?1:-1;
     const impact=Math.abs(rel),gain=cue.spin*impact*.52;
     cue.vx+=nx*sign*gain;cue.vy+=ny*sign*gain;
     cue.spin*=.2;
    }
    if(isReal&&-rel>40)fx('ball',clamp(-rel/850,.22,1.5));
   }
  }
 }
 return any&&arr.some(b=>b.on&&dist(b.vx,b.vy)>8);
}
function resetCue(){const cue=balls[0];cue.on=true;cue.vx=cue.vy=0;cue.spin=0;const q=freePosition(420,410);cue.x=q[0];cue.y=q[1];}
function replaceEight(){const b=balls.find(q=>q.id===8),spots=[[800,410],[860,410],[740,410],[800,470],[800,350],[680,410]];let p=spots.find(q=>!balls.some(x=>x.on&&x!==b&&dist(x.x-q[0],x.y-q[1])<RAD*2+4));if(!p)p=freePosition(800,410);b.x=p[0];b.y=p[1];b.vx=b.vy=0;b.on=true;}
function win(winner){finished=true;localStorage.removeItem(SAVE);fx('win');const h='<img class="win-photo" src="dad.jpg" alt="Геворк"><p class="win-congrats"><b>Геворк Бильярдинский поздравляет '+labelName(winner)+'!</b></p><p>Играй чаще — и когда-нибудь станешь таким же мастером, как сам Геворк!</p>';
 showModal('win','ПОБЕДА · '+labelName(winner),h,['Сыграть ещё','В главное меню'],[()=>startGame(kind,playerMode),showMenu],true);}
function scoreShot(){moving=false;currentWorld=null;phase='aim';const ss=shot,got=ss.potted.filter(x=>x!==0&&(kind==='russian'||x!==8));let foul=false,successful=false,message='';const firstId=ss.firstContact;
 if(kind==='russian'){
  const validHit=firstId!==null;const legalPots=got.length+(ss.cuePocket&&validHit?1:0);
  foul=!validHit||(!legalPots&&!ss.railAfter);
  if(!foul&&legalPots){scores[active]+=legalPots;successful=true;message='МОЛОДЕЦ';}
  if(scores[active]>=8){win(active);return;}
  if(ss.cuePocket)resetCue();
  if(foul){message='ШТРАФ · '+(!validHit?'не было касания':'нет лузы или борта');changeTurn();resetCue();phase='place';}
  else if(!successful){changeTurn();message='НЕ ЗАБИЛ';}
 }else{
  const first=firstId===null?'none':group(balls.find(b=>b.id===firstId));
  const badFirst=first==='none'||(ss.legal==='black'&&first!=='black')||(ss.legal==='open'&&first==='black')||(ss.legal!=='open'&&ss.legal!=='black'&&first!==ss.legal);
  const badRail=!got.length&&ss.blackPocket<0&&!ss.railAfter;
  foul=ss.cuePocket||badFirst||badRail;
  if(ss.blackPocket>=0){if(ss.blackReady&&!foul&&ss.call===ss.blackPocket){win(active);return;}foul=true;replaceEight();message='ШТРАФ · восьмёрка не по правилам';}
  if(!foul&&groups[active]===null&&got.length){const g=group(balls.find(b=>b.id===got[0]));groups[active]=g;groups[1-active]=g==='solid'?'stripe':'solid';}
  successful=!foul&&got.some(id=>group(balls.find(b=>b.id===id))===groups[active]);
  if(foul){message=message||'ШТРАФ · '+(ss.cuePocket?'биток в лузе':badFirst?'неправильный первый шар':'нет борта или лузы');changeTurn();resetCue();phase='place';}
  else if(successful){message='МОЛОДЕЦ';}
  else{changeTurn();message='НЕ ЗАБИЛ';}
 }
 seconds=60;lowTick=-1;charging=false;power=0;spin=0;angle=0;
 if(phase==='aim'&&canBlack(active)){phase='call';selectedPocket=0;}
 invalidateGuide();note(message+(message==='НЕ ЗАБИЛ'?` · Теперь ${labelName(active)}`:message==='МОЛОДЕЦ'?` · ${labelName(active)} играет ещё`:` · Ход: ${labelName(active)}`),2000);
 if(phase==='call')setTimeout(()=>{if(phase==='call'&&!modal)note('Выбери лузу для чёрной восьмёрки',1600);},2100);
 if(isComputer())aiAt=performance.now()+1750;save();hud();
}
function movePhysics(dt){if(!currentWorld)return;const still=stepWorld(currentWorld,dt,true);if(still){const cue=balls[0];if(performance.now()-lastRollFX>450&&balls.some(b=>b.on&&dist(b.vx,b.vy)>130))fx('roll',.7);}else scoreShot();}
function invalidateGuide(){guideCache=null;guideKey='';}
// Ghost shot traces the same physics as gameplay. Dotted trajectories end at a pocket, stop or next event.
// This is a planning aid at a representative power, not a promise that all game states are deterministic on TV.
function makePrediction(force){const copy=balls.map(b=>({...b,vx:0,vy:0,spin:0}));const cue=copy[0],s=shotSpeed(force),dx=Math.cos(angle),dy=Math.sin(angle);cue.vx=dx*s;cue.vy=dy*s;cue.spin=spin;
 const cs={firstContact:null,potted:[],cuePocket:false,blackPocket:-1,railAfter:false},world={balls:copy,shot:cs};
 const cuePath=[[cue.x,cue.y]],objPath=[];let objId=-1,firstCue=null,firstObj=null,firstIndex=-1;
 let lastCue=[cue.x,cue.y],lastObj=null;
 for(let i=0;i<1500;i++){const was=cs.firstContact;const still=stepWorld(world,1/150,false);
  if(was===null&&cs.firstContact!==null){objId=cs.firstContact;const hit=copy.find(b=>b.id===objId);firstCue=[cue.x,cue.y];firstObj=[hit.x,hit.y];cuePath.push([cue.x,cue.y]);firstIndex=cuePath.length-1;objPath.push([hit.x,hit.y]);}
  if(i%5===0||!still){if(cue.on&&dist(cue.x-lastCue[0],cue.y-lastCue[1])>1.5){cuePath.push([cue.x,cue.y]);lastCue=[cue.x,cue.y];}if(objId>=0){const b=copy.find(q=>q.id===objId);if(b.on&&(!lastObj||dist(b.x-lastObj[0],b.y-lastObj[1])>1.5)){objPath.push([b.x,b.y]);lastObj=[b.x,b.y];}}}
  if(!still)break;
 }
 if(!cue.on){const pi=pockets.findIndex(q=>dist(cue.x-q[0],cue.y-q[1])<POCKET_RADIUS+8);if(pi>=0)cuePath.push(pockets[pi]);}
 if(objId>=0){const b=copy.find(q=>q.id===objId);if(!b.on){const pi=pockets.findIndex(q=>dist(b.x-q[0],b.y-q[1])<POCKET_RADIUS+8);if(pi>=0)objPath.push(pockets[pi]);}}
 return {cuePath,objPath,objId,firstCue,firstObj,firstIndex,dx,dy,force,shotPotted:cs.potted};}

function aimRay(){const cue=balls[0],dx=Math.cos(angle),dy=Math.sin(angle);let best=Infinity,target=null;
 for(const b of balls){if(!b.on||b.id===0)continue;const x=b.x-cue.x,y=b.y-cue.y,forward=x*dx+y*dy,offset=x*x+y*y-forward*forward;if(forward<=0||offset>4*RAD*RAD)continue;const t=forward-Math.sqrt(Math.max(0,4*RAD*RAD-offset));if(t>=0&&t<best){best=t;target=b;}}
 const ax=dx>0?(R-RAD-cue.x)/dx:dx<0?(L+RAD-cue.x)/dx:Infinity;
 const ay=dy>0?(B-RAD-cue.y)/dy:dy<0?(T+RAD-cue.y)/dy:Infinity;
 const t=Math.min(...[ax,ay].filter(x=>x>=0));if(t<best){best=t;target=null;}
 if(!Number.isFinite(best))return null;
 // A cue-ball trajectory is displayed up to the exact surface of the first obstruction.
 return {x:cue.x+dx*(best+(target?RAD:0)),y:cue.y+dy*(best+(target?RAD:0)),target};
}
function prediction(now){if(screen!=='game'||phase!=='aim'||isComputer()||moving||modal)return null;
 const f=charging?Math.max(.055,power):.60;
 const key=[Math.round(angle*100000),Math.round(spin*100),Math.round(f*24),active,phase,kind,balls.map(b=>b.on?`${Math.round(b.x)}:${Math.round(b.y)}`:'x').join(',')].join('|');
 if(guideCache&&guideKey===key)return guideCache;
 if(guideCache&&now-guideLast<(charging?110:42))return guideCache;
 guideLast=now;guideKey=key;guideCache=makePrediction(f);return guideCache;
}
function path(points,color,width=3,dashed=[9,7]){if(points.length<2)return;ctx.save();ctx.beginPath();ctx.moveTo(...points[0]);for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dashed);ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();ctx.restore();}
function round(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.lineWidth=2;ctx.strokeStyle=stroke;ctx.stroke();}}
function drawBall(b){const sh=ctx.createRadialGradient(b.x+5,b.y+7,2,b.x+5,b.y+7,RAD+10);sh.addColorStop(0,'#0009');sh.addColorStop(1,'#0000');ctx.beginPath();ctx.arc(b.x+5,b.y+7,RAD+10,0,Math.PI*2);ctx.fillStyle=sh;ctx.fill();ctx.save();ctx.beginPath();ctx.arc(b.x,b.y,RAD,0,2*Math.PI);ctx.clip();let gr=ctx.createRadialGradient(b.x-6,b.y-7,1,b.x,b.y,RAD+3);gr.addColorStop(0,'#fff');gr.addColorStop(.27,kind==='russian'?'#faf9ee':'#f5f1df');gr.addColorStop(1,'#a0a5a0');ctx.fillStyle=gr;ctx.fillRect(b.x-RAD,b.y-RAD,RAD*2,RAD*2);
 if(kind==='eight'&&b.id!==0){ctx.fillStyle=ballColor(b.id);if(b.id>8)ctx.fillRect(b.x-RAD,b.y-RAD*.58,RAD*2,RAD*1.16);else ctx.fillRect(b.x-RAD,b.y-RAD,RAD*2,RAD*2);ctx.beginPath();ctx.arc(b.x,b.y,7.3,0,2*Math.PI);ctx.fillStyle='#fffdf3';ctx.fill();ctx.font='bold 10px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#171818';ctx.fillText(''+b.id,b.x,b.y+.6);}
 if(kind==='russian'&&b.id===0){ctx.beginPath();ctx.arc(b.x,b.y,5,0,2*Math.PI);ctx.fillStyle='#d4b15f';ctx.fill();}
 ctx.beginPath();ctx.ellipse(b.x-6,b.y-8,4.7,2.8,-.5,0,2*Math.PI);ctx.fillStyle='#ffffff80';ctx.fill();ctx.restore();ctx.beginPath();ctx.arc(b.x,b.y,RAD,0,Math.PI*2);ctx.strokeStyle='#777a7066';ctx.lineWidth=1;ctx.stroke();}
function tableDraw(now){ctx.clearRect(0,0,W,H);round(14,16,1572,788,51,'#17100d','#664c32');round(28,30,1544,760,43,'#59391e','#b99359');round(48,50,1504,720,28,'#132f20','#0d140e');round(L-28,T-27,R-L+56,B-T+54,20,'#08452c','#a68e59');const g=ctx.createLinearGradient(0,T,0,B);g.addColorStop(0,'#237a4d');g.addColorStop(.5,'#17683e');g.addColorStop(1,'#105431');round(L,T,R-L,B-T,3,g);ctx.save();ctx.globalAlpha=.04;for(let x=L;x<R;x+=5){ctx.fillStyle='#fff';ctx.fillRect(x,T,1,B-T);}ctx.restore();
 for(let i=0;i<6;i++){let x=L+(R-L)*i/5;for(let y of [T-43,B+43]){ctx.beginPath();ctx.moveTo(x,y-5);ctx.lineTo(x+5,y);ctx.lineTo(x,y+5);ctx.lineTo(x-5,y);ctx.closePath();ctx.fillStyle='#d9b77c';ctx.fill();}}
 pockets.forEach((p,i)=>{ctx.beginPath();ctx.arc(p[0],p[1],POCKET_RADIUS,0,2*Math.PI);ctx.fillStyle='#020605';ctx.fill();ctx.lineWidth=7;ctx.strokeStyle='#745235';ctx.stroke();if(phase==='call'&&i===selectedPocket){ctx.beginPath();ctx.arc(p[0],p[1],POCKET_RADIUS+14,0,2*Math.PI);ctx.lineWidth=5;ctx.strokeStyle='#f6d278';ctx.stroke();ctx.font='bold 24px Arial';ctx.textAlign='center';ctx.fillStyle='#ffecb0';ctx.fillText(''+(i+1),p[0],p[1]+8);}});
 const cue=balls[0];if(phase==='aim'&&cue.on&&!isComputer()&&!modal){const pred=prediction(now);
  const ray=aimRay();if(ray){path([[cue.x+Math.cos(angle)*RAD,cue.y+Math.sin(angle)*RAD],[ray.x,ray.y]],'#fff0bef5',3.2,[12,8]);}
  if(pred){const cp=pred.cuePath;
   if(pred.firstIndex>=0){const post=cp.slice(Math.max(0,pred.firstIndex));if(post.length>1)path(post,'#f5aa62e6',3,[8,7]);}
   else if(cp.length>2){ // After a bank, show the actual predicted reflected direction.
    let firstTurn=1;for(let i=2;i<cp.length;i++){const ax=cp[i-1][0]-cp[i-2][0],ay=cp[i-1][1]-cp[i-2][1],bx=cp[i][0]-cp[i-1][0],by=cp[i][1]-cp[i-1][1];if(ax*bx+ay*by < dist(ax,ay)*dist(bx,by)*.70){firstTurn=i-1;break;}};
    if(firstTurn>1)path(cp.slice(firstTurn),'#f5aa62e6',3,[8,7]);
   }
   if(pred.objPath.length>1)path(pred.objPath,'#92eaf0ed',3.2,[10,6]);
   if(pred.firstObj){ctx.beginPath();ctx.arc(pred.firstObj[0],pred.firstObj[1],RAD+3,0,2*Math.PI);ctx.lineWidth=2;ctx.strokeStyle='#92eaf0af';ctx.stroke();}
  }

 }
 
 // A short cue-tip follow-through after the stroke, overlaid behind moving balls.
 if(moving&&shotEffect&&now-strokeAt<210){const t=clamp((now-strokeAt)/210,0,1),a=shotEffect.a,dx=Math.cos(a),dy=Math.sin(a);ctx.save();ctx.globalAlpha=1-t;const qx=shotEffect.x-dx*(RAD+45-45*t),qy=shotEffect.y-dy*(RAD+45-45*t);ctx.beginPath();ctx.moveTo(qx-dx*185,qy-dy*185);ctx.lineTo(qx,qy);ctx.strokeStyle='#d3a46b';ctx.lineWidth=8;ctx.lineCap='round';ctx.stroke();ctx.restore();}
for(let b of balls)if(b.on)drawBall(b);
 if(phase==='place'&&cue.on){ctx.beginPath();ctx.arc(cue.x,cue.y,RAD+15,0,2*Math.PI);ctx.lineWidth=3;ctx.strokeStyle='#ffdb83';ctx.stroke();}
 if(phase==='aim'&&cue.on&&!isComputer()&&!modal){ctx.beginPath();ctx.arc(cue.x,cue.y,RAD+11,0,2*Math.PI);ctx.lineWidth=3;ctx.strokeStyle='#f4cf81';ctx.setLineDash([5,5]);ctx.stroke();ctx.setLineDash([]);
 // Visible cue-tip contact mark for draw/follow setting, moves up/down on cue ball.
 if(Math.abs(spin)>.02){ctx.font="bold 18px Arial";ctx.fillStyle="#ffda8c";ctx.textAlign="center";ctx.fillText(spin>0?"НАКАТ ↑":"ОТТЯЖКА ↓",cue.x,cue.y-37);}
 const dx=Math.cos(angle),dy=Math.sin(angle),cueBack=200+power*90,ex=cue.x-dx*(RAD+45+power*50),ey=cue.y-dy*(RAD+45+power*50);const strokeProgress=now-strokeAt<250?Math.sin(Math.PI*clamp((now-strokeAt)/250,0,1))*28:0;
 const sx=ex+dx*strokeProgress,sy=ey+dy*strokeProgress;ctx.beginPath();ctx.moveTo(sx-dx*cueBack+6,sy-dy*cueBack+6);ctx.lineTo(sx+6,sy+6);ctx.strokeStyle='#0008';ctx.lineWidth=12;ctx.stroke();const grad=ctx.createLinearGradient(sx-dx*cueBack,sy-dy*cueBack,sx,sy);grad.addColorStop(0,'#503121');grad.addColorStop(.7,'#b98d53');grad.addColorStop(1,'#eee4c7');ctx.beginPath();ctx.moveTo(sx-dx*cueBack,sy-dy*cueBack);ctx.lineTo(sx,sy);ctx.strokeStyle=grad;ctx.lineWidth=8;ctx.lineCap='round';ctx.stroke();ctx.lineCap='butt';}
}
function aiTargets(){const g=legalFirst();return balls.filter(b=>b.on&&b.id!==0&&(kind==='russian'?true:g==='open'?b.id!==8:g==='black'?b.id===8:group(b)===g));}
function lineClear(ax,ay,bx,by,exclude){const dx=bx-ax,dy=by-ay,d=dist(dx,dy);if(d<.1)return true;const ux=dx/d,uy=dy/d;return !balls.some(b=>b.on&&!exclude.includes(b.id)&&(()=>{const x=b.x-ax,y=b.y-ay,p=clamp(x*ux+y*uy,0,d);return dist(x-ux*p,y-uy*p)<RAD*2.12;})());}
function aiPlan(){const cue=balls[0],options=[];for(let b of aiTargets()){for(let i=0;i<6;i++){const p=pockets[i],t=unit(p[0]-b.x,p[1]-b.y),ghost=[b.x-t[0]*RAD*2,b.y-t[1]*RAD*2];if(ghost[0]<L+RAD||ghost[0]>R-RAD||ghost[1]<T+RAD||ghost[1]>B-RAD)continue;if(!lineClear(cue.x,cue.y,ghost[0],ghost[1],[0,b.id]))continue;if(!lineClear(b.x,b.y,p[0],p[1],[b.id,0]))continue;const n=unit(ghost[0]-cue.x,ghost[1]-cue.y),cut=n[0]*t[0]+n[1]*t[1];if(cut<.40)continue;const dc=dist(cue.x-ghost[0],cue.y-ghost[1]),dp=dist(p[0]-b.x,p[1]-b.y);options.push({angle:Math.atan2(n[1],n[0]),force:clamp(.22+dc/2400+dp/5000,.31,.86),pocket:i,quality:cut*1.9-dc/1900-dp/2000+(Math.random()-.5)*.12});}}
 options.sort((a,b)=>b.quality-a.quality);if(options.length){const p=options[Math.random()<.78?0:Math.min(options.length-1,Math.floor(Math.random()*Math.min(options.length,4)))];return{...p,angle:p.angle+(Math.random()-.5)*(.024+Math.random()*.020)};}
 const target=aiTargets().sort((a,b)=>dist(a.x-cue.x,a.y-cue.y)-dist(b.x-cue.x,b.y-cue.y))[0];return{angle:target?Math.atan2(target.y-cue.y,target.x-cue.x)+(Math.random()-.5)*.06:0,force:.55,pocket:0};}
function aiAction(now){if(!isComputer()||screen!=='game'||modal||moving||finished||now<aiAt)return;if(phase==='place'){const cue=balls[0];let candidate=freePosition(360,410);for(let i=0;i<12;i++){const p=freePosition(290+Math.random()*990,180+Math.random()*460);if(!balls.some(b=>b.on&&b.id!==0&&dist(b.x-p[0],b.y-p[1])<RAD*2+2)){candidate=p;break;}}cue.x=candidate[0];cue.y=candidate[1];confirmPlace();aiAt=now+800;return;}
 const plan=aiPlan();if(phase==='call'){selectedPocket=plan.pocket;confirmPocket();aiAt=now+850;return;}if(phase==='aim'){angle=plan.angle;spin=(Math.random()-.5)*.25;launch(plan.force);}}
function timeUp(){if(moving)return;charging=false;power=0;changeTurn();phase=canBlack(active)?'call':'aim';note('ВРЕМЯ ВЫШЛО · Сейчас '+labelName(active),2100);save();}
const downKeys=new Set();let aimHeldAt=0,aimDir=0,lastAimInput=0;
function arrow(k,repeat){if(phase==='place'){if(k==='ArrowUp')place(0,-1);if(k==='ArrowDown')place(0,1);if(k==='ArrowLeft')place(-1,0);if(k==='ArrowRight')place(1,0);return;}
 if(phase==='call'){if(k==='ArrowLeft'||k==='ArrowUp')choosePocket(-1);else choosePocket(1);return;}
 if(phase!=='aim')return;
 if(k==='ArrowLeft'||k==='ArrowRight'){const direction=k==='ArrowLeft'?-1:1;const elapsed=performance.now()-aimHeldAt;angle+=direction*(repeat?(elapsed>900?.010:elapsed>420?.006:.0035):(.12*Math.PI/180));angle=(angle+Math.PI*2)%(Math.PI*2);invalidateGuide();}
 else if(k==='ArrowUp'||k==='ArrowDown'){spin=clamp(spin+(k==='ArrowUp'?.06:-.06),-1,1);invalidateGuide();if(!repeat){note(spin>.025?'НАКАТ · биток пойдёт вперёд':spin<-.025?'ОТТЯЖКА · биток пойдёт назад':'Вращение убрано',850);}}
}
function back(){if(modal==='pause'){closeModal();return;}if(modal==='rules'||modal==='settings'){const was=screen==='game';closeModal();if(was)pause();return;}if(modal){closeModal();return;}if(screen==='game'){pause();return;}if(menuStep==='games'){menuStep='players';menuIndex=0;renderMenu();}}
function keyHandler(e,down){const k=e.key;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' ','Escape','Backspace','MediaPlayPause','BrowserBack'].includes(k))e.preventDefault();if(!down){downKeys.delete(k);if(k==='Enter'||k===' ')release();return;}
 if(['Escape','Backspace','MediaPlayPause','BrowserBack'].includes(k)){if(!e.repeat)back();return;}
 if(modal||screen==='menu'){if(k.startsWith('Arrow')){if(!e.repeat)menuMove(k==='ArrowUp'||k==='ArrowLeft'?-1:1);}else if((k==='Enter'||k===' ')&&!e.repeat){audio();if(modal)callbacks[modalIndex]?.();else menuChoose();}return;}
 if(screen!=='game'||moving||finished||isComputer())return;
 if(k==='Enter'||k===' '){if(e.repeat||downKeys.has(k))return;downKeys.add(k);if(phase==='place')confirmPlace();else if(phase==='call')confirmPocket();else beginCharge();return;}
 if(charging)return;
 if(k.startsWith('Arrow')){if(!e.repeat){aimHeldAt=performance.now();aimDir=k==='ArrowLeft'?-1:1;}arrow(k,e.repeat);}
}
function frame(now){if(!lastFrame)lastFrame=now;const dt=clamp((now-lastFrame)/1000,0,.048);lastFrame=now;
 if(screen==='game'&&!modal&&!finished){if(charging){power=clamp((now-chargeAt)/1750,0,1);}else if(moving){movePhysics(dt);}else{seconds-=dt;if(seconds<=10&&Math.ceil(seconds)!==lowTick){lowTick=Math.ceil(seconds);if(lowTick>=0)fx('tick');}if(seconds<=0)timeUp();else aiAction(now);}hud();tableDraw(now);if(toastDeadline&&now>toastDeadline){$('toast').classList.remove('show');toastDeadline=0;}}
 requestAnimationFrame(frame);
}
window.addEventListener('keydown',e=>keyHandler(e,true),true);
window.addEventListener('keyup',e=>keyHandler(e,false),true);
window.addEventListener('blur',()=>{downKeys.clear();charging=false;power=0;if(screen==='game'&&!modal&&!finished)pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&screen==='game'&&!modal&&!finished)pause();});
let pointerId=null;
cv.addEventListener('pointerdown',e=>{if(screen!=='game'||modal||moving||finished||isComputer())return;const rc=cv.getBoundingClientRect(),x=(e.clientX-rc.left)*W/rc.width,y=(e.clientY-rc.top)*H/rc.height,c=balls[0];if(phase==='place'){const p=freePosition(x,y);c.x=p[0];c.y=p[1];return;}if(phase==='call'){selectedPocket=pockets.map((p,i)=>[i,dist(p[0]-x,p[1]-y)]).sort((a,b)=>a[1]-b[1])[0][0];confirmPocket();return;}angle=Math.atan2(y-c.y,x-c.x);invalidateGuide();pointerId=e.pointerId;beginCharge();});
window.addEventListener('pointerup',e=>{if(pointerId===e.pointerId){pointerId=null;release();}});
// Small inspection hooks for deterministic automated tests; not exposed in the game UI.
window.__GEVORK_TEST__={getState:()=>({kind,playerMode,active,groups,scores,phase,seconds,angle,spin,power,balls:balls.map(b=>({...b})),first:shot?.firstContact}),startGame,makePrediction,arrow,scoreShot,launch};
requestAnimationFrame(frame);
showMenu();
})();
