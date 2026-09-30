const fs=require('fs');
const path=require('path');
const DATA=path.join(__dirname,'data.json');
let pool=null,ready=Promise.resolve(),db=null;
function empty(){return {leads:[],settings:{},settingsByWorkspace:{},events:[],workspaces:[],users:[],sessions:[]}}
function loadLocal(){if(!fs.existsSync(DATA))fs.writeFileSync(DATA,JSON.stringify(empty(),null,2));return JSON.parse(fs.readFileSync(DATA,'utf8'))}
function saveLocal(x){fs.writeFileSync(DATA,JSON.stringify(x,null,2))}
async function initPostgres(){
 if(!process.env.DATABASE_URL)return;
 try{
  const {Pool}=require('pg');pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='false'?false:{rejectUnauthorized:false},max:Number(process.env.DATABASE_POOL_SIZE||10)});
  await pool.query(`CREATE TABLE IF NOT EXISTS alr_state (id integer PRIMARY KEY CHECK(id=1), payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
  const r=await pool.query('SELECT payload FROM alr_state WHERE id=1');
  if(r.rows[0]?.payload)db=r.rows[0].payload;else{db=loadLocal();await pool.query('INSERT INTO alr_state(id,payload) VALUES(1,$1)',[db])}
  console.log('Database: PostgreSQL');
 }catch(e){console.error('PostgreSQL unavailable:',e.message);if(process.env.NODE_ENV==='production')throw e;pool=null;db=loadLocal()}
}
function init(){ready=initPostgres();return ready.then(()=>{if(!db)db=loadLocal();return db})}
function get(){if(!db)db=loadLocal();return db}
function save(x){db=x;saveLocal(x);if(pool)ready=ready.then(()=>pool.query('UPDATE alr_state SET payload=$1,updated_at=now() WHERE id=1',[x]).catch(e=>console.error('PostgreSQL save failed:',e.message)))}
async function status(){await ready;if(pool){try{await pool.query('SELECT 1');return{type:'postgresql',ok:true}}catch(e){return{type:'postgresql',ok:false,error:e.message}}}return{type:'local',ok:true}}
async function close(){await ready;if(pool)await pool.end()}
module.exports={init,get,save,close,status}