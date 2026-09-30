import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const port=3137;const data=path.join(root,'data.json');if(fs.existsSync(data))fs.unlinkSync(data);
const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),NODE_ENV:'development',AUTH_REQUIRED:'true'},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
const base=`http://127.0.0.1:${port}`;
async function wait(){for(let i=0;i<40;i++){try{const r=await fetch(base+'/api/health');if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,100))}throw new Error('server did not start\n'+logs)}
async function req(url,opts={}){const r=await fetch(base+url,opts);const body=await r.json().catch(()=>({}));return{r,body}}
try{await wait();const h=await req('/api/health');if(h.body.version!=='0.16.0')throw new Error('wrong version');
const email=`smoke-${Date.now()}@example.com`;const reg=await req('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:'StrongPass123!',businessName:'Smoke Test Business'})});if(reg.r.status!==201)throw new Error('registration failed');
const cookie=reg.r.headers.get('set-cookie');if(!cookie)throw new Error('session cookie missing');const settings=await req('/api/settings',{headers:{cookie}});const intake=settings.body.intakeToken;if(!intake)throw new Error('intake token missing');
const lead=await req('/api/public/leads',{method:'POST',headers:{'content-type':'application/json','x-intake-token':intake,'idempotency-key':'smoke-1'},body:JSON.stringify({name:'Test Customer',email:'customer@example.com',message:'I need a five-page website within the next three weeks.',source:'smoke-test'})});if(lead.r.status!==201)throw new Error('lead intake failed');
const dup=await req('/api/public/leads',{method:'POST',headers:{'content-type':'application/json','x-intake-token':intake,'idempotency-key':'smoke-1'},body:JSON.stringify({name:'Test Customer',email:'customer@example.com',message:'duplicate'})});if(!dup.body.duplicate)throw new Error('idempotency failed');
const leads=await req('/api/leads',{headers:{cookie}});if(leads.r.status!==200||leads.body.length!==1)throw new Error('lead listing failed');
const reply=await req('/api/public/reply',{method:'POST',headers:{'content-type':'application/json','x-intake-token':intake},body:JSON.stringify({leadId:lead.body.leadId,message:'Thanks, I will get back to you.'})});if(reply.r.status!==200||!reply.body.automationStopped)throw new Error('reply failed');
const ready=await req('/api/ready');if(!ready.body.ready)throw new Error('readiness failed');console.log('SMOKE PASS: health, auth, workspace, intake, idempotency, reply, readiness');
}finally{child.kill('SIGTERM');await once(child,'exit').catch(()=>{});if(fs.existsSync(data))fs.unlinkSync(data)}