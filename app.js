
const routines={
 A:[['레그프레스','허벅지 · 엉덩이'],['체스트프레스 머신','가슴'],['랫 풀다운','등'],['라잉 레그컬','허벅지 뒤'],['덤벨 사이드 레터럴 레이즈','어깨 옆'],['케이블 팔로프 프레스','코어 · 좌우']],
 B:[['스미스 스쿼트','허벅지 · 엉덩이'],['인클라인 체스트프레스','윗가슴'],['시티드 로우','등'],['백 익스텐션','허리 · 둔근'],['숄더프레스 머신','어깨'],['어시스트 딥스','가슴 · 삼두']]
};
const schedule={
 0:{kind:'rest',title:'휴식',sub:'완전 휴식'},
 1:{kind:'strength',routine:'A',title:'전신 A 40~45분',sub:'자전거 10~15분',cardio:'자전거 10~15분'},
 2:{kind:'rest',title:'퇴근 후 휴식',sub:'회복에 집중'},
 3:{kind:'strength',routine:'B',title:'전신 B 40~45분',sub:'자전거 10~15분',cardio:'자전거 10~15분'},
 4:{kind:'rest',title:'퇴근 후 휴식',sub:'회복에 집중'},
 5:{kind:'strength',routine:'A',title:'전신 A 40~45분',sub:'유산소 생략 가능',cardio:'유산소 선택'},
 6:{kind:'cardio',title:'유산소 30~40분',sub:'자전거 또는 빠른 걷기',cardio:'자전거·빠른 걷기 30~40분'}
};
const dayNames=['일','월','화','수','목','금','토'];
const mealDefs=[['breakfast','아침','예: 반숙란 2개 + 고구마'],['lunch','점심','예: 회사 구내식당 메뉴'],['dinner','저녁','예: 계란 2개 + 닭가슴살'],['snack','간식','예: 단백질 음료']];
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
function localDate(){const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)}
function parseDate(s){return new Date(s+'T00:00:00')}
function isoDate(d){const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)}
function koDate(s){const d=parseDate(s);return (d.getMonth()+1)+'월 '+d.getDate()+'일 ('+dayNames[d.getDay()]+')'}
function mondayOf(s){const d=parseDate(typeof s==='string'?s:isoDate(s));d.setDate(d.getDate()-((d.getDay()+6)%7));return d}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function loadHistory(){try{return JSON.parse(localStorage.getItem('workout-history-v1')||'[]')}catch(e){return []}}
function saveHistory(x){localStorage.setItem('workout-history-v1',JSON.stringify(x))}
function loadDiet(){try{return JSON.parse(localStorage.getItem('diet-history-v1')||'[]')}catch(e){return []}}
function saveDiet(x){localStorage.setItem('diet-history-v1',JSON.stringify(x))}
function isRest(x){return x&&x.type==='rest'}
function isWorkout(x){return x&&(x.type||'workout')==='workout'}
function planFor(s){return schedule[parseDate(s).getDay()]}
function recordFor(s){return loadHistory().filter(x=>x.date===s).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''))[0]||null}
function planStatus(s){const r=recordFor(s);if(!r)return '미기록';if(isRest(r))return '휴식 기록';if(r.cardioOnly)return '유산소 기록';return '운동 기록'}

