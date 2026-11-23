// Public presentation adapter: synthetic fixtures only, no accounts or persisted data.
let fixturePromise,role=null,user=null;
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export async function previewApi(path,options={}){
 const f=await(fixturePromise??=fetch('/preview-data.json').then(r=>{if(!r.ok)throw new Error('No se pudo cargar la vista previa.');return r.json();}));
 const url=new URL(path,'https://preview.invalid');
 const data=options.body?JSON.parse(options.body):{};
 if(path==='/event')return {event:f.event,types:f.types,demo:true};
 if(path==='/session')return {user,role};
 if(path==='/preview-account'){user=f.user;role='buyer';return {ok:true};}
 if(path==='/logout'){user=null;role=null;return {ok:true};}
 if(path==='/demo-role'&&['admin','security'].includes(data.role)){role=data.role;user=null;return {ok:true};}
 if(path==='/mine'&&user)return [f.ticket];
 if(url.pathname==='/staff/list'&&['admin','security'].includes(role)){
  const q=normalize(url.searchParams.get('q')),status=url.searchParams.get('status'),type=url.searchParams.get('type');
  const match=normalize(`${f.row.name} ${f.row.surname} ${f.row.dni}`).includes(q)&&(!status||status===f.row.ticket_status)&&(!type||type===f.row.type_id);
  return {rows:match?[f.row]:[],total:match?1:0,page:1};
 }
 if(path==='/admin/stats'&&role==='admin')return {purchases:1,approved:1,active:1,used:0,revenue:1500000,types:f.types};
 throw new Error('Esta vista online es ilustrativa. Las compras, cambios, PDF e ingresos se prueban en la versión local.');
}
