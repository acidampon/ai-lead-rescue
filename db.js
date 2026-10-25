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
async function save(x){db=x;if(!pool){saveLocal(x);return}await ready;const snapshot=JSON.stringify(x);const write=saveQueue.catch(()=>{}).then(()=>pool.query('UPDATE alr_state SET payload=$1::jsonb,updated_at=now() WHERE id=1',[snapshot]));saveQueue=write;await write}
async function status(){await ready;try{await saveQueue;if(pool){await pool.query('SELECT 1');return{type:'postgresql',ok:true}}return{type:'local',ok:true}}catch(e){return{type:pool?'postgresql':'local',ok:false,error:e.message}}}
async function close(){await ready;await saveQueue;if(pool)await pool.end()}

function quoteIdentifier(value){return '"'+String(value).replace(/"/g,'""')+'"'}
async function exportDatabaseSnapshot(){
 await ready;await saveQueue;
 if(!pool)throw new Error('PostgreSQL storage is not active; a shared-database export is unavailable in local mode.');
 const client=await pool.connect();
 try{
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const metadata=await client.query('SELECT current_database() AS database_name,current_user AS database_user,current_timestamp AS exported_at');
 const tableList=await client.query(`
  SELECT table_schema,table_name FROM information_schema.tables
  WHERE table_type='BASE TABLE'
   AND table_schema NOT IN ('pg_catalog','information_schema')
   AND table_schema NOT LIKE 'pg_toast%'
  ORDER BY table_schema,table_name
 `);
 const tables=[];
 for(const item of tableList.rows){
  const schema=item.table_schema,table=item.table_name;
  const relation=quoteIdentifier(schema)+'.'+quoteIdentifier(table);
  const [columns,constraints,indexes,triggers,rows]=await Promise.all([
   client.query('SELECT column_name,data_type,udt_name,is_nullable,column_default,ordinal_position FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position',[schema,table]),
   client.query('SELECT c.conname AS name,c.contype AS type,pg_get_constraintdef(c.oid,true) AS definition FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname=$1 AND r.relname=$2 ORDER BY c.conname',[schema,table]),
   client.query('SELECT indexname,indexdef FROM pg_indexes WHERE schemaname=$1 AND tablename=$2 ORDER BY indexname',[schema,table]),
   client.query('SELECT t.tgname AS name,pg_get_triggerdef(t.oid,true) AS definition FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE NOT t.tgisinternal AND n.nspname=$1 AND r.relname=$2 ORDER BY t.tgname',[schema,table]),
   client.query(`SELECT COALESCE(json_agg(to_jsonb(t)),'[]'::json) AS rows FROM ${relation} t`)
  ]);
  const data=rows.rows[0]?.rows||[];
  tables.push({schema,name:table,rowCount:Array.isArray(data)?data.length:0,columns:columns.rows,constraints:constraints.rows,indexes:indexes.rows,triggers:triggers.rows,rows:data});
 }
 const views=await client.query(`
  SELECT schemaname AS schema,viewname AS name,definition FROM pg_views
  WHERE schemaname NOT IN ('pg_catalog','information_schema')
   AND schemaname NOT LIKE 'pg_toast%'
  ORDER BY schemaname,viewname
 `);
 let sequences=[];
 await client.query('SAVEPOINT sequence_metadata');
 try{
  const result=await client.query(`
   SELECT schemaname AS schema,sequencename AS name,data_type,start_value,min_value,max_value,increment_by,cycle,last_value
   FROM pg_sequences
   WHERE schemaname NOT IN ('pg_catalog','information_schema')
   ORDER BY schemaname,sequencename
  `);
  sequences=result.rows;
  await client.query('RELEASE SAVEPOINT sequence_metadata');
 }catch(error){
  await client.query('ROLLBACK TO SAVEPOINT sequence_metadata');
  await client.query('RELEASE SAVEPOINT sequence_metadata');
  sequences=[{warning:'Sequence metadata could not be read: '+error.message}];
 }
 const functions=await client.query(`
  SELECT n.nspname AS schema,p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog','information_schema')
    AND n.nspname NOT LIKE 'pg_toast%'
    AND p.prokind IN ('f','p')
  ORDER BY n.nspname,p.proname
 `);
 const policies=await client.query(`
  SELECT schemaname AS schema,tablename AS table,policyname,permissive,roles,cmd,qual,with_check
  FROM pg_policies
  WHERE schemaname NOT IN ('pg_catalog','information_schema')
    AND schemaname NOT LIKE 'pg_toast%'
  ORDER BY schemaname,tablename,policyname
 `);
 const tableSecurity=await client.query(`
  SELECT n.nspname AS schema,c.relname AS table,c.relrowsecurity AS row_level_security,c.relforcerowsecurity AS force_row_level_security
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind='r' AND n.nspname NOT IN ('pg_catalog','information_schema')
    AND n.nspname NOT LIKE 'pg_toast%'
  ORDER BY n.nspname,c.relname
 `);
 const snapshot={
  format:'ai-lead-rescue-postgres-logical-backup-v1',
  exportedAt:metadata.rows[0].exported_at,
  databaseName:metadata.rows[0].database_name,
  databaseUser:metadata.rows[0].database_user,
  tableCount:tables.length,
  totalRows:tables.reduce((sum,table)=>sum+table.rowCount,0),
  tables,views:views.rows,sequences,functions:functions.rows,policies:policies.rows,tableSecurity:tableSecurity.rows
 };
 await client.query('COMMIT');
 return snapshot;
 }catch(error){
  await client.query('ROLLBACK').catch(()=>{});
  throw error;
 }finally{client.release()}
}
module.exports={init,get,save,close,status,exportDatabaseSnapshot}