function renderWeekPlan(){
 const m=mondayOf(localDate()), box=$('#weekPlan');box.innerHTML='';
 for(let i=0;i<7;i++){const d=addDays(m,i), ds=isoDate(d), p=planFor(ds), row=document.createElement('div');row.className='plan-row'+(ds===localDate()?' today':'');row.innerHTML='<div class="daybadge">'+dayNames[d.getDay()]+'</div><div><b>'+p.title+'</b><div class="tiny">'+p.sub+'</div></div><div class="status">'+planStatus(ds)+'</div>';box.appendChild(row)}
 const t=planFor(localDate());$('#todayPlanMain').textContent=t.title;$('#todayPlanSub').textContent=t.sub;$('#todayPlanPill').className='pill '+(t.kind==='rest'?'rest':t.kind==='cardio'?'cardio':'')
}
function renderRoutine(){
 const key=$('#routineSelect').value, sets=Number($('#volumeSelect').value), list=$('#exerciseList');list.innerHTML='';
 routines[key].forEach((ex,i)=>{const card=document.createElement('div');card.className='exercise';let rows='';for(let s=1;s<=sets;s++)rows+='<div class="setrow"><div class="setnum">'+s+'</div><input inputmode="decimal" placeholder="kg" data-k="'+i+'-'+s+'-kg"><input inputmode="numeric" placeholder="회" data-k="'+i+'-'+s+'-reps"><button class="donebtn" data-k="'+i+'-'+s+'-done">완료</button></div>';card.innerHTML='<div class="exercise-head"><div><div class="ex-name">'+String(i+1).padStart(2,'0')+' '+ex[0]+'</div><div class="ex-meta">'+ex[1]+' · '+sets+'세트</div></div></div><div class="sets">'+rows+'</div>';list.appendChild(card)});
 bindDraft()
}
function draftKey(){return $('#workoutDate').value+'|'+$('#routineSelect').value+'|'+$('#volumeSelect').value}
function bindDraft(){
 const drafts=JSON.parse(localStorage.getItem('workout-draft-v1')||'{}'), d=drafts[draftKey()]||{};
 $$('#exerciseList [data-k]').forEach(el=>{const k=el.dataset.k;if(el.tagName==='BUTTON'){el.classList.toggle('done',!!d[k]);el.onclick=()=>{el.classList.toggle('done');persistDraft()}}else{el.value=d[k]||'';el.oninput=persistDraft}});
 if(d.cardioType!==undefined)$('#cardioType').value=d.cardioType;if(d.cardioMinutes!==undefined)$('#cardioMinutes').value=d.cardioMinutes
}
function persistDraft(){const all=JSON.parse(localStorage.getItem('workout-draft-v1')||'{}'),d={};$$('#exerciseList [data-k]').forEach(el=>d[el.dataset.k]=el.tagName==='BUTTON'?el.classList.contains('done'):el.value);d.cardioType=$('#cardioType').value;d.cardioMinutes=$('#cardioMinutes').value;all[draftKey()]=d;localStorage.setItem('workout-draft-v1',JSON.stringify(all))}
function applyPlan(s){
 const p=planFor(s);if(p.routine)$('#routineSelect').value=p.routine;
 $('#cardioGuide').textContent=p.cardio||'선택';$('#recommendedPill').textContent=p.kind==='cardio'?'유산소 30~40분':p.kind==='rest'?'계획된 휴식':'근력 40~45분';$('#recommendedPill').className='pill '+(p.kind==='rest'?'rest':p.kind==='cardio'?'cardio':'');
 const cardioOnly=p.kind==='cardio';$('#strengthArea').classList.toggle('hidden',cardioOnly);$('#volumeWrap').classList.toggle('hidden',cardioOnly);$('#routineWrap').classList.toggle('hidden',cardioOnly);
 if(cardioOnly&&!$('#cardioType').value)$('#cardioType').value='자전거';if(p.kind==='strength'&&p.cardio&&p.cardio.indexOf('10~15')>-1&&!$('#cardioType').value)$('#cardioType').value='실내 자전거';
 renderRoutine()
}
function clearDraft(){const all=JSON.parse(localStorage.getItem('workout-draft-v1')||'{}');delete all[draftKey()];localStorage.setItem('workout-draft-v1',JSON.stringify(all));$('#cardioType').value='';$('#cardioMinutes').value='';applyPlan($('#workoutDate').value)}
function saveWorkout(){
 persistDraft();const date=$('#workoutDate').value,p=planFor(date),cardio={type:$('#cardioType').value,minutes:Number($('#cardioMinutes').value)||0};let item;
 if(p.kind==='cardio') item={date:date,type:'workout',cardioOnly:true,cardio:cardio,createdAt:new Date().toISOString()};
 else{const routine=$('#routineSelect').value,volume=Number($('#volumeSelect').value),exercises=routines[routine].map((ex,i)=>({name:ex[0],part:ex[1],sets:Array.from({length:volume},(_,j)=>{const s=j+1;return{kg:document.querySelector('[data-k="'+i+'-'+s+'-kg"]').value,reps:document.querySelector('[data-k="'+i+'-'+s+'-reps"]').value,done:document.querySelector('[data-k="'+i+'-'+s+'-done"]').classList.contains('done')}})}));item={date:date,type:'workout',routine:routine,volume:volume,exercises:exercises,cardio:cardio,createdAt:new Date().toISOString()}}
 let h=loadHistory().filter(x=>x.date!==date);h.push(item);h.sort((a,b)=>b.date.localeCompare(a.date));saveHistory(h);refreshAll();alert('운동 기록을 저장했어요.')
}
function saveRest(){const date=$('#workoutDate').value;if(recordFor(date)&&!confirm('이 날짜의 기존 기록을 휴식으로 바꿀까요?'))return;let h=loadHistory().filter(x=>x.date!==date);h.push({date:date,type:'rest',reason:$('#restReason').value,memo:$('#restMemo').value.trim(),createdAt:new Date().toISOString()});h.sort((a,b)=>b.date.localeCompare(a.date));saveHistory(h);refreshAll();alert('휴식으로 기록했어요.')}

