// Lightweight backend smoke tests that use mock network responses; no credentials required.
import worker from '../worker/index.js';
const env={ALLOWED_ORIGINS:'http://localhost:5173',SUPABASE_URL:'https://demo.supabase.co',SUPABASE_PUBLISHABLE_KEY:'pk',SUPABASE_SERVICE_ROLE_KEY:'fake-legacy-service-role',GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test',GOOGLE_REFRESH_TOKEN:'test'};
const oldFetch=globalThis.fetch;
const requests=[];
const data={};
globalThis.fetch=async (input,options={})=>{
 const url=String(input);requests.push({url,method:options.method||'GET'});
 if(url.endsWith('/auth/v1/user'))return Response.json({id:'33333333-3333-4333-8333-333333333333'});
 if(url.includes('/rest/v1/modules'))return Response.json([{id:'11111111-1111-4111-8111-111111111111'}]);
 if(url.includes('/rest/v1/resources')){
  if(options.method==='POST'){data.record=JSON.parse(options.body);return Response.json([data.record],{status:201});}
  return Response.json([{id:'record'}]);
 }
 if(url.includes('/rest/v1/messages')||url.includes('/rest/v1/profiles'))return Response.json([]);
 if(url.includes('oauth2.googleapis.com/token'))return Response.json({access_token:'test-access'});
 if(url.includes('upload/drive/v3/files'))return Response.json({id:'1GOODFILEIDxxxxx',name:'report.pdf'});
 if(url.includes('drive/v3/files/1GOODFILEIDxxxxx?fields='))return Response.json({id:'1GOODFILEIDxxxxx',mimeType:'application/pdf',name:'report.pdf',size:4});
 if(url.includes('drive/v3/files/1GOODFILEIDxxxxx?alt=media'))return new Response('TEST',{status:200,headers:{'Content-Type':'application/pdf'}});
 throw new Error('Unexpected mock request: '+url);
};
function url(path){return 'https://worker.example'+path;}
function request(path,method='GET',body){return new Request(url(path),{method,headers:{Origin:'http://localhost:5173',Authorization:'Bearer sample-auth-token'},body});}
function check(condition,msg){if(!condition)throw new Error(msg);}
try{
 const health=await worker.fetch(new Request(url('/api/health')),env);check(health.status===200,'Health failed');
 const noAuth=await worker.fetch(new Request(url('/api/file/1GOODFILEIDxxxxx')),env);check(noAuth.status===401,'Unauthorized requests must fail');
 const forbidden=await worker.fetch(new Request(url('/api/health'),{headers:{Origin:'https://bad-site.example'}}),env);check(forbidden.status===403,'Foreign origins must fail');
 const payload=new FormData();payload.set('kind','resource');payload.set('module_id','11111111-1111-4111-8111-111111111111');payload.set('title','My test PDF');payload.set('file',new File(['TEST'],'report.pdf',{type:'application/pdf'}));
 const uploaded=await worker.fetch(request('/api/upload','POST',payload),env);
 check(uploaded.status===201,'Drive upload failed: '+(await uploaded.text()));
 check(data.record.file_id==='1GOODFILEIDxxxxx','Drive file id not saved');
 check(data.record.title==='My test PDF','Resource title not saved');
 const downloaded=await worker.fetch(request('/api/file/1GOODFILEIDxxxxx'),env);
 check(downloaded.status===200,'Authorized file proxy failed');
 check(await downloaded.text()==='TEST','File body was not proxied');
 check(downloaded.headers.get('Cache-Control')==='private, no-store','File privacy cache header missing');
 const aiNoKey=await worker.fetch(request('/api/ai','POST',JSON.stringify({resourceId:'11111111-1111-4111-8111-111111111111',mode:'summary'})),env);
 check(aiNoKey.status===503,'Missing AI key should show a clear configuration error');
 console.log('PASS: health, authentication, CORS, private Drive upload, DB metadata, authorized download and optional-AI handling.');
}finally{globalThis.fetch=oldFetch;}
