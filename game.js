const canvas=document.querySelector('#canvas'),ctx=canvas.getContext('2d'),$=s=>document.querySelector(s);
let W,H,running=false,inShop=false,last=0,keys={},audio,bossBeat;
let stars=[],bullets=[],enemyBullets=[],enemies=[],particles=[],boss=null,player;
const state={};

function resize(){
  W=canvas.width=innerWidth; H=canvas.height=innerHeight;
  stars=Array.from({length:Math.max(80,W*H/7000)},()=>({x:Math.random()*W,y:Math.random()*H,z:1+Math.random()*4}));
}
addEventListener('resize',resize); resize();

function tone(freq,duration=.1,type='square',end){
  if(!audio)return;
  const oscillator=audio.createOscillator(),gain=audio.createGain();
  oscillator.type=type; oscillator.frequency.value=freq; gain.gain.value=.08;
  oscillator.connect(gain).connect(audio.destination);
  gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);
  if(end)oscillator.frequency.exponentialRampToValueAtTime(end,audio.currentTime+duration);
  oscillator.start(); oscillator.stop(audio.currentTime+duration);
}
function explosion(){tone(100,.35,'sawtooth',30)}
function bossMusic(enabled){
  clearInterval(bossBeat);
  if(enabled)bossBeat=setInterval(()=>{if(running&&boss)tone([110,147,165,196][Math.floor(performance.now()/180)%4],.12,'triangle')},180);
}

function reset(){
  Object.assign(state,{score:0,credits:0,lives:3,level:1,kills:0,energy:0,fireRate:1,damage:1,hull:1,drone:0,blast:1});
  player={x:W/2,y:H*.73,r:18,hp:100,maxHp:100,cooldown:0,invulnerable:0,angle:0};
  bullets=[]; enemyBullets=[]; enemies=[]; particles=[]; boss=null; updateHud();
}
function announce(text){
  const message=$('#notice'); message.textContent=text;
  message.classList.remove('show'); void message.offsetWidth; message.classList.add('show');
}
function addExplosion(x,y,color,count=14){
  for(let i=0;i<count;i++)particles.push({x,y,vx:(Math.random()-.5)*350,vy:(Math.random()-.5)*350,life:.3+Math.random()*.5,color});
}
function addBullet(x,y,vx,vy,enemy=false,damage=1,color){
  (enemy?enemyBullets:bullets).push({x,y,vx,vy,r:enemy?5:3,damage,color:color||(enemy?'#ff4ca4':'#55edff')});
}

