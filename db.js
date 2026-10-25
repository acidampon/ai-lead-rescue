const fs=require('fs');
const path=require('path');
const DATA=path.resolve(process.env.DATA_PATH || path.join(__dirname,'data.json'));
let pool=null,ready=Promise.resolve(),saveQueue=Promise.resolve(),db=null;
function empty(){return {leads:[],settings:{},settingsByWorkspace:{},events:[],workspaces:[],users:[],sessions:[]}}
function loadLocal(){if(!fs.existsSync(DATA)){fs.mkdirSync(path.dirname(DATA),{recursive:true});fs.writeFileSync(DATA,JSON.stringify(empty(),null,2))}return JSON.parse(fs.readFileSync(DATA,'utf8'))}
function saveLocal(x){fs.mkdirSync(path.dirname(DATA),{recursive:true});fs.writeFileSync(DATA,JSON.stringify(x,null,2))}
async function initPostgres(){
 if(!process.env.DATABASE_URL)return;
 try{
  const {Pool}=require('pg');pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='false'?false:{rejectUnauthorized:false},max:Number(process.env.DATABASE_POOL_SIZE||10)});
  await pool.query(`CREATE TABLE IF NOT EXISTS alr_state (id integer PRIMARY KEY CHECK(id=1), payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
  const r=await pool.query('SELECT payload FROM alr_state WHERE id=1');
  if(r.rows[0]?.payload)db=r.rows[0].payload;else{db=loadLocal();await pool.query('INSERT INTO alr_state(id,payload) VALUES(1,$1)',[db])}
  console.log('Database: PostgreSQL');
 }catch(e){console.error('PostgreSQL unavailable:',e.message);if(process.env.NODE_ENV==='production'||process.env.REQUIRE_PERSISTENCE==='true')throw e;pool=null;db=loadLocal()}
}
function init(){ready=initPostgres();return ready.then(()=>{if(!db)db=loadLocal();const required=process.env.NODE_ENV==='production'||process.env.REQUIRE_PERSISTENCE==='true';if(required&&!pool)throw new Error('Persistent PostgreSQL storage is required but DATABASE_URL is not configured');console.log(`Storage ready: ${pool?'postgresql':'local'}`);return db})}
function get(){if(!db)db=loadLocal();return db}
async function save(x){db=x;saveLocal(x);if(pool){await ready;const snapshot=JSON.stringify(x);const write=saveQueue.catch(()=>{}).then(()=>pool.query('UPDATE alr_state SET payload=$1::jsonb,updated_at=now() WHERE id=1',[snapshot]));saveQueue=write;await write}}
async function status(){await ready;try{await saveQueue;if(pool){await pool.query('SELECT 1');return{type:'postgresql',ok:true}}return{type:'local',ok:true}}catch(e){return{type:pool?'postgresql':'local',ok:false,error:e.message}}}
async function close(){await ready;await saveQueue;if(pool)await pool.end()}
module.exports={init,get,save,close,status}
