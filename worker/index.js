/**
 * CampusFlow secure media gateway (Cloudflare Worker)
 * - Authenticates each student with Supabase Auth.
 * - Verifies access to chat resources with user's RLS JWT.
 * - Stores media bytes exclusively in privately owned Google Drive files.
 * - Saves only file IDs and metadata in Supabase using server-only service role.
 * - Optionally sends eligible resource bytes to Gemini when a student requests AI assistance.
 */
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };
const ALLOWED_MIME = new Set([
  'image/jpeg','image/png','image/webp','image/gif',
  'application/pdf','text/plain','text/markdown',
  'video/mp4','video/webm','audio/mpeg','audio/mp4','audio/ogg','audio/wav',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);
function resp(data,status=200,extra={}) { return new Response(JSON.stringify(data), {status,headers:{...JSON_HEADERS,...extra}}); }
function fail(msg,status=400) { return resp({error:msg},status); }
function cleanName(name='file') { return String(name).replace(/[\x00-\x1f<>:"/\\|?*]/g,'_').slice(0,140) || 'file'; }
function safeString(str,max=1000) { return String(str || '').trim().slice(0,max); }
function validUuid(value) { return /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value||''); }
function logSafeError(e) { return e instanceof Error ? e.message : 'Unknown error'; }
function parseError(obj,fallback='Upstream service unavailable') { return obj?.error?.message || obj?.error_description || (typeof obj?.error==='string' ? obj.error : fallback); }

async function driveToken(env) {
  const body = new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:env.GOOGLE_REFRESH_TOKEN,grant_type:'refresh_token'});
  const r = await fetch('https://oauth2.googleapis.com/token',{method:'POST',body});
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(`Google authentication failed: ${parseError(j,'Reauthorize the Drive owner account')}`);
  return j.access_token;
}
async function driveUpload(env,file,studentId) {
  const token=await driveToken(env);
  const meta={name:`CampusFlow_${Date.now()}_${cleanName(file.name)}`,mimeType:file.type,appProperties:{source:'campusflow',uploadedBy:studentId}};
  if(env.GOOGLE_FOLDER_ID) meta.parents=[env.GOOGLE_FOLDER_ID];
  const boundary=`campusflow_${crypto.randomUUID()}`;
  const body=new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,JSON.stringify(meta),
    `\r\n--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`,file,`\r\n--${boundary}--`
  ]);
  const r=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size',{
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':`multipart/related; boundary=${boundary}`},body
  });
  const j=await r.json();
  if(!r.ok || !j.id) throw new Error(`Google Drive upload failed: ${parseError(j)}`);
  return {id:j.id, token};
}
async function driveDelete(id,token) {
  try{await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`,{method:'DELETE',headers:{Authorization:`Bearer ${token}`}});}catch{}
}
function restHeaders(env,userToken,service=false){
  const key=service?env.SUPABASE_SERVICE_ROLE_KEY:env.SUPABASE_PUBLISHABLE_KEY;
  return {apikey:key,Authorization:`Bearer ${service?env.SUPABASE_SERVICE_ROLE_KEY:userToken}`,'Content-Type':'application/json'};
}
async function query(env,token,table,params,service=false) {
  const r=await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${params}`,{headers:restHeaders(env,token,service)});
  const j=await r.json();
  if(!r.ok) throw new Error('Database query failed');
  return j;
}
async function write(env,table,payload) {
  const r=await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`,{
    method:'POST',headers:{...restHeaders(env,'',true),Prefer:'return=representation'},body:JSON.stringify(payload)
  });
  const j=await r.json();
  if(!r.ok) throw new Error(j?.message||'Database record could not be saved');
  return j[0];
}
async function patch(env,table,params,payload){
  const r=await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${params}`,{
    method:'PATCH',headers:restHeaders(env,'',true),body:JSON.stringify(payload)
  });
  if(!r.ok) throw new Error('Profile image could not be saved');
}
async function getStudent(req,env){
  const auth=req.headers.get('Authorization')||'';
  if(!auth.startsWith('Bearer ')) return null;
  const token=auth.slice(7).trim();
  const r=await fetch(`${env.SUPABASE_URL}/auth/v1/user`,{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${token}`}});
  if(!r.ok) return null;
  const u=await r.json();
  return u.id?{id:u.id,token}:null;
}
async function canReadFile(env,student,fileId){
  const id=encodeURIComponent(fileId);
  const [resource,message,profile]=await Promise.all([
    query(env,student.token,'resources',`file_id=eq.${id}&select=id&limit=1`),
    query(env,student.token,'messages',`file_id=eq.${id}&select=id&limit=1`),
    query(env,student.token,'profiles',`avatar_file_id=eq.${id}&select=id&limit=1`)
  ]);
  return !!(resource.length||message.length||profile.length);
}
async function upload(req,env,student){
  const form=await req.formData();
  const file=form.get('file');
  const kind=safeString(form.get('kind'),20);
  if(!(file instanceof File)) return fail('Choose a media file');
  if(!ALLOWED_MIME.has(file.type)) return fail('Unsupported file type. Use PDF, images, text, Office documents, audio, or MP4/WebM.');
  if(file.size===0) return fail('Empty files are not supported');
  const limit=kind==='avatar'?2*1024*1024:20*1024*1024;
  if(file.size>limit) return fail(`File exceeds the ${kind==='avatar'?2:20} MB limit`);
  if(!['avatar','resource','message'].includes(kind)) return fail('Invalid upload purpose');
  if(kind==='avatar'&&!['image/jpeg','image/png','image/webp'].includes(file.type)) return fail('Profile pictures must be JPG, PNG or WebP');
  const moduleId=safeString(form.get('module_id'),50), chatId=safeString(form.get('chat_id'),50);
  const title=safeString(form.get('title'),180),description=safeString(form.get('description'),1000);
  if(kind==='resource'){
    if(!validUuid(moduleId)||title.length<2) return fail('Module and title are required');
    const module=await query(env,student.token,'modules',`id=eq.${moduleId}&select=id&limit=1`);
    if(!module.length) return fail('Module not found',404);
  }
  if(kind==='message'){
    if(!validUuid(chatId)) return fail('Select a conversation');
    const chats=await query(env,student.token,'chats',`id=eq.${chatId}&select=id&limit=1`);
    if(!chats.length) return fail('You do not belong to this conversation',403);
  }
  const {id,token}=await driveUpload(env,file,student.id);
  try{
    let record;
    if(kind==='avatar'){
      await patch(env,'profiles',`id=eq.${student.id}`,{avatar_file_id:id});
      record={file_id:id};
    } else if(kind==='resource'){
      record=await write(env,'resources',{module_id:moduleId,uploader_id:student.id,title,description,file_id:id,file_name:cleanName(file.name),mime_type:file.type,size_bytes:file.size});
    } else {
      record=await write(env,'messages',{chat_id:chatId,sender_id:student.id,body:description,file_id:id,file_name:cleanName(file.name),mime_type:file.type});
    }
    return resp({ok:true,record},201);
  }catch(e){await driveDelete(id,token);throw e;}
}
async function download(env,student,fileId){
  if(!/^[a-zA-Z0-9_-]{10,128}$/.test(fileId)) return fail('Invalid file ID');
  if(!await canReadFile(env,student,fileId)) return fail('File not found or access denied',404);
  const token=await driveToken(env);
  const metaR=await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size`,{headers:{Authorization:`Bearer ${token}`}});
  if(!metaR.ok) return fail('File is unavailable on Google Drive',404);
  const meta=await metaR.json();
  const upstream=await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,{headers:{Authorization:`Bearer ${token}`}});
  if(!upstream.ok) return fail('Could not load this file',502);
  const inline=/^(image\/(jpeg|png|webp|gif)|application\/pdf)$/.test(meta.mimeType);
  return new Response(upstream.body,{headers:{
    'Content-Type':meta.mimeType||'application/octet-stream',
    'Content-Disposition':`${inline?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(cleanName(meta.name||'download'))}`,
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff',
    ...(meta.size?{'Content-Length':String(meta.size)}:{})
  }});
}
function b64array(buffer){
  const bytes=new Uint8Array(buffer);
  const chunks=[];
  for(let i=0;i<bytes.length;i+=8192) chunks.push(String.fromCharCode(...bytes.subarray(i,i+8192)));
  return btoa(chunks.join(''));
}
async function ai(req,env,student){
  if(!env.GEMINI_API_KEY) return fail('AI is not configured by the administrator. Add GEMINI_API_KEY to the Worker.',503);
  const {resourceId,mode}=await req.json();
  if(!validUuid(resourceId)||!['summary','extract','quiz'].includes(mode)) return fail('Select a resource and AI task');
  const results=await query(env,student.token,'resources',`id=eq.${resourceId}&select=title,file_id,mime_type,size_bytes&limit=1`);
  if(!results.length) return fail('Resource not found',404);
  const resource=results[0];
  if(resource.size_bytes>3*1024*1024) return fail('AI supports files up to 3 MB in this free-tier starter. Please use a smaller PDF or image.');
  if(!['application/pdf','image/png','image/jpeg','image/webp','text/plain','text/markdown'].includes(resource.mime_type)) return fail('AI currently supports PDF, PNG, JPEG, WebP and plain-text documents.');
  const token=await driveToken(env);
  const drive=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(resource.file_id)}?alt=media`,{headers:{Authorization:`Bearer ${token}`}});
  if(!drive.ok) return fail('Could not read the source document from Google Drive',502);
  const buffer=await drive.arrayBuffer();
  if(buffer.byteLength>3*1024*1024) return fail('Document is too large for AI processing');
  const instructions={
    summary:'Provide a concise student-friendly summary with key concepts, main takeaways and a short revision checklist. Use clear headings.',
    extract:'Extract the content into clean, readable text. Preserve headings and lists where possible. Clearly indicate if any text is unclear.',
    quiz:'Create 8 multiple-choice revision questions about this resource. Include 4 options each, the correct answer and a brief explanation. Do not invent facts.'
  };
  const parts=[{text:`You are a careful learning assistant. Use ONLY the attached resource titled "${resource.title}". ${instructions[mode]} If the resource is unreadable, say so explicitly.`}];
  if(resource.mime_type.startsWith('text/')) parts.push({text:new TextDecoder().decode(buffer)});
  else parts.push({inline_data:{mime_type:resource.mime_type,data:b64array(buffer)}});
  const model=env.GEMINI_MODEL||'gemini-3.6-flash';
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
    method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},
    body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{maxOutputTokens:1800,temperature:0.35}})
  });
  const result=await response.json();
  if(!response.ok) return fail(`AI service error: ${parseError(result)}`,502);
  const answer=result.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('\n').trim();
  if(!answer) return fail('AI returned an empty response; try again',502);
  return resp({result:answer});
}

async function requireAdmin(env, student) {
  const rows = await query(
    env,
    student.token,
    'profiles',
    'id=eq.' + encodeURIComponent(student.id) +
      '&select=id,role&limit=1',
    true
  );

  return rows[0]?.role === 'admin';
}

async function deleteLearningResource(env, student, resourceId) {
  if (!validUuid(resourceId)) {
    return fail('Invalid resource identifier');
  }

  const rows = await query(
    env,
    student.token,
    'resources',
    'id=eq.' + encodeURIComponent(resourceId) +
      '&select=id,file_id,uploader_id,title&limit=1',
    true
  );

  const resource = rows[0];

  if (!resource) {
    return fail('Resource not found',404);
  }

  if (
    resource.uploader_id !== student.id &&
    !(await requireAdmin(env,student))
  ) {
    return fail(
      'Only the uploader or an administrator can delete this resource',
      403
    );
  }

  // Delete the actual media file from Google Drive first.
  const googleToken = await driveToken(env);

  const driveResponse = await fetch(
    'https://www.googleapis.com/drive/v3/files/' +
      encodeURIComponent(resource.file_id),
    {
      method:'DELETE',
      headers:{Authorization:'Bearer '+googleToken}
    }
  );

  if (!driveResponse.ok && driveResponse.status !== 404) {
    const details = await driveResponse.json().catch(()=>({}));

    return fail(
      'Google Drive deletion failed: '+parseError(details),
      502
    );
  }

  // Remove Supabase metadata only after Drive deletion succeeds.
  const dbResponse = await fetch(
    env.SUPABASE_URL +
      '/rest/v1/resources?id=eq.' +
      encodeURIComponent(resource.id),
    {
      method:'DELETE',
      headers:restHeaders(env,'',true)
    }
  );

  if (!dbResponse.ok) {
    return fail(
      'The Google Drive file was removed but database cleanup failed. Please retry.',
      502
    );
  }

  return resp({ok:true});
}

async function permanentlyDeleteStudent(env, admin, targetId) {
  if (!validUuid(targetId)) {
    return fail('Invalid student identifier');
  }

  if (!(await requireAdmin(env,admin))) {
    return fail('Administrator privileges required',403);
  }

  if (targetId === admin.id) {
    return fail('You cannot delete your own administrator account',403);
  }

  const rows = await query(
    env,
    admin.token,
    'profiles',
    'id=eq.' + encodeURIComponent(targetId) +
      '&select=id,role,avatar_file_id&limit=1',
    true
  );

  const target = rows[0];

  if (!target) return fail('Student not found',404);

  if (target.role !== 'student') {
    return fail('Only student accounts can be removed here',403);
  }

  // Delete the Supabase Auth account permanently.
  // The SQL migration preserves messages and resources.
  const deletion = await fetch(
    env.SUPABASE_URL +
      '/auth/v1/admin/users/' +
      encodeURIComponent(targetId),
    {
      method:'DELETE',
      headers:restHeaders(env,'',true),
      body:JSON.stringify({should_soft_delete:false})
    }
  );

  if (!deletion.ok) {
    const details = await deletion.json().catch(()=>({}));

    return fail(
      'Student deletion failed. Check the SQL migration. ' +
        parseError(details,'Contact the administrator.'),
      409
    );
  }

  // Remove the deleted student's unused profile picture.
  // Shared learning resources are deliberately preserved.
  if (target.avatar_file_id) {
    try {
      const token = await driveToken(env);
      await driveDelete(target.avatar_file_id,token);
    } catch {
      // Account deletion has already succeeded.
    }
  }

  return resp({ok:true});
}

export default {
  async fetch(req,env){
    const origin=req.headers.get('Origin')||'';
    const allowed=(env.ALLOWED_ORIGINS||'http://localhost:5173').split(',').map(x=>x.trim());
    const isAllowed=!!origin&&allowed.includes(origin);
    const cors={...(isAllowed?{'Access-Control-Allow-Origin':origin}:{}),'Vary':'Origin',
      'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS'};
    if(req.method==='OPTIONS') return new Response(null,{status:isAllowed?204:403,headers:cors});
    if(origin&&!isAllowed) return fail('Origin not allowed',403);
    const url=new URL(req.url);
    if(url.pathname==='/api/health') return new Response(JSON.stringify({ok:true}),{headers:{...JSON_HEADERS,...cors}});
    if(!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY||!env.SUPABASE_SERVICE_ROLE_KEY) return fail('Backend is missing Supabase secrets',503);
    let r;
    try{
      const student=await getStudent(req,env);
      if(!student) r=fail('Please sign in again',401);
      else if(req.method==='POST'&&url.pathname==='/api/upload') r=await upload(req,env,student);
      else if(req.method==='GET'&&url.pathname.startsWith('/api/file/')) r=await download(env,student,url.pathname.slice('/api/file/'.length));
      else if(req.method==='POST'&&url.pathname==='/api/ai') r=await ai(req,env,student);
       else if(req.method==='DELETE'&&url.pathname.startsWith('/api/resources/')) r=await deleteLearningResource(env,student,url.pathname.slice('/api/resources/'.length));
       else if(req.method==='DELETE'&&url.pathname.startsWith('/api/admin/students/')) r=await permanentlyDeleteStudent(env,student,url.pathname.slice('/api/admin/students/'.length));
      else r=fail('Not found',404);
    }catch(e){r=fail(logSafeError(e),500);}
    const headers=new Headers(r.headers);
    Object.entries(cors).forEach(([k,v])=>headers.set(k,v));
    return new Response(r.body,{status:r.status,headers});
  }
};
