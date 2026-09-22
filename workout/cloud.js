/* Account-scoped online storage. Guest records are never uploaded implicitly. */
(function () {
  'use strict';
  var guestWork=loadWork, guestDiet=loadDiet, guestSaveWork=saveWork, guestSaveDiet=saveDietData;
  var client=null, user=null, ready=false, busy=false, epoch=0, rows=[], dietDirty=false;
  var status=document.getElementById('cloudStatus');
  function message(s){status.textContent=s;}
  function scope(){return user && user.id;}
  function entries(kind){return rows.filter(function(r){return r.kind===kind}).map(function(r){return r.payload}).sort(function(a,b){return b.date.localeCompare(a.date)});}
  window.loadWork=function(){return user?entries('workout'):guestWork()};
  window.loadDiet=function(){return user?entries('diet'):guestDiet()};
  function repaint(){refresh();if(!dietDirty)loadDietForm();}
  function controls(){
    document.getElementById('cloudLogin').hidden=!!user;
    document.getElementById('cloudAccount').hidden=!user;
    document.getElementById('cloudEmailLabel').textContent=user?user.email:'';
    document.querySelector('.privacy').textContent=user?'개인 서버 저장':'기기 내부 저장';
    document.querySelector('.foot').textContent=user?'저장 버튼을 누르면 내 계정의 서버에 저장됩니다.':'로그인하지 않은 기록은 이 기기에만 저장됩니다.';
  }
  async function pull(){
    if(!user||busy)return;
    var id=scope(), token=epoch;
    busy=true;
    try{
      var all=[], offset=0;
      while(true){
        var result=await client.from('workout_entries').select('kind,day,payload,revision').eq('user_id',id).order('kind').order('day').range(offset,offset+499);
        if(result.error)throw result.error;
        all=all.concat(result.data);if(result.data.length<500)break;offset+=500;
      }
      if(scope()!==id||epoch!==token)return;
      rows=all;ready=true;repaint();message('동기화 완료 · '+new Date().toLocaleTimeString('ko-KR'));
    }catch(e){if(scope()===id)message('서버 연결 실패 · 저장 전 연결을 확인하고 다시 동기화해 주세요.');}
    finally{busy=false;}
  }
  async function save(kind,records,date){
    if(!user){(kind==='workout'?guestSaveWork:guestSaveDiet)(records);return;}
    if(!ready||busy)throw Error('서버 연결을 확인 중입니다. 잠시 후 다시 저장해 주세요.');
    var id=scope(), token=epoch;
    var changed=records.filter(function(record){return record.date===date});
    busy=true;
    try{
      for(var record of changed){
        var old=rows.find(function(r){return r.kind===kind&&r.day===record.date});
        var result=await client.rpc('save_workout_entry',{p_kind:kind,p_day:record.date,p_payload:record,p_revision:old?old.revision:0});
        if(result.error){if(result.error.code==='40001')throw Error('다른 기기에서 같은 날짜를 수정했습니다. 입력 내용은 그대로 있습니다. 지금 동기화 후 내용을 확인하고 다시 저장해 주세요.');throw Error('서버에 저장하지 못했습니다. 입력 내용은 그대로입니다. 연결을 확인하고 다시 저장해 주세요.');}
        if(scope()!==id||epoch!==token)throw Error('계정이 변경되었습니다. 다시 로그인해 주세요.');
        rows=rows.filter(function(r){return !(r.kind===kind&&r.day===record.date)}).concat(result.data);
      }
      message('서버 저장 완료 · '+new Date().toLocaleTimeString('ko-KR'));
    }finally{busy=false;}
  }
  window.saveWork=function(a,date){return save('workout',a,date)};
  window.saveDietData=function(a,date){return save('diet',a,date)};
  function handle(fn){return async function(){try{await fn()}catch(e){alert(e.message||'처리하지 못했습니다. 다시 시도해 주세요.')}};}
  document.getElementById('saveWorkout').onclick=handle(saveWorkout);
  document.getElementById('saveRest').onclick=handle(saveRest);
  document.getElementById('saveDiet').onclick=handle(async function(){await saveDiet();dietDirty=false});
  document.getElementById('meals').addEventListener('input',function(){dietDirty=true});
  document.getElementById('ddate').addEventListener('change',function(){dietDirty=false});
  document.getElementById('cloudSync').onclick=pull;
  document.getElementById('cloudImport').onclick=handle(async function(){
    if(!user||!ready||busy)throw Error('동기화 완료 후 다시 시도해 주세요.');
    var work=guestWork(), diet=guestDiet();
    if(!work.length&&!diet.length){message('이 브라우저에 가져올 기존 기록이 없습니다.');return;}
    if(!confirm('이 기기의 기존 기록을 '+user.email+' 계정으로 가져올까요? 같은 날짜의 서버 기록은 유지하며, 원본도 이 기기에 남깁니다.'))return;
    var id=scope(),token=epoch,added=0,skipped=0;
    busy=true;
    try{
      for(var group of [['workout',work],['diet',diet]]){
        for(var record of group[1]){
          if(scope()!==id||epoch!==token)throw Error('계정이 변경되어 가져오기를 중단했습니다.');
          var result=await client.rpc('save_workout_entry',{p_kind:group[0],p_day:record.date,p_payload:record,p_revision:0});
          if(result.error){if(result.error.code==='40001'){skipped++;continue;}throw Error('일부 기록을 가져오지 못했습니다. 원본은 남아 있으며 다시 시도할 수 있습니다.');}
          added++;
        }
      }
    }finally{busy=false;await pull();}
    message('가져오기 완료 · 추가 '+added+'건 / 같은 날짜 유지 '+skipped+'건');
  });
  document.getElementById('cloudLogout').onclick=handle(async function(){
    if(busy)throw Error('저장·동기화가 끝난 후 로그아웃해 주세요.');
    var r=await client.auth.signOut();if(r.error)throw r.error;
  });
  document.getElementById('cloudLogin').onsubmit=async function(e){
    e.preventDefault();if(!client)return;
    var button=document.getElementById('cloudLoginButton');button.disabled=true;
    try{
      var r=await client.auth.signInWithPassword({email:document.getElementById('cloudEmail').value.trim(),password:document.getElementById('cloudPassword').value});
      if(r.error){message('로그인 실패 · 이메일과 비밀번호를 확인해 주세요.');return;}
      document.getElementById('cloudPassword').value='';
    }finally{button.disabled=false;}
  };
  document.getElementById('cloudSignup').onclick=handle(async function(){
    if(!client)return;
    var form=document.getElementById('cloudLogin');if(!form.reportValidity())return;
    var password=document.getElementById('cloudPassword').value;
    if(password.length<12)throw Error('비밀번호를 12자 이상 입력해 주세요.');
    var button=document.getElementById('cloudSignup');button.disabled=true;
    try{
      var r=await client.auth.signUp({email:document.getElementById('cloudEmail').value.trim(),password:password,options:{emailRedirectTo:location.origin+location.pathname}});
      if(r.error)throw Error('계정 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      message('이메일로 도착한 가입 확인 링크를 누른 뒤 여기서 로그인해 주세요.');
      document.getElementById('cloudPassword').value='';
    }finally{button.disabled=false;}
  });
  async function init(){
    var cfg=window.WORKOUT_CLOUD;
    if(!cfg||!cfg.url||!cfg.publishableKey){message('서버 연결 준비 중 · 현재는 기기에만 저장됩니다.');return;}
    try{
      var sdk=await import('https://esm.sh/@supabase/supabase-js@2.57.4');
      client=sdk.createClient(cfg.url,cfg.publishableKey,{auth:{storageKey:'workout-cloud-auth-v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
      document.getElementById('cloudLoginButton').disabled=false;
      document.getElementById('cloudSignup').disabled=false;
      client.auth.onAuthStateChange(function(event,session){
        var next=session&&session.user;
        if((next&&next.id)===(user&&user.id)){if(!next)message('로그인하면 다른 기기와 기록을 공유할 수 있어요.');return;}
        epoch++;user=next;ready=false;rows=[];dietDirty=false;
        controls();clearDiet();renderExercises();repaint();
        if(user){message('서버 기록을 가져오는 중…');setTimeout(pull,0);}else message('로그아웃됨 · 현재는 기기에만 저장됩니다.');
      });
      setInterval(function(){if(document.visibilityState==='visible')pull()},30000);
      window.addEventListener('online',pull);
      document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')pull()});
    }catch(e){message('로그인 연결 실패 · 기기 저장은 계속 사용할 수 있습니다.');}
  }
  init();
})();
