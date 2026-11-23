import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import QRCode from 'qrcode';

// Only this allowlisted directory is deployed. Never copy SQLite, sessions or .env.
const output=new URL('../dist/',import.meta.url);
await mkdir(output,{recursive:true});
await cp(new URL('../public/',import.meta.url),output,{recursive:true});
const index=new URL('index.html',output);
let html=await readFile(index,'utf8');
html=html.replace('<body>','<body data-preview="true">').replace('Datos y precios de muestra · Sin cobros reales','Demo online visual · Sin registros ni cobros reales');
await writeFile(index,html);
const qr=await QRCode.toDataURL('BANCO-HIPOTECARIO:VISTA-PREVIA:SIN-VALIDEZ',{width:300,margin:2});
const fixtures={
 event:{id:1,name:'La fiesta del club',date_text:'Fecha a confirmar',time_text:'Horario a confirmar',location:'Lugar a confirmar',description:'Una noche para encontrarnos, bailar y celebrar juntos. La próxima fiesta del Club Banco Hipotecario empieza acá.',sales_open:1},
 types:[{id:'general',name:'General',description:'Tu lugar para vivir la fiesta del club.',price_cents:1500000,capacity:200,sold:0},{id:'socios',name:'Socios',description:'Una opción de muestra para la comunidad del club.',price_cents:1200000,capacity:100,sold:0}],
 user:{id:'preview-only',name:'Invitado',surname:'de muestra',email:'ejemplo@example.test'},
 ticket:{id:'compra-ilustrativa',amount_cents:1500000,status:'approved',created_at:'Sin fecha real',type_name:'General',ticket_id:'entrada-ilustrativa',ticket_status:'active',entered_at:null,qr},
 row:{id:'compra-ilustrativa',name:'Invitado',surname:'de muestra',dni:'00000000',type_name:'General',type_id:'general',payment_status:'approved',ticket_status:'active',ticket_id:'entrada-ilustrativa',amount_cents:1500000,created_at:'Sin fecha real',entered_at:null}
};
await writeFile(new URL('preview-data.json',output),JSON.stringify(fixtures));
console.log('Vista previa estática generada en dist/. No contiene la base de datos local.');
