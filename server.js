import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Local presentation build. Never expose this server or its demo staff switch publicly.
const root = fileURLToPath(new URL('.', import.meta.url));
mkdirSync(`${root}data`, { recursive: true });
const db = new DatabaseSync(process.env.DB_PATH || `${root}data/club.sqlite`);
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
db.exec(readFileSync(`${root}migrations/001_initial.sql`, 'utf8'));
db.prepare('INSERT OR IGNORE INTO schema_migrations VALUES (1)').run();
db.prepare('INSERT OR IGNORE INTO event VALUES (1,?,?,?,?,?,1)').run('La fiesta del club', 'Fecha a confirmar', 'Horario a confirmar', 'Lugar a confirmar', 'Una noche para encontrarnos, bailar y celebrar juntos. La próxima fiesta del Club Banco Hipotecario empieza acá.');
const seed = db.prepare('INSERT OR IGNORE INTO ticket_types VALUES (?,?,?,?,?)');
seed.run('general','General','Tu lugar para vivir la fiesta del club.',1500000,200);
seed.run('socios','Socios','Una opción de muestra para la comunidad del club.',1200000,100);
const app = express();
app.use(helmet({ contentSecurityPolicy: { directives: { 'script-src': ["'self'"], 'img-src': ["'self'",'data:'], 'style-src': ["'self'",'https://fonts.googleapis.com'], 'font-src':["'self'",'https://fonts.gstatic.com'], 'connect-src': ["'self'"] } } }));
app.use(express.json({ limit:'20kb' }));
app.use(session({ secret: process.env.SESSION_SECRET || randomBytes(32).toString('hex'), resave:false, saveUninitialized:false, cookie:{ httpOnly:true, sameSite:'strict', maxAge:8*3600000 } }));
const fail = (message,status=400) => Object.assign(new Error(message),{status});
const wrap = fn => (req,res,next) => Promise.resolve().then(()=>fn(req,res)).catch(next);
const auth = (req,res,next) => req.session.user ? next() : next(fail('Ingresá a tu cuenta para continuar.',401));
const staff = (...roles) => (req,res,next) => roles.includes(req.session.role) ? next() : next(fail('No tenés permisos para esta acción.',403));
const audit = (req, action, resource) => db.prepare('INSERT INTO audit(actor,action,resource) VALUES(?,?,?)').run(req.session.user?.id || req.session.role || 'demo', action, resource);
// Bound the abuse window; this is intentionally a single-process local server.
const attempts = new Map();
app.use('/api', (req,res,next) => {
  if (!['GET','HEAD'].includes(req.method)) {
    const origin = req.get('origin');
    if (origin && origin !== `http://${req.get('host')}`) return next(fail('Origen no permitido.',403));
    const key = `${req.ip}:${req.path}`; const now = Date.now();
    for (const [k,v] of attempts) if (v.until < now) attempts.delete(k);
    const entry = attempts.get(key) || { count:0, until:now+60000 }; entry.count++; attempts.set(key,entry);
    if(entry.count>30) return next(fail('Demasiados intentos. Esperá un minuto.',429));
  }
  next();
});
const transact = fn => { db.exec('BEGIN IMMEDIATE'); try { const value=fn(); db.exec('COMMIT'); return value; } catch(e) {db.exec('ROLLBACK');throw e;} };
const types = () => db.prepare(`SELECT tt.*, (SELECT count(*) FROM tickets t JOIN purchases p ON p.id=t.purchase_id WHERE p.type_id=tt.id AND t.status!='revoked') sold FROM ticket_types tt`).all();
app.get('/api/event', (req,res)=>res.json({event:db.prepare('SELECT * FROM event').get(),types:types(),demo:true}));
app.get('/api/session',(req,res)=>res.json({user:req.session.user || null,role:req.session.role || null}));
const registerSchema=z.object({name:z.string().trim().min(2).max(80),surname:z.string().trim().min(2).max(80),dni:z.string().transform(v=>v.replace(/[.\s]/g,'')).pipe(z.string().regex(/^\d{7,8}$/)),phone:z.string().trim().regex(/^\+?[\d\s()-]{8,25}$/),email:z.email().transform(v=>v.toLowerCase().trim()),password:z.string().min(8).max(128)});
app.post('/api/register',wrap(async(req,res)=>{
 const v=registerSchema.parse(req.body); const id=randomUUID(); const hash=await bcrypt.hash(v.password,12);
 try {db.prepare('INSERT INTO users(id,name,surname,dni,email,phone,password_hash) VALUES(?,?,?,?,?,?,?)').run(id,v.name,v.surname,v.dni,v.email,v.phone,hash);} catch {throw fail('El correo o DNI ya está registrado.');}
 await new Promise((resolve,reject)=>req.session.regenerate(e=>e?reject(e):resolve()));
 req.session.user={id,name:v.name,surname:v.surname,email:v.email}; req.session.role='buyer'; res.json({ok:true});
}));
app.post('/api/login',wrap(async(req,res)=>{
 const v=z.object({email:z.email(),password:z.string().max(128)}).parse(req.body);
 const u=db.prepare('SELECT * FROM users WHERE email=?').get(v.email.trim().toLowerCase());
 if(!u || !await bcrypt.compare(v.password,u.password_hash)) throw fail('Correo o contraseña incorrectos.',401);
 await new Promise((resolve,reject)=>req.session.regenerate(e=>e?reject(e):resolve()));
 req.session.user={id:u.id,name:u.name,surname:u.surname,email:u.email};req.session.role='buyer';res.json({ok:true});
}));
app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
// No production login is provided for staff. These routes only demonstrate roles locally.
app.post('/api/demo-role',(req,res,next)=>{
 const role=req.body.role; if(!['admin','security'].includes(role)) return next(fail('Rol inválido.'));
 req.session.role=role; req.session.user=null; res.json({ok:true});
});
app.post('/api/purchases',auth,(req,res,next)=>{try{
 const id=transact(()=>{
 if(!db.prepare('SELECT sales_open FROM event').get().sales_open) throw fail('La venta está cerrada.');
 const type=types().find(t=>t.id===req.body.typeId);if(!type || type.sold>=type.capacity) throw fail('Entrada no disponible.');
 if(db.prepare("SELECT t.id FROM tickets t JOIN purchases p ON p.id=t.purchase_id WHERE p.user_id=? AND t.status!='revoked'").get(req.session.user.id)) throw fail('Ya tenés una entrada para este evento.');
 const old=db.prepare("SELECT id FROM purchases WHERE user_id=? AND status='pending' AND type_id=?").get(req.session.user.id,type.id); if(old) return old.id;
 const id=randomUUID(); db.prepare("INSERT INTO purchases(id,user_id,type_id,amount_cents,status) VALUES(?,?,?,?,'pending')").run(id,req.session.user.id,type.id,type.price_cents);audit(req,'purchase_created',id);return id;
 });res.json({id});
 }catch(e){next(e);}});
