import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('recorrido local: permisos, compras, cupos, QR, puerta y PDF',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bh-demo-test-'));const dbPath=join(dir,'test.sqlite');
 const proc=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'3107',DB_PATH:dbPath},stdio:['ignore','pipe','pipe']});
 let output='';proc.stdout.on('data',b=>output+=b);proc.stderr.on('data',b=>output+=b);
 async function client(){let cookie='';return async(path,method='GET',body)=>{const r=await fetch(`http://127.0.0.1:3107/api${path}`,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined});const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];const data=r.headers.get('content-type')?.includes('json')?await r.json():Buffer.from(await r.arrayBuffer());return {status:r.status,data};};}
 try{
 for(let i=0;i<60;i++){try{const r=await fetch('http://127.0.0.1:3107/api/event');if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.match(output,/Demo local/);
 const buyer=await client(),other=await client(),admin=await client(),door=await client();
 assert.equal((await buyer('/admin/stats')).status,403);
 const person={name:'José',surname:'Pérez',dni:'12345678',phone:'1112345678',email:'jose@example.test',password:'Prueba1234!'};
 assert.equal((await buyer('/register','POST',person)).status,200);
 assert.equal((await buyer('/session')).data.user.name,'José');
 const order=(await buyer('/purchases','POST',{typeId:'general'})).data;
 assert.ok(order.id);
 assert.equal((await buyer('/purchases','POST',{typeId:'general'})).data.id,order.id);
 let mine=(await buyer('/mine')).data;assert.equal(mine[0].status,'pending');assert.equal(mine[0].qr,undefined);
 await other('/register','POST',{...person,dni:'23456789',email:'otra@example.test'});
 assert.equal((await other(`/purchases/${order.id}/simulate`,'POST',{status:'approved'})).status,404);
 assert.equal((await buyer(`/purchases/${order.id}/simulate`,'POST',{status:'approved'})).status,200);
 await buyer(`/purchases/${order.id}/simulate`,'POST',{status:'approved'});
 mine=(await buyer('/mine')).data;assert.equal(mine.length,1);assert.match(mine[0].qr,/^data:image\/png/);
 assert.equal((await buyer('/purchases','POST',{typeId:'general'})).status,400);
 await door('/demo-role','POST',{role:'security'});assert.equal((await door('/admin/stats')).status,403);
 assert.equal((await door('/admin/revoke','POST',{id:mine[0].ticket_id})).status,403);
 const enter=await Promise.all([door('/check-in','POST',{value:`BH-DEMO:${mine[0].token}`}),door('/check-in','POST',{value:mine[0].ticket_id,manual:true})]);assert.deepEqual(enter.map(r=>r.status).sort(),[200,409]);
 assert.equal((await door('/check-in','POST',{value:'inexistente'})).status,404);
 await admin('/demo-role','POST',{role:'admin'});
 assert.equal((await admin('/staff/list?q=jose')).data.total,1);
 assert.equal((await admin('/staff/list?status=used')).data.total,1);
 const pdf=await admin('/admin/export.pdf?q=jose');assert.equal(pdf.status,200);assert.equal(pdf.data.subarray(0,4).toString(),'%PDF');
 const db=new DatabaseSync(dbPath);assert.equal(db.prepare('SELECT count(*) n FROM tickets').get().n,1);assert.notEqual(db.prepare('SELECT password_hash FROM users LIMIT 1').get().password_hash,person.password);
 // Two pending purchases competing for one remaining place: only one is emitted.
 db.prepare("UPDATE ticket_types SET capacity=1 WHERE id='socios'").run();
 const third=await client();await third('/register','POST',{...person,dni:'34567890',email:'tercera@example.test'});
 const a=(await other('/purchases','POST',{typeId:'socios'})).data.id;const b=(await third('/purchases','POST',{typeId:'socios'})).data.id;
 const race=await Promise.all([other(`/purchases/${a}/simulate`,'POST',{status:'approved'}),third(`/purchases/${b}/simulate`,'POST',{status:'approved'})]);assert.deepEqual(race.map(r=>r.status).sort(),[200,400]);
 await admin('/admin/revoke','POST',{id:mine[0].ticket_id});assert.equal((await door('/check-in','POST',{value:mine[0].ticket_id,manual:true})).status,409);
 const event=(await admin('/event')).data.event;assert.equal((await admin('/admin/event','PUT',{...event,sales_open:false})).status,200);
 assert.equal((await other('/purchases','POST',{typeId:'general'})).status,400);
 await buyer('/logout','POST',{});assert.equal((await buyer('/mine')).status,401);assert.equal((await buyer('/login','POST',{email:person.email,password:person.password})).status,200);assert.equal((await buyer('/mine')).data.length,1);
 assert.ok(db.prepare('SELECT count(*) n FROM audit').get().n>5);db.close();
 }finally{proc.kill();await new Promise(resolve=>proc.once('exit',resolve));await rm(dir,{recursive:true,force:true});}
});
