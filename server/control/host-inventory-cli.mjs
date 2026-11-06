import {pathToFileURL} from 'node:url';
import {readHostInventory,hostInventoryArguments} from './host-inventory.mjs';

export async function hostInventoryMain(args=process.argv.slice(2),output=console){
  try{
    const parsed=hostInventoryArguments(args);
    if(parsed.help){output.log('Usage: node server/control/host-inventory-cli.mjs --inventory-file ABSOLUTE_PRIVATE_JSON');return 0}
    const result=await readHostInventory(parsed.inventoryFile,{allowLocal:process.env.NODE_ENV!=='production'&&process.env.ROOMQC_HOST_INVENTORY_ALLOW_LOCAL==='true'});
    output.log(JSON.stringify({ok:true,...result}));return 0;
  }catch(error){output.error(JSON.stringify({ok:false,code:error.code??'HOST_INVENTORY_INVALID'}));return 1}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await hostInventoryMain();