app.post('/api/purchases/:id/simulate',auth,(req,res,next)=>{try{
 const status=z.enum(['approved','pending','rejected']).parse(req.body.status);
 transact(()=>{
 const p=db.prepare('SELECT * FROM purchases WHERE id=? AND user_id=?').get(req.params.id,req.session.user.id);if(!p)throw fail('Compra no encontrada.',404);
 if(p.status==='approved')return;
 if(status==='approved'){
 if(db.prepare("SELECT t.id FROM tickets t JOIN purchases p ON p.id=t.purchase_id WHERE p.user_id=? AND t.status!='revoked'").get(req.session.user.id))throw fail('Ya tenés una entrada activa.');
 const type=types().find(t=>t.id===p.type_id);if(type.sold>=type.capacity)throw fail('Se agotó el cupo. No se emitió una entrada.');
 db.prepare('INSERT INTO tickets(id,purchase_id,token) VALUES(?,?,?)').run(randomUUID(),p.id,randomBytes(32).toString('hex'));
 }
 db.prepare('UPDATE purchases SET status=? WHERE id=?').run(status,p.id);audit(req,`demo_payment_${status}`,p.id);
 });res.json({ok:true});
 }catch(e){next(e);}});
app.get('/api/mine',auth,wrap(async(req,res)=>{
 const rows=db.prepare('SELECT p.id,p.amount_cents,p.status,p.created_at,tt.name type_name,t.id ticket_id,t.token,t.status ticket_status,t.entered_at FROM purchases p JOIN ticket_types tt ON tt.id=p.type_id LEFT JOIN tickets t ON t.purchase_id=p.id WHERE p.user_id=? ORDER BY p.created_at DESC').all(req.session.user.id);
 for(const r of rows) if(r.token && r.ticket_status==='active')r.qr=await QRCode.toDataURL(`BH-DEMO:${r.token}`,{width:300,margin:2});
 res.json(rows);
}));

