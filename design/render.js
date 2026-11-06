const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1700,height:4100}});
await p.goto('file://'+process.cwd()+'/holder.html');await p.evaluate(()=>Promise.all([document.fonts.load('40px "Great Vibes"'),document.fonts.load('600 40px "Cormorant Garamond"')]));
await p.locator('#out').screenshot({path:'holder-firna-ogi-luar.png'});await p.locator('#in').screenshot({path:'holder-firna-ogi-dalam.png'});await b.close()})();