function spawnEnemy(){
  const type=Math.random()<.25?'cruiser':Math.random()<.5?'zigzag':'scout';
  const health=(type==='cruiser'?6:2)+state.level;
  enemies.push({type,x:30+Math.random()*(W-60),y:-35,r:type==='cruiser'?26:15,hp:health,maxHp:health,
    speed:70+state.level*8,cooldown:1+Math.random()*2,time:Math.random()*4,
    color:type==='cruiser'?'#ad77ff':type==='zigzag'?'#ffaf46':'#ff4c71'});
}
function spawnBoss(){
  const name=['DREADNOUGHT','RAGE ROBOT','DR. CHAOS'][(state.level/3-1)%3|0];
  const settings={
    DREADNOUGHT:{pattern:'spread',color:'#ff4c71',hp:260},
    'RAGE ROBOT':{pattern:'charge',color:'#ffad42',hp:310},
    'DR. CHAOS':{pattern:'spiral',color:'#ad77ff',hp:240}
  }[name];
  boss={...settings,name,hp:settings.hp+state.level*35,maxHp:settings.hp+state.level*35,x:W/2,y:-90,r:62,cooldown:1.4,time:0};
  $('#bossName').textContent=name+' — THREAT DETECTED';
  $('#bossPanel').classList.remove('hidden'); announce('⚠ '+name+' ARRIVES ⚠'); bossMusic(true);
}
function bossAttack(){
  if(boss.pattern==='spread'){
    for(let angle=-.7;angle<.8;angle+=.22)addBullet(boss.x,boss.y+boss.r,Math.sin(angle)*260,Math.cos(angle)*260,true,9);
  }else if(boss.pattern==='charge'){
    const dx=player.x-boss.x,dy=player.y-boss.y,length=Math.hypot(dx,dy);
    boss.vx=dx/length*430; boss.vy=dy/length*430;
    for(let i=0;i<9;i++)addBullet(boss.x,boss.y,Math.cos(i*.7)*160,Math.sin(i*.7)*160,true,7);
  }else{
    for(let i=0;i<18;i++){const angle=i*.35+boss.time*3;addBullet(boss.x,boss.y,Math.cos(angle)*190,Math.sin(angle)*190,true,7)}
  }
  tone(90,.17,'sawtooth',40);
}
function destroy(target,damage){
  target.hp-=damage; if(target.hp>0)return;
  addExplosion(target.x,target.y,target.color,30); explosion();
  if(target===boss){
    state.score+=1000*state.level; state.credits+=250; boss=null;
    $('#bossPanel').classList.add('hidden'); bossMusic(false); announce('BOSS DESTROYED! +250 CREDITS');
    setTimeout(showShop,700);
  }else{
    state.score+=10*state.level; state.credits+=4; state.energy=Math.min(100,state.energy+5); state.kills++;
    enemies.splice(enemies.indexOf(target),1);
  }
}
function hurt(amount){
  if(player.invulnerable>0)return;
  player.hp-=amount; player.invulnerable=.7; tone(150,.15,'sawtooth',50); addExplosion(player.x,player.y,'#fff');
  if(player.hp<=0){
    state.lives--;
    if(state.lives<1){finishGame();return}
    player.hp=player.maxHp; player.x=W/2; player.y=H*.7; announce('LIFE LOST — '+state.lives+' LEFT');
  }
}
function novaBlast(){
  if(state.energy<100||!running)return;
  state.energy=0; announce('✦ NOVA BLAST ✦'); tone(900,.6,'sine',70);
  enemies.slice().forEach(enemy=>destroy(enemy,9999));
  if(boss)destroy(boss,55*state.blast);
  addExplosion(player.x,player.y,'#55edff',80);
}

function update(dt){
  stars.forEach(star=>{star.y+=star.z*35*dt;if(star.y>H){star.y=0;star.x=Math.random()*W}});
  player.invulnerable-=dt; player.cooldown-=dt; player.angle+=dt*2;
  const moveX=(keys.arrowright||keys.d?1:0)-(keys.arrowleft||keys.a?1:0);
  const moveY=(keys.arrowdown||keys.s?1:0)-(keys.arrowup||keys.w?1:0);
  player.x=Math.max(player.r,Math.min(W-player.r,player.x+moveX*360*dt));
  player.y=Math.max(45,Math.min(H-player.r,player.y+moveY*360*dt));
  if((keys[' ']||keys.fire)&&player.cooldown<0){
    addBullet(player.x,player.y-player.r,0,-620,false,state.damage);
    player.cooldown=.27/state.fireRate; tone(680,.06,'square',330);
  }
  if(state.drone&&player.cooldown<.04&&Math.floor(performance.now()/500)%2===0){
    addBullet(player.x+Math.cos(player.angle)*45,player.y+Math.sin(player.angle)*45,0,-520,false,state.damage*.6,'#ffd54a');
  }
  for(const bullet of bullets.concat(enemyBullets)){bullet.x+=bullet.vx*dt;bullet.y+=bullet.vy*dt}
  bullets=bullets.filter(bullet=>bullet.y>-20&&bullet.y<H+20);
  enemyBullets=enemyBullets.filter(bullet=>bullet.y>-20&&bullet.y<H+20);
  for(const bullet of bullets)for(const target of boss?[boss,...enemies]:enemies){
    if(Math.hypot(bullet.x-target.x,bullet.y-target.y)<bullet.r+target.r){bullet.y=-99;destroy(target,bullet.damage)}
  }
  enemyBullets.forEach(bullet=>{if(Math.hypot(bullet.x-player.x,bullet.y-player.y)<bullet.r+player.r){bullet.y=-99;hurt(bullet.damage)}});
  enemies.forEach(enemy=>{
    enemy.time+=dt;enemy.y+=enemy.speed*dt;if(enemy.type==='zigzag')enemy.x+=Math.sin(enemy.time*3)*110*dt;
    enemy.cooldown-=dt;if(enemy.type==='cruiser'&&enemy.cooldown<0){addBullet(enemy.x,enemy.y,0,260,true,8);enemy.cooldown=1.5}
    if(Math.hypot(enemy.x-player.x,enemy.y-player.y)<enemy.r+player.r){hurt(14);enemy.hp=0}
  });
  enemies=enemies.filter(enemy=>enemy.hp>0);
  if(boss){
    boss.time+=dt;boss.cooldown-=dt;boss.y+=boss.y<120?80*dt:0;boss.x+=Math.sin(boss.time)*90*dt;
    if(boss.vx){boss.x+=boss.vx*dt;boss.y+=boss.vy*dt;boss.vx*=.94;boss.vy*=.94}
    if(boss.cooldown<0){bossAttack();boss.cooldown=boss.pattern==='charge'?1.8:1.2}
    if(Math.hypot(boss.x-player.x,boss.y-player.y)<boss.r+player.r)hurt(25);
  }
  if(!boss&&state.kills>=state.level*14){state.level++;state.kills=0;state.level%3===0?spawnBoss():(announce('SECTOR '+state.level),showShop())}
  else if(!boss&&Math.random()<dt*(.8+state.level*.08))spawnEnemy();
  particles.forEach(particle=>{particle.x+=particle.vx*dt;particle.y+=particle.vy*dt;particle.life-=dt});
  particles=particles.filter(particle=>particle.life>0); updateHud();
}