const normalize=v=>String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function list(req){
 const q=normalize(req.query.q);const status=String(req.query.status || '');const type=String(req.query.type || '');
 let rows=db.prepare('SELECT p.id,p.status payment_status,p.created_at,p.amount_cents,u.name,u.surname,u.dni,tt.name type_name,tt.id type_id,t.id ticket_id,t.status ticket_status,t.entered_at FROM purchases p JOIN users u ON u.id=p.user_id JOIN ticket_types tt ON tt.id=p.type_id LEFT JOIN tickets t ON t.purchase_id=p.id ORDER BY p.created_at DESC,p.id DESC').all();
 rows=rows.filter(r=>normalize(`${r.name} ${r.surname} ${r.dni}`).includes(q) && (!status||(r.ticket_status || r.payment_status)===status) && (!type||r.type_id===type));
 if(req.query.order==='name')rows.sort((a,b)=>`${a.surname} ${a.name}`.localeCompare(`${b.surname} ${b.name}`,'es'));
 if(req.query.order==='oldest')rows.reverse();return rows;
}
app.get('/api/staff/list',staff('admin','security'),(req,res)=>{const rows=list(req);const page=Math.max(1,Number(req.query.page)||1);res.json({rows:rows.slice((page-1)*15,page*15),total:rows.length,page});});
app.get('/api/admin/stats',staff('admin'),(req,res)=>{const rows=list({query:{}});res.json({purchases:rows.length,approved:rows.filter(r=>r.payment_status==='approved').length,active:rows.filter(r=>r.ticket_status==='active').length,used:rows.filter(r=>r.ticket_status==='used').length,revenue:rows.filter(r=>r.payment_status==='approved').reduce((s,r)=>s+r.amount_cents,0),types:types()});});
app.post('/api/check-in',staff('admin','security'),(req,res,next)=>{try{
 const result=transact(()=>{
 const value=z.string().min(1).max(150).parse(req.body.value);
 const t=req.body.manual ? db.prepare('SELECT * FROM tickets WHERE id=?').get(value) : db.prepare('SELECT * FROM tickets WHERE token=?').get(value.replace(/^BH-DEMO:/,''));
 if(!t)throw fail('QR inválido o entrada no habilitada.',404);
 if(t.status==='used')throw fail(`Ya ingresó: ${new Date(t.entered_at).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'})}.`,409);
 if(t.status==='revoked')throw fail('Acceso revocado.',409);
 const now=new Date().toISOString();db.prepare("UPDATE tickets SET status='used',entered_at=? WHERE id=? AND status='active'").run(now,t.id);audit(req,'check_in',t.id);return {ok:true,message:'Ingreso confirmado. ¡Que disfrute la fiesta!'};
 });res.json(result);
 }catch(e){next(e);}});
app.post('/api/admin/revoke',staff('admin'),(req,res,next)=>{try{transact(()=>{const t=db.prepare('SELECT id FROM tickets WHERE id=?').get(req.body.id);if(!t)throw fail('Entrada inexistente.',404);db.prepare("UPDATE tickets SET status='revoked' WHERE id=?").run(t.id);audit(req,'revoke',t.id);});res.json({ok:true});}catch(e){next(e);}});
app.put('/api/admin/event',staff('admin'),(req,res,next)=>{try{
 const v=z.object({name:z.string().trim().min(2).max(100),date_text:z.string().trim().min(2).max(80),time_text:z.string().trim().min(2).max(80),location:z.string().trim().min(2).max(150),description:z.string().trim().min(5).max(1500),sales_open:z.boolean()}).parse(req.body);
 transact(()=>{db.prepare('UPDATE event SET name=?,date_text=?,time_text=?,location=?,description=?,sales_open=? WHERE id=1').run(v.name,v.date_text,v.time_text,v.location,v.description,Number(v.sales_open));audit(req,'event_updated','1');});res.json({ok:true});
 }catch(e){next(e);}});
app.get('/api/admin/export.pdf',staff('admin'),(req,res)=>{
 const rows=list(req);res.type('pdf');res.attachment('lista-banco-hipotecario-demo.pdf');const doc=new PDFDocument({margin:42,size:'A4',bufferPages:true});doc.pipe(res);
 const header=()=>{doc.font('Helvetica-Bold').fontSize(18).text('Banco Hipotecario | Lista DEMO');doc.font('Helvetica').fontSize(9).text(`Generada: ${new Date().toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'})}`);doc.text(`Filtros: búsqueda ${String(req.query.q||'todas')}, estado ${String(req.query.status||'todos')}, tipo ${String(req.query.type||'todos')}. Orden: ${String(req.query.order||'recientes')}`);doc.text(`${rows.length} compras · ${rows.filter(r=>r.ticket_status==='used').length} ingresos`);doc.moveDown();};header();
 for(const r of rows){if(doc.y>710){doc.addPage();header();}doc.fontSize(10).font('Helvetica-Bold').text(`${r.surname}, ${r.name} | DNI ${r.dni}`);doc.font('Helvetica').fontSize(9).text(`${r.type_name} | ${r.ticket_status||r.payment_status} | Inscripción: ${r.created_at}`);doc.text(`Ingreso: ${r.entered_at||'Sin ingreso'}`);doc.moveDown(.7);}
 const range=doc.bufferedPageRange();for(let i=0;i<range.count;i++){doc.switchToPage(i);doc.fontSize(9).text(`Página ${i+1} de ${range.count}`,42,780,{lineBreak:false});}doc.end();
});
app.use(express.static(`${root}public`));
app.use((err,req,res,next)=>{if(res.headersSent)return next(err);res.status(err instanceof z.ZodError?400:err.status||500).json({error:err instanceof z.ZodError?'Revisá los datos del formulario. Contraseña: mínimo 8 caracteres.':err.status?err.message:'No se pudo completar la operación.'});});
const port=Number(process.env.PORT || 3000);
app.listen(port,'127.0.0.1',()=>console.log(`Demo local: http://localhost:${port}`));
