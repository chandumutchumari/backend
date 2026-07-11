(async ()=>{
  try{
    const startRes = await fetch('http://localhost:5000/api/auth/start',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ applicationNumber:'', password:'' })
    });
    const startJson = await startRes.json();
    console.log('START_SESSION:', startJson.sessionId);

    const loginRes = await fetch('http://localhost:5000/api/auth/login',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ sessionId: startJson.sessionId, captcha: 'WRONG123' })
    });
    let loginJson = null;
    try{ loginJson = await loginRes.json(); } catch(e){}
    console.log('LOGIN_STATUS:', loginRes.status);
    console.log('LOGIN_JSON:', JSON.stringify(loginJson));
  }catch(e){
    console.error(e);
    process.exit(1);
  }
})();