function ship(x,y,r,color,enemy=false){
  ctx.save();ctx.translate(x,y);ctx.shadowColor=color;ctx.shadowBlur=18;ctx.fillStyle=color;ctx.beginPath();
  if(enemy){ctx.moveTo(0,r);ctx.lineTo(r,-r);ctx.lineTo(0,-r/3);ctx.lineTo(-r,-r)}
  else{ctx.moveTo(0,-r*1.3);ctx.lineTo(r,r);ctx.lineTo(0,r*.3);ctx.lineTo(-r,r)}
  ctx.closePath();ctx.fill();ctx.restore();
}
function drawBoss(){
  ctx.save();ctx.translate(boss.x,boss.y);ctx.fillStyle=boss.color;ctx.shadowColor=boss.color;ctx.shadowBlur=30;
  if(boss.name==='DREADNOUGHT'){ctx.fillRect(-62,-18,124,70);ctx.beginPath();ctx.moveTo(0,-62);ctx.lineTo(43,30);ctx.lineTo(-43,30);ctx.fill()}
  else if(boss.name==='RAGE ROBOT'){ctx.fillRect(-38,-25,76,90);ctx.fillRect(-65,0,25,55);ctx.fillRect(40,0,25,55);ctx.fillStyle='#fff';ctx.fillRect(-23,-5,12,12);ctx.fillRect(11,-5,12,12)}
  else{ctx.beginPath();ctx.arc(0,0,45,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(0,-5,16,0,Math.PI*2);ctx.fill()}
  ctx.restore();
}
function draw(){
  ctx.clearRect(0,0,W,H);
  stars.forEach(star=>{ctx.fillStyle='#c6efff';ctx.globalAlpha=.2+star.z/8;ctx.fillRect(star.x,star.y,star.z/2,star.z*2)});ctx.globalAlpha=1;
  particles.forEach(particle=>{ctx.fillStyle=particle.color;ctx.globalAlpha=particle.life*1.5;ctx.fillRect(particle.x,particle.y,3,3)});ctx.globalAlpha=1;
  bullets.concat(enemyBullets).forEach(bullet=>{ctx.fillStyle=bullet.color;ctx.shadowColor=bullet.color;ctx.shadowBlur=12;ctx.beginPath();ctx.arc(bullet.x,bullet.y,bullet.r,0,Math.PI*2);ctx.fill()});ctx.shadowBlur=0;
  enemies.forEach(enemy=>{
    ship(enemy.x,enemy.y,enemy.r,enemy.color,true);
    const width=enemy.r*2;
    ctx.fillStyle='rgba(0,0,0,.75)';ctx.fillRect(enemy.x-enemy.r,enemy.y-enemy.r-11,width,5);
    ctx.fillStyle='#55edff';ctx.fillRect(enemy.x-enemy.r,enemy.y-enemy.r-11,width*(enemy.hp/enemy.maxHp),5);
  });if(boss)drawBoss();
  if(state.drone)ship(player.x+Math.cos(player.angle)*45,player.y+Math.sin(player.angle)*45,9,'#ffd54a');
  if(player.invulnerable<0||Math.floor(player.invulnerable*15)%2)ship(player.x,player.y,player.r,'#55edff');
}
function updateHud(){
  $('#score').textContent=Math.floor(state.score);$('#credits').textContent=state.credits;$('#lives').textContent=state.lives;
  $('#health').style.width=(player?100*player.hp/player.maxHp:100)+'%';$('#novaChip').textContent='NOVA BLAST: '+Math.floor(state.energy)+'%';
  $('#droneChip').textContent='COMPANION: '+(state.drone?'ACTIVE':'OFFLINE');
  if(boss)$('#bossHealth').style.width=100*boss.hp/boss.maxHp+'%';
}

const upgrades=[
  ['Hull Plating','+25 maximum hull','hull',70],['Rapid Fire','20% faster firing','fireRate',90],
  ['Weapon Core','More laser damage','damage',110],['Drone Companion','Orbiting mini ship helps fire','drone',180],
  ['Nova Amplifier','More boss damage from Nova','blast',140],['Emergency Life','Gain one extra life','life',220]
];
function showShop(){
  if(!running)return;inShop=true;const list=$('#upgradeList');list.className='upgrade-grid';list.innerHTML='';
  upgrades.forEach(([name,description,key,cost])=>{
    const button=document.createElement('button');button.className='upgrade';button.innerHTML=name+' <b>'+cost+' CR</b><small>'+description+'</small>';
    button.onclick=()=>{
      if(state.credits<cost){announce('NOT ENOUGH CREDITS');return}
      state.credits-=cost;
      if(key==='hull'){state.hull++;player.maxHp+=25;player.hp=Math.min(player.maxHp,player.hp+25)}
      else if(key==='life')state.lives++; else state[key]++;
      announce(name+' UPGRADED');updateHud();
    };list.append(button);
  });$('#shop').classList.remove('hidden');
}
function finishGame(){running=false;bossMusic(false);$('#finalScore').textContent='Final score: '+Math.floor(state.score);$('#gameOver').classList.remove('hidden')}
function startGame(){
  audio=new (window.AudioContext||window.webkitAudioContext)();reset();running=true;
  $('#startScreen').classList.add('hidden');$('#gameOver').classList.add('hidden');last=performance.now();requestAnimationFrame(loop);
}
function loop(time){
  const dt=Math.min(.04,(time-last)/1000);last=time;
  if(running&&!inShop){update(dt);draw()}if(running)requestAnimationFrame(loop);
}
addEventListener('keydown',event=>{keys[event.key.toLowerCase()]=true;if(event.key===' ')event.preventDefault();if(event.key.toLowerCase()==='e')novaBlast()});
addEventListener('keyup',event=>keys[event.key.toLowerCase()]=false);
$('#startButton').onclick=startGame;$('#againButton').onclick=startGame;
$('#continueButton').onclick=()=>{inShop=false;$('#shop').classList.add('hidden')};
$('#upgradeButton').onclick=()=>{if(running&&!inShop)showShop()};
$('#mobileFire').onpointerdown=()=>keys.fire=true;$('#mobileFire').onpointerup=()=>keys.fire=false;$('#mobileNova').onclick=novaBlast;
