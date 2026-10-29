import {readFile} from 'node:fs/promises';
import {scrypt as scryptCallback,timingSafeEqual,randomBytes} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
export async function passwordRecord(username,password){
  if(typeof username!=='string'||!username.trim()||username.length>128||typeof password!=='string'||password.length<12||password.length>1024)throw new Error('Invalid local account');
  const salt=randomBytes(32).toString('hex');
  return {username:username.trim(),salt,hash:(await scrypt(password,salt,64)).toString('hex')};
}
export function createLocalCredentialVerifier(filename){
  if(!filename)throw new Error('Local credential file is required');
  return async(username,password)=>{
    if(typeof username!=='string'||typeof password!=='string'||password.length>1024)return false;
    const document=JSON.parse((await readFile(filename,'utf8')).replace(/^\uFEFF/,''));
    if(document.version!==1||!Array.isArray(document.accounts)||document.accounts.length>20)throw new Error('Invalid local credential file');
    for(const record of document.accounts){
      if(typeof record.username!=='string'||!/^[a-f0-9]{64}$/.test(record.salt)||!/^[a-f0-9]{128}$/.test(record.hash))throw new Error('Invalid local credential record');
    }
    const record=document.accounts.find(account=>account.username===username);
    const derived=await scrypt(password,record?.salt??'0'.repeat(64),64);
    return Boolean(record)&&timingSafeEqual(derived,Buffer.from(record.hash,'hex'));
  };
}
