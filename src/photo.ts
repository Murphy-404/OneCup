import type {Recipe} from './data';
export const MAX_PHOTO_BYTES=64*1024;
export function validatePhoto(value:unknown):asserts value is string|undefined{
 if(value===undefined)return;
 if(typeof value!=='string'||value.length>Math.ceil(MAX_PHOTO_BYTES/3)*4+32)throw Error('配方图片无效或超过 64 KB，请重新选择图片。');
 const match=/^data:image\/(webp|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
 if(!match||match[2].length%4!==0)throw Error('配方图片必须是内嵌的 WebP 或 JPEG 图片。');
 let bytes:string;try{bytes=atob(match[2]);}catch{throw Error('配方图片编码无效。');}
 if(bytes.length>MAX_PHOTO_BYTES||bytes.length<12)throw Error('配方图片大小无效。');
 if(match[1]==='webp'){
  const size=(bytes.charCodeAt(4)|bytes.charCodeAt(5)<<8|bytes.charCodeAt(6)<<16|bytes.charCodeAt(7)<<24)>>>0;
  if(bytes.slice(0,4)!=='RIFF'||bytes.slice(8,12)!=='WEBP'||size+8!==bytes.length||!['VP8 ','VP8L','VP8X'].includes(bytes.slice(12,16)))throw Error('WebP 图片内容无效。');
 }else if(bytes.charCodeAt(0)!==255||bytes.charCodeAt(1)!==216||bytes.charCodeAt(bytes.length-2)!==255||bytes.charCodeAt(bytes.length-1)!==217)throw Error('JPEG 图片内容无效。');
}
export function recipePhotoSource(recipe:Recipe){return recipe.photo??(recipe.id.startsWith('custom-')?undefined:`/images/recipes/${recipe.id}.webp`);}
export function recipePhotoCaption(recipe:Recipe){return recipe.photo?'用户上传图片':recipe.id.startsWith('custom-')?'私人配方 · 暂无图片':'AI 成品示意';}
export function assertWorkspaceFits(data:unknown,maxBytes:number){
 if(new TextEncoder().encode(JSON.stringify({data,revision:Number.MAX_SAFE_INTEGER})).byteLength>maxBytes)throw Error(`记录与图片合计超过本站保存上限（约 ${(maxBytes/1_000_000).toFixed(1)} MB）。请先导出备份，减少不需要的图片或快照后重试；当前输入已保留。`);
}
