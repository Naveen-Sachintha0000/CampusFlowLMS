// Run: node --env-file=.env.drive.local scripts/create-drive-folder.mjs
// This creates an app-owned folder accessible under the drive.file OAuth scope.
const {GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET,GOOGLE_REFRESH_TOKEN}=process.env;
if(!GOOGLE_CLIENT_ID||!GOOGLE_CLIENT_SECRET||!GOOGLE_REFRESH_TOKEN){console.error('Missing Google OAuth credentials in .env.drive.local');process.exit(1)}
const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:GOOGLE_CLIENT_ID,client_secret:GOOGLE_CLIENT_SECRET,refresh_token:GOOGLE_REFRESH_TOKEN,grant_type:'refresh_token'})});
const t=await response.json();
if(!response.ok){console.error('Token error:',t.error_description||t.error);process.exit(1)}
const folder=await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink',{
  method:'POST',headers:{Authorization:`Bearer ${t.access_token}`,'Content-Type':'application/json'},
  body:JSON.stringify({name:'CampusFlow LMS Media',mimeType:'application/vnd.google-apps.folder'})
});
const result=await folder.json();
if(!folder.ok){console.error('Folder error:',result.error?.message);process.exit(1)}
console.log('Folder successfully created in Google Drive.');
console.log('Set Worker secret GOOGLE_FOLDER_ID to:',result.id);
console.log('Keep this folder private; students will access it through the authorized Worker.');