function renderMeals(){
 const box=$('#mealList');box.innerHTML='';
 mealDefs.forEach(def=>{const id=def[0],div=document.createElement('div');div.className='meal';div.innerHTML='<h3>'+def[1]+'</h3><div class="field"><label>먹은 음식</label><textarea id="meal-'+id+'-text" placeholder="'+def[2]+'"></textarea></div><div class="macro-row"><div class="field"><label>kcal</label><input id="meal-'+id+'-kcal" type="number" min="0"></div><div class="field"><label>단백질 g</label><input id="meal-'+id+'-protein" type="number" min="0" step="0.1"></div><div class="field"><label>탄수 g</label><input id="meal-'+id+'-carbs" type="number" min="0" step="0.1"></div><div class="field"><label>지방 g</label><input id="meal-'+id+'-fat" type="number" min="0" step="0.1"></div></div>';box.appendChild(div)});
 $$('#mealList input,#mealList textarea').forEach(el=>el.addEventListener('input',updateDietTotals))
}
function collectMeals(){const meals={};mealDefs.forEach(def=>{const id=def[0];meals[id]={text:$('#meal-'+id+'-text').value.trim(),kcal:Number($('#meal-'+id+'-kcal').value)||0,protein:Number($('#meal-'+id+'-protein').value)||0,carbs:Number($('#meal-'+id+'-carbs').value)||0,fat:Number($('#meal-'+id+'-fat').value)||0}});return meals}
function totals(meals){return Object.values(meals||{}).reduce((a,m)=>({kcal:a.kcal+(m.kcal||0),protein:a.protein+(m.protein||0),carbs:a.carbs+(m.carbs||0),fat:a.fat+(m.fat||0)}),{kcal:0,protein:0,carbs:0,fat:0})}
function updateDietTotals(){const t=totals(collectMeals());$('#dietTotals').innerHTML='<div class="metric"><b>'+Math.round(t.kcal)+'</b><span>kcal</span></div><div class="metric"><b>'+Math.round(t.protein)+'</b><span>단백질 g</span></div><div class="metric"><b>'+Math.round(t.carbs)+'</b><span>탄수 g</span></div><div class="metric"><b>'+Math.round(t.fat)+'</b><span>지방 g</span></div>'}
function loadDietForm(){const found=loadDiet().find(x=>x.date===$('#dietDate').value);mealDefs.forEach(def=>{const id=def[0],m=found&&found.meals&&found.meals[id]?found.meals[id]:{};$('#meal-'+id+'-text').value=m.text||'';$('#meal-'+id+'-kcal').value=m.kcal||'';$('#meal-'+id+'-protein').value=m.protein||'';$('#meal-'+id+'-carbs').value=m.carbs||'';$('#meal-'+id+'-fat').value=m.fat||''});updateDietTotals()}
function saveDietRecord(){const date=$('#dietDate').value,meals=collectMeals();let h=loadDiet().filter(x=>x.date!==date);h.push({date:date,meals:meals,totals:totals(meals),createdAt:new Date().toISOString()});h.sort((a,b)=>b.date.localeCompare(a.date));saveDiet(h);refreshAll();alert('식단을 저장했어요.')}
function resetDiet(){if(!confirm('이 날짜의 입력 내용을 비울까요?'))return;mealDefs.forEach(def=>{['text','kcal','protein','carbs','fat'].forEach(k=>$('#meal-'+def[0]+'-'+k).value='')});updateDietTotals()}

