export function log(scope:string, msg:string, extra?:any){
  const line = JSON.stringify({ts:new Date().toISOString(), scope, msg, extra});
  console.log(line);
}
