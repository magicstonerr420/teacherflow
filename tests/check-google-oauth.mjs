const base=process.env.SUPABASE_URL;
if(!base)throw new Error('Load the server environment first.');
const url=new URL('/auth/v1/authorize',base);
url.searchParams.set('provider','google');
url.searchParams.set('redirect_to','http://127.0.0.1:3000/auth?redirect=%2Fbuilder');
const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000)});
const location=response.headers.get('location');
if(response.status>=300&&response.status<400&&location&&new URL(location).origin==='https://accounts.google.com'){
 console.log('PASS: Supabase redirects to Google. Complete a real browser sign-in before declaring Google login working.');
}else{
 const error=await response.json().catch(()=>({}));
 console.log('Google provider is not ready:',response.status,error.error_code||error.code||'unknown',error.msg||error.message||'No Google authorization redirect');
 process.exitCode=1;
}
