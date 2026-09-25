import fs from 'node:fs';
import {httpLinks}from'./facility-bulk-lib.mjs';
const d='outputs/facility-evidence-20260925',p=JSON.parse(fs.readFileSync(d+'/plan.json')),out=[];
for(const i of p.urls.filter(x=>/ufuya|kushikatsu_ichimatsu|ryoyupan.co.jp\/shop\/archives\/98|halows.com\/stores\/detail\/138|lopia.jp\/shops\/izutsuya|shop.kairikiya.co.jp\/stores\/195/.test(x.url))){
  const r=JSON.parse(fs.readFileSync(d+'/pages/'+i.key+'.json'));
  for(const url of httpLinks(r.html??'',i.url).filter(x=>/maps\/embed|maps.app.goo.gl/.test(x)))out.push({url,source:i.url,purpose:'Official linked position; separate viewport center from the place coordinate.'});
}
for(const url of ['https://matatabi-cafe.com/access.html','https://matatabi-cafe.com/index.html','https://ufuya.jp/news/','https://www.royalhost.jp/news/2026/','https://go2senkyo.com/seijika/185443/posts/1471032','https://www.mrk09.co.jp/area_info/マルキュウ熊毛店/','https://www.mrk09.co.jp/company/history/'])out.push({url,purpose:'Follow-up of saved source lead; not automatically accepted as evidence.'});
fs.writeFileSync(d+'/followup-plan.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({urls:out.length}));