function refreshSummary(){
 const h=loadHistory(),r=h[0];if(r){if(isRest(r)){ $('#lastWorkout').textContent=r.date+' · 휴식';$('#lastWorkoutSub').textContent=(r.reason||'휴식')+(r.memo?' · '+r.memo:'')}else if(r.cardioOnly){$('#lastWorkout').textContent=r.date+' · 유산소';$('#lastWorkoutSub').textContent=(r.cardio.type||'유산소')+' '+(r.cardio.minutes||0)+'분'}else{$('#lastWorkout').textContent=r.date+' · 전신 '+r.routine;$('#lastWorkoutSub').textContent=(r.exercises||[]).length+'개 운동 기록'}}else{$('#lastWorkout').textContent='아직 기록이 없어요';$('#lastWorkoutSub').textContent='첫 기록부터 차곡차곡'}
 const last=h.filter(x=>isWorkout(x)&&!x.cardioOnly&&x.routine)[0];$('#nextRoutine').textContent=last?(last.routine==='A'?'B':'A'):'A';
 const m=mondayOf(localDate()),e=addDays(m,6);$('#weekCount').textContent=h.filter(x=>isWorkout(x)&&!x.cardioOnly&&parseDate(x.date)>=m&&parseDate(x.date)<=e).length
}
function describeRecord(r){if(!r)return '기록 없음';if(isRest(r))return '휴식 ('+(r.reason||'이유 미입력')+(r.memo?', '+r.memo:'')+')';if(r.cardioOnly)return '유산소 '+(r.cardio.type||'')+' '+(r.cardio.minutes||0)+'분';const done=(r.exercises||[]).reduce((n,e)=>n+e.sets.filter(s=>s.done).length,0),total=(r.exercises||[]).reduce((n,e)=>n+e.sets.length,0);let s='전신 '+r.routine+' '+done+'/'+total+'세트';if(r.cardio&&r.cardio.minutes)s+=' + '+(r.cardio.type||'유산소')+' '+r.cardio.minutes+'분';return s}
function renderHistory(){
 const h=loadHistory(),box=$('#historyList');box.innerHTML=h.length?'':'<div class="muted">아직 기록이 없어요.</div>';
 h.forEach(w=>{const div=document.createElement('div');div.className='history-item';let tag='WORKOUT',cls='',detail=describeRecord(w);if(isRest(w)){tag='REST';cls=' rest'}else if(w.cardioOnly){tag='CARDIO';cls=' cardio'}div.innerHTML='<div class="history-title"><div class="strong">'+w.date+'</div><span class="tag'+cls+'">'+tag+'</span></div><div class="muted">'+detail+'</div>';box.appendChild(div)})
}
function renderDietHistory(){const list=loadDiet().slice(0,14),box=$('#dietHistoryList');box.innerHTML=list.length?'':'<div class="muted">아직 식단 기록이 없어요.</div>';list.forEach(d=>{const foods=mealDefs.map(def=>{const m=d.meals&&d.meals[def[0]];return m&&m.text?def[1]+': '+m.text:''}).filter(Boolean).join(' / '),t=d.totals||totals(d.meals),div=document.createElement('div');div.className='history-item';div.innerHTML='<div class="strong">'+d.date+'</div><div class="muted">'+(foods||'음식 내용 미입력')+'</div><div class="tiny">'+Math.round(t.kcal||0)+' kcal · 단백질 '+Math.round(t.protein||0)+'g · 탄수 '+Math.round(t.carbs||0)+'g · 지방 '+Math.round(t.fat||0)+'g</div>';box.appendChild(div)})}
function dietText(d){if(!d)return '식단 기록 없음';const foods=mealDefs.map(def=>{const m=d.meals&&d.meals[def[0]];return m&&m.text?def[1]+' '+m.text:''}).filter(Boolean).join(' | '),t=d.totals||totals(d.meals);return (foods||'음식 내용 미입력')+' / '+Math.round(t.kcal||0)+'kcal, P '+Math.round(t.protein||0)+'g, C '+Math.round(t.carbs||0)+'g, F '+Math.round(t.fat||0)+'g'}
function weeklyData(anchor){const m=mondayOf(anchor),h=loadHistory(),d=loadDiet(),days=[];for(let i=0;i<7;i++){const x=addDays(m,i),s=isoDate(x);days.push({date:s,day:dayNames[x.getDay()],plan:planFor(s),record:h.find(v=>v.date===s)||null,diet:d.find(v=>v.date===s)||null})}return{monday:m,sunday:addDays(m,6),days:days}}
function buildAnalysis(){const w=weeklyData($('#weekAnchor').value);let o='내 1주일 운동·식단 기록을 분석해줘. 운동 계획 준수도, 피로/회복 패턴, 근력운동 진행, 유산소 양, 식사 패턴과 단백질·열량 기록을 함께 보고 다음 주에 조정할 점을 구체적으로 알려줘. 기록이 없는 항목은 추정하지 말고 부족한 데이터라고 표시해줘.\n\n기간: '+isoDate(w.monday)+' ~ '+isoDate(w.sunday)+'\n';w.days.forEach(x=>{o+='\n['+x.date+' '+x.day+']\n계획: '+x.plan.title+' / '+x.plan.sub+'\n실제: '+describeRecord(x.record)+'\n식단: '+dietText(x.diet)+'\n'});return o}
function renderWeekly(){const w=weeklyData($('#weekAnchor').value),box=$('#weekSummary');$('#weekRange').textContent=isoDate(w.monday)+' ~ '+isoDate(w.sunday);box.innerHTML='';w.days.forEach(x=>{const div=document.createElement('div');div.className='week-day';div.innerHTML='<div class="d">'+x.day+'<div class="tiny">'+x.date.slice(5)+'</div></div><div><b>'+x.plan.title+'</b><div class="tiny">실제: '+describeRecord(x.record)+'</div><div class="tiny">식단: '+dietText(x.diet)+'</div></div>';box.appendChild(div)});$('#analysisPreview').textContent=buildAnalysis()}
async function copyAnalysis(){try{await navigator.clipboard.writeText(buildAnalysis());alert('주간 분석문을 복사했어요. ChatGPT에 붙여넣으면 됩니다.')}catch(e){alert('복사에 실패했어요. 분석문을 길게 눌러 복사해 주세요.')}}
async function shareAnalysis(){const text=buildAnalysis();if(navigator.share){try{await navigator.share({title:'주간 운동·식단 분석',text:text});return}catch(e){if(e&&e.name==='AbortError')return}}try{await navigator.clipboard.writeText(text)}catch(e){}alert('분석문을 복사했어요. ChatGPT를 열게요. 새 화면에서 붙여넣어 주세요.');window.open('https://chatgpt.com/','_blank')}
function exportAll(){const data={exportedAt:new Date().toISOString(),workoutHistory:loadHistory(),dietHistory:loadDiet()},blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='workout-diet-backup.json';a.click();URL.revokeObjectURL(a.href)}
function refreshAll(){refreshSummary();renderWeekPlan();renderHistory();renderDietHistory();renderWeekly()}

$$('.tab').forEach(btn=>btn.onclick=()=>{$$('.tab').forEach(x=>x.classList.remove('active'));btn.classList.add('active');['log','diet','history','weekly','guide'].forEach(x=>$('#tab-'+x).classList.toggle('hidden',x!==btn.dataset.tab));if(btn.dataset.tab==='diet')loadDietForm();if(btn.dataset.tab==='weekly')renderWeekly()});
renderMeals();$('#workoutDate').value=localDate();$('#dietDate').value=localDate();$('#weekAnchor').value=localDate();$('#todayText').textContent=koDate(localDate());
$('#routineSelect').onchange=renderRoutine;$('#volumeSelect').onchange=renderRoutine;$('#workoutDate').onchange=()=>applyPlan($('#workoutDate').value);$('#cardioType').onchange=persistDraft;$('#cardioMinutes').oninput=persistDraft;
$('#saveBtn').onclick=saveWorkout;$('#restBtn').onclick=saveRest;$('#resetBtn').onclick=()=>{if(confirm('현재 입력한 운동 기록을 초기화할까요?'))clearDraft()};
$('#dietDate').onchange=loadDietForm;$('#dietSaveBtn').onclick=saveDietRecord;$('#dietResetBtn').onclick=resetDiet;$('#exportBtn').onclick=exportAll;$('#weekAnchor').onchange=renderWeekly;$('#copyAnalysisBtn').onclick=copyAnalysis;$('#shareAnalysisBtn').onclick=shareAnalysis;
applyPlan(localDate());loadDietForm();refreshAll();
if('serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js'))}
let deferredPrompt;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('#installBtn').style.display='block'});$('#installBtn').onclick=async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$('#installBtn').style.display='none'};window.addEventListener('appinstalled',()=>$('#installBtn').style.display='none');
